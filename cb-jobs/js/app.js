import { db, DEMO } from './db.js?v=20261117i';

const APP_VERSION = '17 Nov 2026 (9)';

// ======================================================================
// State & helpers
// ======================================================================
const S = {
  booting: true,
  loadError: null,
  navs: 0,
  session: null,
  data: null,
  loadedAt: 0,
  me: 'a',
  urls: {},
  filter: 'all',
  search: '',
  archiveSearch: '',
  archiveYear: 'all',
  calMonth: null,
  calDay: null,
  taxYear: null,
};

const app = document.getElementById('app');
const sheet = document.getElementById('sheet');

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const r2 = n => Math.round(n * 100) / 100;
const sum = arr => arr.reduce((a, b) => a + b, 0);
const nz = v => (v === '' || v == null ? null : v);
const gbp = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });
const money = n => gbp.format(r2(num(n)));
// Whole pounds for at-a-glance figures (pence shown only when there are some)
const gbp0 = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 });
const money0 = n => (Math.abs(r2(num(n)) % 1) > 0.001 ? money(n) : gbp0.format(Math.round(num(n))));
const pct = n => `${Math.round(n * 100)}%`;
const z2 = n => String(n).padStart(2, '0');
const toISO = d => `${d.getFullYear()}-${z2(d.getMonth() + 1)}-${z2(d.getDate())}`;
const today = () => toISO(new Date());
const parseISO = s => new Date(`${s}T00:00:00`);
const addDays = (iso, n) => { const d = parseISO(iso); d.setDate(d.getDate() + n); return toISO(d); };
const fmtDate = (s, o) => (s ? parseISO(s.slice(0, 10)).toLocaleDateString('en-GB', o || { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const fmtShort = s => fmtDate(s, { day: 'numeric', month: 'short' });
const nl2br = s => esc(s).replace(/\n/g, '<br>');

const STATUS = { quoted: 'Quoted', active: 'Active', finished: 'Finished', declined: 'Declined' };
const STATUS_ORDER = { active: 0, quoted: 1, finished: 2, declined: 3 };
const COST_CATS = {
  materials: 'Materials', hire: 'Plant / tool hire', sub: 'Subcontractor',
  waste: 'Skip / waste', travel: 'Fuel / travel', other: 'Other',
};
const PAY_KINDS = { deposit: 'Deposit', stage: 'Stage payment', final: 'Final payment', other: 'Other' };
const PAY_METHODS = { bank: 'Bank transfer', cash: 'Cash', card: 'Card', cheque: 'Cheque' };
const PHOTO_KINDS = { before: 'Before', during: 'During', after: 'After', receipt: 'Receipt', other: 'Other' };
const OH_FREQ = { weekly: ['Weekly', 52], monthly: ['Monthly', 12], quarterly: ['Quarterly', 4], yearly: ['Yearly', 1], oneoff: ['One-off', 0] };
const OH_CATS = {
  marketing: 'Marketing & leads', insurance: 'Insurance', vehicle: 'Van & fuel', phone: 'Phone, IT & software',
  accreditation: 'Registrations & certs', professional: 'Accountant & bank', tools: 'Tools & equipment', vanstock: 'Van stock & consumables', other: 'Other',
};
const OH_PRESETS = [
  ['Checkatrade', 'marketing', 'monthly'], ['Public liability insurance', 'insurance', 'yearly'],
  ['Van insurance', 'vehicle', 'monthly'], ['Van finance / lease', 'vehicle', 'monthly'], ['Van tax & MOT', 'vehicle', 'yearly'],
  ['Fuel (average)', 'vehicle', 'monthly'], ['Phone contract', 'phone', 'monthly'], ['Microsoft 365', 'phone', 'yearly'],
  ['Domain & website', 'marketing', 'yearly'], ['Gas Safe registration', 'accreditation', 'yearly'],
  ['F-Gas / REFCOM certification', 'accreditation', 'yearly'], ['Tool insurance', 'insurance', 'yearly'],
  ['Accountant', 'professional', 'yearly'], ['Business bank account', 'professional', 'monthly'],
  ['Workwear & PPE', 'tools', 'quarterly'], ['Consumables (sealant, fixings)', 'tools', 'monthly'],
  ['Tool replacement fund', 'tools', 'monthly'], ['Software / apps', 'phone', 'monthly'],
];

const DEFAULTS = {
  business_name: 'C&B',
  tagline: 'Air conditioning • Bathrooms • Plumbing',
  phone: '07534 632490',
  email: 'info@cunninghamandbaker.co.uk',
  area: 'Covering East Sussex & Kent',
  website: 'cunninghamandbaker.co.uk',
  vat_registered: false, vat_number: '', vat_rate: 20,
  quote_valid_days: 30,
  quote_terms: 'This is a fixed price for the work described above. Any additional work requested will be agreed and quoted separately before it is carried out. Materials remain our property until paid for in full.',
  invoice_terms: 'Payment due within 14 days of the invoice date. Thank you for your business.',
  bank_name: '', bank_sort: '', bank_acc: '',
  chase_days: 7,
  payment_chase_days: 7,
};
const set = () => ({ ...DEFAULTS, ...(S.data?.settings || {}) });

// The two partners, as shown throughout the app
const PARTNERS = { a: 'Henry', b: 'Luke' };
const nameOf = p => (p === 'b' ? PARTNERS.b : PARTNERS.a);

const ICON = {
  back: '<svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  refresh: '<svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-2.6-6.4M21 4v5h-5"/></svg>',
  send: '<svg viewBox="0 0 24 24"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/></svg>',
  chat: '<svg viewBox="0 0 24 24"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.8A8 8 0 1 1 21 12z"/></svg>',
  sun: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  moon: '<svg viewBox="0 0 24 24"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
  note: '<svg viewBox="0 0 24 24"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/></svg>',
  jobs: '<svg viewBox="0 0 24 24"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
  cal: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  archive: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4"/></svg>',
  money: '<svg viewBox="0 0 24 24"><path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/></svg>',
  cog: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  phone: '<svg viewBox="0 0 24 24"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/></svg>',
  image: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>',
  camera: '<svg viewBox="0 0 24 24"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>',
  doc: '<svg viewBox="0 0 24 24"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></svg>',
  pin: '<svg viewBox="0 0 24 24"><path d="M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/></svg>',
};

// In-app confirmation box (works everywhere, unlike the browser's own pop-ups)
function ask(msg, okLabel = 'OK', danger = false) {
  if (window.__autoConfirm) return Promise.resolve(true); // used by automated tests only
  return new Promise(resolve => {
    const el = document.createElement('div');
    el.className = 'modal';
    el.innerHTML = `<div class="modal-box" role="alertdialog"><p>${esc(msg).replace(/\n/g, '<br>')}</p>
      <div class="btn-row"><button class="btn" data-x="0">Cancel</button><button class="btn ${danger ? 'danger-solid' : 'primary'}" data-x="1">${esc(okLabel)}</button></div></div>`;
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-x]');
      if (!b && e.target !== el) return;
      e.stopPropagation();
      el.remove();
      resolve(!!b && b.dataset.x === '1');
    });
    document.body.appendChild(el);
    el.querySelector('[data-x="1"]').focus();
  });
}

function toast(msg, bad = false) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast show${bad ? ' bad' : ''}`;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.className = 'toast'; }, 2600);
}

function friendly(err) {
  const m = String(err?.message || err || '');
  if (!navigator.onLine || /failed to fetch|network|load failed|fetch/i.test(m)) return 'No connection — nothing was saved. Try again when you have signal.';
  if (/JWT|expired|not authenticated/i.test(m)) return 'Your login has expired — please sign in again.';
  if (/events_kind_check|schema cache|does not exist/i.test(m)) return 'The database is not fully set up — run supabase/schema.sql in Supabase (see README).';
  return m || 'Something went wrong';
}

async function busy(btn, fn) {
  if (btn) btn.disabled = true;
  try { return await fn(); }
  catch (err) { console.error(err); toast(friendly(err), true); }
  finally { if (btn) btn.disabled = false; }
}

// ======================================================================
// Calculations
// ======================================================================
const lineTotal = c => num(c.qty) * num(c.unit_cost);
const costsOf = id => S.data.costs.filter(c => c.job_id === id);
const paysOf = id => S.data.payments.filter(p => p.job_id === id);
const photosOf = id => S.data.photos.filter(p => p.job_id === id);
const jobById = id => S.data.jobs.find(j => j.id === id);
// Jobs are named by where they are, e.g. "14 Sea Road, Bexhill" —
// with the client and a short description of the job underneath.
const jobAddr = j => String(j.address || '').split('\n').map(x => x.trim()).filter(Boolean).join(', ');
const jobName = j => jobAddr(j) || j.title || 'Job';
const jobSub = j => [j.customer_name, jobAddr(j) ? j.title : null].filter(Boolean).join(' · ');
const JOB_TYPES = ['Bathroom install', 'Boiler swap', 'Boiler service', 'AC install', 'AC service', 'Leak repair', 'Dishwasher waste', 'Radiator swap', 'Tap / toilet repair', 'General building'];
const daysSince = iso => (iso ? Math.round((parseISO(today()) - parseISO(iso.slice(0, 10))) / 86400000) : null);
// When a quote/invoice was last chased (so the To do list moves on)
const getMark = (j, f) => j[f] || null;
async function setMark(j, f, val = today()) {
  await saveRow('jobs', j.id, { [f]: val });
}

// Everything that needs doing, worked out from the jobs
function todos() {
  const st = set();
  const t = today();
  const out = [];
  const add = (j, pri, icon, text, sub, tpl, extra = '') => out.push({ j, pri, icon, text, sub, tpl, extra });
  for (const j of S.data.jobs) {
    const c = calc(j);
    if (j.status === 'quoted' && !j.quote_date) {
      const vis = visitOf(j);
      if (!vis || vis.event_date < t) add(j, 3, '✉', 'Quote to send', vis ? `Visited ${fmtShort(vis.event_date)} — price it up and send it` : 'Price it up, then Send PDF', null, `<a class="btn small" href="#/doc/${j.id}/quote">Quote</a>`);
    } else if (j.status === 'quoted') {
      const sent = j.quote_date;
      const chased = getMark(j, 'chased_at');
      const last = chased && chased > sent ? chased : sent;
      const valid = j.quote_valid_days && sent ? addDays(sent, num(j.quote_valid_days)) : null;
      if (valid && valid < t) {
        // stop nagging 3 weeks after a quote expires
        if (daysSince(valid) <= 21) add(j, 2, '!', 'Quote expired', `Expired ${fmtShort(valid)} — chase, or mark it Declined`, 'chase_quote', `<button class="btn small" data-act="status" data-id="${j.id}" data-s="declined">Declined</button>`);
      } else if (daysSince(last) >= num(st.chase_days)) add(j, 3, '↻', 'Chase quote', `Sent ${daysSince(sent)} days ago${chased ? ` · last chased ${fmtShort(chased)}` : ''}`, 'chase_quote');
    } else if (j.status === 'active') {
      if (!j.start_date) add(j, 4, '▦', 'Needs a start date', 'Won but not scheduled yet', null, `<a class="btn small" href="#/edit/${j.id}">Set dates</a>`);
      else if (j.start_date === t) add(j, 1, '→', 'Starts today', esc(j.address || j.postcode || ''), 'on_way');
      else if (j.start_date === addDays(t, 1)) add(j, 2, '✓', 'Starts tomorrow', 'Give the customer a ring to confirm', 'booked');
      if (j.end_date && j.end_date < t) add(j, 3, '⚑', 'End date passed', 'Finished? Mark it so it moves to the archive', null, `<button class="btn small primary" data-act="status" data-id="${j.id}" data-s="finished">Finished</button>`);
    } else if (j.status === 'finished') {
      if (c.balance > 0.004) {
        const chased = getMark(j, 'chased_at');
        if (!chased || chased < (j.finished_date || '')) add(j, 1, '£', 'Send invoice', `${money(c.balance)} to collect`, 'invoice_send', `<a class="btn small" href="#/doc/${j.id}/invoice">Invoice</a>`);
        else if (daysSince(chased) >= num(st.payment_chase_days)) add(j, 1, '£', 'Payment overdue', `${money(c.balance)} · finished ${daysSince(j.finished_date)} days ago`, 'payment', `<button class="btn small" data-act="paidFull" data-id="${j.id}">Paid</button>`);
      }
    }
  }
  let lastBackup = null;
  try { lastBackup = localStorage.getItem('cb-last-backup'); } catch { /* ignore */ }
  if (!DEMO && S.data.jobs.length >= 3 && (!lastBackup || daysSince(lastBackup) > 30)) out.push({ pri: 6, icon: '⤓', text: 'Download a backup', sub: lastBackup ? `Last one ${daysSince(lastBackup)} days ago (on this device)` : 'Keeps a copy of everything, just in case', backup: true });
  return out.sort((a, b) => a.pri - b.pri);
}

function calc(job) {
  const costs = costsOf(job.id);
  const pays = paysOf(job.id);
  const costA = sum(costs.filter(c => c.paid_by !== 'b').map(lineTotal));
  const costB = sum(costs.filter(c => c.paid_by === 'b').map(lineTotal));
  const totalCost = costA + costB;
  const price = num(job.price);
  const vat = job.vat_applies ? r2(price * num(job.vat_rate) / 100) : 0;
  const gross = price + vat;
  const paidA = sum(pays.filter(p => p.received_by !== 'b').map(p => num(p.amount)));
  const paidB = sum(pays.filter(p => p.received_by === 'b').map(p => num(p.amount)));
  const paid = paidA + paidB;
  const balance = r2(gross - paid);
  const profit = price - totalCost;
  const margin = price ? profit / price : 0;
  // Profit split: 50/50, or 100% to whoever did the job alone
  const sa = jobShareA(job);
  const shareA = profit * sa;
  const shareB = profit - shareA;
  // Settle-up on money actually received (ex-VAT): each partner is owed
  // their own costs back plus their % of whatever profit has come in.
  const netRatio = gross ? price / gross : 1;
  const recA = paidA * netRatio;
  const recB = paidB * netRatio;
  const profitIn = recA + recB - totalCost;
  const entA = costA + profitIn * sa;
  const owedToA = r2(entA - recA); // >0: B owes A; <0: A owes B
  // Overheads for the days the job runs (start → end date)
  const span = jobSpan(job);
  const jobDays = span ? daysBetween(span[0], span[1]) : 0;
  const ohpd = ohSummary().perDay;
  const overheadAlloc = jobDays * ohpd;
  return {
    costs, pays, costA, costB, totalCost, price, vat, gross, paidA, paidB, paid, balance,
    profit, margin, sa, shareA, shareB, owedToA, fullyPaid: gross > 0 && balance <= 0.004,
    jobDays, ohpd, overheadAlloc, netProfit: profit - overheadAlloc,
  };
}

// UK tax year (6 Apr – 5 Apr), labelled by its starting year
function taxYearOf(iso) {
  if (!iso) return null;
  const d = parseISO(iso.slice(0, 10));
  const y = d.getFullYear();
  const start = new Date(y, 3, 6);
  return d >= start ? y : y - 1;
}
const tyLabel = y => `${y}/${String((y + 1) % 100).padStart(2, '0')}`;
const tyStart = y => `${y}-04-06`;
const tyEnd = y => `${y + 1}-04-05`;

// ----- Overheads -----
const daysBetween = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 86400000) + 1;
const ohAnnual = o => (o.frequency === 'oneoff' ? 0 : num(o.amount) * (OH_FREQ[o.frequency]?.[1] || 0));
// A regular bill is running until its end date. Its date is just when it next comes out
// (it repeats from there) — so adding a bill with its next renewal date counts it straight away.
const ohLive = (o, on = today()) => o.frequency !== 'oneoff' && (!o.end_date || o.end_date >= on);
// When we started counting a regular bill: its date or the day it was added, whichever is earlier
const ohFrom = o => [o.start_date, String(o.created_at || '').slice(0, 10)].filter(Boolean).sort()[0] || today();
const ohSplit = () => 0.5; // Henry & Luke always split overheads 50/50
const jobShareA = j => (j.who === 'a' ? 1 : j.who === 'b' ? 0 : 0.5);
const jobWhoLabel = j => (j.who === 'a' ? `${nameOf('a')} only` : j.who === 'b' ? `${nameOf('b')} only` : '');
const ohPaidByA = (o, amt) => amt * (o.paid_by === 'a' ? 1 : o.paid_by === 'split' ? ohSplit() : 0);

// Cost of one overhead falling between two dates (recurring ones pro-rata by day)
function ohInRange(o, from, to) {
  if (o.frequency === 'oneoff') {
    const d = o.start_date || String(o.created_at || '').slice(0, 10);
    return d && d >= from && d <= to ? num(o.amount) : 0;
  }
  const begin = ohFrom(o);
  const st = begin > from ? begin : from;
  const en = o.end_date && o.end_date < to ? o.end_date : to;
  if (en < st) return 0;
  return ohAnnual(o) * daysBetween(st, en) / 365;
}

// Running overheads right now
function ohSummary() {
  const st = set();
  const live = (S.data.overheads || []).filter(o => ohLive(o));
  const annual = sum(live.map(ohAnnual));
  const sa = ohSplit();
  const paidA = sum(live.map(o => ohPaidByA(o, ohAnnual(o))));
  return { live, annual, monthly: annual / 12, perDay: annual / 365, sa, paidA, owedToA: paidA - annual * sa };
}

// Overheads over a period (e.g. a tax year), with each partner's share
function ohPeriod(from, to) {
  const list = S.data.overheads || [];
  const sa = ohSplit();
  const total = sum(list.map(o => ohInRange(o, from, to)));
  const paidA = sum(list.map(o => ohPaidByA(o, ohInRange(o, from, to))));
  return { total, paidA, paidB: total - paidA, shareA: total * sa, shareB: total * (1 - sa), owedToA: paidA - total * sa };
}

// ======================================================================
// Routing & rendering
// ======================================================================
function route() {
  let h = location.hash.replace(/^#\/?/, '') || 'jobs';
  if (/access_token=|error_description=|type=recovery/.test(h)) h = 'jobs';
  const [view, id, extra] = h.split('/');
  return { view, id, extra };
}
const go = h => { location.hash = h; };
window.addEventListener('hashchange', () => {
  S.navs++;
  S.readyPdf = null;
  closeSheet();
  const r = route();
  if (r.view === 'calendar' && /^\d{4}-\d\d-\d\d$/.test(r.id || '')) { S.calDay = r.id; S.calMonth = r.id.slice(0, 7); }
  else if (r.view === 'calendar') { S.calDay = null; S.calMonth = null; } // Calendar tab always opens on today
  window.scrollTo(0, 0);
  render();
  if (S.pendingSync) { S.pendingSync = false; loadData().then(render).catch(console.error); }
});
// Go back within the app if possible (never off-site), otherwise to a fallback page
function goBack(fallback = '#/jobs') { if (S.navs > 0 && history.length > 1) history.back(); else location.replace(fallback); }

function render() {
  if (S.booting) { app.innerHTML = '<div class="splash"><img src="img/house-gold.png" alt=""><span class="wordmark">C<i>&amp;</i>B</span></div>'; return; }
  if (S.recovery && S.session) { app.innerHTML = recoveryView(); return; }
  if (!S.session) { app.innerHTML = loginView(); return; }
  if (S.loadError && !S.data) { app.innerHTML = errorView(); return; }
  if (!S.data) { app.innerHTML = '<div class="splash"><img src="img/house-gold.png" alt=""><span class="wordmark">C<i>&amp;</i>B</span></div>'; return; }
  if (S.data.settingsMissing) { app.innerHTML = notMemberView(); return; }
  const r = route();
  const views = {
    jobs: jobsView, job: jobView, edit: editView, calendar: calendarView,
    archive: archiveView, notes: notesView, money: moneyView, settings: settingsView, doc: docView, overheads: moneyView, chat: chatView,
  };
  const typing = r.view === 'chat' && document.activeElement?.id === 'chat-input';
  const nearBottom = r.view !== 'chat' || (window.innerHeight + window.scrollY >= document.body.scrollHeight - 160);
  const v = (views[r.view] || jobsView)(r);
  app.innerHTML = v;
  if (r.view === 'chat') {
    const inp = document.getElementById('chat-input');
    if (inp) { inp.value = S.chatDraft || ''; growChat(inp); if (typing) inp.focus(); }
    if (nearBottom || S.chatJump) { S.chatJump = false; requestAnimationFrame(() => window.scrollTo(0, document.body.scrollHeight)); }
    markMessagesRead();
    loadChatPhotoUrls();
  }
  document.body.classList.toggle('doc-mode', r.view === 'doc');
  after(r);
}

function after(r) {
  if (r.view === 'job') loadPhotoUrls(r.id);
  if (r.view === 'settings' && S.push && S.push.status !== 'checking' && !S._pushChecked) { S._pushChecked = true; refreshPush(); }
  if (r.view === 'overheads') setTimeout(() => document.getElementById('overheads')?.scrollIntoView({ block: 'start' }), 0);
  if (r.view === 'calendar' && r.id && /^\d{4}-\d\d-\d\d$/.test(r.id)) {
    const el = document.getElementById(`d-${r.id}`);
    if (el) setTimeout(() => { el.scrollIntoView({ block: 'start' }); window.scrollBy(0, -70); el.classList.add('flash'); }, 30);
  }
}

function layout({ title, back, right = '', body, nav = true, fab = '' }) {
  const r = route().view;
  const tab = (key, label, icon) => `<a href="#/${key}" class="${r === key || (key === 'jobs' && (r === 'job' || r === 'edit')) || (key === 'money' && r === 'overheads') ? 'on' : ''}">${icon}<span>${label}</span></a>`;
  return `
  <header class="top">
    ${back ? `<button class="icon-btn" data-act="back" aria-label="Back">${ICON.back}</button>` : '<div class="brand"><img class="brand-mark" src="img/house-gold.png" alt=""><span class="wordmark">C<i>&amp;</i>B</span></div>'}
    <h1>${esc(title)}</h1>
    <div class="top-right">${right}${msgBtn()}${themeSwitch()}</div>
  </header>
  ${S.offlineSince ? `<div class="offline-banner"><b>No signal</b> — showing jobs as of ${new Date(S.offlineSince).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}. You can look, but changes can't be saved until you're back online.</div>` : ''}
  ${DEMO ? '<div class="demo-banner"><b>Demo</b> — sample jobs to try out. Changes stay on this phone only.</div>' : ''}
  <main>${body}</main>
  ${fab}
  ${nav ? `<nav class="tabs">
    ${tab('jobs', 'Jobs', ICON.jobs)}
    ${tab('calendar', 'Calendar', ICON.cal)}
    ${tab('notes', 'Notes', ICON.note)}
    ${tab('archive', 'Archive', ICON.archive)}
    ${tab('money', 'Money', ICON.money)}
    ${tab('settings', 'Settings', ICON.cog)}
  </nav>` : ''}`;
}

// ======================================================================
// Messages between Henry and Luke (pop up on the other phone)
// ======================================================================
const otherOf = who => (who === 'a' ? 'b' : 'a');
const unreadForMe = () => (S.data?.messages || []).filter(m => m.to_who === S.me && !m.read_at);
const msgBtn = () => (S.data && !S.data.messagesMissing && route().view !== 'chat'
  ? `<button class="icon-btn msg-btn" data-act="msgSheet" aria-label="Send a message">${ICON.chat}${unreadForMe().length ? '<i class="dot"></i>' : ''}</button>` : '');
const timeAgo = iso => {
  const d = new Date(iso); const mins = Math.round((Date.now() - d) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  if (d.toDateString() === new Date().toDateString()) return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
};
const QUICK_MSGS = ['On my way', 'Running 15 min late', 'Call me when you can', 'Can you pick up materials?', 'Done for the day'];

function chatView({ id }) {
  if (S.data.messagesMissing) return layout({ title: 'Messages', back: true, nav: false, body: '<div class="empty">Messages need the database set up.</div>' });
  if (id && jobById(id)) S.chatJob = id;
  const other = otherOf(S.me);
  const list = (S.data.messages || []).slice().sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  let lastDay = '';
  const dayLabel = iso => {
    const d = new Date(iso); const t = new Date();
    const y = new Date(); y.setDate(t.getDate() - 1);
    if (d.toDateString() === t.toDateString()) return 'Today';
    if (d.toDateString() === y.toDateString()) return 'Yesterday';
    return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  };
  const bubbles = list.map(m => {
    const mine = m.to_who !== S.me;
    const j = m.job_id ? jobById(m.job_id) : null;
    const day = new Date(m.created_at).toDateString();
    const sep = day !== lastDay ? `<div class="chat-day"><span>${dayLabel(m.created_at)}</span></div>` : '';
    lastDay = day;
    const time = new Date(m.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    return `${sep}<div class="bubble ${mine ? 'mine' : 'theirs'}">
      ${j ? `<a class="bubble-job" href="#/job/${j.id}">${ICON.jobs}<span>${esc(jobName(j))}</span></a>` : ''}
      ${m.photo_path ? `<button class="bubble-photo" data-act="chatPhotoView" data-id="${m.id}">${S.urls[m.photo_path] ? `<img src="${esc(S.urls[m.photo_path])}" alt="Photo">` : `<span class="ph-load">${ICON.image}</span>`}</button>` : ''}
      ${m.text ? `<div class="bubble-text">${nl2br(m.text)}</div>` : ''}
      <div class="bubble-meta">${time}${mine ? (m.read_at ? ' · Seen' : '') : ''}</div>
    </div>`;
  }).join('');
  const job = S.chatJob ? jobById(S.chatJob) : null;
  const jobs = S.data.jobs.filter(j => j.status !== 'declined')
    .sort((a, b) => (a.status === 'finished') - (b.status === 'finished') || String(b.start_date || b.created_at).localeCompare(String(a.start_date || a.created_at)))
    .slice(0, 60);
  const body = `
  <div class="chat-thread">
    ${bubbles || `<div class="chat-empty">${ICON.chat}<p>No messages yet.<br>Say hello to ${esc(nameOf(other))} — it pops up on their phone.</p></div>`}
  </div>
  <form data-form="chat" class="chat-compose">
    <div class="chat-quick">${QUICK_MSGS.map(q => `<button type="button" class="chip" data-act="chatQuick" data-t="${esc(q)}">${esc(q)}</button>`).join('')}</div>
    ${S.chatPhoto ? `<div class="chat-photo-preview"><img src="${esc(S.chatPhoto.url)}" alt=""><span>Photo ready to send — add a message if you like</span><button type="button" data-act="chatPhotoClear" aria-label="Remove photo">×</button></div>` : ''}
    ${job ? `<div class="chat-job-tag">${ICON.jobs}<span>About: <b>${esc(jobName(job))}</b></span><button type="button" data-act="chatJobClear" aria-label="Remove job">×</button></div>` : ''}
    <div class="chat-row">
      <label class="chat-attach" aria-label="Link a job">${ICON.jobs}
        <select data-input="chatJob"><option value="">Link a job…</option>${jobs.map(j => `<option value="${j.id}" ${j.id === S.chatJob ? 'selected' : ''}>${esc(jobName(j))}${j.title && jobAddr(j) ? ` – ${esc(j.title)}` : ''}</option>`).join('')}</select>
      </label>
      <label class="chat-attach" aria-label="Add a photo">${ICON.camera}<input type="file" id="chat-photo" accept="image/*" class="file-hidden"></label>
      <textarea id="chat-input" name="text" rows="1" placeholder="${S.chatPhoto ? 'Add a message (optional)' : `Message ${esc(nameOf(other))}`}" data-input="chatDraft" enterkeyhint="send"></textarea>
      <button class="chat-send" aria-label="Send">${ICON.send}</button>
    </div>
  </form>`;
  return layout({ title: nameOf(other), back: true, nav: false, body });
}
async function loadChatPhotoUrls() {
  const need = (S.data.messages || []).map(m => m.photo_path).filter(p => p && !S.urls[p]);
  if (!need.length) return;
  try {
    Object.assign(S.urls, await db.fileUrls([...new Set(need)]));
    if (route().view === 'chat' && sheet.hidden) render();
  } catch (e) { console.error(e); }
}

// Full-size view of a chat photo, with "add to the job's photos" when it's about a job
function chatPhotoView(id) {
  const m = (S.data.messages || []).find(x => x.id === id);
  if (!m?.photo_path) return;
  const j = m.job_id ? jobById(m.job_id) : null;
  openSheet(`<div class="form">
    ${sheetHead('Photo')}
    <div class="photo-full">${S.urls[m.photo_path] ? `<img src="${esc(S.urls[m.photo_path])}" alt="">` : 'Loading…'}</div>
    ${m.text ? `<p>${nl2br(m.text)}</p>` : ''}
    <p class="muted small">From ${esc(m.to_who === S.me ? nameOf(otherOf(S.me)) : 'you')} · ${timeAgo(m.created_at)}</p>
    <div class="btn-row wrap">
      ${j ? `<button class="btn primary grow" data-act="chatPhotoToJob" data-id="${m.id}">${ICON.image} Add to ${esc(jobName(j))} photos</button>` : ''}
      ${S.urls[m.photo_path] ? `<a class="btn grow" href="${esc(S.urls[m.photo_path])}" target="_blank" rel="noopener">Open full size</a>` : ''}
    </div>
  </div>`);
}

function growChat(el) { el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 120)}px`; }

