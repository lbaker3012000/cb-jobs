// Works out which notifications are due right now.
// Pure functions (no network) so they can be tested on their own.

export const NAMES = { a: 'Henry', b: 'Luke' };
export const DEFAULT_PREFS = { morning: true, visits: true, jobs: true, money: true, changes: false };

const pad = n => String(n).padStart(2, '0');
const toISO = d => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const parseISO = s => new Date(`${String(s).slice(0, 10)}T00:00:00Z`);
export const addDays = (iso, n) => { const d = parseISO(iso); d.setUTCDate(d.getUTCDate() + n); return toISO(d); };
const num = v => (v === null || v === undefined || v === '' ? 0 : Number(v) || 0);
const money = v => `£${num(v).toLocaleString('en-GB', { minimumFractionDigits: num(v) % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
const hm = t => String(t || '').slice(0, 5);
const mins = t => { const [h, m] = hm(t).split(':').map(Number); return h * 60 + (m || 0); };
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const fmtDay = iso => { const d = parseISO(iso); return `${DOW[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`; };

export const jobAddr = j => String(j?.address || '').split('\n').map(x => x.trim()).filter(Boolean).join(', ');
export const jobName = j => jobAddr(j) || j?.title || 'Job';

// "Now" in UK time, whatever the server's clock zone is
export function londonNow(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).map(p => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

// A notification set for `target` minutes is due from that time, for up to 3 hours (covers late runs)
const dueAt = (now, target) => now.minutes >= target && now.minutes < target + 180;

function ohDue(o, iso) {
  if (!o.start_date || num(o.amount) <= 0) return false;
  if (o.end_date && iso > o.end_date) return false;
  if (o.frequency === 'oneoff') return o.start_date === iso;
  const d = parseISO(o.start_date);
  let guard = 0;
  while (toISO(d) < iso && guard++ < 3000) {
    if (o.frequency === 'weekly') d.setUTCDate(d.getUTCDate() + 7);
    else d.setUTCMonth(d.getUTCMonth() + ({ monthly: 1, quarterly: 3, yearly: 12 }[o.frequency] || 12));
  }
  return toISO(d) === iso;
}

const forWho = (who, sub) => !who || who === 'both' || !sub.who || who === sub.who;

/**
 * data: { jobs, costs, payments, events, tasks, overheads, notes, settings, subs, nameByEmail }
 * now:  londonNow()
 * since: ISO timestamp of the earliest change to report (for "changes")
 * Returns [{ sub, type, key, title, body, url }]
 */
export function dueNotifications(data, now, since) {
  const out = [];
  const t = now.date;
  const tomorrow = addDays(t, 1);
  const st = data.settings || {};
  const chaseDays = num(st.payment_chase_days) || 7;
  const jobs = data.jobs || [];
  const jobById = Object.fromEntries(jobs.map(j => [j.id, j]));
  const paidOf = id => (data.payments || []).filter(p => p.job_id === id).reduce((s, p) => s + num(p.amount), 0);
  const gross = j => num(j.price) * (j.vat_applies ? 1 + num(j.vat_rate) / 100 : 1);
  const nameOf = email => (data.nameByEmail || {})[String(email || '').toLowerCase()] || String(email || 'Someone').split('@')[0];

  for (const sub of data.subs || []) {
    const prefs = { ...DEFAULT_PREFS, ...(sub.prefs || {}) };
    const push = (type, key, title, body, url) => out.push({ sub, type, key: `${key}:${sub.id}`, title, body, url });

    // 1. Morning summary at 8:00
    if (prefs.morning && dueAt(now, 8 * 60)) {
      const lines = [];
      const evs = (data.events || []).filter(e => !e.done && e.kind !== 'away' && e.event_date <= t && (e.end_date || e.event_date) >= t && forWho(e.who, sub))
        .sort((a, b) => hm(a.start_time || '99').localeCompare(hm(b.start_time || '99')));
      for (const e of evs) {
        const j = e.job_id ? jobById[e.job_id] : null;
        lines.push(`${e.start_time ? hm(e.start_time) + ' ' : ''}${e.title || 'Entry'}${j ? ` – ${jobName(j)}` : ''}`);
      }
      const running = jobs.filter(j => (j.status === 'active' || j.status === 'quoted') && j.start_date && j.start_date <= t && (j.end_date && j.end_date >= j.start_date ? j.end_date : j.start_date) >= t);
      for (const j of running) lines.push(`${j.status === 'quoted' ? 'Pencilled in: ' : 'Job: '}${jobName(j)}${j.title && jobAddr(j) ? ` (${j.title})` : ''}`);
      const away = (data.events || []).filter(e => e.kind === 'away' && e.event_date <= t && (e.end_date || e.event_date) >= t);
      for (const e of away) lines.push(`${e.who === 'a' ? NAMES.a : e.who === 'b' ? NAMES.b : 'Both'} away`);
      const open = (data.tasks || []).filter(x => !x.done);
      for (const x of open.filter(x => x.due_date === t)) {
        const next = Array.isArray(x.steps) ? x.steps.find(st => !st.done) : null;
        lines.push(`Due today: ${x.text}${next ? ` (next: ${next.text})` : ''}`);
      }
      const overdueTasks = open.filter(x => x.due_date && x.due_date < t).length;
      if (overdueTasks) lines.push(`${overdueTasks} to-do${overdueTasks > 1 ? 's' : ''} overdue`);
      const openTasks = open.length;
      const owed = jobs.filter(j => j.status === 'finished' && gross(j) - paidOf(j.id) > 0.004);
      const extras = [];
      if (openTasks) extras.push(`${openTasks} to-do${openTasks > 1 ? 's' : ''}`);
      if (owed.length) extras.push(`${money(owed.reduce((s, j) => s + gross(j) - paidOf(j.id), 0))} owed`);
      const body = (lines.length ? lines.join('\n') : 'Nothing booked today.') + (extras.length ? `\n${extras.join(' · ')}` : '');
      push('morning', `morning:${t}`, `Today · ${fmtDay(t)}`, body, '#/jobs');
    }

    // 2. Visits & appointments: 1 hour before
    if (prefs.visits) {
      for (const e of data.events || []) {
        if (e.done || e.kind === 'away' || !e.start_time || e.event_date !== t || !forWho(e.who, sub)) continue;
        const start = mins(e.start_time);
        if (now.minutes >= start - 60 && now.minutes < start) {
          const j = e.job_id ? jobById[e.job_id] : null;
          const where = j ? [jobName(j), j.postcode].filter(Boolean).join(' ') : '';
          push('visits', `visit:${e.id}:${t}`, `${e.title || 'Appointment'} at ${hm(e.start_time)}`,
            [where, j?.customer_name, j?.customer_phone].filter(Boolean).join(' · ') || (e.notes || 'In 1 hour'), j ? `#/job/${j.id}` : '#/calendar');
        }
      }
    }

    // 3. Jobs starting tomorrow: 6pm the evening before
    if (prefs.jobs && dueAt(now, 18 * 60)) {
      for (const j of jobs) {
        if (j.status !== 'active' || j.start_date !== tomorrow) continue;
        push('jobs', `jobstart:${j.id}:${j.start_date}`, `Tomorrow: ${jobName(j)}`,
          [j.title, j.postcode, j.customer_name, j.customer_phone].filter(Boolean).join(' · '), `#/job/${j.id}`);
      }
    }

    // 4. Money: invoices going overdue (9am) and bills due tomorrow (6pm)
    if (prefs.money) {
      if (dueAt(now, 9 * 60)) {
        for (const j of jobs) {
          if (j.status !== 'finished' || !j.finished_date) continue;
          const bal = gross(j) - paidOf(j.id);
          if (bal <= 0.004 || addDays(j.finished_date, chaseDays) !== t) continue;
          push('money', `overdue:${j.id}`, `Payment overdue: ${money(bal)}`,
            `${jobName(j)}${j.customer_name ? ` · ${j.customer_name}` : ''} · finished ${chaseDays} days ago`, `#/job/${j.id}`);
        }
      }
      if (dueAt(now, 18 * 60)) {
        for (const o of data.overheads || []) {
          if (num(o.amount) < 50 || !ohDue(o, tomorrow)) continue;
          push('money', `bill:${o.id}:${tomorrow}`, `Bill due tomorrow: ${money(o.amount)}`, `${o.name}${o.paid_by === 'a' ? ` · ${NAMES.a} pays` : o.paid_by === 'b' ? ` · ${NAMES.b} pays` : ''}`, '#/money');
        }
      }
    }

    // 5. Changes made by the other person (off unless turned on)
    if (prefs.changes && since) {
      const mine = String(sub.email || '').toLowerCase();
      const fresh = (rows, kind, text, url) => {
        for (const r of rows || []) {
          const by = String(r.created_by || '').toLowerCase();
          if (!by || by === mine || !r.created_at || Date.parse(r.created_at) < Date.parse(since)) continue;
          push('changes', `chg:${kind}:${r.id}`, `${nameOf(by)} ${text(r)}`, '', url(r));
        }
      };
      fresh(jobs, 'job', j => `added ${j.status === 'quoted' ? 'a quote' : 'a job'}: ${jobName(j)}`, j => `#/job/${j.id}`);
      fresh(data.costs, 'cost', c => `added a cost: ${c.description} ${money(num(c.qty || 1) * num(c.unit_cost))}${jobById[c.job_id] ? ` – ${jobName(jobById[c.job_id])}` : ''}`, c => `#/job/${c.job_id}`);
      fresh(data.payments, 'pay', p => `logged a payment: ${money(p.amount)}${jobById[p.job_id] ? ` – ${jobName(jobById[p.job_id])}` : ''}`, p => `#/job/${p.job_id}`);
      fresh(data.events, 'ev', e => `added to the calendar: ${e.title || 'entry'} ${fmtDay(e.event_date)}${e.start_time ? ` ${hm(e.start_time)}` : ''}`, () => '#/calendar');
      fresh(data.tasks, 'task', x => `added a to-do: ${x.text}`, () => '#/jobs');
    }
  }
  return out;
}