// New messages for me: banner at the top of Jobs until dismissed
function msgBannerHtml() {
  const list = unreadForMe();
  if (!list.length) return '';
  const m = list[0];
  const j = m.job_id ? jobById(m.job_id) : null;
  return `<section class="msg-banner">
    <div class="msg-banner-main">
      <b>${ICON.chat} ${esc(nameOf(otherOf(m.to_who)))}${list.length > 1 ? ` <span class="count">${list.length}</span>` : ''}</b>
      <span class="msg-text">${m.photo_path ? '📷 ' : ''}${m.text ? nl2br(m.text) : 'Photo'}</span>
      <span class="muted small">${timeAgo(m.created_at)}${j ? ` · <a href="#/job/${j.id}" data-act="msgRead">${esc(jobName(j))}</a>` : ''}</span>
    </div>
    <div class="msg-banner-btns">
      <button class="btn small primary" data-act="msgSheet">Reply</button>
      <button class="btn small" data-act="msgRead">OK</button>
    </div>
  </section>`;
}

async function markMessagesRead() {
  const list = unreadForMe();
  if (!list.length) return;
  const at = new Date().toISOString();
  for (const m of list) { try { await saveRow('messages', m.id, { read_at: at }); } catch { /* try again next time */ } }
}

// Dark mode: remembered on each phone
const isDark = () => document.documentElement.dataset.theme === 'dark';
const themeSwitch = () => `<button class="theme-switch" data-act="toggleTheme" role="switch" aria-checked="${isDark()}" aria-label="Dark mode"><i>${isDark() ? ICON.moon : ICON.sun}</i></button>`;

const refreshBtn = `<button class="icon-btn" data-act="refresh" aria-label="Refresh">${ICON.refresh}</button>`;
const pill = s => `<span class="pill ${s}">${STATUS[s] || s}</span>`;

// ======================================================================
// Login
// ======================================================================
function loginView() {
  return `<div class="login">
    <div class="login-logo"><img src="img/house-gold.png" alt=""><span class="wordmark">C<i>&amp;</i>B</span><div class="tag">Air conditioning • Bathrooms • Plumbing</div><div class="area">East Sussex &amp; Kent</div></div>
    <h2>Job tracker</h2>
    <form data-form="login" class="card">
      <label>Email<input name="email" type="email" autocomplete="username" required></label>
      <label>Password<input name="password" type="password" autocomplete="current-password" required></label>
      <button class="btn primary wide">Sign in</button>
      <button type="button" class="link-btn" data-act="forgot">Forgot password?</button>
    </form>
  </div>`;
}

function recoveryView() {
  return `<div class="login"><div class="login-logo"><img src="img/house-gold.png" alt=""><span class="wordmark">C<i>&amp;</i>B</span><div class="tag">Air conditioning • Bathrooms • Plumbing</div><div class="area">East Sussex &amp; Kent</div></div><h2>Set a new password</h2>
    <form data-form="newPassword" class="card">
      <label>New password<input name="password" type="password" autocomplete="new-password" minlength="8" required></label>
      <button class="btn primary wide">Save password</button>
    </form></div>`;
}

function errorView() {
  const offline = !navigator.onLine || /fetch|network|load failed/i.test(S.loadError || '');
  return `<div class="login"><div class="login-logo"><img src="img/house-gold.png" alt=""><span class="wordmark">C<i>&amp;</i>B</span><div class="tag">Air conditioning • Bathrooms • Plumbing</div><div class="area">East Sussex &amp; Kent</div></div>
    <div class="card"><p><b>${offline ? 'No connection' : 'Couldn\'t load your jobs'}</b></p>
    <p class="muted small">${offline ? 'Check you have signal or Wi-Fi, then try again.' : esc(S.loadError)}</p>
    <button class="btn primary wide" data-act="retry">Try again</button>
    <button class="btn wide" style="margin-top:8px" data-act="signout">Sign out</button></div></div>`;
}

function notMemberView() {
  return `<div class="login"><div class="login-logo"><img src="img/house-gold.png" alt=""><span class="wordmark">C<i>&amp;</i>B</span><div class="tag">Air conditioning • Bathrooms • Plumbing</div><div class="area">East Sussex &amp; Kent</div></div>
    <div class="card"><p>You're signed in as <strong>${esc(S.session?.user?.email)}</strong>, but that email isn't on the members list.</p>
    <p class="muted small">Add it to the <code>members</code> table in Supabase (see README), then refresh.</p>
    <button class="btn wide" data-act="signout">Sign out</button></div></div>`;
}

// ======================================================================
// Jobs list
// ======================================================================
function jobsView() {
  const jobs = S.data.jobs;
  const live = jobs.filter(j => j.status === 'quoted' || j.status === 'active');
  const active = jobs.filter(j => j.status === 'active');
  const quoted = jobs.filter(j => j.status === 'quoted');
  const unpaid = jobs.filter(j => j.status === 'finished' && calc(j).balance > 0.004);
  const body = `
  <div class="glance">
    <button data-act="filter" data-f="active"><b>${active.length}</b><span>active job${active.length === 1 ? '' : 's'}</span></button>
    <button data-act="filter" data-f="quoted"><b>${money0(sum(quoted.map(j => calc(j).gross)))}</b><span>${quoted.length} quote${quoted.length === 1 ? '' : 's'} out</span></button>
    <button data-act="filter" data-f="owed" class="${unpaid.length ? 'warn' : ''}"><b>${money0(sum(unpaid.map(j => calc(j).balance)))}</b><span>owed to you</span></button>
  </div>
  ${stripHtml()}
  ${msgBannerHtml()}
  ${todoHtml()}
  <h2 class="section-title">Jobs</h2>
  <div class="toolbar">
    <input type="search" placeholder="Search address, customer or job" value="${esc(S.search)}" data-input="search">
  </div>
  <div class="chips">
    ${[['all', `Live (${live.length})`], ['active', 'Active'], ['quoted', 'Quoted'], ['owed', 'Owed']].map(([k, l]) =>
      `<button class="chip ${S.filter === k ? 'on' : ''}" data-act="filter" data-f="${k}">${l}</button>`).join('')}
  </div>
  <div id="job-list">${jobListHtml()}</div>`;
  return layout({
    title: 'Jobs', right: refreshBtn, body,
    fab: `<a class="fab fab-wide" href="#/edit/new">${ICON.plus}<span>New job</span></a>`,
  });
}

// Due-date label for a to-do: overdue / today / tomorrow / date
function dueChip(x) {
  if (!x.due_date) return '';
  const t = today();
  if (x.due_date < t) return `<span class="due over">Overdue · ${fmtShort(x.due_date)}</span>`;
  if (x.due_date === t) return '<span class="due today">Due today</span>';
  if (x.due_date === addDays(t, 1)) return '<span class="due soon">Due tomorrow</span>';
  return `<span class="due">Due ${fmtShort(x.due_date)}</span>`;
}
const taskSteps = x => (Array.isArray(x.steps) ? x.steps : null);
const sortTasks = list => list.slice().sort((a, b) =>
  String(a.due_date || '9999').localeCompare(String(b.due_date || '9999')) || String(a.created_at).localeCompare(String(b.created_at)));

function taskRowHtml(x) {
  const steps = taskSteps(x);
  if (!steps) {
    return `<div class="todo-item mine">
      <button class="tick" data-act="taskDone" data-id="${x.id}" aria-label="Done"></button>
      <button class="ti-main task-text" data-act="taskSheet" data-id="${x.id}">${esc(x.text)}${x.due_date ? `<br>${dueChip(x)}` : ''}</button>
    </div>`;
  }
  const done = steps.filter(st => st.done).length;
  const next = steps.find(st => !st.done);
  return `<div class="todo-item mine multi">
    <span class="step-count" aria-label="${done} of ${steps.length} steps done"><b>${done}</b>/${steps.length}</span>
    <div class="ti-main">
      <button class="task-text" data-act="taskSheet" data-id="${x.id}">${esc(x.text)}</button>
      <div class="step-bar"><i style="width:${steps.length ? (done / steps.length) * 100 : 0}%"></i></div>
      ${next ? `<div class="next-step"><span><em>Next:</em> ${esc(next.text)}</span><button class="btn small" data-act="stepDone" data-id="${x.id}" data-step="${esc(next.id)}">✓ Done</button></div>`
        : `<div class="next-step waiting"><span><em>What's next?</em></span><span class="btn-row"><button class="btn small primary" data-act="nextStepSheet" data-id="${x.id}">+ Next step</button><button class="btn small" data-act="taskDone" data-id="${x.id}">Finished</button></span></div>`}
      ${x.due_date ? dueChip(x) : ''}
    </div>
  </div>`;
}

function todoHtml() {
  const auto = todos();
  const mine = sortTasks((S.data.tasks || []).filter(x => !x.done));
  const total = mine.length + auto.length;
  const limit = 5;
  const shownMine = S.showAllTodos ? mine : mine.slice(0, limit);
  const shownAuto = S.showAllTodos ? auto : auto.slice(0, Math.max(0, limit - shownMine.length));
  const head = `<div class="row todo-head"><h3>To do ${total ? `<span class="count">${total}</span>` : ''}</h3>
      <span>${total > limit ? `<button class="link-btn" data-act="toggleTodos">${S.showAllTodos ? 'Show less' : `Show all ${total}`}</button>` : ''}<button class="add-day todo-add" data-act="taskSheet" aria-label="Add something to do">+</button></span></div>`;
  if (!total) return `<section class="card todo">${head}<p class="todo-clear">All caught up. Tap <b>+</b> to add something to do.</p></section>`;
  return `<section class="card todo">
    ${head}
    ${shownMine.map(taskRowHtml).join('')}
    ${shownAuto.map(t => `<div class="todo-item">
      <span class="ti-icon p${t.pri}">${t.icon}</span>
      <div class="ti-main">
        ${t.backup ? `<b>${t.text}</b>` : `<a href="#/job/${t.j.id}"><b>${t.text}</b> · ${esc(jobName(t.j))}</a>`}
        <div class="muted small">${t.backup ? t.sub : `${esc(jobSub(t.j))}${t.sub ? ` · ${t.sub}` : ''}`}</div>
        <div class="ti-actions">
          ${t.backup ? '<button class="btn small primary" data-act="export" data-what="backup">Download</button>' : ''}
          ${t.tpl && t.j.customer_phone ? `<a class="btn small primary" href="tel:${esc(String(t.j.customer_phone).replace(/[^\d+]/g, ''))}">${ICON.phone} Call</a>` : ''}
          ${t.extra || ''}
          ${t.tpl === 'chase_quote' || t.tpl === 'payment' || t.tpl === 'invoice_send' ? `<button class="btn small" data-act="markJob" data-id="${t.j.id}" data-f="chased_at" title="Mark as done for now">Done</button>` : ''}
        </div>
      </div>
    </div>`).join('')}
  </section>`;
}

// Quick due-date buttons: Today / Tomorrow / Friday / Next week / none
function dueField(val) {
  const t = today();
  const dow = parseISO(t).getDay();
  const fri = addDays(t, ((5 - dow + 7) % 7) || 7);
  const opts = [['Today', t], ['Tomorrow', addDays(t, 1)], ['Friday', fri], ['Next week', addDays(t, 7)]];
  return `<div class="field-label">Due date <span class="muted small">(optional)</span></div>
    <div class="chips wrap due-chips">${opts.map(([l, d]) => `<button type="button" class="chip ${val === d ? 'on' : ''}" data-act="pickDue" data-d="${d}">${l}</button>`).join('')}
      <button type="button" class="chip ${val ? '' : 'on'}" data-act="pickDue" data-d="">No date</button></div>
    <input type="date" name="due_date" value="${esc(val || '')}">`;
}

function addStepRow(form, text) {
  const list = form.querySelector('#step-list');
  list.insertAdjacentHTML('beforeend', stepRowHtml({ id: (crypto.randomUUID?.() || String(Date.now() + Math.random())), text, done: false }));
  form.dataset.dirty = '1';
}

// After the last planned step is ticked: what's next?
function nextStepSheet(id, justDone) {
  const x = (S.data.tasks || []).find(t => t.id === id);
  if (!x) return;
  const steps = taskSteps(x) || [];
  openSheet(`<form data-form="nextStep" class="form">
    ${sheetHead(justDone ? 'Step done ✓' : 'What\'s next?')}
    <input type="hidden" name="id" value="${x.id}">
    <p class="muted small">${esc(x.text)}${justDone ? ` · ticked off: <b>${esc(justDone)}</b>` : ''} · ${steps.length} step${steps.length === 1 ? '' : 's'} done so far</p>
    <label>What's the next step?<input name="step" placeholder="e.g. Wait for Aqualisa engineer date" autocomplete="off" enterkeyhint="done"></label>
    ${dueField(x.due_date)}
    <button class="btn primary wide big">Add next step</button>
    <div class="btn-row">
      <button type="button" class="btn grow" data-act="closeSheet">Not sure yet</button>
      <button type="button" class="btn grow" data-act="nextStepFinish" data-id="${x.id}">That's everything ✓</button>
    </div>
    <p class="muted small">"Not sure yet" keeps it on your list with a <b>What's next?</b> reminder.</p>
  </form>`);
  setTimeout(() => sheet.querySelector('[name=step]')?.focus(), 60);
}

function stepRowHtml(st) {
  return `<div class="step-row ${st.done ? 'done' : ''}" data-step-id="${esc(st.id)}">
    <label class="step-tick"><input type="checkbox" name="step_done" ${st.done ? 'checked' : ''}><span></span></label>
    <input name="step_text" value="${esc(st.text)}" placeholder="Step" autocomplete="off">
    <button type="button" class="step-del" data-act="stepDel" aria-label="Remove step">×</button>
  </div>`;
}

// Add / edit one of your own To do items
function taskSheet(id, kind) {
  if (S.data.tasksMissing) { toast('To-dos need the database set up: run supabase/schema.sql in Supabase', true); return; }
  const x = id ? (S.data.tasks || []).find(t => t.id === id) : { text: '', steps: kind === 'multi' ? [] : null };
  if (!x) return;
  // New to-do: ask which kind first
  if (!id && !kind) {
    openSheet(`<div class="form">
      ${sheetHead('Add to do')}
      <p class="muted choose-lead">What kind?</p>
      <button class="card choose" data-act="taskKind" data-k="quick">
        <span class="choose-icon">✓</span>
        <span><strong>A quick to-do</strong><em>One thing to do, e.g. order a shower tray</em></span>
      </button>
      <button class="card choose" data-act="taskKind" data-k="multi">
        <span class="choose-icon">☰</span>
        <span><strong>A multi-step to-do</strong><em>Several steps to tick off as you go, e.g. sorting a warranty claim</em></span>
      </button>
    </div>`);
    return;
  }
  const steps = taskSteps(x);
  const multi = !!steps;
  openSheet(`<form data-form="task" class="form">
    ${sheetHead(id ? (multi ? 'Multi-step to-do' : 'Edit to-do') : (multi ? 'New multi-step to-do' : 'New to-do'), id, 'tasks')}
    <input type="hidden" name="id" value="${id || ''}">
    <input type="hidden" name="multi" value="${multi ? '1' : ''}">
    <label>${multi ? 'What\'s it about?' : 'What needs doing?'}<input name="text" required value="${esc(x.text)}" placeholder="${multi ? 'e.g. Pamela – Aqualisa warranty' : 'e.g. Order shower tray for Mill Lane'}" autocomplete="off" enterkeyhint="${multi ? 'next' : 'done'}"></label>
    ${multi ? `
      <div class="field-label">Steps <span class="muted small">(tick them off as you go; add more any time)</span></div>
      <div class="step-list" id="step-list">${steps.map(stepRowHtml).join('')}</div>
      <div class="step-add"><input id="step-new" placeholder="Add a step, e.g. Call Aqualisa" autocomplete="off" enterkeyhint="done"><button type="button" class="btn" data-act="stepAdd">Add</button></div>` : ''}
    ${dueField(x.due_date)}
    <button class="btn primary wide big">Save</button>
  </form>`);
  setTimeout(() => sheet.querySelector(id && multi ? '#step-new' : '[name=text]')?.focus(), 60);
}

function matches(j, q) {
  if (!q) return true;
  q = q.toLowerCase();
  return [j.title, j.customer_name, j.address, j.postcode, j.customer_phone, j.description, `#${j.ref}`]
    .some(v => String(v || '').toLowerCase().includes(q));
}

function jobListHtml() {
  let list = S.data.jobs.slice();
  const f = S.filter;
  if (f === 'all') list = list.filter(j => j.status === 'quoted' || j.status === 'active');
  else if (f === 'owed') list = list.filter(j => j.status === 'finished' && calc(j).balance > 0.004);
  else list = list.filter(j => j.status === f);
  list = list.filter(j => matches(j, S.search));
  list.sort((a, b) => (STATUS_ORDER[a.status] - STATUS_ORDER[b.status])
    || String(a.start_date || '9999').localeCompare(String(b.start_date || '9999'))
    || String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
  if (!list.length) {
    return `<div class="empty">${S.data.jobs.length ? 'No jobs match.' : `No jobs yet. Tap <b>+</b> to add your first job or quote.${DEMO ? '<br><br><button class="btn primary" data-act="seed">Load sample jobs to try it out</button>' : ''}`}</div>`;
  }
  return list.map(jobCard).join('');
}

// The site visit to price up a quote: the job's next calendar "visit" entry
function visitOf(j) {
  return (S.data.events || []).filter(e => e.job_id === j.id && e.kind === 'visit' && !e.done)
    .sort((a, b) => String(a.event_date).localeCompare(String(b.event_date)))[0] || null;
}
const fmtTime = t => (t ? String(t).slice(0, 5) : '');

function jobCard(j) {
  const c = calc(j);
  const dates = j.start_date ? `${fmtShort(j.start_date)}${j.end_date && j.end_date !== j.start_date ? ` – ${fmtShort(j.end_date)}` : ''}` : '';
  let line = '';
  if (j.status === 'quoted') {
    const vis = visitOf(j);
    line = j.quote_date ? `<b>${money0(c.gross)}</b> quote · sent ${fmtShort(j.quote_date)}`
      : vis && vis.event_date >= today() ? `<b>Visit ${fmtShort(vis.event_date)}${vis.start_time ? ` ${fmtTime(vis.start_time)}` : ''}</b> · to price up`
      : `<b class="neg">Quote not sent yet</b>${c.gross ? ` · ${money0(c.gross)}` : ''}`;
  }
  else if (j.status === 'active') line = `${dates ? `<b>${dates}</b> · ` : '<b class="neg">No dates</b> · '}${c.balance > 0.004 ? `${money0(c.balance)} to collect` : 'paid'}`;
  else if (j.status === 'finished') line = c.balance > 0.004 ? `<b class="neg">Owed ${money(c.balance)}</b>` : `Paid · profit <b class="${c.profit < 0 ? 'neg' : 'pos'}">${money0(c.profit)}</b>`;
  else line = `Declined · ${money0(c.gross)}`;
  return `<a class="card job ${j.status}" href="#/job/${j.id}">
    <div class="row"><strong>${esc(jobName(j))}</strong>${pill(j.status)}</div>
    <div class="job-who">${esc(jobSub(j) || 'No customer')}</div>
    <div class="job-line">${line}</div>
  </a>`;
}

// ======================================================================
// Job detail
// ======================================================================
function jobView({ id }) {
  const j = jobById(id);
  if (!j) return layout({ title: 'Not found', back: true, body: '<div class="empty">This job no longer exists.</div>' });
  const c = calc(j);
  const phone = String(j.customer_phone || '').replace(/[^\d+]/g, '');
  const addr = [j.address, j.postcode].filter(Boolean).join(', ');
  const body = `
    <section class="hero">
      <div class="row"><h2>${esc(jobName(j))}</h2>${pill(j.status)}</div>
      <div class="hero-who">${esc(jobSub(j) || 'No customer')}${jobAddr(j) && j.postcode ? ` · ${esc(j.postcode)}` : ''}</div>
      <div class="quick">
        ${phone ? `<a href="tel:${esc(phone)}">${ICON.phone}<span>Call</span></a>` : '<span class="off">' + ICON.phone + '<span>Call</span></span>'}
        <a href="#/doc/${j.id}/${j.status === 'quoted' || j.status === 'declined' ? 'quote' : 'invoice'}">${ICON.doc}<span>${j.status === 'quoted' || j.status === 'declined' ? 'Quote' : 'Invoice'}</span></a>
        ${addr ? `<a href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addr)}" target="_blank" rel="noopener">${ICON.pin}<span>Directions</span></a>` : '<span class="off">' + ICON.pin + '<span>Directions</span></span>'}
      </div>
    </section>
    ${overviewTab(j, c)}`;
  return layout({
    title: `Job #${j.ref ?? ''}`, back: true, body,
    right: `<a class="btn small" href="#/edit/${id}">Edit</a>`,
  });
}

function statusActions(j) {
  const b = (s, label, cls = '') => `<button class="btn ${cls}" data-act="status" data-id="${j.id}" data-s="${s}">${label}</button>`;
  const steps = ['quoted', 'active', 'finished'];
  const idx = steps.indexOf(j.status);
  const stepper = `<div class="stepper">${steps.map((s, i) => `<div class="step ${i <= idx ? 'done' : ''} ${i === idx ? 'cur' : ''}"><span></span>${STATUS[s]}</div>`).join('')}</div>`;
  let btns = '';
  if (j.status === 'quoted') btns = b('active', 'Won it — mark Active', 'primary') + b('declined', 'Lost');
  else if (j.status === 'active') btns = b('finished', 'Mark Finished', 'primary');
  else if (j.status === 'finished') btns = b('active', 'Reopen');
  else btns = b('quoted', 'Reopen as quote');
  return `${j.status === 'declined' ? '<div class="note">This quote was declined. It\'s kept in the Archive.</div>' : stepper}<div class="btn-row">${btns}</div>`;
}

function overviewTab(j, c) {
  const quoted = j.status === 'quoted';
  const paidPct = c.gross > 0 ? Math.min(100, Math.max(0, (c.paid / c.gross) * 100)) : 0;
  const others = (() => {
    const key = (j.customer_name || '').trim().toLowerCase();
    return key ? S.data.jobs.filter(o => o.id !== j.id && (o.customer_name || '').trim().toLowerCase() === key) : [];
  })();
  const dates = j.start_date ? `${fmtDate(j.start_date, { weekday: 'short', day: 'numeric', month: 'short' })}${j.end_date && j.end_date !== j.start_date ? ` → ${fmtDate(j.end_date, { weekday: 'short', day: 'numeric', month: 'short' })}` : ''}` : '';

  return `
  <section class="card">${statusActions(j)}</section>

  <section class="card">
    <div class="big3">
      <button class="price-cell" data-act="priceSheet" data-id="${j.id}"><span>Price</span><b>${money0(c.gross)}</b>${j.vat_applies ? '<em>inc VAT</em>' : ''}<em class="change">✎ Change</em></button>
      <div><span>Costs</span><b>${money0(c.totalCost)}</b></div>
      <div><span>${quoted ? 'Est. profit' : 'Profit'}</span><b class="${c.profit < 0 ? 'neg' : 'pos'}">${money0(c.profit)}</b><em>${pct(c.margin)}</em></div>
    </div>
    ${c.ohpd > 0 && c.jobDays ? `<div class="after-oh">After overheads (${c.jobDays} day${c.jobDays === 1 ? '' : 's'}): <b class="${c.netProfit < 0 ? 'neg' : ''}">${money(c.netProfit)}</b></div>` : ''}
    ${quoted ? '' : `
    <div class="paybar"><i style="width:${paidPct}%"></i></div>
    <div class="row small paybar-label"><span>Paid ${money(c.paid)}</span><b class="${c.balance > 0.004 ? 'neg' : 'pos'}">${c.balance > 0.004 ? `${money(c.balance)} to collect` : c.balance < -0.004 ? `Overpaid ${money(-c.balance)}` : 'Paid in full'}</b></div>`}
  </section>

  ${photosTab(j)}
  ${costsTab(j, c)}
  ${payTab(j, c)}

  <section class="card">
    <h3>Details</h3>
    ${dates ? `<div class="kv"><span>On site</span><b>${dates}</b></div>` : '<div class="kv"><span>On site</span><b class="muted">No dates yet</b></div>'}
    ${j.address ? `<div class="kv"><span>Address</span><b class="addr">${nl2br([j.address, j.postcode].filter(Boolean).join(', '))}</b></div>` : ''}
    ${j.customer_phone ? `<div class="kv"><span>Phone</span><b>${esc(j.customer_phone)}</b></div>` : ''}
    ${j.customer_email ? `<div class="kv"><span>Email</span><b>${esc(j.customer_email)}</b></div>` : ''}
    ${j.status === 'quoted' && visitOf(j) ? `<div class="kv"><span>Quote visit</span><b>${fmtDate(visitOf(j).event_date)}${visitOf(j).start_time ? ` · ${fmtTime(visitOf(j).start_time)}` : ''}</b></div>` : ''}
    ${jobWhoLabel(j) ? `<div class="kv"><span>Who did it</span><b>${esc(jobWhoLabel(j))} · 100% to them</b></div>` : ''}
    <div class="kv"><span>Quote #${j.ref ?? ''}</span><b>${j.quote_date ? `sent ${fmtDate(j.quote_date)}` : j.status === 'quoted' ? '<span class="muted">not sent yet</span>' : '—'}</b></div>
    ${j.finished_date ? `<div class="kv"><span>Finished</span><b>${fmtDate(j.finished_date)}</b></div>` : ''}
    ${j.description ? `<h4>Scope of works</h4><p>${nl2br(j.description)}</p>` : ''}
    ${j.notes ? `<h4>Notes (just you two)</h4><p class="notes">${nl2br(j.notes)}</p>` : ''}
    ${others.length ? `<h4>Other jobs for ${esc(j.customer_name)}</h4>${others.map(o => `<a class="kv link" href="#/job/${o.id}"><span>${esc(jobName(o))}${jobAddr(o) ? ` <em class="muted">${esc(o.title || '')}</em>` : ''}</span><b>${pill(o.status)}</b></a>`).join('')}` : ''}
  </section>

  <div class="action-grid">
    <a class="btn" href="#/doc/${j.id}/quote">Quote PDF</a>
    <a class="btn" href="#/doc/${j.id}/invoice">Invoice PDF</a>
    ${S.data.eventsMissing ? '' : `<button class="btn" data-act="evSheet" data-job="${j.id}">+ Calendar</button>`}
    <button class="btn" data-act="duplicate" data-id="${j.id}">Duplicate</button>
    ${S.data.messagesMissing ? '' : `<button class="btn" data-act="msgSheet" data-job="${j.id}">${ICON.chat} Message ${esc(nameOf(otherOf(S.me)))}</button>`}
  </div>
  <button class="link-btn danger-link" data-act="deleteJob" data-id="${j.id}">Delete this job</button>`;
}

function costsTab(j, c) {
  const st = set();
  const byCat = {};
  c.costs.forEach(x => { byCat[x.category] = (byCat[x.category] || 0) + lineTotal(x); });
  const rows = c.costs.slice().sort((a, b) => String(b.cost_date || b.created_at).localeCompare(String(a.cost_date || a.created_at)));
  return `
  <section class="card sec" id="j-costs">
    <div class="row sec-head"><h3>Costs ${rows.length ? `<span class="count">${rows.length}</span>` : ''}</h3><b>${money(c.totalCost)}</b></div>
    <div class="list">
      ${rows.length ? rows.map(x => `
        <button class="item" data-act="costSheet" data-job="${j.id}" data-id="${x.id}">
          <div class="row"><strong>${esc(x.description)}</strong><b>${money(lineTotal(x))}</b></div>
          <div class="row small muted"><span>${num(x.qty) !== 1 ? `${r2(num(x.qty))} × ${money(x.unit_cost)} · ` : ''}${esc(COST_CATS[x.category] || x.category)}${x.supplier ? ` · ${esc(x.supplier)}` : ''}</span>
          <span><span class="who ${x.paid_by}">${esc(nameOf(x.paid_by))}</span>${x.cost_date ? ` ${fmtShort(x.cost_date)}` : ''}</span></div>
        </button>`).join('') : '<p class="muted small sec-empty">No costs yet. Add materials as you buy them, or before quoting to work out the price.</p>'}
    </div>
    ${rows.length ? `<div class="sec-foot small">
      <div class="kv"><span>Paid by ${esc(nameOf('a'))}</span><b>${money(c.costA)}</b></div>
      <div class="kv"><span>Paid by ${esc(nameOf('b'))}</span><b>${money(c.costB)}</b></div>
      ${Object.keys(byCat).length > 1 ? `<div class="cat-bars">${Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([k, v]) =>
        `<div class="cat"><span>${esc(COST_CATS[k] || k)}</span><i style="width:${c.totalCost ? Math.max(2, (v / c.totalCost) * 100) : 0}%"></i><b>${money(v)}</b></div>`).join('')}</div>` : ''}
    </div>` : ''}
    ${st.vat_registered ? '<p class="muted small">VAT registered: enter costs ex-VAT where you reclaim the VAT.</p>' : ''}
    <button class="btn primary wide" data-act="costSheet" data-job="${j.id}">${ICON.plus} Add cost</button>
  </section>`;
}

function payTab(j, c) {
  const rows = c.pays.slice().sort((a, b) => String(b.pay_date || '').localeCompare(String(a.pay_date || '')));
  return `
  <section class="card sec" id="j-paid">
    <div class="row sec-head"><h3>Payments ${rows.length ? `<span class="count">${rows.length}</span>` : ''}</h3><b>${money(c.paid)}</b></div>
    <div class="list">
      ${rows.length ? rows.map(x => `
        <button class="item" data-act="paySheet" data-job="${j.id}" data-id="${x.id}">
          <div class="row"><strong>${esc(PAY_KINDS[x.kind] || x.kind)}</strong><b>${money(x.amount)}</b></div>
          <div class="row small muted"><span>${fmtDate(x.pay_date)} · ${esc(PAY_METHODS[x.method] || x.method || '')}${x.note ? ` · ${esc(x.note)}` : ''}</span><span class="who ${x.received_by}">${esc(nameOf(x.received_by))}</span></div>
        </button>`).join('') : '<p class="muted small sec-empty">No payments yet.</p>'}
    </div>
    <div class="sec-foot">
      <div class="kv"><span>Job total${j.vat_applies ? ' (inc VAT)' : ''}</span><b>${money(c.gross)}</b></div>
      <div class="kv total"><span>${c.balance < -0.004 ? 'Overpaid' : 'Balance due'}</span><b class="${c.balance > 0.004 ? 'neg' : 'pos'}">${money(Math.abs(c.balance))}</b></div>
    </div>
    <div class="btn-row">
      <button class="btn primary grow" data-act="paySheet" data-job="${j.id}">${ICON.plus} Add payment</button>
      ${c.balance > 0.004 ? `<button class="btn grow" data-act="paidFull" data-id="${j.id}">Paid in full</button>` : ''}
    </div>
  </section>`;
}

function photosTab(j) {
  const ph = photosOf(j.id).slice().sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  const groups = {};
  ph.forEach(p => { (groups[p.kind || 'other'] ||= []).push(p); });
  const kind = S.photoKind?.[j.id] || (j.status === 'quoted' ? 'before' : j.status === 'finished' ? 'after' : 'during');
  const many = Object.keys(groups).length > 1;
  return `
  <section class="card sec" id="j-photos">
    <div class="row sec-head"><h3>Photos ${ph.length ? `<span class="count">${ph.length}</span>` : ''}</h3></div>
    ${ph.length ? Object.keys(PHOTO_KINDS).filter(k => groups[k]).map(k => `
      ${many ? `<h4 class="group">${PHOTO_KINDS[k]}</h4>` : ''}
      <div class="photos">${groups[k].map(p => `
        <button class="thumb" data-act="viewPhoto" data-id="${p.id}">
          ${S.urls[p.path] ? `<img src="${esc(S.urls[p.path])}" alt="${esc(p.caption || '')}" loading="lazy">` : '<span class="ph-load">…</span>'}
          ${p.caption ? `<span class="cap">${esc(p.caption)}</span>` : ''}
        </button>`).join('')}</div>`).join('') : ''}
    <div class="ph-add-row">
      <span class="small muted">Add as:</span>
      <div class="chips wrap ph-kinds">${Object.entries(PHOTO_KINDS).map(([k, l]) => `<button class="chip ${k === kind ? 'on' : ''}" data-act="photoKind" data-id="${j.id}" data-k="${k}">${l}</button>`).join('')}</div>
    </div>
    <div class="ph-add">
      <label class="btn primary ph-btn">${ICON.image}<span>Camera roll</span><input class="file-hidden" type="file" accept="image/*" multiple data-photo-job="${j.id}"></label>
      <label class="btn ph-btn">${ICON.camera}<span>Take photo</span><input class="file-hidden" type="file" accept="image/*" capture="environment" data-photo-job="${j.id}"></label>
    </div>
    <div class="ph-status muted small" id="ph-status"></div>
  </section>`;
}

// Upload photos straight after they're picked
async function uploadPhotos(jobId, files, input) {
  const kind = S.photoKind?.[jobId] || (() => { const j = jobById(jobId); return j.status === 'quoted' ? 'before' : j.status === 'finished' ? 'after' : 'during'; })();
  const status = document.getElementById('ph-status');
  const btns = document.querySelectorAll('.ph-btn');
  btns.forEach(b => b.classList.add('busy'));
  let done = 0;
  try {
    for (const f of files) {
      if (status) status.textContent = `Uploading ${done + 1} of ${files.length}…`;
      const blob = await compress(f);
      const path = `${jobId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
      await db.upload(path, blob);
      await saveRow('photos', null, { job_id: jobId, path, kind, caption: null });
      done++;
    }
    toast(`${done} photo${done === 1 ? '' : 's'} added`);
  } catch (err) {
    console.error(err);
    toast(done ? `${done} added, then: ${friendly(err)}` : friendly(err), true);
  } finally {
    if (input) input.value = '';
    btns.forEach(b => b.classList.remove('busy'));
    render();
    loadPhotoUrls(jobId);
  }
}

async function loadPhotoUrls(jobId) {
  const need = photosOf(jobId).map(p => p.path).filter(p => !S.urls[p]);
  if (!need.length) return;
  try {
    Object.assign(S.urls, await db.fileUrls(need));
    const r = route();
    if (r.view === 'job' && r.id === jobId && sheet.hidden) render();
  } catch (e) { console.error(e); }
}

// ======================================================================
// Edit / new job
// ======================================================================
// Previous customers (most recent details first)
function customers() {
  const seen = new Map();
  S.data.jobs.slice().sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))).forEach(j => {
    const k = (j.customer_name || '').trim().toLowerCase();
    if (k && !seen.has(k)) seen.set(k, j);
  });
  return [...seen.values()];
}

// Previously bought items (latest price first)
function pastItems() {
  const seen = new Map();
  S.data.costs.slice().sort((a, b) => String(b.cost_date || b.created_at || '').localeCompare(String(a.cost_date || a.created_at || ''))).forEach(c => {
    const k = (c.description || '').trim().toLowerCase();
    if (k && !seen.has(k)) seen.set(k, c);
  });
  return [...seen.values()];
}

// Switching between "New quote" and "New job" keeps what's been typed
function takeDraft() {
  const d = S.newDraft || {};
  S.newDraft = null;
  const keep = ['address', 'postcode', 'title', 'customer_name', 'customer_phone', 'customer_email', 'price', 'description', 'notes', 'start_date', 'end_date'];
  return Object.fromEntries(keep.filter(k => d[k]).map(k => [k, d[k]]));
}

// ======================================================================
// Notes: anything that doesn't fit a job
// ======================================================================
const noteTitle = n => String(n.text || '').trim().split('\n')[0].slice(0, 80) || 'Untitled';
const noteRest = n => String(n.text || '').trim().split('\n').slice(1).join('\n').trim();
const sortNotes = list => list.slice().sort((a, b) => (b.pinned - a.pinned) || String(b.updated_at || b.created_at).localeCompare(String(a.updated_at || a.created_at)));

function notesView() {
  if (S.data.notesMissing) {
    return layout({ title: 'Notes', body: `<section class="card"><h3>One quick database update needed</h3>
      <p>Notes need a new table in Supabase. Open the <b>SQL Editor</b> in Supabase, paste in <code>supabase/schema.sql</code> and press <b>Run</b> (it's safe to run again and doesn't touch your jobs). Then refresh.</p></section>` });
  }
  const all = S.data.notes || [];
  const body = `
  <button class="btn primary wide big" data-act="noteSheet">${ICON.plus} New note</button>
  ${all.length > 5 ? `<input class="search" type="search" placeholder="Search notes" value="${esc(S.noteSearch || '')}" data-input="noteSearch" style="margin-top:12px">` : ''}
  <div id="notes-list" style="margin-top:12px">${notesListHtml()}</div>`;
  return layout({ title: 'Notes', right: refreshBtn, body });
}

function notesListHtml() {
  const q = (S.noteSearch || '').toLowerCase();
  const all = sortNotes(S.data.notes || []);
  const list = q ? all.filter(n => String(n.text || '').toLowerCase().includes(q)) : all;
  return `${list.length ? list.map(n => `
    <button class="card note-card ${n.pinned ? 'pinned' : ''}" data-act="noteSheet" data-id="${n.id}">
      <span class="note-title">${n.pinned ? '📌 ' : ''}${esc(noteTitle(n))}</span>
      ${noteRest(n) ? `<span class="note-body">${esc(noteRest(n))}</span>` : ''}
      <span class="note-meta">${n.updated_by ? `${esc(n.updated_by)} · ` : ''}${fmtShort(String(n.updated_at || n.created_at).slice(0, 10))}</span>
    </button>`).join('')
    : q ? '<div class="empty">No notes match that.</div>'
    : `<div class="empty">Somewhere for anything that doesn't fit a job — key safe codes, supplier account numbers, sizes, ideas, things to buy for the van.<br><br>The first line of a note is its title. Pin the important ones to the top.</div>`}`;
}

function priceSheet(id) {
  const j = jobById(id);
  if (!j) return;
  const st = set();
  openSheet(`<form data-form="price" class="form">
    ${sheetHead('Change price')}
    <input type="hidden" name="id" value="${j.id}">
    <p class="muted small">${esc(jobName(j))} · currently <b>${money(num(j.price))}</b>${j.vat_applies ? ' + VAT' : ''}</p>
    <label>New price${j.vat_applies || st.vat_registered ? ' (ex VAT)' : ''} £<input name="price" type="number" inputmode="decimal" step="0.01" min="0" value="${esc(j.price ?? '')}" required></label>
    <button class="btn primary wide big">Save new price</button>
  </form>`);
  setTimeout(() => { const i = sheet.querySelector('[name=price]'); i?.focus(); i?.select(); }, 60);
}

function noteSheet(id) {
  if (S.data.notesMissing) { toast('Notes need the database set up: run supabase/schema.sql in Supabase', true); return; }
  const n = id ? (S.data.notes || []).find(x => x.id === id) : { text: '', pinned: false };
  if (!n) return;
  openSheet(`<form data-form="note" class="form note-edit">
    ${sheetHead(id ? 'Note' : 'New note', id, 'notes')}
    <input type="hidden" name="id" value="${id || ''}">
    <textarea name="text" required placeholder="First line is the title&#10;&#10;Then anything you like…">${esc(n.text || '')}</textarea>
    <label class="check"><input type="checkbox" name="pinned" ${n.pinned ? 'checked' : ''}> Pin to the top</label>
    ${id ? `<p class="muted small">Last changed${n.updated_by ? ` by ${esc(n.updated_by)}` : ''} ${fmtDate(String(n.updated_at || n.created_at).slice(0, 10))}</p>` : ''}
    <button class="btn primary wide big">Save</button>
  </form>`);
  if (!id) setTimeout(() => sheet.querySelector('[name=text]')?.focus(), 60);
}

function newChoiceView() {
  const body = `
  <p class="muted choose-lead">What are you adding?</p>
  <a class="card choose" href="#/edit/new-quote">
    <span class="choose-icon">${ICON.doc}</span>
    <span><strong>A quote</strong><em>Need to price it up first — maybe visit to have a look</em></span>
  </a>
  <a class="card choose" href="#/edit/new-job">
    <span class="choose-icon">${ICON.jobs}</span>
    <span><strong>A job</strong><em>Price agreed — the work is going ahead</em></span>
  </a>`;
  return layout({ title: 'New', back: true, body, nav: false });
}

function editView({ id }) {
  if (id === 'new') return newChoiceView();
  const isNew = id === 'new-quote' || id === 'new-job';
  const st = set();
  const j = isNew
    ? { status: id === 'new-job' ? 'active' : 'quoted', price: '', vat_applies: !!st.vat_registered, vat_rate: st.vat_rate, quote_date: null, quote_valid_days: st.quote_valid_days, ...takeDraft() }
    : jobById(id);
  if (!j) return layout({ title: 'Not found', back: true, body: '<div class="empty">Job not found.</div>' });
  const v = k => esc(j[k] ?? '');
  const quote = j.status === 'quoted';
  const vis = !isNew && quote ? visitOf(j) : null;
  const visitCard = `
    <section class="card">
      <h3>Quote visit</h3>
      <p class="muted small">Going round to look and price it up? Put it in and it goes on the calendar. Leave blank if you're quoting without visiting.</p>
      <div class="two">
        <label>Visit date<input name="visit_date" type="date" value="${esc(vis?.event_date || '')}"></label>
        <label>Time<input name="visit_time" type="time" value="${esc(fmtTime(vis?.start_time))}"></label>
      </div>
      <input type="hidden" name="visit_id" value="${esc(vis?.id || '')}">
    </section>`;
  const quoteSent = `
      <div class="two">
        <label>Date quote sent<input name="quote_date" type="date" value="${v('quote_date')}"></label>
        <label>Quote valid (days)<input name="quote_valid_days" type="number" min="0" value="${v('quote_valid_days')}"></label>
      </div>
      ${quote && !j.quote_date ? '<p class="muted small">Leave blank until it\'s sent — tapping <b>Send PDF</b> on the quote fills this in for you.</p>' : ''}`;
  const workDates = `
      <div class="two">
        <label>Job start<input name="start_date" type="date" value="${v('start_date')}"></label>
        <label>Job end<input name="end_date" type="date" value="${v('end_date')}"></label>
      </div>`;
  const body = `
  <form data-form="job" class="form">
    <input type="hidden" name="id" value="${isNew ? '' : esc(j.id)}">
    ${isNew ? `<div class="new-kind ${quote ? 'quoted' : 'active'}">${quote ? 'New quote' : 'New job'} <a href="#/edit/${quote ? 'new-job' : 'new-quote'}" data-act="swapKind">Change to ${quote ? 'job' : 'quote'}</a></div>` : ''}
    <section class="card">
      <h3>${quote ? 'What and where' : 'Job'}</h3>
      <label>Job address <span class="muted small">(this is the job's name)</span><textarea name="address" rows="2" autocapitalize="words" placeholder="e.g. 14 Sea Road, Bexhill-on-Sea">${v('address')}</textarea></label>
      <label>Postcode<input name="postcode" value="${v('postcode')}" autocapitalize="characters"></label>
      <label>What's the job? <span class="muted small">(a few words)</span><input name="title" required value="${v('title')}" placeholder="e.g. Bathroom install" list="job-types" autocomplete="off"></label>
      <div class="chips wrap job-types">${JOB_TYPES.map(t => `<button type="button" class="chip ${j.title === t ? 'on' : ''}" data-act="jobType" data-t="${esc(t)}">${esc(t)}</button>`).join('')}</div>
      <datalist id="job-types">${[...new Set(S.data.jobs.map(x => x.title).filter(Boolean))].filter(t => !JOB_TYPES.includes(t)).slice(0, 50).map(t => `<option value="${esc(t)}">`).join('')}</datalist>
      <div class="field-label">Who's doing it?</div>
      <div class="seg3">${[['both', 'Both · 50/50'], ['a', `${nameOf('a')} only`], ['b', `${nameOf('b')} only`]].map(([k, l]) =>
        `<label class="${(j.who || 'both') === k ? 'on' : ''}"><input type="radio" name="who" value="${k}" ${(j.who || 'both') === k ? 'checked' : ''} data-input="segpick">${l}</label>`).join('')}</div>
      ${isNew ? `<input type="hidden" name="status" value="${j.status}">` : `<label>Status<select name="status">${Object.entries(STATUS).map(([k, l]) => `<option value="${k}" ${j.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`}
    </section>
    <section class="card">
      <h3>Customer</h3>
      <label>Name<input name="customer_name" value="${v('customer_name')}" autocapitalize="words" autocomplete="off" list="customers" data-input="customer" placeholder="Start typing — returning customers fill in"></label>
      <datalist id="customers">${customers().map(cu => `<option value="${esc(cu.customer_name)}">${esc([cu.postcode, cu.customer_phone].filter(Boolean).join(' · '))}</option>`).join('')}</datalist>
      <div class="two">
        <label>Phone<input name="customer_phone" type="tel" value="${v('customer_phone')}"></label>
        <label>Email<input name="customer_email" type="email" value="${v('customer_email')}"></label>
      </div>
    </section>
    ${quote ? visitCard : ''}
    <section class="card">
      <h3>Price</h3>
      ${quote && isNew ? '<p class="muted small">Don\'t know yet? Leave it — fill it in after the visit.</p>' : ''}
      <label>Fixed price${st.vat_registered ? ' (ex VAT)' : ''} £<input name="price" type="number" inputmode="decimal" step="0.01" min="0" value="${v('price')}" placeholder="0"></label>
      ${st.vat_registered || j.vat_applies ? `
      <div class="two">
        <label class="check"><input type="checkbox" name="vat_applies" ${j.vat_applies ? 'checked' : ''}> Add VAT</label>
        <label>VAT rate %<input name="vat_rate" type="number" step="0.1" value="${v('vat_rate')}"></label>
      </div>` : `<input type="hidden" name="vat_rate" value="${v('vat_rate')}">`}
    </section>
    <section class="card">
      ${quote ? `<h3>Sending the quote</h3>${quoteSent}
        <h4>Pencil in the work <span class="muted small">(optional)</span></h4>
        <p class="muted small">Got rough dates in mind? They show on the calendar as <i>pencilled in</i> until it's confirmed.</p>${workDates}`
        : `<h3>Dates</h3>${workDates}${isNew ? `<input type="hidden" name="quote_valid_days" value="${v('quote_valid_days')}">` : `<h4>Quote</h4>${quoteSent}`}`}
    </section>
    <section class="card">
      <label>Scope of works <span class="muted small">(shown on quote & invoice)</span><textarea name="description" rows="5">${v('description')}</textarea></label>
      <label>Internal notes <span class="muted small">(only you two see these)</span><textarea name="notes" rows="3">${v('notes')}</textarea></label>
    </section>
    <button class="btn primary wide big">${isNew ? (quote ? 'Save quote' : 'Create job') : 'Save changes'}</button>
  </form>`;
  return layout({ title: isNew ? (quote ? 'New quote' : 'New job') : 'Edit', back: true, body, nav: false });
}

// ======================================================================
// Calendar
// ======================================================================
function jobSpan(j) {
  if (!j.start_date) return null;
  const s = j.start_date;
  const e = j.end_date && j.end_date >= s ? j.end_date : s;
  return [s, e];
}

// ----- Calendar data: jobs, your own entries, and deadlines -----
const EV_KINDS = { visit: 'Site visit / quote', collect: 'Collect materials', vehicle: 'Van MOT / service', meeting: 'Meeting / call', away: 'Holiday / away', other: 'Other' };
const EV_SHORT = { visit: 'Visit', work: 'Work', collect: 'Collect', vehicle: 'Van', meeting: 'Meeting', away: 'Away', other: 'Entry' };
const evSpan = e => [e.event_date, e.end_date && e.end_date >= e.event_date ? e.end_date : e.event_date];
const whoLabel = w => (w === 'a' ? nameOf('a') : w === 'b' ? nameOf('b') : 'Both');

// Deadlines that fall between two dates (anything overdue lands on today)
function deadlinesIn(from, to) {
  const st = set();
  const t = today();
  const map = {};
  const put = (iso, d) => {
    if (iso < t) iso = t;
    if (iso < from || iso > to) return;
    (map[iso] ||= []).push(d);
  };
  for (const j of S.data.jobs) {
    if (j.status === 'quoted' && j.quote_date) {
      const sent = j.quote_date;
      const valid = j.quote_valid_days && sent ? addDays(sent, num(j.quote_valid_days)) : null;
      if (valid && valid >= t) put(valid, { cls: 'warn', label: 'Quote expires', sub: jobName(j), href: `#/job/${j.id}` });
    }
  }
  // Yearly / quarterly bills (insurance, Gas Safe, etc.)
  for (const o of S.data.overheads || []) {
    const step = { yearly: 12, quarterly: 3 }[o.frequency];
    if (!step || !o.start_date) continue;
    const d = parseISO(o.start_date);
    let guard = 0;
    while (toISO(d) < from && guard++ < 400) d.setMonth(d.getMonth() + step);
    const iso = toISO(d);
    if (iso <= to && (!o.end_date || iso <= o.end_date)) {
      (map[iso] ||= []).push({ cls: 'bill', label: 'Renewal due', sub: `${o.name} · ${money(o.amount)}`, href: '#/overheads' });
    }
  }
  return map;
}

// A job shows on every day from its start date to its end date
function jobOnDay(j, iso) {
  const [a, b] = jobSpan(j);
  return iso >= a && iso <= b;
}

function dayData(iso, deadlines) {
  const jobs = S.data.jobs.filter(j => j.status !== 'declined' && jobSpan(j) && jobOnDay(j, iso));
  const events = (S.data.events || []).filter(e => { const [a, b] = evSpan(e); return iso >= a && iso <= b; })
    .sort((a, b) => String(a.start_time || '99').localeCompare(String(b.start_time || '99')));
  return { jobs, events, deadlines: deadlines[iso] || [] };
}

function dayItemsHtml(iso, dd, compactEmpty = true) {
  const t = today();
  const rows = [];
  dd.events.filter(e => e.kind === 'away').forEach(e => rows.push(`
    <button class="cal-item ev away ${e.done ? 'done' : ''}" data-act="evSheet" data-id="${e.id}">
      <span class="tag">Away</span><b>${esc(whoLabel(e.who))}${e.who === 'both' ? ' — both away' : ' away'}</b>${e.title && !/^holiday/i.test(e.title) ? `<span class="muted"> · ${esc(e.title)}</span>` : ''}
    </button>`));
  dd.jobs.forEach(j => {
    const addr = [j.address, j.postcode].filter(Boolean).join(', ');
    rows.push(`<div class="cal-item job ${j.status}">
      <a href="#/job/${j.id}" class="ci-main">
        <b>${esc(jobName(j))}</b>
        <div class="muted small">${esc(jobSub(j))}${j.status === 'quoted' ? ' · <i>pencilled in</i>' : ''}</div>
      </a>
      ${addr && iso >= t && j.status !== 'finished' ? `<a class="btn small" href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addr)}" target="_blank" rel="noopener">${ICON.pin}</a>` : ''}
    </div>`);
  });
  dd.events.filter(e => e.kind !== 'away').forEach(e => {
    const job = e.job_id ? jobById(e.job_id) : null;
    rows.push(`<div class="cal-item ev ${e.done ? 'done' : ''}">
      <button class="tick ${e.done ? 'on' : ''}" data-act="evDone" data-id="${e.id}" aria-label="Done">${e.done ? '✓' : ''}</button>
      <button class="ci-main" data-act="evSheet" data-id="${e.id}">
        ${e.start_time ? `<span class="time">${esc(String(e.start_time).slice(0, 5))}</span>` : ''}<span class="tag">${EV_SHORT[e.kind] || 'Entry'}</span><b>${esc(e.title)}</b>
        <div class="muted small">${esc(whoLabel(e.who))}${job ? ` · ${esc(jobName(job))}` : ''}${e.notes ? ` · ${esc(e.notes)}` : ''}</div>
      </button>
    </div>`);
  });
  dd.deadlines.forEach(d => rows.push(`<a class="cal-item dl ${d.cls}" href="${d.href}"><span class="tag">${esc(d.label)}</span>${esc(d.sub)}</a>`));
  if (!rows.length) {
    return '<div class="cal-free">Free — nothing booked</div>';
  }
  return rows.join('');
}

function stripHtml() {
  const t = today();
  const to = addDays(t, 13);
  const dl = deadlinesIn(t, to);
  let cells = '';
  let todayCount = 0;
  let tomorrowCount = 0;
  for (let i = 0; i < 14; i++) {
    const iso = addDays(t, i);
    const dd = dayData(iso, dl);
    const n = dd.jobs.length + dd.events.length + dd.deadlines.length;
    if (i === 0) todayCount = n;
    if (i === 1) tomorrowCount = n;
    const away = dd.events.some(e => e.kind === 'away');
    const dots = [
      ...dd.jobs.slice(0, 3).map(j => `<i class="${j.status}"></i>`),
      ...dd.events.filter(e => e.kind !== 'away').slice(0, 2).map(() => '<i class="event"></i>'),
      ...(dd.deadlines.length ? ['<i class="deadline"></i>'] : []),
    ].join('');
    const d = parseISO(iso);
    cells += `<button class="sday ${i === 0 ? 'today' : ''} ${away ? 'away' : ''} ${n ? '' : 'free'} ${S.stripDay === iso ? 'sel' : ''}" data-act="stripDay" data-d="${iso}" aria-expanded="${S.stripDay === iso}">
      <span class="dow">${d.toLocaleDateString('en-GB', { weekday: 'short' })}</span><span class="dn">${d.getDate()}</span><span class="dots">${dots}</span></button>`;
  }
  const say = (n, w) => (n ? `${n} thing${n === 1 ? '' : 's'} ${w}` : `Nothing ${w}`);
  return `<section class="card strip">
    <a class="row strip-head" href="#/calendar"><h3>Next 2 weeks</h3><span class="muted small">Open calendar ›</span></a>
    <div class="sgrid">${cells}</div>
    ${S.stripDay && S.stripDay >= t && S.stripDay <= to ? `
    <div class="strip-day">
      <div class="row day-head"><span><b>${parseISO(S.stripDay).toLocaleDateString('en-GB', { weekday: 'long' })}</b> <span class="muted">${fmtShort(S.stripDay)}</span>${S.stripDay === t ? ' <span class="day-badge">Today</span>' : S.stripDay === addDays(t, 1) ? ' <span class="day-badge soft">Tomorrow</span>' : ''}</span>
        <span>${S.data.eventsMissing ? '' : `<button class="add-day" data-act="evSheet" data-date="${S.stripDay}" aria-label="Add entry">+</button>`}<button class="add-day close" data-act="stripDay" data-d="${S.stripDay}" aria-label="Close">×</button></span></div>
      ${dayItemsHtml(S.stripDay, dayData(S.stripDay, dl))}
    </div>` : `<div class="muted small strip-sum">${say(todayCount, 'today')} · ${say(tomorrowCount, 'tomorrow').replace(/^N/, 'n')}<br>Tap a day to see what's on</div>`}
  </section>`;
}

// Short label for a calendar square, e.g. "3 Mill Lane"
const calLabel = j => (jobAddr(j).split(',')[0] || j.title || 'Job');

function calendarView() {
  const t = today();
  const now = new Date();
  const m = S.calMonth || `${now.getFullYear()}-${z2(now.getMonth() + 1)}`;
  const [yy, mm] = m.split('-').map(Number);
  const first = new Date(yy, mm - 1, 1);
  const startOffset = (first.getDay() + 6) % 7; // Monday first
  const daysInMonth = new Date(yy, mm, 0).getDate();
  const mFrom = `${yy}-${z2(mm)}-01`;
  const mTo = `${yy}-${z2(mm)}-${z2(daysInMonth)}`;
  const dl = deadlinesIn(mFrom, mTo);
  if (!S.calDay || S.calDay < mFrom || S.calDay > mTo) S.calDay = t >= mFrom && t <= mTo ? t : mFrom;
  const sel = S.calDay;

  let cells = '';
  for (let i = 0; i < startOffset; i++) cells += '<div class="mday blank"></div>';
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${yy}-${z2(mm)}-${z2(d)}`;
    const dd = dayData(iso, dl);
    const bars = [
      ...dd.events.filter(e => e.kind === 'away').map(e => `<span class="mbar away">${esc(whoLabel(e.who))} away</span>`),
      ...dd.jobs.map(j => `<span class="mbar ${j.status}">${esc(calLabel(j))}</span>`),
      ...dd.events.filter(e => e.kind !== 'away').map(e => `<span class="mbar ev ${e.done ? 'done' : ''}">${e.start_time ? `${esc(String(e.start_time).slice(0, 5))} ` : ''}${esc(e.title)}</span>`),
      ...dd.deadlines.map(x => `<span class="mbar dl ${x.cls}">${x.cls === 'bill' ? 'Renewal' : 'Quote expires'}</span>`),
    ];
    const shown = bars.slice(0, 3).join('');
    const more = bars.length > 3 ? `<span class="mmore">+${bars.length - 3} more</span>` : '';
    cells += `<button class="mday ${iso === t ? 'today' : ''} ${iso === sel ? 'sel' : ''} ${iso < t ? 'past' : ''}" data-act="calDay" data-d="${iso}">
      <span class="mnum">${d}</span>${shown}${more}</button>`;
  }
  const trailing = (7 - ((startOffset + daysInMonth) % 7)) % 7;
  for (let i = 0; i < trailing; i++) cells += '<div class="mday blank"></div>';

  const prev = new Date(yy, mm - 2, 1);
  const next = new Date(yy, mm, 1);
  const ym = d => `${d.getFullYear()}-${z2(d.getMonth() + 1)}`;
  const thisMonth = `${now.getFullYear()}-${z2(now.getMonth() + 1)}`;
  const unscheduled = S.data.jobs.filter(j => j.status === 'active' && !j.start_date);
  const missing = S.data.eventsMissing ? '<div class="note">Calendar entries need the database set up: run <code>supabase/schema.sql</code> in the Supabase SQL Editor (safe to run again), then refresh.</div>' : '';
  const body = `${missing}
  <section class="card month">
    <div class="row cal-head">
      <button class="icon-btn" data-act="calMonth" data-m="${ym(prev)}" aria-label="Previous month">${ICON.back}</button>
      <b>${first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</b>
      <button class="icon-btn flip" data-act="calMonth" data-m="${ym(next)}" aria-label="Next month">${ICON.back}</button>
    </div>
    ${m !== thisMonth ? `<button class="link-btn month-today" data-act="calMonth" data-m="${thisMonth}">Back to this month</button>` : ''}
    <div class="mgrid">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => `<div class="mdow">${d}</div>`).join('')}${cells}</div>
    <div class="legend"><span><i class="active"></i>Job</span><span><i class="quoted"></i>Pencilled in</span><span><i class="event"></i>Entry</span><span><i class="deadline"></i>Deadline</span></div>
  </section>
  <section class="card cal-day ${sel === t ? 'is-today' : ''}" id="d-${sel}">
    <div class="row day-head"><span><b>${parseISO(sel).toLocaleDateString('en-GB', { weekday: 'long' })}</b> <span class="muted">${fmtDate(sel, { day: 'numeric', month: 'long' })}</span>${sel === t ? ' <span class="day-badge">Today</span>' : sel === addDays(t, 1) ? ' <span class="day-badge soft">Tomorrow</span>' : ''}</span>
      ${S.data.eventsMissing ? '' : `<button class="add-day" data-act="evSheet" data-date="${sel}" aria-label="Add entry">+</button>`}</div>
    ${dayItemsHtml(sel, dayData(sel, dl))}
  </section>
  ${unscheduled.length ? `<h3 class="group">Won but no dates yet</h3><div class="list">${unscheduled.map(j => `<a class="item" href="#/edit/${j.id}"><div class="row"><strong>${esc(jobName(j))}</strong><span class="btn small">Set dates</span></div><div class="small muted">${esc(jobSub(j))}</div></a>`).join('')}</div>` : ''}`;
  const fab = S.data.eventsMissing ? '' : `<button class="fab" data-act="evSheet" data-date="${sel}" aria-label="Add calendar entry">${ICON.plus}</button>`;
  return layout({ title: 'Calendar', right: refreshBtn, body, fab });
}

// Add / edit a calendar entry
function evSheet(id, date, jobId) {
  const x = id ? (S.data.events || []).find(e => e.id === id)
    : { kind: 'visit', who: S.me, event_date: date || today(), job_id: jobId || null, done: false };
  if (!x) return;
  const v = k => esc(x[k] ?? '');
  const jobs = S.data.jobs.filter(j => j.status === 'quoted' || j.status === 'active' || j.id === x.job_id)
    .sort((a, b) => jobName(a).localeCompare(jobName(b)));
  openSheet(`<form data-form="event" class="form">
    ${sheetHead(id ? 'Edit entry' : 'Add to calendar', id, 'events')}
    <input type="hidden" name="id" value="${id || ''}">
    <div class="chips wrap">${Object.entries(EV_KINDS).map(([k, l]) => `<button type="button" class="chip ${x.kind === k ? 'on' : ''}" data-act="evKind" data-k="${k}">${l}</button>`).join('')}</div>
    <input type="hidden" name="kind" value="${v('kind')}">
    <label>What<input name="title" required value="${v('title')}" placeholder="e.g. Quote visit — bathroom"></label>
    <div class="two">
      <label>Date<input name="event_date" type="date" required value="${v('event_date')}"></label>
      <label>Time <span class="muted small">(optional)</span><input name="start_time" type="time" value="${esc(String(x.start_time || '').slice(0, 5))}"></label>
      <label>Until <span class="muted small">(multi-day)</span><input name="end_date" type="date" value="${v('end_date')}"></label>
      <label>Who<select name="who">${opts({ both: 'Both of us', a: nameOf('a'), b: nameOf('b') }, x.who)}</select></label>
    </div>
    <label>For job <span class="muted small">(optional)</span><select name="job_id"><option value="">— none —</option>${jobs.map(j => `<option value="${j.id}" ${j.id === x.job_id ? 'selected' : ''}>${esc(jobName(j))}${jobSub(j) ? ` — ${esc(jobSub(j))}` : ''}</option>`).join('')}</select></label>
    <label>Notes<input name="notes" value="${v('notes')}" placeholder="e.g. bring ladder, gate code 1234"></label>
    ${id ? `<label class="check"><input type="checkbox" name="done" ${x.done ? 'checked' : ''}> Done</label>` : ''}
    <button class="btn primary wide big">Save</button>
  </form>`);
}


// ======================================================================
// Archive
// ======================================================================
function archiveView() {
  const all = S.data.jobs.filter(j => j.status === 'finished' || j.status === 'declined');
  const years = [...new Set(all.map(j => (j.finished_date || j.updated_at || '').slice(0, 4)).filter(Boolean))].sort().reverse();
  const body = `
  <div class="toolbar"><input type="search" placeholder="Search archive…" value="${esc(S.archiveSearch)}" data-input="archiveSearch"></div>
  <div class="chips">
    ${['all', ...years, 'declined'].map(y => `<button class="chip ${S.archiveYear === y ? 'on' : ''}" data-act="archiveYear" data-y="${y}">${y === 'all' ? 'All finished' : y === 'declined' ? 'Declined' : y}</button>`).join('')}
  </div>
  <div id="archive-list">${archiveListHtml()}</div>`;
  return layout({ title: 'Archive', right: refreshBtn, body });
}

function archiveListHtml() {
  const y = S.archiveYear;
  let list = S.data.jobs.filter(j => (y === 'declined' ? j.status === 'declined' : j.status === 'finished'));
  if (y !== 'all' && y !== 'declined') list = list.filter(j => (j.finished_date || j.updated_at || '').startsWith(y));
  list = list.filter(j => matches(j, S.archiveSearch));
  list.sort((a, b) => String(b.finished_date || b.updated_at || '').localeCompare(String(a.finished_date || a.updated_at || '')));
  if (!list.length) return '<div class="empty">Nothing here yet. Finished jobs land here.</div>';
  let head = '';
  if (y !== 'declined') {
    const cs = list.map(calc);
    const profit = sum(cs.map(c => c.profit));
    head = `<section class="card"><div class="money-grid">
      <div><span>Jobs</span><b>${list.length}</b></div>
      <div><span>Revenue</span><b>${money(sum(cs.map(c => c.price)))}</b></div>
      <div><span>Profit</span><b class="${profit < 0 ? 'neg' : 'pos'}">${money(profit)}</b></div>
      <div><span>Avg margin</span><b>${sum(cs.map(c => c.price)) ? pct(profit / sum(cs.map(c => c.price))) : '—'}</b></div>
    </div></section>`;
  }
  return head + list.map(jobCard).join('');
}

// ======================================================================
// Money / reports
// ======================================================================
function moneyView() {
  const jobs = S.data.jobs;
  const cur = taxYearOf(today());
  const yrs = new Set([cur]);
  jobs.forEach(j => { if (j.finished_date) yrs.add(taxYearOf(j.finished_date)); });
  S.data.payments.forEach(p => { if (p.pay_date) yrs.add(taxYearOf(p.pay_date)); });
  const years = [...yrs].filter(Boolean).sort((a, b) => b - a);
  const ty = S.taxYear ?? cur;
  const inTy = iso => iso && taxYearOf(iso) === ty;

  const fin = jobs.filter(j => j.status === 'finished' && inTy(j.finished_date));
  const cs = fin.map(calc);
  const rev = sum(cs.map(c => c.price));
  const cost = sum(cs.map(c => c.totalCost));
  const profit = rev - cost;
  const shareA = sum(cs.map(c => c.shareA));
  const shareB = sum(cs.map(c => c.shareB));
  const oh = ohPeriod(tyStart(ty), ty === cur ? today() : tyEnd(ty));
  const net = profit - oh.total;

  const pays = S.data.payments.filter(p => inTy(p.pay_date));
  const costsY = S.data.costs.filter(c => inTy(c.cost_date || c.created_at));
  const inA = sum(pays.filter(p => p.received_by !== 'b').map(p => num(p.amount)));
  const inB = sum(pays.filter(p => p.received_by === 'b').map(p => num(p.amount)));
  const outA = sum(costsY.filter(c => c.paid_by !== 'b').map(lineTotal));
  const outB = sum(costsY.filter(c => c.paid_by === 'b').map(lineTotal));

  const quoted = jobs.filter(j => j.status === 'quoted');
  const active = jobs.filter(j => j.status === 'active');
  const owed = jobs.filter(j => j.status === 'finished' && calc(j).balance > 0.004);
  const decided = jobs.filter(j => ['active', 'finished', 'declined'].includes(j.status) && j.quote_date);
  const won = decided.filter(j => j.status !== 'declined');

  const body = `
  <div class="chips">${years.map(y => `<button class="chip ${y === ty ? 'on' : ''}" data-act="taxYear" data-y="${y}">${tyLabel(y)}</button>`).join('')}</div>
  <p class="muted small pad">UK tax year 6 Apr ${ty} – 5 Apr ${ty + 1}.</p>

  <section class="card">
    <h3>Finished jobs this tax year</h3>
    <div class="money-grid">
      <div><span>Jobs</span><b>${fin.length}</b></div>
      <div><span>Revenue (ex VAT)</span><b>${money(rev)}</b></div>
      <div><span>Costs</span><b>${money(cost)}</b></div>
      <div><span>Profit</span><b class="${profit < 0 ? 'neg' : 'pos'}">${money(profit)}</b><em>${rev ? pct(profit / rev) : '—'} margin</em></div>
      <div><span>Overheads${ty === cur ? ' so far' : ''}</span><b>${money(oh.total)}</b></div>
      <div><span>Net profit</span><b class="${net < 0 ? 'neg' : 'pos'}">${money(net)}</b><em>after overheads</em></div>
    </div>
    <table class="split">
      <thead><tr><th></th><th>${esc(nameOf('a'))}</th><th>${esc(nameOf('b'))}</th></tr></thead>
      <tbody>
        <tr><td>Job profit share</td><td>${money(shareA)}</td><td>${money(shareB)}</td></tr>
        <tr><td>Overheads share</td><td>−${money(oh.shareA)}</td><td>−${money(oh.shareB)}</td></tr>
        <tr class="b"><td>Net share</td><td>${money(shareA - oh.shareA)}</td><td>${money(shareB - oh.shareB)}</td></tr>
      </tbody>
    </table>
  </section>

  <section class="card">
    <h3>Waiting on payment</h3>
    ${owed.length ? owed.map(j => { const c = calc(j); return `<a class="kv link" href="#/job/${j.id}"><span>${esc(jobName(j))} <em class="muted">${esc(jobSub(j))}</em></span><b class="neg">${money(c.balance)}</b></a>`; }).join('') : '<p class="muted small">Nobody owes you anything.</p>'}
  </section>

  <h2 class="section-title" id="overheads">Overheads</h2>
  ${overheadsBody()}



  <h2 class="section-title">Backup</h2>
  <section class="card">
    <h3>Export</h3>
    <div class="btn-row wrap">
      <button class="btn" data-act="export" data-what="jobs">Jobs CSV</button>
      <button class="btn" data-act="export" data-what="costs">Costs CSV</button>
      <button class="btn" data-act="export" data-what="payments">Payments CSV</button>
      <button class="btn" data-act="export" data-what="overheads">Overheads CSV</button>
      <button class="btn" data-act="export" data-what="backup">Full backup (JSON)</button>
    </div>
  </section>`;
  return layout({ title: 'Money', right: refreshBtn, body });
}

// ======================================================================
// Settings
// ======================================================================
// ======================================================================
// Phone notifications
// ======================================================================
const VAPID_PUBLIC_KEY = 'BMTzNUAP9jdgD0UhtQVx0efe7ZcLiSOyWzT60q3iVYNWnBs5ZnGyKchNYLaomToTjxFxRkYVcZvq6YuFG5un7PA';
const PUSH_DEFAULTS = { morning: true, visits: true, jobs: true, money: true, changes: false, messages: true };
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
const pushCapable = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const deviceName = () => (isIOS() ? 'iPhone' : /Android/i.test(navigator.userAgent) ? 'Android' : 'Computer');
function b64ToBytes(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, ch => ch.charCodeAt(0));
}
async function swReg() {
  return Promise.race([navigator.serviceWorker.ready, new Promise((_, rej) => setTimeout(() => rej(new Error('The app is still installing. Close it and open it again, then try once more.')), 8000))]);
}

// Works out this phone's notification state, then redraws the card
async function refreshPush() {
  const P = (S.push = { ...(S.push || {}), status: 'checking' });
  try {
    if (DEMO || !db.pushSupported) P.status = 'demo';
    else if (!pushCapable()) P.status = isIOS() && !isStandalone() ? 'needs-install' : 'unsupported';
    else if (Notification.permission === 'denied') P.status = 'blocked';
    else {
      const reg = await swReg();
      const sub = await reg.pushManager.getSubscription();
      if (!sub) P.status = 'off';
      else {
        let row = await db.pushGet(sub.endpoint);
        if (!row) row = await db.pushSave(sub, PUSH_DEFAULTS, deviceName());
        Object.assign(P, { status: 'on', endpoint: sub.endpoint, prefs: { ...PUSH_DEFAULTS, ...(row.prefs || {}) } });
      }
    }
  } catch (e) { P.status = 'error'; P.error = e.message || String(e); }
  const card = document.getElementById('notif-card');
  if (card) card.innerHTML = notifCardHtml();
}

function notifCardHtml() {
  const P = S.push || { status: 'checking' };
  if (!S.push) setTimeout(refreshPush, 0);
  let mine = S.meKnown ? S.me : null;
  if (!mine) { try { mine = localStorage.getItem('cb-me'); } catch { /* ignore */ } }
  const other = mine === 'a' ? nameOf('b') : mine === 'b' ? nameOf('a') : 'the other one of you';
  const head = '<h3>Notifications</h3>';
  const msg = {
    checking: '<p class="muted small">Checking…</p>',
    demo: '<p class="muted small">Phone notifications work once you\'re signed in to your real account (not in the demo).</p>',
    'needs-install': '<p>To get notifications on iPhone, C&amp;B Jobs needs to be on your home screen. Open it from the <b>C&amp;B icon</b> (not Safari), then come back here.</p>',
    unsupported: '<p class="muted small">This browser can\'t do notifications. On iPhone, add C&amp;B Jobs to your home screen and open it from there.</p>',
    blocked: '<p>Notifications are blocked for C&amp;B Jobs on this phone. Turn them on in your phone\'s <b>Settings → Notifications → C&amp;B Jobs</b>, then reopen the app.</p>',
    error: `<p class="muted small">Couldn't check notifications: ${esc(P.error || '')}</p><button class="btn" data-act="pushRefresh">Try again</button>`,
  }[P.status];
  if (msg) return head + msg;
  if (P.status === 'off') {
    return `${head}<p class="muted small">Get a nudge on this phone: an 8am summary of the day, a reminder an hour before quote visits, and more. You choose which.</p>
      <button class="btn primary wide big" data-act="pushOn">Turn on notifications</button>`;
  }
  const row = (k, title, sub) => `<label class="switch-row"><span><b>${title}</b><em>${sub}</em></span>
      <input type="checkbox" class="switch" data-input="pushPref" data-k="${k}" ${P.prefs?.[k] ? 'checked' : ''}></label>`;
  return `${head}<p class="muted small">On for this phone. Each phone has its own switches.</p>
    <div class="switches">
      ${row('messages', `Messages from ${esc(other === 'the other one of you' ? 'each other' : other)}`, 'Pops up as soon as it\'s sent')}
      ${row('morning', 'Morning summary', '8am: today\'s visits, jobs, to-dos and money owed')}
      ${row('visits', 'Visits & appointments', '1 hour before, with the address')}
      ${row('jobs', 'Jobs starting tomorrow', '6pm the evening before')}
      ${row('money', 'Money', 'Invoices going overdue (9am) · bills of £50+ due tomorrow (6pm)')}
      ${row('changes', `When ${esc(other)} adds things`, 'New jobs, costs, payments, calendar entries and to-dos')}
    </div>
    <div class="btn-row wrap">
      <button class="btn" data-act="pushTest">Send a test</button>
      <button class="btn" data-act="pushOff">Turn off on this phone</button>
    </div>`;
}

function settingsView() {
  const s = set();
  const v = k => esc(s[k] ?? '');
  const body = `
  <form data-form="settings" class="form">
    <section class="card">
      <h3>Business details <span class="muted small">(on quotes &amp; invoices)</span></h3>
      <label>Business name<input name="business_name" value="${v('business_name')}"></label>
      <label>Tagline<input name="tagline" value="${v('tagline')}"></label>
      <label>Phone<input name="phone" value="${v('phone')}" inputmode="tel"></label>
      <label>Email<input name="email" value="${v('email')}" inputmode="email"></label>
      <label>Website<input name="website" value="${v('website')}"></label>
      <label>Area covered<input name="area" value="${v('area')}"></label>
      <h4>Bank details <span class="muted small">(printed on invoices)</span></h4>
      <label>Account name<input name="bank_name" value="${v('bank_name')}"></label>
      <div class="two">
        <label>Sort code<input name="bank_sort" value="${v('bank_sort')}" inputmode="numeric" placeholder="00-00-00"></label>
        <label>Account number<input name="bank_acc" value="${v('bank_acc')}" inputmode="numeric"></label>
      </div>
    </section>
    <section class="card">
      <h3>VAT</h3>
      <label class="check"><input type="checkbox" name="vat_registered" ${s.vat_registered ? 'checked' : ''}> We're VAT registered</label>
      <div class="two">
        <label>VAT number<input name="vat_number" value="${v('vat_number')}"></label>
        <label>VAT rate %<input name="vat_rate" type="number" step="0.1" value="${v('vat_rate')}"></label>
      </div>
      <p class="muted small">Leave unticked until you register. When ticked, new jobs add VAT and quotes/invoices show it.</p>
    </section>
    <button class="btn primary wide big">Save settings</button>
  </form>
  <section class="card" id="notif-card">${notifCardHtml()}</section>
  <section class="card">
    <p class="muted small">Signed in as ${S.meKnown ? `<b>${esc(nameOf(S.me))}</b> · ` : ''}${esc(S.session?.user?.email || '')}${S.live ? ' · <span class="live-dot"></span> live sync on' : ''}<br>App version ${APP_VERSION}</p>
    <div class="btn-row wrap">
      ${DEMO ? '' : '<button class="btn" data-act="changePw">Change password</button>'}
      ${DEMO ? '<button class="btn" data-act="seed">Load sample jobs</button><button class="btn danger" data-act="resetDemo">Wipe demo data</button>' : '<button class="btn" data-act="signout">Sign out</button>'}
    </div>
  </section>`;
  return layout({ title: 'Settings', body });
}

// ======================================================================
// Overheads
// ======================================================================
// Dates a bill falls due between two dates (from its start date, repeating)
function ohDueDates(o, from, to) {
  if (!o.start_date) return [];
  if (o.frequency === 'oneoff') return o.start_date >= from && o.start_date <= to ? [o.start_date] : [];
  const d = parseISO(o.start_date);
  const step = () => (o.frequency === 'weekly' ? d.setDate(d.getDate() + 7) : d.setMonth(d.getMonth() + ({ monthly: 1, quarterly: 3, yearly: 12 }[o.frequency] || 12)));
  let guard = 0;
  while (toISO(d) < from && guard++ < 3000) step();
  const out = [];
  while (toISO(d) <= to && guard++ < 3000) {
    const iso = toISO(d);
    if (o.end_date && iso > o.end_date) break;
    out.push(iso);
    step();
  }
  return out;
}

// Profit from jobs finished between two dates
const profitBetween = (from, to) => sum(S.data.jobs.filter(j => j.status === 'finished' && j.finished_date && j.finished_date >= from && j.finished_date <= to).map(j => calc(j).profit));
const finishedBetween = (from, to) => S.data.jobs.filter(j => j.status === 'finished' && j.finished_date && j.finished_date >= from && j.finished_date <= to);

// "Are we covering our running costs?" for a month
function ohCover(monthStartIso) {
  const d = parseISO(monthStartIso);
  const from = monthStartIso;
  const end = toISO(new Date(d.getFullYear(), d.getMonth() + 1, 0));
  const to = end < today() ? end : today();
  // the month's bills: regular ones at their monthly rate, plus any one-offs paid that month
  const costs = sum((S.data.overheads || []).map(o => {
    if (o.frequency === 'oneoff') { const dd = o.start_date || String(o.created_at || '').slice(0, 10); return dd >= from && dd <= end ? num(o.amount) : 0; }
    const running = !o.end_date || o.end_date >= from;
    return running ? ohAnnual(o) / 12 : 0;
  }));
  const profit = profitBetween(from, to);
  return { from, end, costs, profit, left: profit - costs, pct: costs > 0 ? profit / costs : null };
}

function coverBar(cv, compact = false) {
  if (!cv.costs) return '<p class="muted small">Add your regular bills below to see whether jobs are covering them.</p>';
  const pct = Math.max(0, Math.min(1, cv.pct || 0));
  const ok = cv.left >= 0;
  return `<div class="cover ${ok ? 'ok' : ''}">
    <div class="cover-bar"><i style="width:${pct * 100}%"></i></div>
    <div class="row small"><span>${money0(Math.round(Math.max(0, cv.profit)))} profit vs ${money0(Math.round(cv.costs))} costs</span><b>${ok ? 'Covered' : `${Math.round(pct * 100)}%`}</b></div>
    ${compact ? '' : `<p class="cover-msg">${ok ? `Running costs covered, with <b>${money0(Math.round(cv.left))}</b> profit left over.` : `<b>${money0(Math.round(-cv.left))}</b> more profit needed to cover this month's running costs.`}</p>`}
  </div>`;
}

// One-off purchases with their own box on the Money tab
const BUY_KINDS = {
  tools: { title: 'Tools &amp; equipment', btn: 'Tool purchase', id: 'tools', what: 'e.g. Milwaukee rotary tool + 12v batteries', saved: 'Tool purchase saved',
    empty: 'Bought a drill, a pipe cutter or PPE? Add it here so it comes off profit and you can see who paid.' },
  vanstock: { title: 'Van stock', btn: 'Van stock', id: 'vanstock', what: 'e.g. P-traps, silicone, PTFE, push-fit fittings', saved: 'Van stock saved',
    empty: 'Materials and consumables kept in the van for any job (silicone, traps, fittings) — not bought for one particular job.' },
};
const buyKind = o => (o && o.frequency === 'oneoff' && BUY_KINDS[o.category] ? o.category : null);
const isTool = o => !!buyKind(o);

function buyCardHtml(kind) {
  const K = BUY_KINDS[kind];
  const t = today();
  const ty = taxYearOf(t);
  const from = tyStart(ty);
  const items = (S.data.overheads || []).filter(o => buyKind(o) === kind)
    .sort((a, b) => String(b.start_date || b.created_at || '').localeCompare(String(a.start_date || a.created_at || '')));
  const inYear = items.filter(o => (o.start_date || String(o.created_at || '').slice(0, 10)) >= from);
  const total = sum(inYear.map(o => num(o.amount)));
  const paidA = sum(inYear.map(o => num(o.amount) * (o.paid_by === 'a' ? 1 : o.paid_by === 'split' ? 0.5 : 0)));
  const showAll = S.showAllBuys?.[kind];
  const shown = showAll ? items : items.slice(0, 5);
  return `<section class="card" id="${K.id}">
    <div class="row"><h3>${K.title}</h3><button class="btn small primary" data-act="buySheet" data-k="${kind}">${ICON.plus} ${K.btn}</button></div>
    ${items.length ? `
      <div class="kv"><span>Spent this tax year (${tyLabel(ty)})</span><b>${money(total)}</b></div>
      ${total ? `<div class="kv small"><span>Paid by ${esc(nameOf('a'))} · ${esc(nameOf('b'))}</span><b>${money(paidA)} · ${money(total - paidA)}</b></div>` : ''}
      <div class="list tools-list">${shown.map(o => `
        <button class="item" data-act="ohSheet" data-id="${o.id}">
          <div class="row"><strong>${esc(o.name)}</strong><b>${money(o.amount)}</b></div>
          <div class="row small muted"><span>${o.start_date ? fmtDate(o.start_date) : ''}${o.notes ? ` · ${esc(o.notes)}` : ''}</span><span class="who ${o.paid_by}">${o.paid_by === 'split' ? 'Split' : esc(nameOf(o.paid_by))}</span></div>
        </button>`).join('')}</div>
      ${items.length > 5 ? `<button class="link-btn" data-act="toggleBuys" data-k="${kind}">${showAll ? 'Show less' : `Show all ${items.length}`}</button>` : ''}
      <p class="muted small">Counted as a business cost, so it comes off profit like your other running costs.</p>`
    : `<p class="muted small">${K.empty}</p>`}
  </section>`;
}

function overheadsBody() {
  const sm = ohSummary();
  const t = today();
  const list = (S.data.overheads || []).slice();
  const live = sm.live.slice().sort((a, b) => ohAnnual(b) - ohAnnual(a));
  const rest = list.filter(o => !sm.live.includes(o) && !isTool(o)).sort((a, b) => String(b.start_date || '').localeCompare(String(a.start_date || '')));
  const now = parseISO(t);
  const thisMonth = toISO(new Date(now.getFullYear(), now.getMonth(), 1));
  const lastMonth = toISO(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const cvNow = ohCover(thisMonth);
  const cvLast = ohCover(lastMonth);
  const ty = taxYearOf(t);
  const tyOh = ohPeriod(tyStart(ty), t).total;
  const tyProfit = profitBetween(tyStart(ty), t);

  // bills coming up in the next 60 days
  const horizon = addDays(t, 60);
  const upcoming = list.flatMap(o => ohDueDates(o, t, horizon).map(d => ({ d, o }))).sort((a, b) => a.d.localeCompare(b.d));
  const undated = live.filter(o => !o.start_date);
  const upTotal = sum(upcoming.map(u => num(u.o.amount)));

  // what each job needs to bring in (based on the last 3 months)
  const recent = finishedBetween(addDays(t, -90), t);
  const jobsPerMonth = recent.length / 3;
  const perJob = jobsPerMonth > 0 ? sm.monthly / jobsPerMonth : null;
  const avgProfit = recent.length ? sum(recent.map(j => calc(j).profit)) / recent.length : null;

  const byCat = {};
  live.forEach(o => { byCat[o.category] = (byCat[o.category] || 0) + ohAnnual(o) / 12; });
  const label = o => {
    if (o.frequency === 'oneoff') return `One-off${o.start_date ? ` · ${fmtDate(o.start_date)}` : ''}`;
    if (o.end_date && o.end_date < t) return `Ended ${fmtDate(o.end_date)}`;
    const next = ohDueDates(o, t, addDays(t, 400))[0];
    return next ? `Next ${fmtShort(next)}` : '';
  };
  const per = { weekly: '/wk', monthly: '/mo', quarterly: '/qtr', yearly: '/yr' };
  const row = o => `
    <button class="item" data-act="ohSheet" data-id="${o.id}">
      <div class="row"><strong>${esc(o.name)}</strong><b>${money(o.amount)}<span class="muted small"> ${per[o.frequency] || ''}</span></b></div>
      <div class="row small muted"><span>${esc(OH_CATS[o.category] || o.category)}${label(o) ? ` · ${label(o)}` : ''}</span>
      <span>${o.frequency !== 'oneoff' && o.frequency !== 'monthly' ? `${money0(ohAnnual(o) / 12)}/mo · ` : ''}<span class="who ${o.paid_by}">${o.paid_by === 'split' ? 'Split' : esc(nameOf(o.paid_by))}</span></span></div>
    </button>`;
  const settle = Math.abs(sm.owedToA) < 0.01 ? '<div class="settle ok">Bills are shared evenly — nothing to settle.</div>'
    : `<div class="settle">${sm.owedToA > 0 ? `${esc(nameOf('b'))} owes ${esc(nameOf('a'))}` : `${esc(nameOf('a'))} owes ${esc(nameOf('b'))}`} about <b>${money(Math.abs(sm.owedToA) / 12)}</b> a month for the bills they're covering.</div>`;
  const monthName = iso => parseISO(iso).toLocaleDateString('en-GB', { month: 'long' });

  const body = `
  ${S.data.overheadsMissing ? '<div class="note">Bills need the database set up: run <code>supabase/schema.sql</code> in the Supabase SQL Editor (safe to run again), then refresh.</div>' : ''}
  <section class="card oh-hero">
    <div class="oh-big"><span>Running the business costs</span><b>${money0(Math.round(sm.monthly))}<small> a month</small></b>
      <em>${money0(Math.round(sm.annual))} a year · ${money(sm.perDay)} a day</em></div>
    <h3 class="oh-q">Are jobs covering it in ${monthName(thisMonth)}?</h3>
    ${coverBar(cvNow)}
    ${cvLast.costs ? `<div class="kv"><span>${monthName(lastMonth)}</span><b class="${cvLast.left >= 0 ? 'pos' : 'neg'}">${cvLast.left >= 0 ? `Covered, ${money0(Math.round(cvLast.left))} spare` : `${money0(Math.round(-cvLast.left))} short`}</b></div>` : ''}
    ${tyOh ? `<div class="kv"><span>Tax year ${tyLabel(ty)} so far</span><b>${money0(Math.round(tyOh))} costs · ${money0(Math.round(tyProfit))} job profit</b></div>` : ''}
  </section>

  <section class="card">
    <div class="row"><h3>Bills coming up</h3><span class="muted small">next 60 days</span></div>
    ${upcoming.length ? upcoming.map(u => `<button class="bill-row" data-act="ohSheet" data-id="${u.o.id}">
        <span class="bill-l"><b class="bill-date">${fmtDate(u.d, { weekday: 'short', day: 'numeric', month: 'short' })}</b><span>${esc(u.o.name)}</span></span>
        <span class="bill-r"><b>${money(u.o.amount)}</b><span class="who ${u.o.paid_by}">${u.o.paid_by === 'split' ? 'Split' : esc(nameOf(u.o.paid_by))}</span></span></button>`).join('')
      + `<div class="kv total"><span>Total</span><b>${money(upTotal)}</b></div>`
      : '<p class="muted small">Nothing due in the next 60 days.</p>'}
    ${undated.length ? `<p class="muted small">${undated.length} bill${undated.length === 1 ? ' has' : 's have'} no start date, so can't be put on the calendar — tap ${undated.length === 1 ? 'it' : 'them'} below to add one.</p>` : ''}
  </section>

  <section class="card">
    <h3>What each job needs to cover</h3>
    ${perJob != null ? `
      <div class="money-grid">
        <div><span>Jobs finished a month</span><b>${(Math.round(jobsPerMonth * 10) / 10).toString()}</b><em>last 3 months</em></div>
        <div><span>Overheads per job</span><b>${money0(perJob)}</b><em>build this into quotes</em></div>
        ${avgProfit != null ? `<div><span>Average job profit</span><b>${money0(avgProfit)}</b></div>
        <div><span>After overheads</span><b class="${avgProfit - perJob < 0 ? 'neg' : 'pos'}">${money0(avgProfit - perJob)}</b><em>per job</em></div>` : ''}
      </div>`
      : `<p class="muted small">At ${money0(sm.monthly)} a month, if you finish 4 jobs a month each one needs to cover about <b>${money0(sm.monthly / 4)}</b> of running costs on top of its materials. This fills in with your real numbers once you've finished some jobs.</p>`}
  </section>



  ${buyCardHtml('vanstock')}
  ${buyCardHtml('tools')}

  <div class="row section-row"><h2 class="section-title">Your bills</h2><button class="btn small primary" data-act="ohSheet">${ICON.plus} Add bill</button></div>
  <div class="list">
    ${live.length ? live.map(row).join('') : '<div class="empty">No regular bills yet. Add things like Checkatrade, insurance, van, phone and certifications — tap <b>Add bill</b> and pick from the quick list.</div>'}
  </div>
  ${rest.length ? `<h3 class="group">One-offs &amp; ended</h3><div class="list">${rest.map(row).join('')}</div>` : ''}`;
  return body;
}

function ohSheet(id, preset) {
  const x = id ? (S.data.overheads || []).find(o => o.id === id)
    : { frequency: 'monthly', category: 'other', paid_by: S.payer || S.me, start_date: today(), ...(preset || {}) };
  if (!x) return;
  const v = k => esc(x[k] ?? '');
  if (isTool(x)) {
    const K = BUY_KINDS[buyKind(x)];
    openSheet(`<form data-form="overhead" class="form">
      ${sheetHead(id ? K.btn : `Add ${K.btn.toLowerCase()}`, id, 'overheads')}
      <input type="hidden" name="id" value="${id || ''}">
      <input type="hidden" name="frequency" value="oneoff">
      <input type="hidden" name="category" value="${buyKind(x)}">
      <label>What did you buy?<input name="name" required value="${v('name')}" placeholder="${K.what}" autocomplete="off"></label>
      <div class="two">
        <label>Cost £<input name="amount" type="number" inputmode="decimal" step="0.01" min="0" required value="${v('amount')}"></label>
        <label>Date bought<input name="start_date" type="date" value="${v('start_date')}"></label>
      </div>
      <div class="field-label">Who paid?</div>
      <div class="seg3">${[['a', nameOf('a')], ['b', nameOf('b')], ['split', 'Split 50/50']].map(([k, l]) =>
        `<label class="${(x.paid_by || 'a') === k ? 'on' : ''}"><input type="radio" name="paid_by" value="${k}" ${(x.paid_by || 'a') === k ? 'checked' : ''} data-input="segpick">${l}</label>`).join('')}</div>
      <label>Notes <span class="muted small">(optional)</span><input name="notes" value="${v('notes')}" placeholder="e.g. Toolstation, serial no., warranty till 2028"></label>
      <button class="btn primary wide big">Save</button>
    </form>`);
    if (!id) setTimeout(() => sheet.querySelector('[name=name]')?.focus(), 60);
    return;
  }
  openSheet(`<form data-form="overhead" class="form">
    ${sheetHead(id ? 'Edit overhead' : 'Add overhead', id, 'overheads')}
    <input type="hidden" name="id" value="${id || ''}">
    ${id ? '' : `<p class="muted small">Quick picks:</p><div class="chips wrap">${OH_PRESETS.map((p, i) => `<button type="button" class="chip" data-act="ohPreset" data-i="${i}">${esc(p[0])}</button>`).join('')}</div>`}
    <label>Name<input name="name" required value="${v('name')}" placeholder="e.g. Checkatrade"></label>
    <div class="two">
      <label>Amount £<input name="amount" type="number" inputmode="decimal" step="0.01" min="0" required value="${v('amount')}"></label>
      <label>How often<select name="frequency">${opts(Object.fromEntries(Object.entries(OH_FREQ).map(([k, [l]]) => [k, l])), x.frequency)}</select></label>
      <label>Category<select name="category">${opts(OH_CATS, x.category)}</select></label>
      <label>Paid by<select name="paid_by">${opts({ a: nameOf('a'), b: nameOf('b'), split: 'Split (each pays own share)' }, x.paid_by)}</select></label>
      <label>Next payment date<input name="start_date" type="date" value="${v('start_date')}"></label>
      <label>End date<input name="end_date" type="date" value="${v('end_date')}"></label>
    </div>
    <p class="muted small">For a regular bill, put the next date it comes out — it repeats from there. For a one-off, the date you paid it. Only add an end date if you cancel it.</p>
    <label>Notes<input name="notes" value="${v('notes')}" placeholder="e.g. renewal date, policy number"></label>
    <button class="btn primary wide big">Save</button>
  </form>`);
}

// ======================================================================
// Quote / invoice document
// ======================================================================
function docView({ id, extra }) {
  const j = jobById(id);
  if (!j) return layout({ title: 'Not found', back: true, body: '<div class="empty">Job not found.</div>', nav: false });
  const s = set();
  const c = calc(j);
  const isQuote = extra !== 'invoice';
  const date = isQuote ? (j.quote_date || today()) : (j.finished_date || today());
  const validTo = j.quote_valid_days ? addDays(date, num(j.quote_valid_days)) : '';
  const ref = `${isQuote ? 'Q' : 'INV'}-${String(j.ref ?? 0).padStart(4, '0')}`;
  const doc = `
  <article class="doc">
    <header class="doc-head">
      <div>
        <div class="doc-brand">
          <img src="img/house-deep.png" alt="">
          <div>
            <div class="doc-logo">${/^C&B$/i.test(s.business_name.trim()) ? 'C<i>&amp;</i>B' : esc(s.business_name)}</div>
            <div class="doc-name">Cunningham &amp; Baker</div>
            <div class="doc-tag">${esc(s.tagline)}</div>
          </div>
        </div>
      </div>
      <div class="doc-contact">
        ${s.phone ? `<div>${esc(s.phone)}</div>` : ''}${s.email ? `<div>${esc(s.email)}</div>` : ''}
        ${s.website ? `<div>${esc(s.website)}</div>` : ''}${s.area ? `<div>${esc(s.area)}</div>` : ''}
        ${s.vat_registered && s.vat_number ? `<div>VAT no. ${esc(s.vat_number)}</div>` : ''}
      </div>
    </header>
    <div class="doc-title">
      <h1>${isQuote ? 'Quotation' : 'Invoice'}</h1>
      <table>
        <tr><td>${isQuote ? 'Quote' : 'Invoice'} no.</td><td>${ref}</td></tr>
        <tr><td>Date</td><td>${fmtDate(date)}</td></tr>
        ${isQuote && validTo ? `<tr><td>Valid until</td><td>${fmtDate(validTo)}</td></tr>` : ''}
      </table>
    </div>
    <div class="doc-to">
      <div class="lbl">${isQuote ? 'Prepared for' : 'Bill to'}</div>
      <div><b>${esc(j.customer_name || '')}</b></div>
      ${j.address ? `<div>${nl2br(j.address)}</div>` : ''}${j.postcode ? `<div>${esc(j.postcode)}</div>` : ''}
    </div>
    <div class="doc-body">
      <h2>${esc(j.title)}</h2>
      ${j.description ? `<p>${nl2br(j.description)}</p>` : ''}
    </div>
    <table class="doc-totals">
      ${j.vat_applies ? `
        <tr><td>Price (ex VAT)</td><td>${money(c.price)}</td></tr>
        <tr><td>VAT @ ${r2(num(j.vat_rate))}%</td><td>${money(c.vat)}</td></tr>` : ''}
      <tr class="tot"><td>${isQuote ? 'Fixed price' : 'Total'}${j.vat_applies ? ' (inc VAT)' : ''}</td><td>${money(c.gross)}</td></tr>
      ${!isQuote && c.pays.length ? c.pays.slice().sort((a, b) => String(a.pay_date).localeCompare(String(b.pay_date))).map(p => `<tr><td>Paid ${fmtDate(p.pay_date)} (${esc((PAY_KINDS[p.kind] || p.kind).toLowerCase()) })</td><td>−${money(p.amount)}</td></tr>`).join('') : ''}
      ${!isQuote ? `<tr class="tot"><td>Balance due</td><td>${money(Math.max(0, c.balance))}</td></tr>` : ''}
    </table>
    ${!s.vat_registered && !j.vat_applies ? '<p class="doc-small">No VAT is charged.</p>' : ''}
    ${!isQuote && (s.bank_acc || s.bank_sort) ? `<div class="doc-bank"><b>Pay by bank transfer</b><br>${esc(s.bank_name)}<br>Sort code ${esc(s.bank_sort)} · Account ${esc(s.bank_acc)}<br>Reference: ${ref}</div>` : ''}
    <div class="doc-terms">${nl2br(isQuote ? s.quote_terms : s.invoice_terms)}</div>
    <footer class="doc-foot">${esc(s.business_name)} · ${esc(s.phone)} · ${esc(s.email)}</footer>
  </article>`;
  return `
  <div class="doc-bar">
    <button class="btn small" data-act="back">${ICON.back} Back</button>
    <a class="btn small" href="#/doc/${j.id}/${isQuote ? 'invoice' : 'quote'}">${isQuote ? 'Invoice' : 'Quote'}</a>
    <div class="grow"></div>
    <button class="btn small" data-act="print" title="Print">Print</button>
    <button class="btn small primary" data-act="sendPdf" data-id="${j.id}" data-type="${isQuote ? 'quote' : 'invoice'}">Send PDF</button>
  </div>
  <p class="doc-hint"><b>Send PDF</b> attaches this ${isQuote ? 'quote' : 'invoice'} to WhatsApp, email or text.</p>
  ${doc}`;
}

// Make a real PDF file of the document (library loaded only when needed)
function loadScript(src) {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) return res();
    const el = document.createElement('script');
    el.src = src; el.onload = res; el.onerror = () => rej(new Error('Could not load the PDF tool — check your connection'));
    document.head.appendChild(el);
  });
}
async function makePdf(filename) {
  await loadScript('vendor/html2pdf.bundle.min.js');
  const src = document.querySelector('.doc');
  const holder = document.createElement('div');
  holder.style.cssText = 'position:absolute;left:0;top:0;width:760px;background:#fff;z-index:-1;pointer-events:none';
  const clone = src.cloneNode(true);
  clone.classList.add('pdf');
  holder.appendChild(clone);
  document.body.appendChild(holder);
  try {
    const blob = await window.html2pdf().set({
      margin: [8, 8, 8, 8], image: { type: 'jpeg', quality: 0.95 },
      html2canvas: { scale: 2, backgroundColor: '#ffffff', windowWidth: 760, width: 760, scrollX: 0, scrollY: -window.scrollY, x: 0, y: 0 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }, pagebreak: { mode: ['css', 'legacy'] },
    }).from(clone).outputPdf('blob');
    return new File([blob], filename, { type: 'application/pdf' });
  } finally { holder.remove(); }
}
function saveFile(file) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}

// ======================================================================
// Bottom sheets (add/edit costs, time, payments, photos)
// ======================================================================
function openSheet(html) {
  sheet.innerHTML = `<div class="sheet-back" data-act="closeSheet"></div><div class="sheet-panel" role="dialog">${html}</div>`;
  sheet.hidden = false;
  document.body.classList.add('noscroll');
}
function closeSheet() {
  sheet.hidden = true;
  sheet.innerHTML = '';
  document.body.classList.remove('noscroll');
  if (S.pendingSync) { S.pendingSync = false; loadData().then(render).catch(console.error); }
}
const opts = (obj, sel) => Object.entries(obj).map(([k, l]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${esc(l)}</option>`).join('');
const whoOpts = sel => opts({ a: nameOf('a'), b: nameOf('b') }, sel);
const sheetHead = (title, id, table) => `<div class="sheet-head"><h3>${title}</h3>${id ? `<button type="button" class="btn small danger" data-act="deleteRow" data-table="${table}" data-id="${id}">Delete</button>` : ''}<button type="button" class="btn small" data-act="closeSheet">Close</button></div>`;

function costSheet(jobId, id, keep) {
  const x = id ? S.data.costs.find(c => c.id === id) : { qty: 1, category: 'materials', paid_by: S.payer || S.me, cost_date: today(), ...(keep || {}) };
  const items = pastItems().slice(0, 300);
  const v = k => esc(x[k] ?? '');
  const suppliers = [...new Set(S.data.costs.map(c => c.supplier).filter(Boolean))].slice(0, 30);
  openSheet(`<form data-form="cost" class="form">
    ${sheetHead(id ? 'Edit cost' : 'Add cost', id, 'costs')}
    <input type="hidden" name="id" value="${id || ''}"><input type="hidden" name="job_id" value="${jobId}">
    <label>Item<input name="description" required value="${v('description')}" placeholder="e.g. 15mm copper pipe" list="past-items" data-input="costItem" autocomplete="off"></label>
    <datalist id="past-items">${items.map(c => `<option value="${esc(c.description)}">${money(c.unit_cost)}${c.supplier ? ` · ${esc(c.supplier)}` : ''}</option>`).join('')}</datalist>
    <div class="hint" data-out="lastPrice"></div>
    <div class="two">
      <label>Qty<input name="qty" type="number" inputmode="decimal" step="any" value="${v('qty')}"></label>
      <label>Unit cost £<input name="unit_cost" type="number" inputmode="decimal" step="0.01" value="${v('unit_cost')}"></label>
      <label>Category<select name="category">${opts(COST_CATS, x.category)}</select></label>
      <label>Paid by<select name="paid_by">${whoOpts(x.paid_by)}</select></label>
      <label>Supplier<input name="supplier" list="suppliers" value="${v('supplier')}"></label>
      <label>Date<input name="cost_date" type="date" value="${v('cost_date')}"></label>
    </div>
    <datalist id="suppliers">${suppliers.map(s => `<option value="${esc(s)}">`).join('')}</datalist>
    <div class="btn-row">
      <button class="btn primary grow big">Save</button>
      ${id ? '' : '<button type="button" class="btn grow big" data-act="saveAgain">Save + add another</button>'}
    </div>
  </form>`);
  if (keep) setTimeout(() => sheet.querySelector('[name=description]')?.focus(), 60);
}


function paySheet(jobId, id) {
  const j = jobById(jobId);
  const c = calc(j);
  const x = id ? S.data.payments.find(p => p.id === id) : {
    kind: c.paid ? (c.balance > 0 && j.status === 'finished' ? 'final' : 'stage') : 'deposit',
    method: 'bank', received_by: S.payer || S.me, pay_date: today(),
    amount: c.balance > 0 ? r2(c.balance) : '',
  };
  const v = k => esc(x[k] ?? '');
  openSheet(`<form data-form="payment" class="form">
    ${sheetHead(id ? 'Edit payment' : 'Add payment', id, 'payments')}
    <input type="hidden" name="id" value="${id || ''}"><input type="hidden" name="job_id" value="${jobId}">
    <div class="two">
      <label>Amount £<input name="amount" type="number" inputmode="decimal" step="0.01" required value="${v('amount')}"></label>
      <label>Date<input name="pay_date" type="date" value="${v('pay_date')}"></label>
      <label>Type<select name="kind">${opts(PAY_KINDS, x.kind)}</select></label>
      <label>Method<select name="method">${opts(PAY_METHODS, x.method)}</select></label>
    </div>
    <label>Received by<select name="received_by">${whoOpts(x.received_by)}</select></label>
    <label>Note<input name="note" value="${v('note')}" placeholder="optional"></label>
    <button class="btn primary wide big">Save</button>
  </form>`);
}

function viewPhoto(id) {
  const p = S.data.photos.find(x => x.id === id);
  if (!p) return;
  openSheet(`${sheetHead(esc(PHOTO_KINDS[p.kind] || 'Photo'), p.id, 'photos')}
    <div class="photo-full">${S.urls[p.path] ? `<img src="${esc(S.urls[p.path])}" alt="">` : 'Loading…'}</div>
    <form data-form="photoInfo" class="form photo-info">
      <input type="hidden" name="id" value="${p.id}">
      <div class="two">
        <label>Type<select name="kind">${opts(PHOTO_KINDS, p.kind || 'other')}</select></label>
        <label>Caption<input name="caption" value="${esc(p.caption || '')}" placeholder="optional"></label>
      </div>
      <button class="btn primary wide">Save</button>
    </form>
    <p class="muted small">${fmtDate(p.created_at)}</p>`);
}

async function compress(file, max = 1600) {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const cv = document.createElement('canvas');
    cv.width = Math.round(bmp.width * k);
    cv.height = Math.round(bmp.height * k);
    cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
    const blob = await new Promise(res => cv.toBlob(res, 'image/jpeg', 0.8));
    return blob || file;
  } catch {
    return file;
  }
}

// ======================================================================
// Data writes
// ======================================================================
async function saveRow(table, id, row) {
  S.lastWrite = Date.now();
  if (id) {
    const r = await db.update(table, id, row);
    S.data[table] = S.data[table].map(x => (x.id === id ? r : x));
    return r;
  }
  const r = await db.insert(table, { id: crypto.randomUUID(), ...row });
  S.data[table].push(r);
  return r;
}
async function deleteRow(table, id) {
  S.lastWrite = Date.now();
  if (table === 'photos') {
    const p = S.data.photos.find(x => x.id === id);
    if (p) await db.removeFiles([p.path]).catch(console.error);
  }
  await db.remove(table, id);
  S.data[table] = S.data[table].filter(x => x.id !== id);
}

// Last-loaded jobs are kept on the phone so they can still be viewed with no signal
const snapKey = () => `cb-snapshot-${(S.session?.user?.email || 'me').toLowerCase()}`;
const isNetErr = e => !navigator.onLine || /failed to fetch|network|load failed|fetch/i.test(String(e?.message || e));
async function loadData() {
  try {
    S.data = await db.loadAll();
    S.loadError = null;
    S.offlineSince = null;
    if (!DEMO) { try { localStorage.setItem(snapKey(), JSON.stringify({ at: Date.now(), data: S.data })); } catch { /* too big or blocked — fine */ } }
  } catch (e) {
    let snap = null;
    if (!DEMO && isNetErr(e)) { try { snap = JSON.parse(localStorage.getItem(snapKey())); } catch { /* ignore */ } }
    if (snap?.data) { S.data = snap.data; S.offlineSince = snap.at; S.loadError = null; }
    else { S.loadError = e.message || String(e); throw e; }
  }
  S.loadedAt = Date.now();
  S.me = getMe();
  S.meKnown = false;
  // Whose phone this is comes from the login (Henry's email = Henry), not from "Paid by" picks
  try {
    const email = String(S.session?.user?.email || '').toLowerCase();
    const m = (S.data.members || []).find(x => String(x.email).toLowerCase() === email);
    if (m?.who) { setMe(m.who); S.meKnown = true; }
  } catch { /* ignore */ }
  S.payer = getPayer();
}
// Who's using this phone: remembered from the last time they picked themselves
function getMe() { try { return localStorage.getItem('cb-me') === 'b' ? 'b' : 'a'; } catch { return 'a'; } }
function setMe(p) { if (p !== 'a' && p !== 'b') return; S.me = p; try { localStorage.setItem('cb-me', p); } catch { /* ignore */ } }
// Default for "Paid by" / "Received by": whoever was picked last on this phone (starts as the phone's owner)
function getPayer() { try { const v = localStorage.getItem('cb-payer'); return v === 'a' || v === 'b' ? v : S.me; } catch { return S.me; } }
function setPayer(p) { if (p !== 'a' && p !== 'b') return; S.payer = p; try { localStorage.setItem('cb-payer', p); } catch { /* ignore */ } }

const FORMS = {
  async login(fd, form) {
    await busy(form.querySelector('button'), async () => {
      S.session = await db.signIn(fd.get('email').trim(), fd.get('password'));
      render();
      try { await loadData(); startLive(); } finally { render(); }
    });
  },

  async job(fd, form) {
    await busy(form.querySelector('button.primary'), async () => {
      const id = fd.get('id');
      const old = id ? jobById(id) : null;
      const row = {
        title: fd.get('title').trim() || 'Job',
        status: fd.get('status'),
        customer_name: nz(fd.get('customer_name')?.trim()),
        customer_phone: nz(fd.get('customer_phone')?.trim()),
        customer_email: nz(fd.get('customer_email')?.trim()),
        address: nz(fd.get('address')?.trim()),
        postcode: nz(fd.get('postcode')?.trim().toUpperCase()),
        description: nz(fd.get('description')),
        notes: nz(fd.get('notes')),
        price: r2(num(fd.get('price'))),
        vat_applies: fd.get('vat_applies') === 'on',
        vat_rate: num(fd.get('vat_rate')) || num(set().vat_rate) || 20,
        quote_date: fd.has('quote_date') ? nz(fd.get('quote_date')) : (old?.quote_date ?? null),
        quote_valid_days: fd.get('quote_valid_days') === '' ? null : Math.round(num(fd.get('quote_valid_days'))),
        start_date: nz(fd.get('start_date')),
        end_date: nz(fd.get('end_date')),
        who: fd.get('who') || 'both',
      };
      // Quote visit -> calendar entry linked to the job
      const syncVisit = async jobId => {
        if (!fd.has('visit_date')) return;
        const date = nz(fd.get('visit_date')), time = nz(fd.get('visit_time')), vid = fd.get('visit_id');
        const ex = vid ? (S.data.events || []).find(e => e.id === vid) : null;
        if (S.data.eventsMissing) return;
        if (date && ex) { if (ex.event_date !== date || fmtTime(ex.start_time) !== (time || '')) await saveRow('events', ex.id, { event_date: date, start_time: time }); }
        else if (date) await saveRow('events', null, { title: 'Quote visit', kind: 'visit', event_date: date, start_time: time, who: 'both', job_id: jobId, done: false });
        else if (ex) await deleteRow('events', ex.id);
      };
      if (row.status === 'finished' && !(old && old.finished_date)) row.finished_date = today();
      if (row.status !== 'finished' && row.status !== 'declined') row.finished_date = null;
      if (row.status === 'declined' && !(old && old.finished_date)) row.finished_date = today();
      if (!id) {
        row.created_by = S.session?.user?.email || null;
        const saved = await saveRow('jobs', null, row);
        await syncVisit(saved.id);
        toast(row.status === 'quoted' ? 'Quote saved' : 'Job created');
        location.replace(`#/job/${saved.id}`);
        return;
      }
      // Only send fields you actually changed, so a save never undoes
      // something your partner changed on their phone in the meantime.
      const same = (a, b) => String(a ?? '') === String(b ?? '') || (typeof a === 'number' && num(b) === a && b !== '' && b != null);
      const patch = Object.fromEntries(Object.entries(row).filter(([k, v]) => !same(v, old[k])));
      if (Object.keys(patch).length) await saveRow('jobs', id, patch);
      await syncVisit(id);
      toast('Saved');
      goBack(`#/job/${id}`);
    });
  },

  async cost(fd, form) {
    await busy(form.querySelector('button.primary'), async () => {
      await saveRow('costs', fd.get('id') || null, {
        job_id: fd.get('job_id'),
        description: fd.get('description').trim(),
        qty: num(fd.get('qty')) || 1,
        unit_cost: r2(num(fd.get('unit_cost'))),
        category: fd.get('category'),
        paid_by: fd.get('paid_by'),
        supplier: nz(fd.get('supplier')?.trim()),
        cost_date: nz(fd.get('cost_date')),
      });
      if (!fd.get('id')) setPayer(fd.get('paid_by'));
      const again = form.dataset.again === '1';
      closeSheet(); render(); toast('Cost saved');
      if (again) costSheet(fd.get('job_id'), null, { paid_by: fd.get('paid_by'), supplier: fd.get('supplier') || '', cost_date: fd.get('cost_date'), category: fd.get('category') });
    });
  },

  async payment(fd, form) {
    await busy(form.querySelector('button.primary'), async () => {
      await saveRow('payments', fd.get('id') || null, {
        job_id: fd.get('job_id'),
        amount: r2(num(fd.get('amount'))),
        pay_date: nz(fd.get('pay_date')),
        kind: fd.get('kind'),
        method: fd.get('method'),
        received_by: fd.get('received_by'),
        note: nz(fd.get('note')?.trim()),
      });
      if (!fd.get('id')) setPayer(fd.get('received_by'));
      closeSheet(); render(); toast('Payment saved');
    });
  },

  async newPassword(fd, form) {
    await busy(form.querySelector('button'), async () => {
      await db.updatePassword(fd.get('password'));
      S.recovery = false;
      if (location.hash && /access_token|type=recovery/.test(location.hash)) history.replaceState(null, '', location.pathname);
      toast('Password updated');
      if (!S.data) await loadData();
      render();
    });
  },
  async changePassword(fd, form) {
    await busy(form.querySelector('button.primary'), async () => {
      if (fd.get('password') !== fd.get('password2')) throw new Error("Passwords don't match");
      await db.updatePassword(fd.get('password'));
      closeSheet(); toast('Password changed');
    });
  },

  async event(fd, form) {
    await busy(form.querySelector('button.primary'), async () => {
      const start = fd.get('event_date');
      let end = nz(fd.get('end_date'));
      if (end && end < start) end = null;
      if (end === start) end = null;
      const id = fd.get('id') || null;
      const row = {
        title: fd.get('title').trim() || EV_KINDS[fd.get('kind')] || 'Entry',
        kind: fd.get('kind') || 'other',
        event_date: start,
        end_date: end,
        start_time: nz(fd.get('start_time')),
        who: fd.get('who'),
        job_id: nz(fd.get('job_id')),
        notes: nz(fd.get('notes')?.trim()),
      };
      if (id) row.done = fd.get('done') === 'on';
      await saveRow('events', id, row);
      closeSheet(); render(); toast('Saved to calendar');
    });
  },

  async photoInfo(fd, form) {
    await busy(form.querySelector('button.primary'), async () => {
      await saveRow('photos', fd.get('id'), { kind: fd.get('kind'), caption: nz(fd.get('caption')?.trim()) });
      closeSheet(); render(); toast('Photo updated');
    });
  },

  async task(fd, form) {
    await busy(form.querySelector('button.primary'), async () => {
      const text = (fd.get('text') || '').trim();
      if (!text) throw new Error('Type what needs doing');
      const id = fd.get('id') || null;
      const row = { text, due_date: nz(fd.get('due_date')) };
      if (fd.get('multi')) {
        // A step typed in the box but not yet added still counts
        const pending = form.querySelector('#step-new')?.value.trim();
        if (pending) addStepRow(form, pending);
        const old = id ? taskSteps((S.data.tasks || []).find(t => t.id === id)) || [] : [];
        row.steps = [...form.querySelectorAll('.step-row')].map(r => {
          const sid = r.dataset.stepId;
          const was = old.find(o => o.id === sid);
          const done = r.querySelector('[name=step_done]').checked;
          return { id: sid, text: r.querySelector('[name=step_text]').value.trim(), done, done_at: done ? (was?.done_at || new Date().toISOString()) : null };
        }).filter(st => st.text);
      }
      await saveRow('tasks', id, id ? row : { ...row, done: false, created_by: S.session?.user?.email || null });
      closeSheet(); render(); toast(id ? 'Saved' : 'Added to your to-do list');
    });
  },

  async nextStep(fd, form) {
    await busy(form.querySelector('button.primary'), async () => {
      const text = (fd.get('step') || '').trim();
      if (!text) throw new Error('Type the next step, or tap "Not sure yet"');
      const x = (S.data.tasks || []).find(t => t.id === fd.get('id'));
      const steps = [...(taskSteps(x) || []), { id: crypto.randomUUID?.() || String(Date.now()), text, done: false, done_at: null }];
      await saveRow('tasks', x.id, { steps, due_date: nz(fd.get('due_date')) });
      closeSheet(); render(); toast('Next step added');
    });
  },

  async chat(fd, form) {
    const text = (S.chatDraft || fd.get('text') || '').trim();
    const photo = S.chatPhoto;
    if (!text && !photo) return;
    const btn = form.querySelector('.chat-send');
    btn.disabled = true;
    try {
      let photo_path = null;
      if (photo) {
        btn.classList.add('busy');
        photo_path = `chat/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
        await db.upload(photo_path, photo.blob);
        S.urls[photo_path] = photo.url; // show it straight away
      }
      const r = await db.sendMessage({ to_who: otherOf(S.me), text, job_id: S.chatJob || null, photo_path });
      S.data.messages = [r.saved, ...(S.data.messages || [])];
      S.chatDraft = ''; S.chatJob = null; S.chatPhoto = null; S.chatJump = true;
      render();
      document.getElementById('chat-input')?.focus();
      const who = nameOf(otherOf(S.me));
      if (r.demo) toast('Demo: saved, nothing is sent');
      else if (!r.delivered) toast(r.phones ? `${who} has message pop-ups off — they'll see it in the app` : `${who} hasn't turned on notifications yet — they'll see it when they open the app`);
    } catch (e) { toast(friendly(e), true); btn.disabled = false; btn.classList.remove('busy'); }
  },

  async price(fd, form) {
    await busy(form.querySelector('button.primary'), async () => {
      const v = fd.get('price');
      if (v === '' || num(v) < 0) throw new Error('Enter the new price');
      const j = jobById(fd.get('id'));
      const price = r2(num(v));
      if (num(j.price) !== price) await saveRow('jobs', j.id, { price });
      closeSheet(); render(); toast(`Price changed to ${money(price)}`);
    });
  },

  async note(fd, form) {
    await busy(form.querySelector('button.primary'), async () => {
      const text = (fd.get('text') || '').replace(/\s+$/, '');
      if (!text.trim()) throw new Error('Type something first');
      const id = fd.get('id') || null;
      const who = S.me ? nameOf(S.me) : (S.session?.user?.email || '').split('@')[0] || null;
      const row = { text, pinned: fd.get('pinned') === 'on', updated_by: who, updated_at: new Date().toISOString() };
      if (!id) Object.assign(row, { created_by: S.session?.user?.email || null });
      await saveRow('notes', id, row);
      closeSheet(); render(); toast('Note saved');
    });
  },

  async overhead(fd, form) {
    await busy(form.querySelector('button.primary'), async () => {
      await saveRow('overheads', fd.get('id') || null, {
        name: fd.get('name').trim(),
        amount: r2(num(fd.get('amount'))),
        frequency: fd.get('frequency'),
        category: fd.get('category'),
        paid_by: fd.get('paid_by'),
        start_date: nz(fd.get('start_date')),
        end_date: nz(fd.get('end_date')),
        notes: nz(fd.get('notes')?.trim()),
      });
      closeSheet(); render(); toast(fd.get('frequency') === 'oneoff' && BUY_KINDS[fd.get('category')] ? BUY_KINDS[fd.get('category')].saved : 'Overhead saved');
    });
  },

  async settings(fd, form) {
    await busy(form.querySelector('button.primary'), async () => {
      const data = { ...set() };
      for (const k of Object.keys(DEFAULTS)) {
        if (k === 'vat_registered') continue;
        if (fd.has(k)) data[k] = fd.get(k);
      }
      data.vat_registered = fd.get('vat_registered') === 'on';
      ['vat_rate'].forEach(k => {
        data[k] = data[k] === '' || data[k] == null ? DEFAULTS[k] : num(data[k]);
      });
      S.lastWrite = Date.now();
      await db.saveSettings(data);
      S.data.settings = data;
      toast('Settings saved');
      render();
    });
  },
};

const ACT = {
  async back() {
    const f = document.querySelector('form[data-form="job"]');
    if (f && f.dataset.dirty === '1' && !await ask('Discard your changes to this job?', 'Discard', true)) return;
    goBack();
  },
  async retry(d, el) { await busy(el, async () => { await loadData(); render(); }); render(); },
  noteSheet(d) { noteSheet(d.id); },
  msgSheet(d) { S.chatJump = true; S.chatJob = d.job || null; go(d.job ? `#/chat/${d.job}` : '#/chat'); },
  chatQuick(d) { const i = document.getElementById('chat-input'); S.chatDraft = d.t; i.value = d.t; growChat(i); i.focus(); },
  chatJobClear() { S.chatJob = null; render(); },
  chatPhotoClear() { if (S.chatPhoto?.url) URL.revokeObjectURL(S.chatPhoto.url); S.chatPhoto = null; render(); },
  chatPhotoView(d) { chatPhotoView(d.id); },
  async chatPhotoToJob(d, el) {
    const m = (S.data.messages || []).find(x => x.id === d.id);
    if (!m?.job_id) return;
    await busy(el, async () => {
      // Copy the picture into the job's photos (its own file, so deleting one never breaks the other)
      const blob = await (await fetch(S.urls[m.photo_path])).blob();
      const path = `${m.job_id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
      await db.upload(path, blob);
      const j = jobById(m.job_id);
      await saveRow('photos', null, { job_id: m.job_id, path, kind: j.status === 'quoted' ? 'before' : j.status === 'finished' ? 'after' : 'during', caption: m.text || null });
      closeSheet(); toast(`Added to ${jobName(j)} photos`);
    });
  },
  async msgRead() { await markMessagesRead(); render(); },
  pushRefresh() { refreshPush(); },
  async pushOn(d, el) {
    await busy(el, async () => {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { await refreshPush(); if (perm === 'denied') throw new Error('Notifications were blocked. Turn them on in your phone\'s Settings.'); return; }
      const reg = await swReg();
      let sub = await reg.pushManager.getSubscription();
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(VAPID_PUBLIC_KEY) });
      await db.pushSave(sub, PUSH_DEFAULTS, deviceName());
      await refreshPush();
      toast('Notifications on');
    });
  },
  async pushOff(d, el) {
    await busy(el, async () => {
      const reg = await swReg();
      const sub = await reg.pushManager.getSubscription();
      if (sub) { await db.pushRemove(sub.endpoint).catch(() => {}); await sub.unsubscribe().catch(() => {}); }
      await refreshPush();
      toast('Notifications off on this phone');
    });
  },
  async pushTest(d, el) {
    await busy(el, async () => {
      const r = await db.pushTest(S.push?.endpoint);
      if (!r?.results?.includes('sent')) throw new Error('The test didn\'t go through. Turn notifications off and on again.');
      toast('Test sent: it should pop up in a few seconds');
    });
  },
  priceSheet(d) { priceSheet(d.id); },
  swapKind(d, el) {
    const f = el.closest('form');
    if (f) S.newDraft = Object.fromEntries(new FormData(f));
    location.replace(el.getAttribute('href'));
  },
  toggleTheme() {
    const dark = !isDark();
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    try { localStorage.setItem('cb-theme', dark ? 'dark' : 'light'); } catch {}
    document.querySelectorAll('.theme-switch').forEach(b => { b.setAttribute('aria-checked', dark); b.querySelector('i').innerHTML = dark ? ICON.moon : ICON.sun; });
  },
  async refresh(d, el) { await busy(el, async () => { await loadData(); S.urls = {}; render(); toast('Up to date'); }); },
  filter(d) { S.filter = d.f; render(); },
  calMonth(d) { S.calMonth = d.m; S.calDay = null; render(); },
  calDay(d) {
    S.calDay = d.d;
    render();
    // bring that day's details into view (stays on the calendar)
    const el = document.querySelector('.cal-day');
    if (el && el.getBoundingClientRect().top > window.innerHeight - 160) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  },
  jobType(d, el) {
    const f = el.closest('form');
    f.title.value = d.t;
    f.querySelectorAll('.job-types .chip').forEach(c => c.classList.toggle('on', c === el));
  },
  stripDay(d) { S.stripDay = S.stripDay === d.d ? null : d.d; render(); },
  evSheet(d) { evSheet(d.id, d.date, d.job); },
  evKind(d, el) {
    const f = el.closest('form');
    f.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c === el));
    const oldLabel = EV_KINDS[f.kind.value];
    f.kind.value = d.k;
    if (!f.title.value || f.title.value === oldLabel) f.title.value = EV_KINDS[d.k];
    if (d.k === 'away' && !f.end_date.value) f.end_date.value = f.event_date.value;
  },
  async evDone(d, el) {
    const e = S.data.events.find(x => x.id === d.id);
    await busy(el, async () => { await saveRow('events', e.id, { done: !e.done }); render(); });
  },
  archiveYear(d) { S.archiveYear = d.y; render(); },
  taxYear(d) { S.taxYear = Number(d.y); render(); },
  async closeSheet(d, el) {
    // tapping outside a form you've typed in asks first
    const f = sheet.querySelector('form');
    if (el?.classList.contains('sheet-back') && f?.dataset.dirty === '1' && !await ask('Discard what you\'ve typed?', 'Discard', true)) return;
    closeSheet();
  },
  costSheet(d) { costSheet(d.job, d.id); },
  paySheet(d) { paySheet(d.job, d.id); },
  photoKind(d) { (S.photoKind ||= {})[d.id] = d.k; render(); },
  viewPhoto(d) { viewPhoto(d.id); },
  ohSheet(d) { ohSheet(d.id); },
  buySheet(d) { ohSheet(null, { frequency: 'oneoff', category: d.k, paid_by: S.payer || S.me }); },
  toggleBuys(d) { S.showAllBuys = { ...(S.showAllBuys || {}), [d.k]: !S.showAllBuys?.[d.k] }; render(); },
  taskSheet(d) { taskSheet(d.id); },
  taskKind(d) { taskSheet(null, d.k); },
  nextStepSheet(d) { nextStepSheet(d.id); },
  async nextStepFinish(d, el) {
    await busy(el, async () => {
      await saveRow('tasks', d.id, { done: true, done_at: new Date().toISOString() });
      closeSheet(); render(); toast('All done ✓');
    });
  },
  pickDue(d, el) {
    const f = el.closest('form');
    f.querySelector('[name=due_date]').value = d.d;
    f.querySelectorAll('.due-chips .chip').forEach(c => c.classList.toggle('on', c === el));
  },
  stepAdd(d, el) {
    const f = el.closest('form');
    const inp = f.querySelector('#step-new');
    const v = inp.value.trim();
    if (!v) { inp.focus(); return; }
    addStepRow(f, v);
    inp.value = ''; inp.focus();
  },
  stepDel(d, el) { el.closest('.step-row')?.remove(); },
  async stepDone(d, el) {
    const x = (S.data.tasks || []).find(t => t.id === d.id);
    if (!x) return;
    const steps = (taskSteps(x) || []).map(st => (st.id === d.step ? { ...st, done: true, done_at: new Date().toISOString() } : st));
    const ticked = steps.find(st => st.id === d.step);
    await busy(el, async () => {
      await saveRow('tasks', x.id, { steps });
      render();
      if (steps.every(st => st.done)) nextStepSheet(x.id, ticked?.text);
      else toast('Step done ✓');
    });
  },
  async taskDone(d, el) {
    el.classList.add('on');
    el.closest('.todo-item')?.classList.add('done');
    await busy(el, async () => {
      await saveRow('tasks', d.id, { done: true, done_at: new Date().toISOString() });
      setTimeout(render, 250);
      toast('Done ✓');
    });
  },
  async markJob(d, el) {
    const j = jobById(d.id);
    await busy(el, async () => { await setMark(j, d.f); render(); toast('Marked as chased'); });
  },
  async paidFull(d, el) {
    const j = jobById(d.id);
    const c = calc(j);
    if (c.balance <= 0.004) return;
    if (!await ask(`Record a final payment of ${money(c.balance)} received by ${nameOf(S.payer || S.me)} today?`)) return;
    await busy(el, async () => {
      await saveRow('payments', null, { job_id: j.id, amount: r2(c.balance), pay_date: today(), kind: 'final', method: 'bank', received_by: S.payer || S.me, note: null });
      render(); toast('Paid in full');
    });
  },
  toggleTodos() { S.showAllTodos = !S.showAllTodos; render(); },
  saveAgain(d, el) { const f = el.closest('form'); f.dataset.again = '1'; f.requestSubmit(); },
  async sendPdf(d, el) {
    const j = jobById(d.id);
    const isQuote = d.type === 'quote';
    if (isQuote && !j.quote_date && j.status === 'quoted') saveRow('jobs', j.id, { quote_date: today() }).catch(console.error);
    const text = () => `${set().business_name} ${isQuote ? 'quote' : 'invoice'} ${isQuote ? 'Q' : 'INV'}-${String(j.ref ?? 0).padStart(4, '0')} — ${j.title}`;
    // Second tap after Safari blocked the first share: share the ready-made file instantly
    if (S.readyPdf && S.readyPdf.key === `${j.id}/${d.type}`) {
      const file = S.readyPdf.file;
      S.readyPdf = null;
      el.textContent = 'Send PDF';
      try { await navigator.share({ files: [file], title: file.name, text: text() }); await setMark(j, 'chased_at'); }
      catch (e) { if (e.name !== 'AbortError') { saveFile(file); toast('PDF downloaded instead'); } }
      return;
    }
    const ref = `${isQuote ? 'Q' : 'INV'}-${String(j.ref ?? 0).padStart(4, '0')}`;
    const name = `${set().business_name.replace(/[^\w]+/g, '')} ${isQuote ? 'Quote' : 'Invoice'} ${ref}.pdf`;
    const label = el.textContent;
    el.textContent = 'Making PDF…';
    await busy(el, async () => {
      const file = await makePdf(name);
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: name, text: text() });
        } catch (e) {
          if (e.name === 'AbortError') return;
          if (e.name === 'NotAllowedError') {
            // iPhone needs a fresh tap to open the share sheet
            S.readyPdf = { key: `${j.id}/${d.type}`, file };
            setTimeout(() => { el.textContent = 'PDF ready — tap to send'; el.classList.add('pulse'); }, 0);
            return;
          }
          throw e;
        }
      } else {
        saveFile(file);
        try { await navigator.clipboard.writeText(text()); } catch { /* ignore */ }
        toast('PDF downloaded — message copied, ready to paste');
      }
      await setMark(j, 'chased_at');
    });
    if (!S.readyPdf) el.textContent = label;
  },
  async forgot(d, el) {
    const email = el.closest('form').email.value.trim();
    if (!email) { toast('Type your email first, then tap Forgot password', true); return; }
    await busy(el, async () => { await db.resetPassword(email); toast('Check your email for a reset link'); });
  },
  changePw() {
    openSheet(`<form data-form="changePassword" class="form">${sheetHead('Change password')}
      <label>New password<input name="password" type="password" autocomplete="new-password" minlength="8" required></label>
      <label>Repeat it<input name="password2" type="password" autocomplete="new-password" minlength="8" required></label>
      <button class="btn primary wide big">Save</button></form>`);
  },
  ohPreset(d, el) {
    const [name, category, frequency] = OH_PRESETS[Number(d.i)];
    const f = el.closest('form');
    f.name.value = name; f.category.value = category; f.frequency.value = frequency;
    f.amount.focus();
  },
  print() { window.print(); },
  async signout() {
    try { localStorage.removeItem(snapKey()); } catch { /* ignore */ }
    await db.signOut().catch(console.error); S.session = null; S.data = null; S.loadError = null; render(); },

  async status(d, el) {
    const j = jobById(d.id);
    const patch = { status: d.s };
    if (d.s === 'finished' || d.s === 'declined') patch.finished_date = j.finished_date || today();
    else patch.finished_date = null;
    if (d.s === 'finished') {
      const c = calc(j);
      if (c.balance > 0.004 && !await ask(`Mark finished? ${money(c.balance)} is still unpaid — it'll show under "Owed".`)) return;
    }
    await busy(el, async () => {
      await saveRow('jobs', j.id, patch);
      render();
      toast(`Marked ${STATUS[d.s]}${d.s === 'finished' || d.s === 'declined' ? ' — moved to Archive' : ''}`);
    });
  },

  async deleteRow(d, el) {
    const what = { costs: 'cost', payments: 'payment', photos: 'photo', overheads: 'overhead', events: 'calendar entry', tasks: 'to-do' }[d.table];
    if (!await ask(`Delete this ${what}?`, 'Delete', true)) return;
    await busy(el, async () => { await deleteRow(d.table, d.id); closeSheet(); render(); toast('Deleted'); });
  },

  async deleteJob(d, el) {
    const j = jobById(d.id);
    if (!await ask(`Delete "${jobName(j)}" and all its costs, payments and photos? This can't be undone.\n\nTip: mark it Finished or Declined instead to keep it in the Archive.`, 'Delete job', true)) return;
    await busy(el, async () => {
      const paths = photosOf(j.id).map(p => p.path);
      await db.removeFiles(paths).catch(console.error);
      await db.remove('jobs', j.id);
      S.data.jobs = S.data.jobs.filter(x => x.id !== j.id);
      ['costs', 'payments', 'photos'].forEach(t => { S.data[t] = S.data[t].filter(x => x.job_id !== j.id); });
      (S.data.events || []).forEach(e => { if (e.job_id === j.id) e.job_id = null; });
      location.replace(j.status === 'finished' || j.status === 'declined' ? '#/archive' : '#/jobs');
      toast('Job deleted');
    });
  },

  async duplicate(d, el) {
    const j = jobById(d.id);
    await busy(el, async () => {
      const keep = ['title', 'customer_name', 'customer_phone', 'customer_email', 'address', 'postcode', 'description', 'notes', 'price', 'vat_applies', 'vat_rate', 'quote_valid_days'];
      const row = Object.fromEntries(keep.map(k => [k, j[k] ?? null]));
      row.title = `${j.title} (copy)`;
      row.status = 'quoted';
      row.quote_date = null;
      row.created_by = S.session?.user?.email || null;
      const nj = await saveRow('jobs', null, row);
      for (const c of costsOf(j.id)) {
        await saveRow('costs', null, { job_id: nj.id, description: c.description, qty: c.qty, unit_cost: c.unit_cost, category: c.category, paid_by: c.paid_by, supplier: c.supplier, cost_date: null });
      }
      go(`#/job/${nj.id}`);
      toast('Copied as a new quote with its costs — tap Edit to change details');
    });
  },

  export(d) { exportData(d.what); },

  async seed(d, el) {
    if (!await ask('Add some sample jobs so you can try things out?', 'Add samples')) return;
    await busy(el, async () => { await seedDemo(); await loadData(); go('#/jobs'); render(); toast('Sample jobs added'); });
  },
  async resetDemo() {
    if (!await ask('Wipe all demo data in this browser?', 'Wipe', true)) return;
    db.resetDemo();
    await loadData();
    go('#/jobs');
    render();
  },
};

// ======================================================================
// Export
// ======================================================================
function csv(rows) {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const cell = v => { let s = v == null ? '' : String(v); if (typeof v === 'string' && /^[=+\-@]/.test(s)) s = `'${s}`; return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [cols.join(','), ...rows.map(r => cols.map(c => cell(r[c])).join(','))].join('\n');
}
function download(name, text, type = 'text/csv') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
function exportData(what) {
  const d = S.data;
  const stamp = today();
  const title = id => jobById(id)?.title || '';
  const ref = id => jobById(id)?.ref || '';
  if (what === 'backup') {
    try { localStorage.setItem('cb-last-backup', today()); } catch { /* ignore */ }
    setTimeout(() => { if (route().view === 'jobs') render(); }, 300);
    download(`cb-jobs-backup-${stamp}.json`, JSON.stringify({ exported: new Date().toISOString(), ...d }, null, 2), 'application/json');
    return;
  }
  let rows = [];
  if (what === 'jobs') {
    rows = d.jobs.map(j => {
      const c = calc(j);
      return {
        ref: j.ref, title: j.title, status: j.status, customer: j.customer_name, phone: j.customer_phone, email: j.customer_email,
        address: j.address, postcode: j.postcode, quote_date: j.quote_date, start: j.start_date, end: j.end_date, finished: j.finished_date,
        price_ex_vat: r2(c.price), vat: r2(c.vat), total: r2(c.gross), costs: r2(c.totalCost), profit: r2(c.profit),
        paid: r2(c.paid), balance: r2(c.balance),
        [`${nameOf('a')}_costs`]: r2(c.costA), [`${nameOf('a')}_share`]: r2(c.shareA),
        [`${nameOf('b')}_costs`]: r2(c.costB), [`${nameOf('b')}_share`]: r2(c.shareB),
      };
    });
  } else if (what === 'costs') {
    rows = d.costs.map(c => ({ job_ref: ref(c.job_id), job: title(c.job_id), date: c.cost_date, item: c.description, category: COST_CATS[c.category] || c.category, qty: c.qty, unit_cost: c.unit_cost, total: r2(lineTotal(c)), supplier: c.supplier, paid_by: nameOf(c.paid_by) }));
  } else if (what === 'payments') {
    rows = d.payments.map(p => ({ job_ref: ref(p.job_id), job: title(p.job_id), date: p.pay_date, amount: p.amount, type: PAY_KINDS[p.kind] || p.kind, method: PAY_METHODS[p.method] || p.method, received_by: nameOf(p.received_by), note: p.note }));
  } else if (what === 'overheads') {
    rows = (d.overheads || []).map(o => ({ name: o.name, category: OH_CATS[o.category] || o.category, amount: o.amount, frequency: OH_FREQ[o.frequency]?.[0] || o.frequency, per_year: r2(ohAnnual(o)), paid_by: o.paid_by === 'split' ? 'Split' : nameOf(o.paid_by), start: o.start_date, end: o.end_date, notes: o.notes }));
  }
  if (!rows.length) { toast('Nothing to export yet'); return; }
  download(`cb-${what}-${stamp}.csv`, csv(rows));
}

// ======================================================================
// Demo sample data
// ======================================================================
async function seedDemo() {
  const t = today();
  const mk = async (job, costs = [], pays = []) => {
    const j = await db.insert('jobs', { id: crypto.randomUUID(), vat_applies: false, vat_rate: 20, quote_valid_days: 30, ...job });
    for (const c of costs) await db.insert('costs', { id: crypto.randomUUID(), job_id: j.id, qty: 1, category: 'materials', ...c });
    for (const p of pays) await db.insert('payments', { id: crypto.randomUUID(), job_id: j.id, method: 'bank', ...p });
  };
  await mk({ title: 'Air con install — 2 bedrooms', status: 'finished', customer_name: 'Mrs J. Holloway', customer_phone: '07700 900123', address: '14 Sea Road, Bexhill-on-Sea', postcode: 'TN40 1AB', price: 3200, quote_date: addDays(t, -40), start_date: addDays(t, -21), end_date: addDays(t, -20), finished_date: addDays(t, -20), description: 'Supply and fit 2 × 2.5kW wall-mounted split units to front and rear bedrooms, including pipework, condensate and electrical connection. Commissioning and F-Gas certificate.' },
    [{ description: '2.5kW split unit', qty: 2, unit_cost: 520, supplier: 'Climate Centre', paid_by: 'a', cost_date: addDays(t, -22) },
     { description: 'Pipe, trunking & fixings', unit_cost: 186.4, supplier: 'Climate Centre', paid_by: 'a', cost_date: addDays(t, -22) },
     { description: 'Electrical sundries', unit_cost: 64.2, supplier: 'CEF', paid_by: 'b', cost_date: addDays(t, -21) }],
    [{ kind: 'deposit', amount: 960, received_by: 'a', pay_date: addDays(t, -30) }, { kind: 'final', amount: 2240, received_by: 'a', pay_date: addDays(t, -18) }]);
  await mk({ title: 'Bathroom refit', status: 'active', customer_name: 'Tom Ellis', customer_phone: '07700 900456', customer_email: 'tom@example.com', address: '3 Mill Lane, Hastings', postcode: 'TN34 2CD', price: 6850, quote_date: addDays(t, -25), start_date: addDays(t, -3), end_date: addDays(t, 6), description: 'Strip out existing suite. Replace with new bath, shower screen, vanity unit and WC. Re-tile walls and floor. New towel rail.', notes: 'Customer supplying tiles. Parking on drive.' },
    [{ description: 'Bath, vanity & WC', unit_cost: 1140, supplier: 'Plumb Centre', paid_by: 'b', cost_date: addDays(t, -4) },
     { description: 'Thermostatic shower + screen', unit_cost: 389, supplier: 'Screwfix', paid_by: 'a', cost_date: addDays(t, -4) },
     { description: 'Adhesive & grout', qty: 6, unit_cost: 18.5, supplier: 'Toolstation', paid_by: 'a', cost_date: addDays(t, -2) },
     { description: 'Skip hire', category: 'waste', unit_cost: 260, paid_by: 'b', cost_date: addDays(t, -3) }],
    [{ kind: 'deposit', amount: 2000, received_by: 'b', pay_date: addDays(t, -10) }]);
  await mk({ title: 'Combi boiler swap', status: 'quoted', customer_name: 'R. Patel', customer_phone: '07700 900789', address: '22 Collington Ave, Bexhill', postcode: 'TN39 3NE', price: 2650, quote_date: addDays(t, -2), description: 'Remove existing system boiler and cylinder. Supply and fit new 30kW combi boiler with magnetic filter, flush system, and register with Gas Safe and manufacturer warranty.' },
    [{ description: '30kW combi boiler', unit_cost: 1045, supplier: 'Plumb Centre', paid_by: 'a' }, { description: 'Flue, filter & fittings', unit_cost: 210, paid_by: 'a' }]);
  await mk({ title: 'Garage door infill', status: 'quoted', customer_name: 'Sue Martin', address: 'Little Common, Bexhill', postcode: 'TN39 4XX', price: 1450, quote_date: addDays(t, -9), start_date: addDays(t, 14), end_date: addDays(t, 15), description: 'Remove up-and-over door, build stud wall with insulation and window opening, render finish externally.' });
  const ys = addDays(t, -200);
  for (const o of [
    { name: 'Checkatrade', category: 'marketing', amount: 120, frequency: 'monthly', paid_by: 'a' },
    { name: 'Public liability insurance', category: 'insurance', amount: 420, frequency: 'yearly', paid_by: 'b' },
    { name: 'Van insurance', category: 'vehicle', amount: 95, frequency: 'monthly', paid_by: 'split' },
    { name: 'Phone contract', category: 'phone', amount: 28, frequency: 'monthly', paid_by: 'a' },
    { name: 'Microsoft 365', category: 'phone', amount: 79, frequency: 'yearly', paid_by: 'b' },
    { name: 'Gas Safe registration', category: 'accreditation', amount: 300, frequency: 'yearly', paid_by: 'a', start_date: addDays(t, -355) },
    { name: 'Business cards', category: 'marketing', amount: 45, frequency: 'oneoff', paid_by: 'b', start_date: addDays(t, -30) },
  ]) await db.insert('overheads', { id: crypto.randomUUID(), start_date: ys, notes: 'Example figure', ...o });
  const boiler = (await db.loadAll()).jobs.find(j => j.title === 'Combi boiler swap');
  for (const e of [
    { title: 'Collect bath & vanity from Plumb Centre', kind: 'collect', event_date: addDays(t, 1), start_time: '07:30', who: 'b' },
    { title: 'Quote visit — loft conversion', kind: 'visit', event_date: addDays(t, 2), start_time: '10:00', who: 'both', notes: 'Mr Davies, 8 Station Rd, Bexhill' },
    { title: 'Boiler survey', kind: 'visit', event_date: addDays(t, 3), start_time: '14:00', who: 'a', job_id: boiler?.id || null },
    { title: 'Van MOT', kind: 'vehicle', event_date: addDays(t, 9), start_time: '08:30', who: 'a' },
    { title: 'Holiday', kind: 'away', event_date: addDays(t, 7), end_date: addDays(t, 9), who: 'b' },
  ]) await db.insert('events', { id: crypto.randomUUID(), done: false, end_date: null, start_time: null, job_id: null, notes: null, ...e });
  await mk({ title: 'Kitchen leak repair', status: 'declined', customer_name: 'D. Brown', postcode: 'TN38 0AA', price: 180, quote_date: addDays(t, -50), finished_date: addDays(t, -45) });
  for (const n of [
    { text: 'Key safe codes\nMill Lane: 4417\nSea Road (back gate): 2090', pinned: true, updated_by: 'Luke' },
    { text: 'Trade accounts\nPlumb Centre acc no. on the card in the van\nCEF: ask for the trade price', pinned: false, updated_by: 'Henry' },
    { text: 'Van — things to buy\nSpare PTFE, 15mm push-fit elbows, new hacksaw blades', pinned: false, updated_by: 'Luke' },
  ]) await db.insert('notes', { id: crypto.randomUUID(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...n });
}

// ======================================================================
// Event wiring & start-up
// ======================================================================
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const fn = ACT[el.dataset.act];
  if (!fn) return;
  e.preventDefault();
  fn(el.dataset, el, e);
});

// Folded Settings sections: open any section holding an invalid field so Save never fails silently
document.addEventListener('click', e => {
  const btn = e.target.closest('form button:not([type=button])');
  if (btn) btn.form.querySelectorAll('details').forEach(d => { if (d.querySelector(':invalid')) d.open = true; });
}, true);

document.addEventListener('submit', e => {
  const f = e.target.closest('form[data-form]');
  if (!f) return;
  e.preventDefault();
  FORMS[f.dataset.form](new FormData(f), f);
});

document.addEventListener('change', async e => {
  if (e.target.id === 'chat-photo' && e.target.files?.[0]) {
    const f = e.target.files[0];
    e.target.value = '';
    try {
      const blob = await compress(f);
      if (S.chatPhoto?.url) URL.revokeObjectURL(S.chatPhoto.url);
      S.chatPhoto = { blob, url: URL.createObjectURL(blob) };
      render();
    } catch (err) { toast(friendly(err), true); }
    return;
  }
  const jobId = e.target.dataset?.photoJob;
  if (!jobId || !e.target.files?.length) return;
  uploadPhotos(jobId, [...e.target.files], e.target);
});

// To-do steps: Enter adds the step; ticking strikes it through
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.id === 'step-new') { e.preventDefault(); ACT.stepAdd({}, e.target); }
  if (e.key === 'Enter' && !e.shiftKey && e.target.id === 'chat-input' && !/iPhone|iPad|Android/.test(navigator.userAgent)) { e.preventDefault(); e.target.form.requestSubmit(); }
});
document.addEventListener('change', e => {
  if (e.target.name === 'step_done') e.target.closest('.step-row')?.classList.toggle('done', e.target.checked);
});

document.addEventListener('input', e => {
  const form = e.target.closest?.('form[data-form]');
  if (form && form.dataset.form !== 'login' && !e.target.matches('[type=search]')) form.dataset.dirty = '1';
  const k = e.target.dataset?.input;
  if (!k) return;
  if (k === 'search') { S.search = e.target.value; document.getElementById('job-list').innerHTML = jobListHtml(); }
  if (k === 'chatDraft') { S.chatDraft = e.target.value; growChat(e.target); }
  if (k === 'chatJob') { S.chatJob = e.target.value || null; render(); }
  if (k === 'pushPref') {
    const P = S.push;
    if (P?.endpoint) {
      P.prefs = { ...P.prefs, [e.target.dataset.k]: e.target.checked };
      db.pushPrefs(P.endpoint, P.prefs).then(() => toast('Saved')).catch(err => { e.target.checked = !e.target.checked; toast(err.message, true); });
    }
  }
  if (k === 'segpick') { e.target.closest('.seg3').querySelectorAll('label').forEach(l => l.classList.toggle('on', l.contains(e.target))); }
  if (k === 'noteSearch') { S.noteSearch = e.target.value; document.getElementById('notes-list').innerHTML = notesListHtml(); }
  if (k === 'archiveSearch') { S.archiveSearch = e.target.value; document.getElementById('archive-list').innerHTML = archiveListHtml(); }
  if (k === 'customer') {
    const f = e.target.closest('form');
    const key = e.target.value.trim().toLowerCase();
    const cu = key && customers().find(x => x.customer_name.trim().toLowerCase() === key);
    if (cu) {
      let filled = 0;
      ['customer_phone', 'customer_email', 'address', 'postcode'].forEach(n => {
        if (f[n] && !f[n].value && cu[n]) { f[n].value = cu[n]; filled++; }
      });
      if (filled) toast('Details filled from their last job');
    }
  }
  if (k === 'costItem') {
    const f = e.target.closest('form');
    const key = e.target.value.trim().toLowerCase();
    const it = key && pastItems().find(x => x.description.trim().toLowerCase() === key);
    const out = f.querySelector('[data-out="lastPrice"]');
    if (it) {
      if (!f.unit_cost.value) f.unit_cost.value = r2(num(it.unit_cost));
      if (!f.supplier.value && it.supplier) f.supplier.value = it.supplier;
      f.category.value = it.category || f.category.value;
      if (out) out.textContent = `Last bought: ${money(it.unit_cost)}${it.supplier ? ` at ${it.supplier}` : ''}${it.cost_date ? ` on ${fmtDate(it.cost_date)}` : ''}`;
    } else if (out) out.textContent = '';
  }
});

// Refresh when coming back to the app (so you see your partner's changes)
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible' || !S.session || !S.data) return;
  if (Date.now() - S.loadedAt < 30000) return;
  const v = route().view;
  if (!sheet.hidden || v === 'edit' || v === 'settings') return;
  try { await loadData(); S.urls = {}; render(); } catch (e) { console.error(e); }
});

// Live sync: when your partner changes something, refresh quietly
function startLive() {
  if (S.liveStarted || DEMO) return;
  S.liveStarted = true;
  db.subscribe(() => {
    S.live = true;
    if (Date.now() - (S.lastWrite || 0) < 4000) return; // our own change echoing back
    clearTimeout(startLive.t);
    startLive.t = setTimeout(async () => {
      const v = route().view;
      if (!sheet.hidden || v === 'edit' || v === 'settings' || document.activeElement?.matches('input,textarea,select')) { S.pendingSync = true; return; }
      try { await loadData(); render(); } catch (e) { console.error(e); }
    }, 1200);
  }).catch(console.error);
}

window.addEventListener('online', () => {
  if (S.session && S.offlineSince) loadData().then(() => { render(); toast('Back online — up to date'); }).catch(console.error);
});

// Keep the app's files on the phone for instant, signal-free opening
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  try { navigator.serviceWorker.register('sw.js').catch(() => {}); } catch { /* not allowed here (e.g. demo preview) */ }
  try { navigator.serviceWorker?.addEventListener('message', e => { if (e.data?.goto) location.hash = e.data.goto; }); } catch { /* ignore */ }
}

async function start() {
  // Arriving from a password-reset email?
  const h = location.hash;
  if (/type=recovery/.test(h)) S.recovery = true;
  const linkErr = /error_description=([^&]+)/.exec(h);
  if (linkErr) {
    history.replaceState(null, '', location.pathname);
    setTimeout(() => toast(`${decodeURIComponent(linkErr[1].replace(/\+/g, ' '))} — request a new reset link`, true), 300);
  }
  render();
  try {
    await db.onAuth((session, event) => {
      const was = !!S.session;
      S.session = session;
      if (event === 'PASSWORD_RECOVERY') { S.recovery = true; render(); return; }
      if (!session && was) { S.data = null; render(); }
    });
    S.session = await db.session();
    S.booting = false;
    if (S.recovery && !S.session) {
      S.recovery = false;
      setTimeout(() => toast('That reset link has expired — request a new one', true), 300);
    }
    if (S.session) { render(); await loadData(); startLive(); }
    if (DEMO && S.data && !S.data.jobs.length) {
      let seeded = false;
      try { seeded = localStorage.getItem('cb-demo-seeded') === '1'; localStorage.setItem('cb-demo-seeded', '1'); } catch { /* ignore */ }
      if (!seeded) { await seedDemo(); await loadData(); }
    }
  } catch (e) {
    console.error(e);
    S.loadError = S.loadError || e.message || 'Could not connect';
  }
  S.booting = false;
  render();
}
start();
