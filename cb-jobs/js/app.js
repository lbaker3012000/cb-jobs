import { db, DEMO } from './db.js?v=20261121h';
const VERSION_TAG = '20261121h';

const APP_VERSION = '21 Nov 2026 (8)';

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
  inboxFiles: [],
  inboxText: '',
  inboxJob: null,
  reading: {},
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
const addMonths = (iso, n) => { const d = parseISO(iso); const day = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + n); d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); return toISO(d); };
const fmtDate = (s, o) => (s ? parseISO(s.slice(0, 10)).toLocaleDateString('en-GB', o || { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const fmtShort = s => fmtDate(s, { day: 'numeric', month: 'short' });
const nl2br = s => esc(s).replace(/\n/g, '<br>');

const STATUS = { enquiry: 'Enquiry', quoted: 'Quoted', active: 'Active', finished: 'Finished', declined: 'Declined' };
const STATUS_ORDER = { active: 0, enquiry: 1, quoted: 2, finished: 3, declined: 4 };
// Where a job came from (to see what's worth paying for)
const SOURCES = { checkatrade: 'Checkatrade', referral: 'Word of mouth', repeat: 'Repeat customer', website: 'Website', social: 'Facebook / social', other: 'Other' };
const isPre = j => j.status === 'enquiry' || j.status === 'quoted';
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
  markup_pct: 20, day_rate: 0,
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
  mic: '<svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M8.5 21h7"/></svg>',
  car: '<svg viewBox="0 0 24 24"><path d="M3 13l2-5.5A2 2 0 0 1 6.9 6h10.2a2 2 0 0 1 1.9 1.5L21 13v5h-2.5M3 13v5h2.5M3 13h18"/><circle cx="7.5" cy="17.5" r="2"/><circle cx="16.5" cy="17.5" r="2"/><path d="M9.5 17.5h5"/></svg>',
  people: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.3-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><path d="M16 4.8a3.3 3.3 0 0 1 0 6.4M18.5 14.8c1.8.8 2.8 2.6 3 5.2"/></svg>',
  inbox: '<svg viewBox="0 0 24 24"><path d="M3 13h5l1.5 3h5l1.5-3h5M5.5 5h13L21 13v6H3v-6z"/></svg>',
  upload: '<svg viewBox="0 0 24 24"><path d="M12 16V4M7 9l5-5 5 5M4 16v4h16v-4"/></svg>',
  spark: '<svg viewBox="0 0 24 24"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/></svg>',
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
  const undo = !bad && /deleted/i.test(msg) && S.undo && Date.now() - S.undo.at < 4000;
  t.innerHTML = `${esc(msg)}${undo ? ' <button class="toast-undo" data-act="undoDelete">Undo</button>' : ''}`;
  t.className = `toast show${bad ? ' bad' : ''}${undo ? ' has-undo' : ''}`;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.className = 'toast'; }, undo ? 10000 : 2600);
}
// Undo: anything just deleted can be put back for 10 seconds
function rememberDeleted(items) {
  S.undo = { items, at: Date.now() };
}
async function undoDelete() {
  const u = S.undo;
  if (!u || Date.now() - u.at > 15000) { toast('Too late to undo', true); return; }
  S.undo = null;
  S.lastWrite = Date.now();
  clearTimeout(u.fileTimer);
  for (const { table, row } of u.items) {
    const clean = { ...row };
    delete clean.ref; // job numbers are given out by the database
    const r = await db.insert(table, clean);
    (S.data[table] ||= []).push(r);
  }
  for (const { table, id, field, value } of u.relink || []) {
    await db.update(table, id, { [field]: value }).catch(console.error);
    const x = (S.data[table] || []).find(y => y.id === id); if (x) x[field] = value;
  }
  if (u.back) location.hash = u.back;
  render(); toast('Put back');
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
    if (j.status === 'enquiry') {
      const vis = visitOf(j);
      if (!vis && daysSince(String(j.created_at || '').slice(0, 10)) >= 1) add(j, 3, '☎', 'Enquiry waiting', 'Ring them back or book a visit', null, j.customer_phone ? `<a class="btn small" href="tel:${esc(String(j.customer_phone).replace(/[^\d+]/g, ''))}">Call</a>` : '');
      continue;
    }
    if (j.status === 'quoted' && !j.quote_date) {
      const vis = visitOf(j);
      if (!vis || vis.event_date < t) add(j, 3, '✉', 'Quote to send', vis ? `Visited ${fmtShort(vis.event_date)} — price it up and send it` : 'Price it up, then Send PDF', null, `<a class="btn small" href="#/quotes/job-quote/${j.id}">Quote</a>`);
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
        if (!chased || chased < (j.finished_date || '')) add(j, 1, '£', 'Send invoice', `${money(c.balance)} to collect`, 'invoice_send', `<a class="btn small" href="#/quotes/job-invoice/${j.id}">Invoice</a>`);
        else if (daysSince(chased) >= num(st.payment_chase_days)) add(j, 1, '£', 'Payment overdue', `${money(c.balance)} · finished ${daysSince(j.finished_date)} days ago`, 'payment', `<button class="btn small" data-act="paidFull" data-id="${j.id}">Paid</button>`);
      }
    }
  }
  // Services coming up (a month before) — ring and book them in
  for (const j of S.data.jobs) {
    if (!j.service_due || j.service_due > addDays(t, 31)) continue;
    out.push({ j, pri: j.service_due <= t ? 2 : 4, icon: '🔧', text: j.service_due <= t ? 'Service overdue' : 'Service due soon', sub: `${esc(j.title || 'Service')} · due ${fmtShort(j.service_due)}${j.customer_phone ? ` · ${esc(j.customer_phone)}` : ''}`,
      tpl: null, extra: `<button class="btn small primary" data-act="serviceBook" data-id="${j.id}">Book it</button><button class="btn small" data-act="serviceSkip" data-id="${j.id}">Not needed</button>` });
  }
  let lastBackup = null;
  try { lastBackup = localStorage.getItem('cb-last-backup'); } catch { /* ignore */ }
  if (false && lastBackup) out.push({ pri: 6, icon: '⤓', text: 'Download a backup', sub: lastBackup ? `Last one ${daysSince(lastBackup)} days ago (on this device)` : 'Keeps a copy of everything, just in case', backup: true });
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
    archive: archiveView, notes: notesView, money: moneyView, settings: settingsView, doc: docView, overheads: moneyView, chat: chatView, inbox: inboxView, quotes: quotesView, contacts: contactsView, activity: activityView,
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
  if (r.view === 'inbox') resumeInboxReading();
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
    <div class="top-right">${right}${inboxBtn()}${msgBtn()}${themeSwitch()}</div>
  </header>
  ${S.offlineSince ? `<div class="offline-banner"><b>No signal</b> — showing jobs as of ${new Date(S.offlineSince).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}. You can look, but changes can't be saved until you're back online.</div>` : ''}
  ${DEMO ? '<div class="demo-banner"><b>Demo</b> — sample jobs to try out. Changes stay on this phone only.</div>' : ''}
  <main>${tipHtml(r)}${body}</main>
  ${fab}
  ${nav ? `<nav class="tabs">
    ${tab('jobs', 'Home', ICON.jobs)}
    ${tab('calendar', 'Calendar', ICON.cal)}
    ${tab('quotes', 'Quotes', ICON.doc)}
    ${tab('contacts', 'Contacts', ICON.people)}
    ${tab('notes', 'Notes', ICON.note)}
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
  const body = `
  <div class="chat-thread">
    ${bubbles || `<div class="chat-empty">${ICON.chat}<p>No messages yet.<br>Say hello to ${esc(nameOf(other))} — it pops up on their phone.</p></div>`}
  </div>
  <form data-form="chat" class="chat-compose">
    <div class="chat-quick">${QUICK_MSGS.map(q => `<button type="button" class="chip" data-act="chatQuick" data-t="${esc(q)}">${esc(q)}</button>`).join('')}</div>
    ${S.chatPhoto ? `<div class="chat-photo-preview"><img src="${esc(S.chatPhoto.url)}" alt=""><span>Photo ready to send — add a message if you like</span><button type="button" data-act="chatPhotoClear" aria-label="Remove photo">×</button></div>` : ''}
    ${S.chatJobOpen ? `<div class="chat-jobsearch">
      <div id="chat-suggest">${jobSuggestHtml(S.chatJobQ, 'chatPickJob', 5)}</div>
      <div class="chat-jobsearch-row"><input type="search" id="chat-jobq" placeholder="Which job? Start typing an address or name…" autocomplete="off" value="${esc(S.chatJobQ || '')}" data-input="chatJobQ"><button type="button" class="btn small" data-act="chatJobClose">Cancel</button></div>
    </div>` : ''}
    ${job ? `<div class="chat-job-tag">${ICON.jobs}<span>About: <b>${esc(jobName(job))}</b></span><button type="button" data-act="chatJobClear" aria-label="Remove job">×</button></div>` : ''}
    <div class="chat-row">
      <button type="button" class="chat-attach ${S.chatJobOpen ? 'on' : ''}" data-act="chatJobOpen" aria-label="Link a job">${ICON.jobs}</button>
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

// ======================================================================
// Inbox for Claude: upload invoices or type requests, Claude proposes, you approve
// ======================================================================
const PDFJS_BASE = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/';
const TESS_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
const TESS_LANG = 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0_best_int';
const INBOX_STATUS = { reading: 'Reading the file…', new: 'Waiting for Claude', proposed: 'Ready to approve', question: 'Claude has a question', approved: 'Done', rejected: 'Rejected' };
const ACTION_TYPES = { new_job: 'New job', update_job: 'Change job', add_cost: 'Cost', add_payment: 'Payment', add_overhead: 'Business buy', add_task: 'To-do', add_note: 'Note', add_trip: 'Mileage' };
const myEmail = () => String(S.session?.user?.email || '').toLowerCase();
const byName = email => {
  const m = (S.data?.members || []).find(x => String(x.email).toLowerCase() === String(email || '').toLowerCase());
  if (m?.who) return m.who === S.me && String(email).toLowerCase() === myEmail() ? 'You' : nameOf(m.who);
  return String(email || '').toLowerCase() === myEmail() ? 'You' : (String(email || 'Someone').split('@')[0]);
};
const inboxItems = () => (S.data?.inbox_items || []);
const inboxNeeds = () => inboxItems().filter(i => i.status === 'proposed' || i.status === 'question');
const inboxBtn = () => (S.data && !S.data.inboxMissing && route().view !== 'inbox'
  ? `<a class="icon-btn msg-btn" href="#/inbox" aria-label="Invoices for Claude">${ICON.inbox}${inboxNeeds().length ? '<i class="dot"></i>' : ''}</a>` : '');

let pdfLib = null;
let tessLoading = null;
async function loadPdf() {
  if (!pdfLib) {
    pdfLib = await import(`${PDFJS_BASE}pdf.min.mjs`);
    pdfLib.GlobalWorkerOptions.workerSrc = `${PDFJS_BASE}pdf.worker.min.mjs`;
  }
  return pdfLib;
}
function loadTess() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  tessLoading ||= new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = TESS_URL;
    s.onload = () => res(window.Tesseract);
    s.onerror = () => { tessLoading = null; rej(new Error('Could not load the photo reader — check your signal')); };
    document.head.appendChild(s);
  });
  return tessLoading;
}
// Read the words in a photo (or a drawn PDF page) on this phone
async function ocrText(img, onProgress) {
  const T = await loadTess();
  const w = await T.createWorker('eng', 1, {
    langPath: TESS_LANG,
    logger: m => { if (m.status === 'recognizing text') onProgress?.(Math.round((m.progress || 0) * 100)); },
  });
  try { return (await w.recognize(img)).data.text || ''; } finally { await w.terminate().catch(() => {}); }
}
// PDF text, keeping each printed line together (so prices stay next to their item)
function pdfLines(items) {
  const rows = [];
  for (const it of items) {
    if (!it.str || !it.transform) continue;
    const y = it.transform[5]; const x = it.transform[4];
    let row = rows.find(r => Math.abs(r.y - y) < 3);
    if (!row) { row = { y, parts: [] }; rows.push(row); }
    row.parts.push({ x, s: it.str, w: it.width || 0 });
  }
  rows.sort((a, b) => b.y - a.y);
  return rows.map(r => {
    r.parts.sort((a, b) => a.x - b.x);
    let out = ''; let end = null;
    for (const p of r.parts) { out += end == null ? p.s : (p.x - end > 12 ? '   ' : (out.endsWith(' ') || p.s.startsWith(' ') ? '' : ' ')) + p.s; end = p.x + p.w; }
    return out.trim();
  }).filter(Boolean).join('\n');
}
async function pdfText(blob, onProgress) {
  const lib = await loadPdf();
  const doc = await lib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
  const pages = [];
  for (let i = 1; i <= Math.min(doc.numPages, 10); i++) pages.push(pdfLines((await (await doc.getPage(i)).getTextContent()).items));
  let text = pages.join('\n\n--- next page ---\n\n');
  if (text.replace(/\s/g, '').length < 40) { // a scanned PDF: read the pages as pictures
    const parts = [];
    for (let i = 1; i <= Math.min(doc.numPages, 3); i++) {
      const page = await doc.getPage(i);
      const vp = page.getViewport({ scale: 2 });
      const cv = document.createElement('canvas');
      cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
      await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
      parts.push(await ocrText(cv, onProgress));
    }
    text = parts.join('\n\n--- next page ---\n\n');
  }
  return text;
}
const isPdf = x => /pdf/i.test(x?.file_type || x?.type || '') || /\.pdf$/i.test(x?.file_name || x?.name || '');

// Read an uploaded file and save its text so Claude can work from it
async function readInboxFile(item, blob) {
  S.reading[item.id] = 'Reading…';
  const label = t => { S.reading[item.id] = t; const el = document.getElementById(`rd-${item.id}`); if (el) el.textContent = t; };
  let text = ''; let err = null;
  try {
    if (!blob) {
      const urls = await db.fileUrls([item.file_path]);
      blob = await (await fetch(urls[item.file_path])).blob();
    }
    label(isPdf(item) ? 'Reading the PDF…' : 'Reading the photo… (first time takes a minute)');
    text = isPdf(item) ? await pdfText(blob, p => label(`Reading… ${p}%`)) : await ocrText(blob, p => label(`Reading the photo… ${p}%`));
  } catch (e) { console.error(e); err = e; }
  text = String(text || '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, 20000);
  delete S.reading[item.id];
  try {
    await saveRow('inbox_items', item.id, {
      extracted_text: text || (err ? `[The phone couldn't read this file: ${err.message || err}]` : '[No words found in this file]'),
      status: 'new', updated_at: new Date().toISOString(),
    });
  } catch (e) { console.error(e); }
  if (route().view === 'inbox' && sheet.hidden && !document.activeElement?.matches('input,textarea,select')) render();
}
// If the app was closed while a file was being read, carry on next time it's opened
function resumeInboxReading() {
  for (const it of inboxItems()) {
    if (it.status !== 'reading' || !it.file_path || S.reading[it.id]) continue;
    const mine = String(it.created_by || '').toLowerCase() === myEmail();
    const stale = Date.now() - Date.parse(it.created_at) > 10 * 60000;
    if (mine || stale) readInboxFile(it);
  }
}

async function addInboxFiles(list) {
  const files = [...(list || [])];
  for (const f of files) {
    const pdf = isPdf(f);
    if (!pdf && !/^image\//.test(f.type) && !/\.(jpe?g|png|heic|heif|webp)$/i.test(f.name)) { toast(`${f.name}: only photos and PDFs`, true); continue; }
    if (f.size > 20 * 1024 * 1024) { toast(`${f.name} is too big (20MB max)`, true); continue; }
    const blob = pdf ? f : await compress(f, 2200);
    const name = pdf ? f.name : String(f.name || 'photo').replace(/\.[a-z0-9]+$/i, '') + '.jpg';
    S.inboxFiles.push({ blob, name, type: pdf ? 'application/pdf' : (blob.type || 'image/jpeg'), url: pdf ? null : URL.createObjectURL(blob) });
  }
  render();
}

function actionDetail(a) {
  const j = a.job_id ? jobById(a.job_id) : null;
  const jl = j ? jobName(j) : (a.job_id ? 'the new job above' : '');
  const bits = [];
  if (a.type === 'add_cost') {
    bits.push(money(num(a.qty || 1) * num(a.unit_cost)) + (num(a.qty || 1) !== 1 ? ` (${r2(num(a.qty))} × ${money(a.unit_cost)})` : ''));
    if (a.supplier) bits.push(a.supplier);
    bits.push(`paid by ${nameOf(a.paid_by)}`);
    if (a.cost_date) bits.push(fmtShort(a.cost_date));
  } else if (a.type === 'add_payment') {
    bits.push(money(a.amount), `to ${nameOf(a.received_by)}`);
    if (a.pay_date) bits.push(fmtShort(a.pay_date));
  } else if (a.type === 'add_overhead') {
    bits.push(money(a.amount), OH_CATS[a.category] || a.category || '', a.paid_by === 'split' ? 'split 50/50' : `paid by ${nameOf(a.paid_by)}`);
  } else if (a.type === 'new_job') {
    const n = a.job || {};
    bits.push(n.status === 'quoted' || !n.status ? 'Quote' : STATUS[n.status] || n.status);
    if (n.customer_name) bits.push(n.customer_name);
    if (n.address) bits.push(String(n.address).split('\n')[0]);
    if (num(n.price)) bits.push(money(n.price));
  } else if (a.type === 'update_job') {
    bits.push(Object.entries(a.patch || {}).map(([k, v]) => `${k.replace(/_/g, ' ')}: ${k === 'price' ? money(v) : /_date$/.test(k) && v ? fmtShort(v) : v}`).join(', '));
  } else if (a.type === 'add_trip') {
    bits.push(`${num(a.miles)} miles`, nameOf(a.who || 'a'));
    if (a.trip_date) bits.push(fmtShort(a.trip_date));
    if (a.purpose) bits.push(a.purpose);
  } else if (a.type === 'add_task') {
    if (a.due_date) bits.push(`due ${fmtShort(a.due_date)}`);
    if (a.steps?.length) bits.push(`${a.steps.length} steps`);
  }
  if (jl && a.type !== 'new_job') bits.push(jl);
  return bits.filter(Boolean).map(esc).join(' · ');
}

function inboxCardHtml(it) {
  const j = it.job_id ? jobById(it.job_id) : null;
  const acts = it.proposal?.actions || [];
  const head = `<div class="ib-head">
    <span class="ib-ico">${it.kind === 'invoice' ? ICON.doc : ICON.chat}</span>
    <div class="ib-title"><b>${esc(it.kind === 'invoice' ? (it.file_name || 'Invoice') : 'Request')}</b>
      <span class="muted small">${esc(byName(it.created_by))} · ${timeAgo(it.created_at)}${j ? ` · <a href="#/job/${j.id}">${esc(jobName(j))}</a>` : ''}${it.paid_by ? ` · paid by ${esc(nameOf(it.paid_by))}` : ''}</span></div>
    <span class="ib-status s-${it.status}">${INBOX_STATUS[it.status] || it.status}</span>
  </div>`;
  const note = it.text ? `<div class="ib-text">${nl2br(it.text)}</div>` : '';
  const file = it.file_path ? `<button class="link-btn small" data-act="inboxFile" data-id="${it.id}">View file</button>` : '';
  const read = it.extracted_text ? `<details class="ib-read"><summary>What the phone read</summary><pre>${esc(it.extracted_text)}</pre></details>` : '';
  const answer = it.answer ? `<div class="ib-answer muted small">${nl2br(it.answer)}</div>` : '';
  let main = '';
  if (it.status === 'reading') {
    main = `<p class="muted small" id="rd-${it.id}">${esc(S.reading[it.id] || `Being read on ${byName(it.created_by) === 'You' ? 'this' : `${byName(it.created_by)}'s`} phone…`)}</p>`;
  } else if (it.status === 'new') {
    main = `<p class="muted small">Claude checks at 8am and 5pm. Need it sooner? Tell Claude "process invoices".</p>`;
  } else if (it.status === 'proposed') {
    main = `<form data-form="inboxApprove" class="ib-proposal">
      <input type="hidden" name="id" value="${it.id}">
      ${it.proposal?.summary ? `<p class="ib-summary">${ICON.spark} ${nl2br(it.proposal.summary)}</p>` : ''}
      <div class="ib-acts">${acts.map((a, i) => `<label class="ib-act ${a.done ? 'done' : ''}">
        <input type="checkbox" name="act" value="${i}" ${a.done ? 'checked disabled' : 'checked'}>
        <span><b><em>${esc(ACTION_TYPES[a.type] || a.type)}</em> ${esc(a.label || '')}</b><span class="muted small">${actionDetail(a)}</span></span>
      </label>`).join('') || '<p class="muted small">Nothing to add.</p>'}</div>
      ${it.claude_note ? `<p class="muted small">${nl2br(it.claude_note)}</p>` : ''}
      <div class="btn-row">
        <button class="btn primary grow">Approve${acts.length > 1 ? ' ticked' : ''}</button>
        <button type="button" class="btn" data-act="inboxReplySheet" data-id="${it.id}">Change</button>
        <button type="button" class="btn danger" data-act="inboxRejectSheet" data-id="${it.id}">Reject</button>
      </div>
    </form>`;
  } else if (it.status === 'question') {
    main = `<div class="ib-question">${ICON.spark} ${nl2br(it.question || 'Claude needs more detail.')}</div>
    <form data-form="inboxReply" class="ib-reply">
      <input type="hidden" name="id" value="${it.id}">
      <textarea name="text" rows="2" required placeholder="Your answer"></textarea>
      <div class="btn-row"><button class="btn primary grow">Send answer</button><button type="button" class="btn danger" data-act="inboxRejectSheet" data-id="${it.id}">Cancel it</button></div>
    </form>`;
  } else {
    const did = acts.filter(a => a.done);
    main = `${did.length ? `<ul class="ib-done">${did.map(a => `<li>${esc(ACTION_TYPES[a.type] || a.type)}: ${esc(a.label || '')}</li>`).join('')}</ul>` : ''}
      ${it.claude_note ? `<p class="muted small">${nl2br(it.claude_note)}</p>` : ''}
      <p class="muted small">${it.status === 'approved' ? 'Approved' : 'Rejected'}${it.decided_by ? ` by ${esc(byName(it.decided_by))}` : ''}${it.decided_at ? ` · ${timeAgo(it.decided_at)}` : ''}</p>`;
  }
  const del = ['reading', 'new', 'rejected', 'approved'].includes(it.status) ? `<button class="link-btn small danger-text" data-act="inboxDelete" data-id="${it.id}">Delete</button>` : '';
  return `<article class="card ib-card ibs-${it.status}">${head}${note}${answer}${main}<div class="ib-foot">${file}${del}</div>${read}</article>`;
}


// Type-to-find job picker: "re" → 4 Regent Place, etc.
function jobMatches(q, limit = 6) {
  const words = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const rank = j => ({ active: 0, quoted: 1, finished: 2 }[j.status] ?? 3);
  return S.data.jobs.filter(j => j.status !== 'declined').filter(j => {
    const hay = [j.address, j.postcode, j.customer_name, j.title, j.ref != null ? `#${j.ref} ${j.ref}` : ''].join(' ').toLowerCase();
    return words.every(w => hay.includes(w));
  }).sort((a, b) => {
    const sw = j => (jobName(j).toLowerCase().split(/[\s,]+/).some(t => t.startsWith(words[0])) || String(j.customer_name || '').toLowerCase().split(/\s+/).some(t => t.startsWith(words[0])) ? 0 : 1);
    return sw(a) - sw(b) || rank(a) - rank(b) || String(b.start_date || b.created_at).localeCompare(String(a.start_date || a.created_at));
  }).slice(0, limit);
}
function jobSuggestHtml(q, act = 'inboxPickJob', limit = 6) {
  const list = jobMatches(q, limit);
  if (!String(q || '').trim()) return '';
  if (!list.length) return `<div class="job-suggest"><p class="muted small">${act === 'inboxPickJob' ? 'No job matches — leave it blank and Claude will work it out.' : 'No job matches that.'}</p></div>`;
  return `<div class="job-suggest">${list.map(j => `<button type="button" class="job-opt" data-act="${act}" data-id="${j.id}">
    <b>${esc(jobName(j))}</b><span class="muted small">${[j.customer_name, j.title && jobAddr(j) ? j.title : '', STATUS[j.status]].filter(Boolean).map(esc).join(' · ')}</span></button>`).join('')}</div>`;
}
function inboxJobPickHtml() {
  const j = S.inboxJob ? jobById(S.inboxJob) : null;
  if (j) return `<div class="job-chosen">${ICON.jobs}<span><b>${esc(jobName(j))}</b>${j.customer_name ? `<span class="muted small"> · ${esc(j.customer_name)}</span>` : ''}</span><button type="button" data-act="inboxClearJob" aria-label="Change job">×</button></div>`;
  return `<input type="search" id="ib-jobq" placeholder="Start typing an address or name…" autocomplete="off" value="${esc(S.inboxJobQ || '')}" data-input="inboxJobQ">
    <div id="ib-suggest">${jobSuggestHtml(S.inboxJobQ)}</div>`;
}

function inboxView({ id }) {
  if (S.data.inboxMissing) return layout({ title: 'Inbox', back: true, body: '<div class="empty">The inbox needs the database set up.</div>' });
  if (id && jobById(id) && S.inboxJobFrom !== id) { S.inboxJob = id; S.inboxJobFrom = id; }
  const list = inboxItems().slice().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const needs = list.filter(i => i.status === 'proposed' || i.status === 'question');
  const waiting = list.filter(i => i.status === 'new' || i.status === 'reading');
  const done = list.filter(i => i.status === 'approved' || i.status === 'rejected');
  const payer = S.inboxPayer ?? getPayer();
  const files = S.inboxFiles;
  const body = `
  <form data-form="inbox" class="card ib-new">
    <h3>Send to Claude</h3>
    <label class="dropzone" id="ib-drop">
      ${ICON.upload}
      <b>Drop invoices here</b>
      <span class="muted small">or tap to take a photo / choose a PDF</span>
      <input type="file" id="inbox-file" accept="image/*,application/pdf,.pdf" multiple class="file-hidden">
    </label>
    ${files.length ? `<div class="ib-files">${files.map((f, i) => `<div class="ib-file">${f.url ? `<img src="${esc(f.url)}" alt="">` : `<span class="ib-pdf">${ICON.doc}<i>PDF</i></span>`}<span>${esc(f.name)}</span><button type="button" data-act="inboxFileRemove" data-i="${i}" aria-label="Remove">×</button></div>`).join('')}</div>` : ''}
    <label>${files.length ? 'Anything Claude should know?' : 'Or type what needs doing'} <span class="muted small">(optional${files.length ? '' : ' if you add a file'})</span>
      <textarea name="text" rows="3" data-input="inboxText" placeholder="${files.length ? 'e.g. tiles for Pevensey, the trap is for Joshua' : 'e.g. Joshua paid £175 today by bank to Henry'}">${esc(S.inboxText || '')}</textarea></label>
    <div class="field-label">Which job? <span class="muted small">(optional — Claude will work it out)</span></div>
    <div class="job-pick" id="ib-jobpick">${inboxJobPickHtml()}</div>
    <div class="field-label">Who paid?</div>
    <div class="seg3">${[['a', nameOf('a')], ['b', nameOf('b')], ['', 'Not sure / n/a']].map(([k, l]) =>
      `<label class="${payer === k ? 'on' : ''}"><input type="radio" name="paid_by" value="${k}" ${payer === k ? 'checked' : ''} data-input="inboxPayer">${l}</label>`).join('')}</div>
    <button class="btn primary wide big" id="ib-send">${ICON.send} Send to Claude</button>
    <p class="muted small center">Claude checks at 8am and 5pm and puts what it would add here for you to approve. Nothing changes until you press Approve.</p>
  </form>
  ${needs.length ? `<h2 class="section-title">Needs you <span class="count">${needs.length}</span></h2>${needs.map(inboxCardHtml).join('')}` : ''}
  ${waiting.length ? `<h2 class="section-title">Waiting for Claude</h2>${waiting.map(inboxCardHtml).join('')}` : ''}
  ${done.length ? `<details class="ib-history"><summary class="section-title">Done (${done.length})</summary>${done.slice(0, 30).map(inboxCardHtml).join('')}</details>` : ''}
  ${!list.length ? '<p class="muted small center">Nothing sent yet.</p>' : ''}`;
  return layout({ title: 'Claude inbox', back: true, body });
}

function inboxBannerHtml() {
  const n = inboxNeeds();
  if (!n.length) return '';
  const q = n.filter(i => i.status === 'question').length;
  return `<a class="msg-banner ib-banner" href="#/inbox">
    <div class="msg-banner-main"><b>${ICON.spark} Claude ${q === n.length ? `has ${q === 1 ? 'a question' : `${q} questions`}` : `has ${n.length} thing${n.length === 1 ? '' : 's'} ready to approve`}</b>
    <span class="muted small">Invoices &amp; requests — tap to check</span></div>
    <span class="btn small primary">Open</span>
  </a>`;
}

// Turning an approved proposal into real records
const ALLOW = {
  jobs: ['title', 'status', 'customer_name', 'customer_phone', 'customer_email', 'address', 'postcode', 'description', 'notes', 'price', 'vat_applies', 'vat_rate', 'who', 'quote_date', 'start_date', 'end_date', 'finished_date', 'source', 'guarantee_until', 'guarantee_note', 'service_due'],
  costs: ['description', 'category', 'qty', 'unit_cost', 'supplier', 'paid_by', 'cost_date'],
  payments: ['pay_date', 'amount', 'kind', 'method', 'received_by', 'note'],
  overheads: ['name', 'category', 'amount', 'frequency', 'paid_by', 'start_date', 'end_date', 'notes'],
};
const pickKeys = (o, keys) => Object.fromEntries(keys.filter(k => o && o[k] !== undefined).map(k => [k, o[k]]));
async function applyAction(a, keyMap) {
  const jid = a.job_id ? (keyMap[a.job_id] || a.job_id) : null;
  const needJob = () => { if (!jid || !jobById(jid)) throw new Error(`Couldn't find the job for "${a.label || ACTION_TYPES[a.type]}"`); return jid; };
  const now = new Date().toISOString();
  switch (a.type) {
    case 'new_job': {
      const row = { status: 'quoted', ...pickKeys(a.job || {}, ALLOW.jobs) };
      if (!row.title) row.title = row.description ? String(row.description).slice(0, 60) : 'Job';
      const r = await saveRow('jobs', null, row);
      if (a.key) keyMap[a.key] = r.id;
      return r.id;
    }
    case 'update_job': return (await saveRow('jobs', needJob(), pickKeys(a.patch || {}, ALLOW.jobs))).id;
    case 'add_cost': return (await saveRow('costs', null, { category: 'materials', qty: 1, cost_date: today(), paid_by: S.me, ...pickKeys(a, ALLOW.costs), description: a.description || a.label || 'Materials', job_id: needJob() })).id;
    case 'add_payment': return (await saveRow('payments', null, { kind: 'stage', method: 'bank', pay_date: today(), received_by: S.me, ...pickKeys(a, ALLOW.payments), job_id: needJob() })).id;
    case 'add_overhead': return (await saveRow('overheads', null, { frequency: 'oneoff', start_date: today(), paid_by: S.me, category: 'other', ...pickKeys(a, ALLOW.overheads), name: a.name || a.label || 'Purchase' })).id;
    case 'add_task': return (await saveRow('tasks', null, {
      text: a.text || a.label, due_date: a.due_date || null, done: false, created_by: myEmail(),
      steps: a.steps?.length ? a.steps.map(t => ({ id: crypto.randomUUID(), text: String(t), done: false, done_at: null })) : null,
    })).id;
    case 'add_trip': {
      if (!(num(a.miles) > 0)) throw new Error(`No miles for "${a.label || 'trip'}"`);
      const tj = a.job_id ? (keyMap[a.job_id] || a.job_id) : null;
      return (await saveRow('mileage', null, { trip_date: a.trip_date || today(), who: a.who === 'b' ? 'b' : 'a', miles: r2(num(a.miles)), job_id: tj && jobById(tj) ? tj : null, purpose: a.purpose || null })).id;
    }
    case 'add_note': return (await saveRow('notes', null, { text: a.text || a.label || '', pinned: false, created_by: myEmail(), updated_by: myEmail(), updated_at: now })).id;
    default: throw new Error(`Unknown change type: ${a.type}`);
  }
}

// ======================================================================
// Quotes tab: quotes & invoices for Cunningham & Baker and Henry The Plumber
// (based on Henry's invoice maker)
// ======================================================================
const Q_PROFILES = {
  cb: {
    label: 'Cunningham & Baker', short: 'C&B',
    starter: [''],
    defaults: {
      businessName: 'Cunningham & Baker', tagline: '', phone: '07534 632490', email: 'info@cunninghamandbaker.co.uk', address: '',
      accountName: 'Henry Cunningham', sortCode: '20-26-78', accountNumber: '13014363',
      altAccountName: 'Luke Baker', altSortCode: '07-04-36', altAccountNumber: '37417016',
      quoteStart: 1047,
    },
  },
  htp: {
    label: 'Henry The Plumber', short: 'Henry',
    starter: [''],
    defaults: {
      businessName: 'Henry The Plumber', tagline: '', phone: '', email: '', address: '',
      accountName: 'Henry Cunningham', sortCode: '20-26-78', accountNumber: '13014363',
      quoteStart: 1047,
    },
  },
};
const Q_INVOICE_START = 1089; // shared running invoice number for both businesses
const qSettings = () => {
  const saved = set().doc_profiles || {};
  return {
    invoiceStart: num(saved.invoiceStart) || Q_INVOICE_START,
    cb: { ...Q_PROFILES.cb.defaults, ...(saved.cb || {}) },
    htp: { ...Q_PROFILES.htp.defaults, ...(saved.htp || {}) },
  };
};
const qDocs = () => S.data?.docs || [];
function qNextNumber(type, profile) {
  const st = qSettings();
  if (type === 'invoice') {
    const max = Math.max(0, ...qDocs().filter(d => d.doc_type === 'invoice').map(d => d.number));
    return Math.max(st.invoiceStart, max + 1);
  }
  const max = Math.max(0, ...qDocs().filter(d => d.doc_type === 'quote' && d.profile === profile).map(d => d.number));
  return Math.max(num(st[profile].quoteStart) || 1, max + 1);
}
const qMoney = n => {
  n = Math.round((num(n) + Number.EPSILON) * 100) / 100;
  return '£' + n.toLocaleString('en-GB', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
};
const qLoadFonts = () => {
  if (document.getElementById('inv-fonts')) return;
  const l = document.createElement('link');
  l.id = 'inv-fonts'; l.rel = 'stylesheet'; l.href = `css/inv-fonts.css?v=${VERSION_TAG}`;
  document.head.appendChild(l);
};

// The draft being worked on (kept on this phone so nothing is lost)
const Q_DRAFT_KEY = 'cb-quote-draft';
function qBlank(profile = localStorage.getItem('cb-quote-profile') || 'cb', type = 'quote') {
  return {
    id: null, profile, doc_type: type, number: null, job_id: null, from_quote: null,
    customer: { name: '', addr1: '', town: '', postcode: '' },
    doc_date: today(),
    categories: [{ heading: '', lines: [] }],
    total: '', pay_to: 'primary', paid_to_date: 0, paid_note: '', materials_included: true, paid_in_full: false,
  };
}
function qDraft() {
  if (!S.qd) {
    try { S.qd = JSON.parse(localStorage.getItem(Q_DRAFT_KEY)); } catch { S.qd = null; }
    if (!S.qd?.categories) S.qd = qBlank();
    // drafts from before "All materials included" became its own tick box
    if (S.qd.materials_included === undefined) {
      const old = S.qd.categories.findIndex(c => !(c.lines || []).some(l => String(l).trim()) && /^all materials included\.?$/i.test(String(c.heading).trim()));
      S.qd.materials_included = old >= 0 || !S.qd.id;
      if (old >= 0) S.qd.categories.splice(old, 1);
      if (!S.qd.categories.length) S.qd.categories = [{ heading: '', lines: [] }];
    }
  }
  return S.qd;
}
let qSaveTimer = null;
function qKeep() {
  clearTimeout(qSaveTimer);
  qSaveTimer = setTimeout(() => { try { localStorage.setItem(Q_DRAFT_KEY, JSON.stringify(S.qd)); } catch { /* full */ } }, 250);
}

// Fill a draft from one of our jobs
function qFromJob(j, type) {
  let lines = String(j.address || '').split('\n').map(x => x.trim()).filter(Boolean);
  if (lines.length === 1 && lines[0].includes(',')) { const i = lines[0].lastIndexOf(','); lines = [lines[0].slice(0, i).trim(), lines[0].slice(i + 1).trim()]; }
  const work = String(j.description || '').split('\n').map(x => x.replace(/^[-•*\s]+/, '').replace(/\.\s*$/, '').trim()).filter(Boolean);
  const c = calc(j);
  const d = qBlank(S.qd?.profile || localStorage.getItem('cb-quote-profile') || 'cb', type);
  d.job_id = j.id;
  d.customer = { name: j.customer_name || '', addr1: lines[0] || '', town: lines.slice(1).join(', '), postcode: j.postcode || '' };
  d.doc_date = type === 'quote' ? (j.quote_date || today()) : (j.finished_date || today());
  d.categories = [
    { heading: j.title || 'Works', lines: work },
  ];
  d.total = c.gross ? String(r2(c.gross)) : '';
  if (type === 'invoice' && c.paid > 0) {
    d.paid_to_date = r2(c.paid);
    d.paid_in_full = c.gross > 0 && c.paid >= c.gross - 0.004;
    d.paid_note = c.pays.slice().sort((a, b) => String(a.pay_date).localeCompare(String(b.pay_date))).map(p => fmtShort(p.pay_date)).join(', ');
  }
  return d;
}

// The printed page, in Henry's two designs
function qPaperHtml(rec) {
  const st = qSettings();
  const isQuote = rec.doc_type === 'quote';
  const b = rec.business || qBusiness(rec.profile, rec.pay_to, st);
  const cb = rec.profile === 'cb';
  const letter = esc(((b.businessName || 'H').trim().charAt(0) || 'H').toUpperCase());
  const brand = cb && /^\s*cunningham\s*(&|and)\s*baker\s*$/i.test(b.businessName || '')
    ? 'Cunningham <span class="cf-fix">&amp;</span> Baker' : esc(b.businessName || '');
  const cu = rec.customer || {};
  const paid = num(rec.paid_to_date);
  const pif = !isQuote && rec.paid_in_full;
  const vat = num(b.vatRate);
  const cats = (rec.categories || []).map(cat => {
    const lines = (cat.lines || []).filter(l => l && String(l).trim());
    if (!cat.heading && !lines.length) return '';
    return `<div class="inv-category${lines.length ? '' : ' solo'}">${cat.heading ? `<h4>${esc(cat.heading)}</h4>` : ''}${lines.map(l => `<p>${esc(l)}</p>`).join('')}</div>`;
  }).join('');
  return `<div class="inv-paper ${cb ? 'cf' : ''}">
    <div class="inv-trim"></div>
    <div class="inv-band">${cb ? `<img class="cf-logo" src="img/cb-banner.jpg" alt="Cunningham &amp; Baker">` : `<div class="logo-badge">${letter}</div>`}</div>
    <div class="inv-body">
      <div class="inv-top-row">
        <div><div class="inv-brand">${brand}${isQuote ? '<span class="inv-doctype">Quote</span>' : ''}${pif ? '<span class="inv-doctype paid">Paid</span>' : ''}</div>
          ${b.tagline ? `<div class="inv-tagline">${esc(b.tagline)}</div>` : ''}</div>
        <div class="inv-billed"><div class="label">${isQuote ? 'Quoted to' : 'Billed to'}</div>
          <div class="name">${esc(cu.name || '—')}</div>
          ${cu.addr1 ? `<div>${esc(cu.addr1)}</div>` : ''}${cu.town ? `<div>${esc(cu.town)}</div>` : ''}${cu.postcode ? `<div>${esc(cu.postcode)}</div>` : ''}
          <div class="ref">*${esc(rec.number ?? '')}${rec.doc_date ? `<span class="inv-date"> · ${esc(fmtDate(rec.doc_date))}</span>` : ''}</div></div>
      </div>
      <hr class="inv-header-rule">
      <div class="inv-services-title">${isQuote ? 'Proposed Works' : 'Services Provided'}</div>
      <hr class="inv-rule">
      ${cats}
      ${rec.materials_included ? '<div class="inv-materials">All materials included</div>' : ''}
      ${!isQuote && !pif && (b.sortCode || b.accountNumber) ? `<div class="inv-bank"><strong>Bank Details</strong>
        ${b.accountName ? `<div><span class="bk">Account name:</span> ${esc(b.accountName)}</div>` : ''}
        ${b.sortCode ? `<div><span class="bk">Sort code:</span> ${esc(b.sortCode)}</div>` : ''}
        ${b.accountNumber ? `<div><span class="bk">Account number:</span> ${esc(b.accountNumber)}</div>` : ''}
        <div><span class="bk">Reference:</span> ${esc(rec.number ?? '')}</div></div>` : ''}
      <hr class="inv-rule">
      ${pif
        ? `<div class="inv-sub-row"><span>Total for all materials and labour:</span><span class="num">${qMoney(rec.total)}</span></div>
           <div class="inv-sub-row paid-row"><span>Paid in full${rec.paid_note ? ` (${esc(rec.paid_note)})` : ''} — thank you</span><span class="num">✓</span></div>
           <div class="inv-total-row"><span>Balance due:</span><span class="num">£0</span></div>`
        : paid > 0 && !isQuote
        ? `<div class="inv-sub-row"><span>Total for all materials and labour:</span><span class="num">${qMoney(rec.total)}</span></div>
           <div class="inv-sub-row"><span>Less amount already paid${rec.paid_note ? ` (${esc(rec.paid_note)})` : ''}:</span><span class="num">−${qMoney(paid)}</span></div>
           <div class="inv-total-row"><span>${num(rec.total) - paid > 0.004 ? 'Balance due:' : 'Paid in full — balance:'}</span><span class="num">${qMoney(Math.max(0, num(rec.total) - paid))}</span></div>`
        : `${vat ? `<div class="inv-sub-row"><span>Total before VAT:</span><span class="num">${qMoney(num(rec.total) / (1 + vat / 100))}</span></div>
           <div class="inv-sub-row"><span>VAT @ ${vat}%:</span><span class="num">${qMoney(num(rec.total) - num(rec.total) / (1 + vat / 100))}</span></div>` : ''}
           <div class="inv-total-row"><span>${isQuote ? `Total Estimated Cost${vat ? ' inc. VAT' : ''}:` : `Total Cost for all materials and labour${vat ? ' inc. VAT' : ''}:`}</span><span class="num">${qMoney(rec.total)}</span></div>`}
      <hr class="inv-rule">
    </div>
    <div class="inv-footer">
      <div>${b.phone ? `<div>${esc(b.phone)}</div>` : ''}${b.email ? `<div>${esc(b.email)}</div>` : ''}</div>
      <div class="right"><strong>${esc(b.businessName || '')}</strong>${b.vatNumber ? `<div>VAT no. ${esc(b.vatNumber)}</div>` : ''}${String(b.address || '').split('\n').filter(Boolean).map(l => `<div>${esc(l)}</div>`).join('')}</div>
    </div>
    ${cb ? '<div class="inv-band cf-tagline">Air Conditioning<i>&bull;</i>Bathrooms<i>&bull;</i>Plumbing &amp; Heating</div>' : '<div class="inv-band"></div>'}
    <div class="inv-trim"></div>
  </div>`;
}
// Business & bank details printed on a document
function qBusiness(profile, payTo, st = qSettings()) {
  const p = st[profile] || st.cb;
  const b = { businessName: p.businessName, tagline: p.tagline, phone: p.phone, email: p.email, address: p.address, accountName: p.accountName, sortCode: p.sortCode, accountNumber: p.accountNumber };
  if (profile === 'cb' && payTo === 'second') Object.assign(b, { accountName: p.altAccountName || '', sortCode: p.altSortCode || '', accountNumber: p.altAccountNumber || '' });
  const g = set();
  if (g.vat_registered && num(g.vat_rate) > 0) Object.assign(b, { vatRate: num(g.vat_rate), vatNumber: g.vat_number || '' });
  return b;
}

function qBizSwitch(active, act = 'qProfile') {
  return `<div class="q-biz" role="tablist">${Object.entries(Q_PROFILES).map(([k, p]) =>
    `<button type="button" class="${active === k ? 'on' : ''}" data-act="${act}" data-p="${k}">${k === 'cb' ? '<img src="img/house-gold.png" alt="">' : '<span class="q-h">H</span>'}<span>${p.label}</span></button>`).join('')}</div>`;
}
// Quotes & invoices already made for a job (shown on the job page)
function jobDocsHtml(j) {
  const list = qDocs().filter(d => d.job_id === j.id).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  if (!list.length) return '';
  return `<section class="card"><h3>Quotes &amp; invoices</h3>${list.map(d => `<a class="kv link" href="#/quotes/view/${d.id}"><span>${d.doc_type === 'quote' ? 'Quote' : 'Invoice'} *${d.number} <em class="muted">${fmtShort(d.doc_date)}</em></span><b>${qMoney(d.total)}</b></a>`).join('')}</section>`;
}
function qSubNav(on) {
  const n = qDocs().length;
  return `<div class="q-subnav">
    <a href="#/quotes" class="${on === 'new' ? 'on' : ''}">${ICON.plus} New</a>
    <a href="#/quotes/saved" class="${on === 'saved' ? 'on' : ''}">${ICON.doc} Saved${n ? ` (${n})` : ''}</a>
    <a href="#/quotes/settings" class="${on === 'settings' ? 'on' : ''}">${ICON.cog} Details</a>
  </div>`;
}

function quotesView({ id, extra }) {
  qLoadFonts();
  if (S.data.docsMissing) return layout({ title: 'Quotes', body: '<div class="empty">Quotes need the database set up.</div>' });
  if (id === 'saved') return qSavedView();
  if (id === 'settings') return qSettingsView();
  if (id === 'view') return qDocView(extra);
  if (id === 'job-quote' || id === 'job-invoice') {
    // #/quotes/job-quote/<jobId>: open this job's quote/invoice, or start one filled in from the job
    const type = id === 'job-quote' ? 'quote' : 'invoice';
    const j = jobById(extra);
    if (j) {
      const existing = qDocs().filter(d => d.job_id === j.id && d.doc_type === type).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
      if (existing) { setTimeout(() => go(`#/quotes/view/${existing.id}`), 0); return layout({ title: 'Quotes', body: '' }); }
      S.qd = qFromJob(j, type); qKeep();
    }
    setTimeout(() => history.replaceState(null, '', '#/quotes'), 0);
  }
  return qEditView();
}

function qEditView() {
  const d = qDraft();
  const st = qSettings();
  const isQuote = d.doc_type === 'quote';
  const j = d.job_id ? jobById(d.job_id) : null;
  const editing = d.id ? qDocs().find(x => x.id === d.id) : null;
  const nextNo = editing ? editing.number : qNextNumber(d.doc_type, d.profile);
  const p = st[d.profile];
  const showPay = d.profile === 'cb' && !isQuote && (p.altSortCode || p.altAccountNumber);
  const body = `
  ${qSubNav('new')}
  ${qBizSwitch(d.profile)}
  <div class="q-type">
    <button type="button" class="${isQuote ? 'on' : ''}" data-act="qType" data-t="quote">Quote</button>
    <button type="button" class="${!isQuote ? 'on' : ''}" data-act="qType" data-t="invoice">Invoice</button>
  </div>
  ${editing ? `<div class="note">Editing ${isQuote ? 'quote' : 'invoice'} *${editing.number}. <button class="link-btn" data-act="qNew">Start a new one instead</button></div>` : ''}

  <section class="card">
    <h3>Fill from a job</h3>
    <div class="job-pick" id="q-jobpick">${j
      ? `<div class="job-chosen">${ICON.jobs}<span><b>${esc(jobName(j))}</b>${j.customer_name ? `<span class="muted small"> · ${esc(j.customer_name)}</span>` : ''}</span><button type="button" data-act="qClearJob" aria-label="Unlink job">×</button></div>`
      : `<input type="search" id="q-jobq" placeholder="Type an address or name to fill everything in…" autocomplete="off" data-input="qJobQ" value="${esc(S.qJobQ || '')}"><div id="q-suggest">${jobSuggestHtml(S.qJobQ, 'qPickJob')}</div>`}
    </div>
    ${j ? '<p class="muted small">Customer, address, works and price came from the job — change anything below.</p>' : ''}
  </section>

  <section class="card q-form">
    <h3>Customer</h3>
    <label>Name<input data-qf="customer.name" value="${esc(d.customer.name)}" autocomplete="off"></label>
    <label>Address<input data-qf="customer.addr1" value="${esc(d.customer.addr1)}" placeholder="Street" autocomplete="off"></label>
    <div class="two"><label>Town<input data-qf="customer.town" value="${esc(d.customer.town)}" autocomplete="off"></label>
      <label>Postcode<input data-qf="customer.postcode" value="${esc(d.customer.postcode)}" autocomplete="off"></label></div>
    <div class="two"><label>Date<input type="date" data-qf="doc_date" value="${esc(d.doc_date || '')}"></label>
      <label>${isQuote ? 'Quote' : 'Invoice'} number<input type="number" inputmode="numeric" data-qf="number" value="${esc(d.number ?? '')}" placeholder="${nextNo}"></label></div>
    ${showPay ? `<div class="field-label">Bank details on the invoice</div>
      <div class="seg3">${[['primary', p.accountName || 'Main account'], ['second', p.altAccountName || 'Second account']].map(([k, l]) =>
        `<label class="${(d.pay_to || 'primary') === k ? 'on' : ''}"><input type="radio" name="q-payto" value="${k}" data-qf="pay_to" ${(d.pay_to || 'primary') === k ? 'checked' : ''}>${esc(l)}</label>`).join('')}</div>` : ''}
  </section>

  <section class="card q-form">
    <h3>${isQuote ? 'Proposed works' : 'Services provided'}</h3>
    <p class="muted small">One box per item. Add detail underneath only for bigger jobs.</p>
    <div id="q-cats">${qCatsHtml(d)}</div>
    <button type="button" class="btn small" data-act="qAddCat">${ICON.plus} Add item</button>
    <label class="q-mat"><input type="checkbox" data-qf="materials_included" ${d.materials_included ? 'checked' : ''}> <span><b>All materials included</b><span class="muted small">Printed on its own after the list</span></span></label>
  </section>

  <section class="card q-form">
    <h3>Total</h3>
    <label>${isQuote ? 'Estimated total cost (£)' : 'Final total for all materials and labour (£)'}<input type="number" inputmode="decimal" step="0.01" data-qf="total" value="${esc(d.total)}"></label>
    ${!isQuote ? `<label class="q-mat"><input type="checkbox" data-qf="paid_in_full" ${d.paid_in_full ? 'checked' : ''}> <span><b>Paid in full</b><span class="muted small">They've already paid — shows "Paid", balance £0, no bank details</span></span></label>
      <div class="two q-paid">${d.paid_in_full ? '' : `<label>Already paid (£)<input type="number" inputmode="decimal" step="0.01" data-qf="paid_to_date" value="${num(d.paid_to_date) || ''}" placeholder="0"></label>`}
      <label>Paid when <span class="muted small">(optional)</span><input data-qf="paid_note" value="${esc(d.paid_note || '')}" placeholder="e.g. 2 November, by bank"></label></div>` : ''}
  </section>

  <button class="btn primary wide big" data-act="qGenerate">${editing ? 'Save changes' : `Make ${isQuote ? 'quote' : 'invoice'}`} →</button>
  <p class="muted small center">Saves it to Saved, then you can send it as a PDF.</p>`;
  return layout({ title: 'Quotes & invoices', body });
}

function qCatsHtml(d) {
  return d.categories.map((c, ci) => `<div class="q-cat">
    <div class="q-cat-head"><textarea rows="1" class="q-heading" data-qcat="${ci}" placeholder="e.g. Replace bath trap">${esc(c.heading)}</textarea>
      ${d.categories.length > 1 || c.lines.length ? `<button type="button" class="q-x" data-act="qDelCat" data-i="${ci}" aria-label="Remove item">×</button>` : ''}</div>
    ${c.lines.map((l, li) => `<div class="q-line"><textarea rows="1" data-qline="${ci}:${li}" placeholder="Extra detail">${esc(l)}</textarea>
      <button type="button" class="q-x" data-act="qDelLine" data-i="${ci}:${li}" aria-label="Remove detail">×</button></div>`).join('')}
    <button type="button" class="link-btn small q-adddetail" data-act="qAddLine" data-i="${ci}">+ Add detail${c.lines.length ? '' : ' (for bigger jobs)'}</button>
  </div>`).join('') || '<p class="muted small">Nothing added yet.</p>';
}
function qRefreshCats() {
  const el = document.getElementById('q-cats');
  if (el) { el.innerHTML = qCatsHtml(qDraft()); el.querySelectorAll('textarea').forEach(growChat); }
}

function qDocView(id) {
  const rec = qDocs().find(x => x.id === id);
  if (!rec) return layout({ title: 'Quotes', back: true, body: '<div class="empty">Not found — it may have been deleted.</div>' });
  const isQuote = rec.doc_type === 'quote';
  const j = rec.job_id ? jobById(rec.job_id) : null;
  const inv = isQuote ? qDocs().find(x => x.from_quote === rec.id) : null;
  const body = `
  <div class="doc-bar q-bar">
    <a class="btn small" href="#/quotes/saved">${ICON.back} Saved</a>
    <button class="btn small" data-act="qEdit" data-id="${rec.id}">Edit</button>
    <div class="grow"></div>
    <button class="btn small" data-act="print">Print</button>
    <button class="btn small primary" data-act="qSend" data-id="${rec.id}">Send PDF</button>
  </div>
  <div class="q-meta muted small">${esc(Q_PROFILES[rec.profile]?.label || '')} ${isQuote ? 'quote' : 'invoice'} *${rec.number}${j ? ` · <a href="#/job/${j.id}">${esc(jobName(j))}</a>` : ''}</div>
  ${qPaperHtml(rec)}
  <div class="q-after">
    ${isQuote ? (inv ? `<a class="btn wide" href="#/quotes/view/${inv.id}">Open invoice *${inv.number}</a>` : `<button class="btn primary wide" data-act="qConvert" data-id="${rec.id}">Job done — turn into an invoice →</button>`) : ''}
    <button class="btn wide" data-act="qCopy" data-id="${rec.id}">Copy into a new one</button>
    <button class="link-btn small danger-text" data-act="qDelete" data-id="${rec.id}">Delete</button>
  </div>`;
  return layout({ title: `${isQuote ? 'Quote' : 'Invoice'} *${rec.number}`, back: true, body, nav: false });
}

function qSavedList() {
  const q = String(S.qSavedQ || '').toLowerCase().trim();
  const f = S.qSavedF || 'all';
  return qDocs().filter(d => (f === 'all' || d.profile === f || d.doc_type === f))
    .filter(d => !q || [d.customer?.name, d.customer?.addr1, d.customer?.town, d.customer?.postcode, String(d.number)].join(' ').toLowerCase().includes(q))
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
}
function qSavedView() {
  const f = S.qSavedF || 'all';
  const list = qSavedList();
  const chip = (k, l) => `<button type="button" class="chip ${f === k ? 'on' : ''}" data-act="qSavedFilter" data-f="${k}">${l}</button>`;
  const body = `
  ${qSubNav('saved')}
  <input type="search" class="q-search" placeholder="Search name, address or number" value="${esc(S.qSavedQ || '')}" data-input="qSavedQ">
  <div class="chips">${chip('all', 'All')}${chip('quote', 'Quotes')}${chip('invoice', 'Invoices')}${chip('cb', 'C&B')}${chip('htp', 'Henry The Plumber')}</div>
  <section class="card q-saved" id="q-saved-list">${qSavedRows(list)}</section>`;
  return layout({ title: 'Saved quotes & invoices', body });
}
function qSavedRows(list) {
  return list.map(d => `<a class="q-row" href="#/quotes/view/${d.id}">
      <div><b>${esc(d.customer?.name || 'No name')}</b><span class="q-tag ${d.doc_type}">${d.doc_type === 'quote' ? 'Quote' : 'Invoice'}</span>
        <div class="muted small">*${d.number} · ${esc(Q_PROFILES[d.profile]?.short || '')} · ${fmtDate(d.doc_date)}${d.customer?.addr1 ? ` · ${esc(d.customer.addr1)}` : ''}</div></div>
      <b class="num">${qMoney(d.total)}</b></a>`).join('') || '<p class="muted small">Nothing saved yet.</p>';
}

function qSettingsView() {
  const st = qSettings();
  const pk = S.qSetP || 'cb';
  const p = st[pk];
  const f = (k, l, ph = '', type = 'text') => `<label>${l}<input type="${type}" name="${k}" value="${esc(p[k] ?? '')}" placeholder="${esc(ph)}"></label>`;
  const body = `
  ${qSubNav('settings')}
  ${qBizSwitch(pk, 'qSetProfile')}
  <form data-form="qSettings" class="form">
    <input type="hidden" name="_profile" value="${pk}">
    <section class="card">
      <h3>Business details</h3>
      <p class="muted small">Used on ${esc(Q_PROFILES[pk].label)} quotes and invoices.</p>
      ${f('businessName', 'Business name')}
      ${f('tagline', 'Tagline (optional, shown under the name)')}
      ${f('phone', 'Phone')}${f('email', 'Email')}
      <label>Business address (footer)<textarea name="address" rows="3">${esc(p.address || '')}</textarea></label>
    </section>
    <section class="card">
      <h3>Bank details</h3>
      <p class="muted small">Only printed on invoices.</p>
      ${f('accountName', 'Account name')}${f('sortCode', 'Sort code', '00-00-00')}${f('accountNumber', 'Account number')}
    </section>
    ${pk === 'cb' ? `<section class="card"><h3>Second bank account</h3><p class="muted small">Choose which account goes on each invoice when you make it.</p>
      ${f('altAccountName', 'Account name')}${f('altSortCode', 'Sort code', '00-00-00')}${f('altAccountNumber', 'Account number')}</section>` : ''}
    <section class="card">
      <h3>Numbering</h3>
      <label>Next ${esc(Q_PROFILES[pk].label)} quote number<input type="number" name="quoteStart" value="${qNextNumber('quote', pk)}"></label>
      <label>Next invoice number <span class="muted small">(one running number for both businesses)</span><input type="number" name="_invoiceStart" value="${qNextNumber('invoice', pk)}"></label>
      <p class="muted small">Numbers carry on from the highest one saved; set them higher here to jump ahead.</p>
    </section>
    <button class="btn primary wide big">Save details</button>
  </form>`;
  return layout({ title: 'Quote details', body });
}



// ======================================================================
// Tell Claude: speak (or type) what happened; it goes to the Claude inbox
// ======================================================================
const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
let talkRec = null;
function talkStop() { try { talkRec?.stop(); } catch { /* ignore */ } talkRec = null; document.getElementById('talk-btn')?.classList.remove('on'); }
function talkSheet() {
  openSheet(`<form data-form="talk" class="form talk">
    ${sheetHead('Tell Claude')}
    <p class="muted">Say it like you'd text Luke — Claude sorts it into the right place and asks you to approve it.</p>
    <ul class="talk-eg muted small"><li>"Joshua paid two hundred quid by bank today"</li><li>"Fifteen pound at Screwfix for Pevensey, I paid"</li><li>"New enquiry, Mrs Smith, 4 High Street Bexhill, leaking tap"</li></ul>
    ${SpeechRec ? `<button type="button" class="talk-btn" id="talk-btn" data-act="talkMic">${ICON.mic}<span>Tap and speak</span></button>` : ''}
    <textarea name="text" rows="4" required placeholder="${SpeechRec ? 'What you say appears here — you can fix it before sending' : 'Tap the microphone on your keyboard and speak, or type'}"></textarea>
    <button class="btn primary wide big">${ICON.send} Send to Claude</button>
    <p class="muted small center">Claude checks at 8am and 5pm. Nothing changes until you press Approve.</p>
  </form>`);
  if (!SpeechRec) setTimeout(() => sheet.querySelector('textarea')?.focus(), 80);
}
function talkMic() {
  if (talkRec) { talkStop(); return; }
  const ta = sheet.querySelector('form[data-form=talk] textarea');
  const btn = document.getElementById('talk-btn');
  try {
    talkRec = new SpeechRec();
    talkRec.lang = 'en-GB'; talkRec.interimResults = true; talkRec.continuous = true;
    const before = ta.value ? `${ta.value.trim()} ` : '';
    talkRec.onresult = e => { ta.value = before + [...e.results].map(r => r[0].transcript).join(' ').replace(/\s+/g, ' ').trim(); };
    talkRec.onerror = e => { talkStop(); if (e.error !== 'aborted' && e.error !== 'no-speech') { toast('Microphone not available here — tap the mic on your keyboard instead', true); ta.focus(); } };
    talkRec.onend = () => { talkRec = null; btn?.classList.remove('on'); if (btn) btn.querySelector('span').textContent = 'Tap and speak'; };
    talkRec.start();
    btn.classList.add('on'); btn.querySelector('span').textContent = 'Listening… tap to stop';
  } catch (err) { console.error(err); talkStop(); toast('Microphone not available — tap the mic on your keyboard instead', true); ta.focus(); }
}

// ======================================================================
// Mileage log (HMRC: 45p a mile for the first 10,000 business miles each tax year, then 25p)
// ======================================================================
function mileAllowance(miles) { return Math.min(miles, 10000) * 0.45 + Math.max(0, miles - 10000) * 0.25; }
function mileageCardHtml(ty) {
  if (S.data.mileageMissing) return '';
  const inTy = iso => iso && taxYearOf(String(iso).slice(0, 10)) === ty;
  const trips = (S.data.mileage || []).filter(m => inTy(m.trip_date));
  const per = w => sum(trips.filter(m => m.who === w).map(m => num(m.miles)));
  const recent = (S.data.mileage || []).slice().sort((a, b) => String(b.trip_date).localeCompare(String(a.trip_date))).slice(0, 6);
  return `<section class="card mileage">
    <div class="row"><h3>Mileage</h3><button class="btn small primary" data-act="tripSheet">${ICON.plus} Log a trip</button></div>
    <div class="money-grid">${['a', 'b'].map(w => `<div><span>${esc(nameOf(w))}</span><b>${per(w).toLocaleString('en-GB')} mi</b><em>${money(mileAllowance(per(w)))} to claim</em></div>`).join('')}</div>
    ${recent.length ? recent.map(m => { const j = m.job_id ? jobById(m.job_id) : null; return `<button class="item kv" data-act="tripSheet" data-id="${m.id}"><span>${fmtShort(m.trip_date)} · ${esc(nameOf(m.who))} <em class="muted">${esc(j ? jobName(j) : m.purpose || '')}</em></span><b>${num(m.miles)} mi</b></button>`; }).join('') : '<p class="muted small">Log business trips (to jobs, merchants, quotes). It adds up fast — HMRC allows 45p a mile for the first 10,000 miles a year each.</p>'}
    <p class="muted small">Only claim this way if you use HMRC's simplified mileage for the van — check with your accountant.</p>
  </section>`;
}
function tripSheet(id, jobId) {
  const m = id ? (S.data.mileage || []).find(x => x.id === id) : null;
  const jid = m?.job_id || jobId || '';
  const j = jid ? jobById(jid) : null;
  const who = m?.who || (S.meKnown ? S.me : 'a');
  openSheet(`<form data-form="trip" class="form">
    ${sheetHead(m ? 'Trip' : 'Log a trip', m ? m.id : null, m ? 'mileage' : null)}
    <input type="hidden" name="id" value="${m?.id || ''}">
    <input type="hidden" name="job_id" value="${esc(jid)}">
    <div class="seg3">${['a', 'b'].map(w => `<label class="${who === w ? 'on' : ''}"><input type="radio" name="who" value="${w}" ${who === w ? 'checked' : ''} data-input="segpick">${esc(nameOf(w))}</label>`).join('')}</div>
    <div class="two"><label>Date<input type="date" name="trip_date" value="${esc(m?.trip_date || today())}"></label>
      <label>Miles<input type="number" name="miles" inputmode="decimal" step="0.1" min="0.1" required value="${m ? num(m.miles) : ''}" placeholder="e.g. 12"></label></div>
    ${m ? '' : '<label class="check"><input type="checkbox" name="return" checked> There and back (doubles the miles)</label>'}
    <div class="field-label">Which job? <span class="muted small">(optional)</span></div>
    <div class="job-pick" id="trip-jobpick">${j ? `<div class="job-chosen">${ICON.jobs}<span><b>${esc(jobName(j))}</b></span><button type="button" data-act="tripClearJob" aria-label="Clear">×</button></div>`
      : `<input type="search" id="trip-jobq" placeholder="Start typing an address or name…" autocomplete="off" data-input="tripJobQ"><div id="trip-suggest"></div>`}</div>
    <label>Or what for <span class="muted small">(optional)</span><input name="purpose" value="${esc(m?.purpose || '')}" placeholder="e.g. Plumb Center, quote visit"></label>
    <button class="btn primary wide big">Save trip</button>
  </form>`);
  if (!m) setTimeout(() => sheet.querySelector('[name=miles]')?.focus(), 60);
}

// ======================================================================
// First-time tips: a short hint the first time each screen is opened (per phone)
// ======================================================================
const TIPS = {
  jobs: 'This is your day at a glance. The big buttons do the everyday jobs, and <b>Tell Claude</b> lets you say what happened instead of typing. Tap any job to open it.',
  job: 'Everything about one job. The top buttons call the customer or get directions. Costs, payments and photos are further down, and <b>Aftercare</b> keeps guarantees and service reminders.',
  quotes: 'Pick C&B or Henry The Plumber, then <b>Fill from a job</b> to fill everything in. List the work, add the total, then <b>Make quote</b> and <b>Send PDF</b>.',
  contacts: 'Every customer from your jobs is here automatically. Tap <b>+</b> to add suppliers or trades. Tap a name to see everything you’ve done for them.',
  money: 'Profit, bills and where your work comes from. Log tool and van stock buys and mileage here.',
  calendar: 'Tap a day to see what’s on. The <b>+</b> adds a visit, a collection or a day off.',
  inbox: 'Send photos of receipts or type what needs adding. Claude sorts them at 8am and 5pm — nothing changes until you press <b>Approve</b>.',
  notes: 'Anything that doesn’t fit elsewhere — key safe codes, trade account numbers, things to buy.',
};
function tipsSeen() { try { return JSON.parse(localStorage.getItem('cb-tips') || '{}'); } catch { return {}; } }
function tipHtml(view) {
  if (!TIPS[view] || tipsSeen()[view]) return '';
  return `<div class="tip" id="tip"><span class="tip-ico">💡</span><div>${TIPS[view]}</div><button class="btn small" data-act="tipDone" data-v="${view}">Got it</button></div>`;
}

// ======================================================================
// Recent changes: who changed what (recorded by the database)
// ======================================================================
const ACT_TABLES = { jobs: 'job', costs: 'cost', payments: 'payment', overheads: 'bill / buy', events: 'calendar entry', tasks: 'to-do', docs: 'quote/invoice', contacts: 'contact', notes: 'note', photos: 'photo' };
const ACT_FIELDS = { price: 'price', status: 'status', start_date: 'start', end_date: 'end', finished_date: 'finished', quote_date: 'quote sent', customer_name: 'customer', customer_phone: 'phone', customer_email: 'email',
  address: 'address', postcode: 'postcode', title: 'job', description: 'scope of works', notes: 'notes', who: 'who', source: 'came from', guarantee_until: 'guarantee', service_due: 'service due',
  amount: 'amount', unit_cost: 'cost', qty: 'qty', paid_by: 'paid by', received_by: 'paid to', pay_date: 'date', cost_date: 'date', event_date: 'date', start_time: 'time', done: 'done',
  text: 'text', due_date: 'due', name: 'name', total: 'total', paid_in_full: 'paid in full', chased_at: 'chased', callbacks: 'call-backs', frequency: 'how often', category: 'type' };
function actWho(a) {
  if (!a.who || a.who === 'claude') return 'Claude';
  const m = (S.data.members || []).find(x => String(x.email).toLowerCase() === String(a.who).toLowerCase());
  if (m?.who) return nameOf(m.who);
  const n = String(a.who).split('@')[0].replace(/[._\d]+/g, ' ').trim();
  return n ? n[0].toUpperCase() + n.slice(1) : 'Someone';
}
function actVal(k, v) {
  if (v == null || v === '') return '—';
  if (k === 'status') return STATUS[v] || v;
  if (k === 'source') return SOURCES[v] || v;
  if (['price', 'amount', 'unit_cost', 'total'].includes(k)) return money(v);
  if (['who', 'paid_by', 'received_by'].includes(k)) return v === 'both' ? 'Both' : v === 'split' ? 'Split' : nameOf(v);
  if (v === NO_END) return 'no end date';
  if (/_date$|_until$|_due$|chased_at/.test(k)) return fmtShort(String(v).slice(0, 10));
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  if (Array.isArray(v)) return `${v.length}`;
  if (typeof v === 'object') return '…';
  const t = String(v).replace(/\s+/g, ' ');
  return t.length > 40 ? `${t.slice(0, 38)}…` : t;
}
function actThing(a) {
  const d = a.data || {};
  switch (a.tbl) {
    case 'jobs': return jobById(a.row_id) ? jobName(jobById(a.row_id)) : (String(d.address || '').split('\n')[0] || d.title || 'a job');
    case 'costs': return `${d.description || 'cost'}${d.unit_cost != null ? ` ${money(num(d.qty || 1) * num(d.unit_cost))}` : ''}`;
    case 'payments': return d.amount != null ? money(d.amount) : 'payment';
    case 'overheads': return `${d.name || ''}${d.amount != null ? ` ${money(d.amount)}` : ''}`;
    case 'events': return `${d.title || 'entry'}${d.event_date ? ` ${fmtShort(d.event_date)}` : ''}`;
    case 'tasks': case 'notes': return actVal('text', d.text);
    case 'docs': return `${d.doc_type === 'invoice' ? 'invoice' : 'quote'} *${d.number ?? ''}${d.customer?.name ? ` (${d.customer.name})` : ''}`;
    case 'contacts': return d.name || 'contact';
    default: return '';
  }
}
function actLine(a, withJob = true) {
  const what = ACT_TABLES[a.tbl] || a.tbl;
  const j = a.tbl !== 'jobs' && a.job_id ? jobById(a.job_id) : null;
  let text;
  if (a.op === 'insert') text = `added ${a.tbl === 'jobs' ? ({ enquiry: 'an enquiry', quoted: 'a quote' }[a.data?.status] || 'a job') : `a ${what}`}: <b>${esc(actThing(a))}</b>`;
  else if (a.op === 'delete') text = `deleted a ${what}: <b>${esc(actThing(a))}</b>`;
  else {
    const ch = Object.entries(a.changes || {});
    const parts = ch.slice(0, 3).map(([k, [o, n]]) => k === 'callbacks' ? 'logged a call-back' : k === 'done' && n === true ? 'ticked it off' : `${ACT_FIELDS[k] || k.replace(/_/g, ' ')} ${esc(actVal(k, o))} → <b>${esc(actVal(k, n))}</b>`);
    text = `changed ${a.tbl === 'jobs' ? '' : `a ${what} `}<b>${esc(actThing(a))}</b>: ${parts.join(', ')}${ch.length > 3 ? ` and ${ch.length - 3} more` : ''}`;
  }
  return `<span class="act-who">${esc(actWho(a))}</span> ${text}${withJob && j ? ` <a class="muted" href="#/job/${j.id}">· ${esc(jobName(j))}</a>` : ''}`;
}
function activityView() {
  const f = S.actF || 'all';
  const list = (S.data.activity || []).filter(a => f === 'all' || actWho(a) === f).slice(0, 300);
  const people = [...new Set((S.data.activity || []).map(actWho))];
  let day = '';
  const rows = list.map(a => {
    const d = String(a.at).slice(0, 10);
    const head = d !== day ? `<div class="act-day">${d === today() ? 'Today' : d === addDays(today(), -1) ? 'Yesterday' : fmtDate(d)}</div>` : '';
    day = d;
    return `${head}<div class="act-row"><span class="act-time">${new Date(a.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span><span>${actLine(a)}</span></div>`;
  }).join('');
  const body = `
  <p class="muted small">Every change either of you (or Claude) makes is listed here.</p>
  <div class="chips">${['all', ...people].map(p => `<button class="chip ${f === p ? 'on' : ''}" data-act="actFilter" data-f="${esc(p)}">${p === 'all' ? 'Everyone' : esc(p)}</button>`).join('')}</div>
  <section class="card act-list">${rows || `<p class="muted small">${S.data.activityMissing ? 'Not set up yet.' : DEMO ? 'Recent changes show here on your real account.' : 'Nothing yet.'}</p>`}</section>`;
  return layout({ title: 'Recent changes', back: true, body });
}
function jobHistoryHtml(j) {
  const list = (S.data.activity || []).filter(a => a.job_id === j.id || (a.tbl === 'jobs' && a.row_id === j.id));
  if (!list.length) return '';
  return `<details class="card act-job"><summary><b>History</b> <span class="muted small">${list.length} change${list.length > 1 ? 's' : ''}</span></summary>
    ${list.slice(0, 25).map(a => `<div class="act-row"><span class="act-time">${fmtShort(String(a.at).slice(0, 10))}</span><span>${actLine(a, false)}</span></div>`).join('')}</details>`;
}

// ======================================================================
// Contacts: every customer from the jobs, plus suppliers, trades and others you add
// ======================================================================
const CONTACT_KINDS = { customer: 'Customer', supplier: 'Supplier', trade: 'Trade', other: 'Other' };
const normPhone = p => { let d = String(p || '').replace(/\D/g, ''); if (d.startsWith('44')) d = '0' + d.slice(2); return d.length >= 9 ? d.slice(-10) : ''; };
const normEmail = e => String(e || '').trim().toLowerCase();
const waNumber = p => { let d = String(p || '').replace(/\D/g, ''); if (d.startsWith('0')) d = '44' + d.slice(1); return d; };

// Build the contact list: saved contacts + customers worked out from the jobs (merged when the phone or email match)
function contactList() {
  const saved = (S.data?.contacts || []).map(c => ({ ...c, key: c.id, saved: true, jobs: [] }));
  const byPhone = new Map(); const byEmail = new Map();
  const byName = new Map();
  const nameKey = c => String(c.name || '').trim().toLowerCase();
  const index = c => { const p = normPhone(c.phone); const e = normEmail(c.email); if (p) byPhone.set(p, c); if (e) byEmail.set(e, c); if (c.saved && nameKey(c)) byName.set(nameKey(c), c); };
  saved.forEach(index);
  const fromJobs = new Map();
  const jobs = (S.data?.jobs || []).slice().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  for (const j of jobs) {
    if (!j.customer_name && !j.customer_phone && !j.customer_email) continue;
    const p = normPhone(j.customer_phone); const e = normEmail(j.customer_email);
    let c = (p && byPhone.get(p)) || (e && byEmail.get(e));
    if (!c) { // same name as a saved contact, and no clash in postcode
      const n = byName.get(String(j.customer_name || '').trim().toLowerCase());
      if (n && (!n.postcode || !j.postcode || n.postcode.replace(/\s/g, '').toLowerCase() === String(j.postcode).replace(/\s/g, '').toLowerCase())) c = n;
    }
    if (!c) {
      const key = p ? `p${p}` : e ? `e${e}` : `n${String(j.customer_name).trim().toLowerCase()}|${String(j.postcode || '').replace(/\s/g, '').toLowerCase()}`;
      c = fromJobs.get(key);
      if (!c) {
        c = { key, saved: false, kind: 'customer', name: j.customer_name || 'No name', phone: j.customer_phone || '', email: j.customer_email || '', address: j.address || '', postcode: j.postcode || '', notes: '', jobs: [] };
        fromJobs.set(key, c); index(c);
      }
    }
    c.jobs.push(j);
    // fill gaps from older jobs
    if (!c.phone && j.customer_phone) c.phone = j.customer_phone;
    if (!c.email && j.customer_email) c.email = j.customer_email;
    if (!c.address && j.address) { c.address = j.address; c.postcode = j.postcode || c.postcode; }
  }
  return [...saved, ...fromJobs.values()].sort((a, b) => String(a.name).localeCompare(String(b.name), 'en', { sensitivity: 'base' }));
}
function contactMatches(c, q) {
  const words = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = [c.name, c.company, c.phone, normPhone(c.phone), c.email, c.address, c.postcode, String(c.postcode || '').replace(/\s/g, ''), c.notes, CONTACT_KINDS[c.kind],
    ...c.jobs.map(j => `${j.title || ''} ${j.address || ''} #${j.ref ?? ''}`)].join(' ').toLowerCase();
  return words.every(w => hay.includes(w));
}
function contactRowsHtml() {
  const f = S.contactsF || 'all';
  const list = contactList().filter(c => f === 'all' || c.kind === f).filter(c => contactMatches(c, S.contactsQ));
  if (!list.length) return `<p class="muted small center">${S.contactsQ ? 'No one matches that.' : 'No contacts yet.'}</p>`;
  return list.map(c => `<a class="ct-row" href="#/contacts/${encodeURIComponent(c.key)}">
    <span class="ct-av k-${c.kind}">${esc((String(c.name || '?').trim()[0] || '?').toUpperCase())}</span>
    <span class="ct-main"><b>${esc(c.name)}</b>${c.company ? ` <span class="muted small">${esc(c.company)}</span>` : ''}
      <span class="muted small">${[c.kind !== 'customer' ? CONTACT_KINDS[c.kind] : '', c.phone, c.postcode || String(c.address || '').split('\n')[0]].filter(Boolean).map(esc).join(' · ')}</span></span>
    ${c.jobs.length ? `<span class="ct-jobs">${c.jobs.length} job${c.jobs.length > 1 ? 's' : ''}</span>` : ''}
  </a>`).join('');
}
function contactsView({ id }) {
  if (id) return contactView(decodeURIComponent(id));
  const all = contactList();
  const f = S.contactsF || 'all';
  const count = k => all.filter(c => c.kind === k).length;
  const chip = (k, l) => `<button type="button" class="chip ${f === k ? 'on' : ''}" data-act="contactsFilter" data-f="${k}">${l}</button>`;
  const body = `
  <input type="search" class="q-search" id="ct-q" placeholder="Search name, number, address, postcode…" autocomplete="off" value="${esc(S.contactsQ || '')}" data-input="contactsQ">
  <div class="chips">${chip('all', `All (${all.length})`)}${chip('customer', `Customers (${count('customer')})`)}${chip('supplier', `Suppliers (${count('supplier')})`)}${chip('trade', `Trades (${count('trade')})`)}${chip('other', 'Other')}</div>
  <section class="card ct-list" id="ct-list">${contactRowsHtml()}</section>
  <p class="muted small center">Customers from your jobs appear here automatically.</p>`;
  return layout({
    title: 'Contacts', body,
    fab: S.data.contactsMissing ? '' : `<button class="fab" data-act="contactSheet" aria-label="Add contact">${ICON.plus}</button>`,
  });
}
function contactView(key) {
  const c = contactList().find(x => x.key === key);
  if (!c) return layout({ title: 'Contacts', back: true, body: '<div class="empty">Contact not found.</div>' });
  const phone = String(c.phone || '').replace(/[^\d+]/g, '');
  const addr = [String(c.address || '').split('\n').join(', '), c.postcode].filter(Boolean).join(', ');
  const jobs = c.jobs.slice().sort((a, b) => String(b.start_date || b.created_at).localeCompare(String(a.start_date || a.created_at)));
  // Customer history
  const done = jobs.filter(j => j.status === 'active' || j.status === 'finished');
  const sums = done.reduce((t, j) => { const k = calc(j); t.work += k.gross; t.paid += k.paid; if (j.status === 'finished') t.owed += Math.max(0, k.balance); return t; }, { work: 0, paid: 0, owed: 0 });
  const openQuotes = jobs.filter(j => j.status === 'quoted');
  const dates = jobs.map(j => j.start_date || j.finished_date || String(j.created_at).slice(0, 10)).filter(Boolean).sort();
  const jobIds = new Set(jobs.map(j => j.id));
  const nm = String(c.name || '').trim().toLowerCase();
  const docs = qDocs().filter(d => jobIds.has(d.job_id) || (nm && String(d.customer?.name || '').trim().toLowerCase() === nm))
    .sort((a, b) => String(b.doc_date).localeCompare(String(a.doc_date)));
  const pays = (S.data.payments || []).filter(p => jobIds.has(p.job_id)).sort((a, b) => String(b.pay_date).localeCompare(String(a.pay_date)));
  const body = `
  <section class="hero">
    <div class="row"><h2>${esc(c.name)}</h2><span class="pill">${CONTACT_KINDS[c.kind] || 'Contact'}</span></div>
    ${c.company ? `<div class="hero-who">${esc(c.company)}</div>` : ''}
    <div class="quick ct-quick">
      ${phone ? `<a href="tel:${esc(phone)}">${ICON.phone}<span>Call</span></a>` : `<span class="off">${ICON.phone}<span>Call</span></span>`}
      ${phone ? `<a href="sms:${esc(phone)}">${ICON.chat}<span>Text</span></a>` : `<span class="off">${ICON.chat}<span>Text</span></span>`}
      ${c.email ? `<a href="mailto:${esc(c.email)}">${ICON.send}<span>Email</span></a>` : `<span class="off">${ICON.send}<span>Email</span></span>`}
      ${addr ? `<a href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addr)}" target="_blank" rel="noopener">${ICON.pin}<span>Directions</span></a>` : `<span class="off">${ICON.pin}<span>Directions</span></span>`}
    </div>
  </section>
  ${jobs.length ? `<div class="glance ct-stats">
    <div><b>${done.length}</b><span>job${done.length === 1 ? '' : 's'} done</span></div>
    <div><b>${money0(sums.work)}</b><span>work in total</span></div>
    <div class="${sums.owed > 0.004 ? 'warn' : ''}"><b>${money0(sums.owed)}</b><span>owed</span></div>
  </div>
  <p class="muted small ct-since">${dates.length ? `Customer since ${fmtDate(dates[0])}${dates.length > 1 ? ` · latest ${fmtDate(dates[dates.length - 1])}` : ''}` : ''}${openQuotes.length ? ` · ${openQuotes.length} quote${openQuotes.length > 1 ? 's' : ''} waiting` : ''}${sums.paid ? ` · ${money0(sums.paid)} paid so far` : ''}</p>` : ''}
  <section class="card">
    <h3>Details</h3>
    ${c.phone ? `<div class="kv"><span>Phone</span><b>${esc(c.phone)}</b></div>` : ''}
    ${phone ? `<div class="kv"><span>WhatsApp</span><a href="https://wa.me/${waNumber(phone)}" target="_blank" rel="noopener">Open chat</a></div>` : ''}
    ${c.email ? `<div class="kv"><span>Email</span><b class="ct-wrap">${esc(c.email)}</b></div>` : ''}
    ${addr ? `<div class="kv"><span>Address</span><b class="ct-wrap">${nl2br([c.address, c.postcode].filter(Boolean).join('\n'))}</b></div>` : ''}
    ${c.notes ? `<div class="ct-notes">${nl2br(c.notes)}</div>` : ''}
    ${!c.phone && !c.email && !addr && !c.notes ? '<p class="muted small">No details yet.</p>' : ''}
  </section>
  ${jobs.length ? `<section class="card"><h3>Jobs (${jobs.length})</h3>${jobs.map(j => { const k = calc(j); return `<a class="ct-job" href="#/job/${j.id}">
      <span class="ct-job-main"><b>${esc(j.title || 'Job')}</b><span class="muted small">#${j.ref ?? ''}${j.start_date ? ` · ${fmtShort(j.start_date)}` : ''}${jobAddr(j) && jobAddr(j) !== String(c.address || '').split('\n').join(', ') ? ` · ${esc(jobAddr(j))}` : ''}</span></span>
      <span class="ct-job-side">${pill(j.status)}<b>${k.gross ? money0(k.gross) : '—'}</b>${j.status === 'finished' && k.balance > 0.004 ? `<em class="owed">${money0(k.balance)} owed</em>` : ''}</span></a>`; }).join('')}</section>` : '<section class="card"><p class="muted small">No jobs with us yet.</p></section>'}
  ${docs.length ? `<section class="card"><h3>Quotes &amp; invoices</h3>${docs.map(d => `<a class="kv link" href="#/quotes/view/${d.id}"><span>${d.doc_type === 'quote' ? 'Quote' : 'Invoice'} *${d.number} <em class="muted">${fmtShort(d.doc_date)}${d.paid_in_full ? ' · paid' : ''}</em></span><b>${qMoney(d.total)}</b></a>`).join('')}</section>` : ''}
  ${pays.length ? `<section class="card"><h3>Payments</h3>${pays.slice(0, 20).map(p => `<div class="kv"><span>${fmtShort(p.pay_date)} <em class="muted">${esc(jobById(p.job_id)?.title || '')}</em></span><b>${money(p.amount)}</b></div>`).join('')}</section>` : ''}
  <div class="q-after">
    <button class="btn primary wide" data-act="contactQuote" data-key="${esc(c.key)}">${ICON.doc} New quote for ${esc(String(c.name).split(' ')[0])}</button>
    <button class="btn wide" data-act="contactSheet" data-key="${esc(c.key)}">${c.saved ? 'Edit contact' : 'Add notes / edit details'}</button>
    ${c.saved ? `<button class="link-btn small danger-text" data-act="contactDelete" data-id="${c.id}">Delete contact</button>` : ''}
  </div>`;
  return layout({ title: 'Contact', back: true, body });
}
function contactSheetHtml(c) {
  const k = c?.kind || 'supplier';
  return `<form data-form="contact" class="form">
    ${sheetHead(c?.saved ? 'Edit contact' : c ? 'Save contact' : 'Add contact')}
    <input type="hidden" name="id" value="${esc(c?.saved ? c.id : '')}">
    <div class="seg4">${Object.entries(CONTACT_KINDS).map(([v, l]) => `<label class="${k === v ? 'on' : ''}"><input type="radio" name="kind" value="${v}" ${k === v ? 'checked' : ''}>${l}</label>`).join('')}</div>
    <label>Name<input name="name" required value="${esc(c?.name || '')}" autocomplete="off"></label>
    <label>Company <span class="muted small">(optional)</span><input name="company" value="${esc(c?.company || '')}" autocomplete="off" placeholder="e.g. Plumb Center Hastings"></label>
    <label>Phone<input name="phone" type="tel" value="${esc(c?.phone || '')}"></label>
    <label>Email<input name="email" type="email" value="${esc(c?.email || '')}" autocomplete="off"></label>
    <label>Address<textarea name="address" rows="2">${esc(c?.address || '')}</textarea></label>
    <label>Postcode<input name="postcode" value="${esc(c?.postcode || '')}"></label>
    <label>Notes<textarea name="notes" rows="3" placeholder="e.g. trade account number, opening hours, gate code">${esc(c?.notes || '')}</textarea></label>
    <button class="btn primary wide big">Save</button>
  </form>`;
}

// Dark mode: remembered on each phone
const isDark = () => document.documentElement.dataset.theme === 'dark';
const themeSwitch = () => `<button class="theme-switch" data-act="toggleTheme" role="switch" aria-checked="${isDark()}" aria-label="Dark mode"><i>${isDark() ? ICON.moon : ICON.sun}</i></button>`;

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
  const t = today();
  const hour = new Date().getHours();
  const hello = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const name = S.meKnown ? nameOf(S.me) : '';
  const dlToday = deadlinesIn(t, t);
  const dd = dayData(t, dlToday);
  const tmr = dayData(addDays(t, 1), deadlinesIn(addDays(t, 1), addDays(t, 1)));
  const nTmr = tmr.jobs.length + tmr.events.length;
  const searching = String(S.search || '').trim().length > 0;
  const body = `
  <div class="home-hello"><h2>${hello}${name ? `, ${esc(name)}` : ''}</h2>
    <span class="muted">${parseISO(t).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</span></div>

  <section class="card home-today">
    <div class="row"><h3>Today</h3><a class="muted small" href="#/calendar">Calendar ›</a></div>
    ${dayItemsHtml(t, dd)}
    <div class="muted small home-tmr">Tomorrow: ${nTmr ? `${nTmr} thing${nTmr === 1 ? '' : 's'} booked` : 'nothing booked yet'}</div>
  </section>

  <div class="home-actions">
    <a href="#/edit/new">${ICON.plus}<span>New job<br>or quote</span></a>
    <a href="#/inbox">${ICON.upload}<span>Add a receipt<br>or invoice</span></a>
    ${S.data.inboxMissing ? '' : `<button type="button" class="home-talk" data-act="talkSheet">${ICON.mic}<span><b>Tell Claude</b><em>Say what happened — "Joshua paid £200 by bank"</em></span></button>`}
  </div>

  ${inboxBannerHtml()}
  ${msgBannerHtml()}
  ${todoHtml()}

  <div class="toolbar home-search">
    <input type="search" placeholder="Search any job, customer, address or phone" value="${esc(S.search)}" data-input="search">
  </div>
  <div id="job-list">${searching ? jobListHtml() : homeGroupsHtml()}</div>

  ${stripHtml()}`;
  return layout({ title: 'Home', body });
}

// The jobs, in plain groups: what's on now, booked in, quotes waiting, money owed
function homeGroupsHtml() {
  const t = today();
  const jobs = S.data.jobs;
  if (!jobs.length) return jobListHtml();
  const running = j => j.status === 'active' && j.start_date && j.start_date <= t && (j.end_date && j.end_date >= j.start_date ? j.end_date : j.start_date) >= t;
  const byStart = (a, b) => String(a.start_date || '9999').localeCompare(String(b.start_date || '9999'));
  const onNow = jobs.filter(running).sort(byStart);
  const booked = jobs.filter(j => j.status === 'active' && !running(j)).sort(byStart);
  const quotes = jobs.filter(j => j.status === 'quoted').sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const enquiries = jobs.filter(j => j.status === 'enquiry').sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const owed = jobs.filter(j => j.status === 'finished' && calc(j).balance > 0.004).sort((a, b) => String(a.finished_date || '').localeCompare(String(b.finished_date || '')));
  const group = (key, title, list, extra = '', hint = '') => {
    if (!list.length) return '';
    const open = S.homeOpen?.[key] ?? true;
    return `<section class="home-group g-${key}">
      <button class="home-ghead" data-act="homeToggle" data-k="${key}" aria-expanded="${open}">
        <span><b>${title}</b> <span class="count">${list.length}</span>${extra ? ` <span class="muted small">${extra}</span>` : ''}</span><span class="chev">${open ? '▾' : '▸'}</span></button>
      ${open ? `${hint ? `<p class="muted small home-hint">${hint}</p>` : ''}${list.map(jobCard).join('')}` : ''}
    </section>`;
  };
  const out = [
    group('enq', 'New enquiries', enquiries, '', 'Ring them back or book a visit, then make a quote.'),
    group('now', 'On now', onNow),
    group('booked', 'Booked in', booked, '', booked.some(j => !j.start_date) ? 'Jobs without a date are at the bottom — tap one to set a date.' : ''),
    group('quotes', 'Quotes waiting for an answer', quotes, quotes.length ? money0(sum(quotes.map(j => calc(j).gross))) : ''),
    group('owed', 'Waiting to be paid', owed, owed.length ? money0(sum(owed.map(j => calc(j).balance))) : ''),
  ].join('');
  const fin = jobs.filter(j => j.status === 'finished' || j.status === 'declined').length;
  return (out || '<div class="empty">Nothing on at the moment. Tap <b>New job or quote</b> to add one.</div>')
    + (fin ? `<a class="home-archive" href="#/archive">${ICON.archive}<span>Finished jobs <span class="muted">(${fin})</span></span><span class="chev">›</span></a>` : '')
    + (S.data.activityMissing ? '' : `<a class="home-archive" href="#/activity">${ICON.refresh}<span>Recent changes${(() => { const n = (S.data.activity || []).filter(a => a.who && a.who !== myEmail() && Date.now() - Date.parse(a.at) < 86400000).length; return n ? ` <span class="muted">(${n} today by ${S.meKnown ? esc(nameOf(otherOf(S.me))) : 'others'})</span>` : ''; })()}</span><span class="chev">›</span></a>`);
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

// Customers / contacts matching the Jobs search, shown above the jobs
function searchProfilesHtml(q) {
  if (!String(q || '').trim() || String(q).trim().length < 2) return '';
  const hits = contactList().filter(c => contactMatches(c, q)).slice(0, 4);
  if (!hits.length) return '';
  return `<div class="ct-hits"><div class="muted small">Customers &amp; contacts</div>${hits.map(c => `<a class="ct-row" href="#/contacts/${encodeURIComponent(c.key)}">
    <span class="ct-av k-${c.kind}">${esc((String(c.name || '?').trim()[0] || '?').toUpperCase())}</span>
    <span class="ct-main"><b>${esc(c.name)}</b><span class="muted small">${[c.kind !== 'customer' ? CONTACT_KINDS[c.kind] : '', c.phone, c.postcode].filter(Boolean).map(esc).join(' · ')}</span></span>
    ${c.jobs.length ? `<span class="ct-jobs">${c.jobs.length} job${c.jobs.length > 1 ? 's' : ''}</span>` : ''}<span class="ct-go">Profile ›</span></a>`).join('')}</div>`;
}
function jobListHtml() {
  let list = S.data.jobs.slice();
  const f = String(S.search || '').trim() ? 'any' : S.filter;
  if (f === 'any') { /* searching: every job, finished ones too */ }
  else if (f === 'all') list = list.filter(j => isPre(j) || j.status === 'active');
  else if (f === 'owed') list = list.filter(j => j.status === 'finished' && calc(j).balance > 0.004);
  else list = list.filter(j => j.status === f);
  list = list.filter(j => matches(j, S.search));
  list.sort((a, b) => (STATUS_ORDER[a.status] - STATUS_ORDER[b.status])
    || String(a.start_date || '9999').localeCompare(String(b.start_date || '9999'))
    || String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
  const profiles = searchProfilesHtml(S.search);
  if (!list.length) {
    return profiles + `<div class="empty">${S.data.jobs.length ? 'No jobs match.' : `No jobs yet. Tap <b>+</b> to add your first job or quote.${DEMO ? '<br><br><button class="btn primary" data-act="seed">Load sample jobs to try it out</button>' : ''}`}</div>`;
  }
  return profiles + list.map(jobCard).join('');
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
  if (j.status === 'enquiry') {
    const vis = visitOf(j);
    line = vis && vis.event_date >= today() ? `<b>Visit ${fmtShort(vis.event_date)}${vis.start_time ? ` ${fmtTime(vis.start_time)}` : ''}</b> · to price up`
      : `<b>New enquiry</b> · ${fmtShort(String(j.created_at || today()).slice(0, 10))}${j.source ? ` · ${esc(SOURCES[j.source] || '')}` : ''}`;
  } else if (j.status === 'quoted') {
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
      ${(() => { const cp = j.customer_name || j.customer_phone ? contactList().find(x => x.jobs.some(y => y.id === j.id)) : null;
        return cp ? `<a class="hero-profile" href="#/contacts/${encodeURIComponent(cp.key)}">${ICON.people} ${esc(cp.name)}'s profile${cp.jobs.length > 1 ? ` · ${cp.jobs.length} jobs` : ''} ›</a>` : ''; })()}
      <div class="quick">
        ${phone ? `<a href="tel:${esc(phone)}">${ICON.phone}<span>Call</span></a>` : '<span class="off">' + ICON.phone + '<span>Call</span></span>'}
        <a href="#/quotes/job-${isPre(j) || j.status === 'declined' ? 'quote' : 'invoice'}/${j.id}">${ICON.doc}<span>${isPre(j) || j.status === 'declined' ? 'Quote' : 'Invoice'}</span></a>
        ${addr ? `<a href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addr)}" target="_blank" rel="noopener">${ICON.pin}<span>Directions</span></a>` : '<span class="off">' + ICON.pin + '<span>Directions</span></span>'}
      </div>
    </section>
    ${overviewTab(j, c)}`;
  return layout({
    title: `Job #${j.ref ?? ''}`, back: true, body,
    right: `<a class="btn small" href="#/edit/${id}">Edit</a>`,
  });
}


// ----- Aftercare: guarantee, call-backs, service reminder -----
const jobBaseDate = j => j.finished_date || j.end_date || j.start_date || today();
const NO_END = '9999-12-31'; // guarantee with no end date
const gUntil = d => d === NO_END ? 'no end date' : fmtDate(d);
function aftercareHtml(j) {
  if (j.status !== 'active' && j.status !== 'finished') return '';
  const t = today();
  const cbs = Array.isArray(j.callbacks) ? j.callbacks : [];
  const g = j.guarantee_until;
  const gLine = g ? (g === NO_END ? '<b class="ok">Guaranteed — no end date</b>' : g >= t ? `<b class="ok">Guaranteed until ${fmtDate(g)}</b>` : `<b class="muted">Guarantee ended ${fmtDate(g)}</b>`) : '<span class="muted">No guarantee recorded</span>';
  const sv = j.service_due;
  return `<section class="card aftercare">
    <h3>Aftercare</h3>
    <div class="ac-row"><span class="ac-ico">🛡</span><div class="ac-main">${gLine}${j.guarantee_note ? `<div class="muted small">${esc(j.guarantee_note)}</div>` : ''}</div>
      <button class="btn small" data-act="guaranteeSheet" data-id="${j.id}">${g ? 'Change' : 'Add'}</button></div>
    <div class="ac-row"><span class="ac-ico">🔧</span><div class="ac-main">${sv ? `<b>Service due ${fmtDate(sv)}</b><div class="muted small">You'll get a to-do a month before</div>` : '<span class="muted">No service reminder</span>'}</div>
      <button class="btn small" data-act="serviceSheet" data-id="${j.id}">${sv ? 'Change' : 'Remind us'}</button></div>
    <div class="ac-row"><span class="ac-ico">↩</span><div class="ac-main">${cbs.length ? `<b>${cbs.length} call-back${cbs.length > 1 ? 's' : ''}</b>` : '<span class="muted">No call-backs</span>'}</div>
      <button class="btn small" data-act="callbackSheet" data-id="${j.id}">Log one</button></div>
    ${cbs.length ? `<ul class="ac-cbs">${cbs.slice().sort((a, b) => String(b.date).localeCompare(String(a.date))).map(x => `<li><b>${fmtShort(x.date)}</b> ${x.who ? `<span class="muted">${esc(nameOf(x.who))}</span> ` : ''}— ${esc(x.note || '')}</li>`).join('')}</ul>` : ''}
  </section>`;
}
const periodBtns = (base, opts) => `<div class="chips wrap">${opts.map(([m, l]) => `<button type="button" class="chip" data-act="pickPeriod" data-d="${addMonths(base, m)}">${l}</button>`).join('')}</div>`;

function statusActions(j) {
  const b = (s, label, cls = '') => `<button class="btn ${cls}" data-act="status" data-id="${j.id}" data-s="${s}">${label}</button>`;
  const steps = ['enquiry', 'quoted', 'active', 'finished'];
  const idx = steps.indexOf(j.status);
  const stepper = `<div class="stepper">${steps.map((s, i) => `<div class="step ${i <= idx ? 'done' : ''} ${i === idx ? 'cur' : ''}"><span></span>${STATUS[s]}</div>`).join('')}</div>`;
  let btns = '';
  if (j.status === 'enquiry') btns = `<a class="btn primary" href="#/quotes/job-quote/${j.id}">Price it — make a quote</a>` + b('active', 'Straight to job') + b('declined', 'Not going ahead');
  else if (j.status === 'quoted') btns = b('active', 'Won it — mark Active', 'primary') + b('declined', 'Lost');
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
    <div class="kv"><span>Came from</span><b>${j.source ? esc(SOURCES[j.source] || j.source) : `<a href="#/edit/${j.id}" class="muted">not set — add</a>`}</b></div>
    ${jobWhoLabel(j) ? `<div class="kv"><span>Who did it</span><b>${esc(jobWhoLabel(j))} · 100% to them</b></div>` : ''}
    <div class="kv"><span>Quote #${j.ref ?? ''}</span><b>${j.quote_date ? `sent ${fmtDate(j.quote_date)}` : j.status === 'quoted' ? '<span class="muted">not sent yet</span>' : '—'}</b></div>
    ${j.finished_date ? `<div class="kv"><span>Finished</span><b>${fmtDate(j.finished_date)}</b></div>` : ''}
    ${j.description ? `<h4>Scope of works</h4><p>${nl2br(j.description)}</p>` : ''}
    ${j.notes ? `<h4>Notes (just you two)</h4><p class="notes">${nl2br(j.notes)}</p>` : ''}
    ${others.length ? `<h4>Other jobs for ${esc(j.customer_name)}</h4>${others.map(o => `<a class="kv link" href="#/job/${o.id}"><span>${esc(jobName(o))}${jobAddr(o) ? ` <em class="muted">${esc(o.title || '')}</em>` : ''}</span><b>${pill(o.status)}</b></a>`).join('')}` : ''}
  </section>

  ${aftercareHtml(j)}
  ${jobHistoryHtml(j)}
  ${jobDocsHtml(j)}
  <div class="action-grid">
    ${isPre(j) || j.status === 'declined' ? `<a class="btn" href="#/quotes/job-invoice/${j.id}">${ICON.doc} Invoice</a>` : `<a class="btn" href="#/quotes/job-quote/${j.id}">${ICON.doc} Quote</a>`}
    ${S.data.eventsMissing ? '' : `<button class="btn" data-act="evSheet" data-job="${j.id}">+ Calendar</button>`}
    <button class="btn" data-act="duplicate" data-id="${j.id}">Duplicate</button>
    ${S.data.mileageMissing ? '' : `<button class="btn" data-act="tripSheet" data-job="${j.id}">${ICON.car} Log a trip</button>`}
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
    ${S.data.inboxMissing ? '' : `<a class="btn wide ib-jobbtn" href="#/inbox/${j.id}">${ICON.upload} Upload invoice for Claude to fill in</a>`}
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
  const kind = S.photoKind?.[j.id] || (isPre(j) ? 'before' : j.status === 'finished' ? 'after' : 'during');
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
  const kind = S.photoKind?.[jobId] || (() => { const j = jobById(jobId); return isPre(j) ? 'before' : j.status === 'finished' ? 'after' : 'during'; })();
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
  return layout({ title: 'Notes', body });
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
    <details class="ph" ${isPre(j) || !num(j.price) ? 'open' : ''}><summary>Help me work it out</summary>
      <div class="two"><label>Materials £<input class="ph-in" name="ph_mat" type="number" inputmode="decimal" step="0.01" value="${r2(calc(j).totalCost) || ''}" placeholder="0"></label>
        <label>Mark-up %<input class="ph-in" name="ph_markup" type="number" inputmode="decimal" step="1" value="${num(st.markup_pct)}"></label></div>
      <div class="two"><label>Labour days<input class="ph-in" name="ph_days" type="number" inputmode="decimal" step="0.5" placeholder="0"></label>
        <label>Day rate £<input class="ph-in" name="ph_rate" type="number" inputmode="decimal" step="1" value="${num(st.day_rate) || ''}" placeholder="e.g. 220"></label></div>
      <label>Anything else £ <span class="muted small">(skip, parking, travel)</span><input class="ph-in" name="ph_extra" type="number" inputmode="decimal" step="0.01" placeholder="0"></label>
      <div class="ph-out" id="ph-out"></div>
      <button type="button" class="btn wide" data-act="phUse">Use this price</button>
    </details>
    <button class="btn primary wide big">Save new price</button>
  </form>`);
  phCalc();
  setTimeout(() => { const i = sheet.querySelector('[name=price]'); i?.focus(); i?.select(); }, 60);
}

// Price helper: materials + mark-up + labour (+ extras)
function phCalc() {
  const f = sheet.querySelector('form[data-form=price]');
  const out = document.getElementById('ph-out');
  if (!f || !out) return 0;
  const g = n => num(f.querySelector(`[name=${n}]`)?.value);
  const mat = g('ph_mat'), mk = g('ph_markup'), days = g('ph_days'), rate = g('ph_rate'), extra = g('ph_extra');
  const matCharge = mat * (1 + mk / 100), labour = days * rate;
  const total = Math.ceil((matCharge + labour + extra) / 5) * 5; // round up to the nearest £5
  out.innerHTML = total > 0 ? `<div class="kv"><span>Materials ${money(mat)} + ${mk}%</span><b>${money(matCharge)}</b></div>
    ${labour ? `<div class="kv"><span>Labour ${days} day${days === 1 ? '' : 's'} × ${money(rate)}</span><b>${money(labour)}</b></div>` : ''}
    ${extra ? `<div class="kv"><span>Extras</span><b>${money(extra)}</b></div>` : ''}
    <div class="kv ph-total"><span>Suggested price <em class="muted">(rounded up to £5)</em></span><b>${money(total)}</b></div>
    <div class="muted small">Profit on that: about ${money(total - mat)} before overheads</div>` : '<p class="muted small">Fill in materials and labour to get a suggested price.</p>';
  out.dataset.total = total;
  return total;
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
  <a class="card choose" href="#/edit/new-enquiry">
    <span class="choose-icon">${ICON.phone}</span>
    <span><strong>An enquiry</strong><em>Someone's been in touch — not priced yet</em></span>
  </a>
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
  const isNew = id === 'new-quote' || id === 'new-job' || id === 'new-enquiry';
  const st = set();
  const j = isNew
    ? { status: id === 'new-job' ? 'active' : id === 'new-enquiry' ? 'enquiry' : 'quoted', price: '', vat_applies: !!st.vat_registered, vat_rate: st.vat_rate, quote_date: null, quote_valid_days: st.quote_valid_days, ...takeDraft() }
    : jobById(id);
  if (!j) return layout({ title: 'Not found', back: true, body: '<div class="empty">Job not found.</div>' });
  const v = k => esc(j[k] ?? '');
  const enq = j.status === 'enquiry';
  const quote = j.status === 'quoted' || enq;
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
    ${isNew ? `<div class="new-kind ${enq ? 'enquiry' : quote ? 'quoted' : 'active'}">${enq ? 'New enquiry' : quote ? 'New quote' : 'New job'} <a href="#/edit/${quote ? 'new-job' : 'new-quote'}" data-act="swapKind">Change to ${quote ? 'job' : 'quote'}</a></div>` : ''}
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
      <div class="field-label">Where did they find us?</div>
      <div class="chips wrap src-pick">${Object.entries(SOURCES).map(([k, l]) => `<label class="chip ${j.source === k ? 'on' : ''}"><input type="radio" name="source" value="${k}" ${j.source === k ? 'checked' : ''} data-input="srcpick">${l}</label>`).join('')}</div>
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
    <button class="btn primary wide big">${isNew ? (enq ? 'Save enquiry' : quote ? 'Save quote' : 'Create job') : 'Save changes'}</button>
  </form>`;
  return layout({ title: isNew ? (enq ? 'New enquiry' : quote ? 'New quote' : 'New job') : 'Edit', back: true, body, nav: false });
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
      ${iso === t && j.customer_phone ? `<a class="btn small" href="tel:${esc(String(j.customer_phone).replace(/[^\d+]/g, ''))}" aria-label="Call ${esc(j.customer_name || 'customer')}">${ICON.phone}</a>` : ''}
      ${addr && iso >= t && j.status !== 'finished' ? `<a class="btn small" href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addr)}" target="_blank" rel="noopener" aria-label="Directions">${ICON.pin}</a>` : ''}
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
  return layout({ title: 'Calendar', body, fab });
}

// Add / edit a calendar entry
function evSheet(id, date, jobId) {
  const x = id ? (S.data.events || []).find(e => e.id === id)
    : { kind: 'visit', who: S.me, event_date: date || today(), job_id: jobId || null, done: false };
  if (!x) return;
  const v = k => esc(x[k] ?? '');
  const jobs = S.data.jobs.filter(j => isPre(j) || j.status === 'active' || j.id === x.job_id)
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
    ${['all', 'guarantee', 'service', ...years, 'declined'].map(y => `<button class="chip ${S.archiveYear === y ? 'on' : ''}" data-act="archiveYear" data-y="${y}">${{ all: 'All finished', declined: 'Declined', guarantee: 'Under guarantee', service: 'Service reminders' }[y] || y}</button>`).join('')}
  </div>
  <div id="archive-list">${archiveListHtml()}</div>`;
  return layout({ title: 'Finished jobs', back: true, body });
}

function archiveListHtml() {
  const y = S.archiveYear;
  let list = S.data.jobs.filter(j => (y === 'declined' ? j.status === 'declined' : y === 'guarantee' ? j.guarantee_until && j.guarantee_until >= today() : y === 'service' ? !!j.service_due : j.status === 'finished'));
  if (y === 'guarantee') list.sort((a, b) => String(a.guarantee_until).localeCompare(String(b.guarantee_until)));
  if (y === 'service') list.sort((a, b) => String(a.service_due).localeCompare(String(b.service_due)));
  if (y === 'guarantee' || y === 'service') {
    list = list.filter(j => matches(j, S.archiveSearch));
    return list.length ? list.map(j => `${jobCard(j)}`.replace('</a>', `<div class="muted small arch-extra">${y === 'guarantee' ? `🛡 Guaranteed ${j.guarantee_until === NO_END ? '— no end date' : `until ${fmtDate(j.guarantee_until)}`}${j.guarantee_note ? ` — ${esc(j.guarantee_note)}` : ''}` : `🔧 Service due ${fmtDate(j.service_due)}`}</div></a>`)).join('')
      : `<div class="empty">${y === 'guarantee' ? 'No jobs under guarantee. Add one from a job\u2019s Aftercare section.' : 'No service reminders set. Add one from a job\u2019s Aftercare section.'}</div>`;
  }
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

// Where work comes from: enquiries, wins, work and profit per source (for the tax year)
function sourcesCardHtml(ty, cur) {
  const inTy = iso => iso && taxYearOf(String(iso).slice(0, 10)) === ty;
  const jobs = S.data.jobs.filter(j => inTy(j.created_at) || inTy(j.finished_date));
  if (!jobs.length) return '';
  const keys = [...Object.keys(SOURCES), ''];
  const rows = keys.map(k => {
    const js = jobs.filter(j => (j.source || '') === k);
    if (!js.length) return null;
    const won = js.filter(j => j.status === 'active' || j.status === 'finished');
    const lost = js.filter(j => j.status === 'declined');
    const fin = js.filter(j => j.status === 'finished' && inTy(j.finished_date));
    return { k, label: k ? SOURCES[k] : 'Not set', leads: js.length, won: won.length, lost: lost.length, work: sum(won.map(j => calc(j).gross)), profit: sum(fin.map(j => calc(j).profit)) };
  }).filter(Boolean).sort((a, b) => b.work - a.work);
  const end = ty === cur ? today() : tyEnd(ty);
  const cta = (S.data.overheads || []).filter(o => /checkatrade/i.test(o.name || ''));
  const ctaCost = sum(cta.map(o => ohInRange(o, tyStart(ty), end)));
  const ct = rows.find(r => r.k === 'checkatrade');
  const unset = rows.find(r => !r.k);
  return `<section class="card sources">
    <h3>Where your work comes from</h3>
    <table class="src-table"><thead><tr><th></th><th>Jobs</th><th>Won</th><th>Work</th><th>Profit</th></tr></thead><tbody>
      ${rows.map(r => `<tr><td>${esc(r.label)}</td><td>${r.leads}</td><td>${r.won}${r.won + r.lost ? `<em> ${Math.round((r.won / Math.max(1, r.won + r.lost)) * 100)}%</em>` : ''}</td><td>${money0(r.work)}</td><td class="${r.profit < 0 ? 'neg' : ''}">${money0(r.profit)}</td></tr>`).join('')}
    </tbody></table>
    ${ctaCost ? `<div class="src-cta ${ct && ct.profit >= ctaCost ? 'ok' : 'warn'}"><b>Checkatrade:</b> cost ${money0(ctaCost)} this tax year${ct ? ` · profit from its jobs ${money0(ct.profit)} → <b>${ct.profit >= ctaCost ? `paying for itself (+${money0(ct.profit - ctaCost)})` : `${money0(ctaCost - ct.profit)} short so far`}</b>` : ' · no jobs marked as Checkatrade yet'}</div>` : ''}
    ${unset ? `<p class="muted small">${unset.leads} job${unset.leads > 1 ? 's don’t' : ' doesn’t'} say where ${unset.leads > 1 ? 'they' : 'it'} came from yet — set it with <b>Edit</b> on the job for better figures.</p>` : ''}
    <p class="muted small">Profit counts finished jobs only. "Won" % is out of the quotes that got an answer.</p>
  </section>`;
}

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

  ${sourcesCardHtml(ty, cur)}
  ${mileageCardHtml(ty)}

  <h2 class="section-title" id="overheads">Overheads</h2>
  ${overheadsBody()}



`;
  return layout({ title: 'Money', body });
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

// Text colours + size — per phone, so Henry and Luke can each pick their own
const TEXT_SCHEMES = [
  ['classic', 'Gold and grey', 'How it looked to start with'],
  ['hc', 'Black and white', 'Clearest — plain, strong text'],
  ['blue', 'White and blue', 'Links and headings in blue'],
  ['warm', 'Cream and yellow', 'Softer, warmer, still bright'],
];
const lookGet = () => { try { return { text: localStorage.getItem('cb-text') || 'classic', size: localStorage.getItem('cb-size') || 'normal' }; } catch { return { text: 'classic', size: 'normal' }; } };
function lookApply() {
  const { text, size } = lookGet(), h = document.documentElement;
  h.dataset.text = text; h.dataset.size = size;
  h.classList.toggle('tx', text !== 'classic');
}
function lookCardHtml() {
  const { text, size } = lookGet();
  return `<h3>Text colours</h3>
    <p class="muted small">Pick whichever is easiest to read. It only changes this phone.</p>
    <div class="look-opts">${TEXT_SCHEMES.map(([k, name, sub]) => `<button type="button" class="look-opt sc-${k}${k === text ? ' on' : ''}" data-act="setText" data-k="${k}" aria-pressed="${k === text}">
      <b>${name}</b><span>${sub}</span><em>Example link ›</em></button>`).join('')}</div>
    <h3 class="look-h">Text size</h3>
    <div class="btn-row">
      <button type="button" class="chip${size === 'normal' ? ' on' : ''}" data-act="setSize" data-k="normal">Normal</button>
      <button type="button" class="chip${size === 'big' ? ' on' : ''}" data-act="setSize" data-k="big">Bigger</button>
    </div>`;
}

function settingsView() {
  const s = set();
  const v = k => esc(s[k] ?? '');
  const body = `
  <section class="card" id="look-card">${lookCardHtml()}</section>
  <a class="card home-archive" href="#/quotes/settings">${ICON.doc}<span>Business &amp; bank details for quotes and invoices</span><span class="chev">›</span></a>
  <section class="card" id="notif-card">${notifCardHtml()}</section>
  <form data-form="settings" class="form">
    <section class="card">
      <h3>VAT</h3>
      <label class="check"><input type="checkbox" name="vat_registered" ${s.vat_registered ? 'checked' : ''}> We're VAT registered</label>
      <div class="two">
        <label>VAT number<input name="vat_number" value="${v('vat_number')}"></label>
        <label>VAT rate %<input name="vat_rate" type="number" step="0.1" value="${v('vat_rate')}"></label>
      </div>
      <p class="muted small">Leave unticked until you register. When ticked, new jobs add VAT and quotes/invoices show it.</p>
    </section>
    <button class="btn primary wide big">Save VAT settings</button>
  </form>
  <section class="card">
    <h3>Download a copy</h3>
    <p class="muted small">Everything is saved online automatically. These are just for your accountant or your own records.</p>
    <div class="btn-row wrap">
      <button class="btn" data-act="export" data-what="jobs">Jobs</button>
      <button class="btn" data-act="export" data-what="costs">Costs</button>
      <button class="btn" data-act="export" data-what="payments">Payments</button>
      <button class="btn" data-act="export" data-what="overheads">Bills &amp; buys</button>
      <button class="btn" data-act="export" data-what="backup">Everything</button>
    </div>
  </section>
  <section class="card">
    <p class="muted small">Signed in as ${S.meKnown ? `<b>${esc(nameOf(S.me))}</b> · ` : ''}${esc(S.session?.user?.email || '')}${S.live ? ' · <span class="live-dot"></span> live sync on' : ''}<br>App version ${APP_VERSION}</p>
    <div class="btn-row wrap">
      <button class="btn" data-act="refresh">${ICON.refresh} Refresh now</button>
      <button class="btn" data-act="tipsReset">Show tips again</button>
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
  // Only bills still to pay: regular ones (Checkatrade, insurance…) and one-offs dated in the future.
  // Tool and van-stock buys are already paid, so they never show here.
  const isBill = o => o.category !== 'tools' && o.category !== 'vanstock' && (o.frequency !== 'oneoff' || o.start_date > t);
  const upcoming = list.filter(isBill).flatMap(o => ohDueDates(o, t, horizon).map(d => ({ d, o }))).sort((a, b) => a.d.localeCompare(b.d));
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
      : `<p class="muted small">No bills due in the next 60 days. Add regular payments like Checkatrade, insurance or phone as monthly / yearly bills and they'll show here before they go out.</p>
         <button class="btn small" data-act="ohSheet">${ICON.plus} Add a regular bill</button>`}
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
// Old links (#/doc/<job>/quote) now open the Quotes tab
function docView({ id, extra }) {
  setTimeout(() => go(`#/quotes/job-${extra === 'invoice' ? 'invoice' : 'quote'}/${id}`), 0);
  return layout({ title: 'Quotes', body: '' });
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
async function makePdf(filename, selector = '.doc', width = 760) {
  await loadScript('vendor/html2pdf.bundle.min.js');
  await document.fonts?.ready;
  const src = document.querySelector(selector);
  const holder = document.createElement('div');
  holder.style.cssText = `position:absolute;left:0;top:0;width:${width}px;background:#fff;z-index:-1;pointer-events:none`;
  const clone = src.cloneNode(true);
  clone.classList.add('pdf');
  holder.appendChild(clone);
  document.body.appendChild(holder);
  try {
    // Quotes & invoices: squeeze onto one A4 page if it can be done neatly; otherwise spill onto more pages
    if (clone.classList.contains('inv-paper')) {
      await Promise.all([...clone.querySelectorAll('img')].map(i => (i.complete ? null : i.decode?.().catch(() => {}))));
      invFit(clone, width * (297 - 16) / (210 - 16)); // one A4 page (inside 8mm margins) in screen pixels
    }
    const blob = await window.html2pdf().set({
      margin: [8, 8, 8, 8], image: { type: 'jpeg', quality: 0.95 },
      html2canvas: { scale: 2, backgroundColor: '#ffffff', windowWidth: width, width, scrollX: 0, scrollY: -window.scrollY, x: 0, y: 0 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['css', 'legacy'] },
    }).from(clone).outputPdf('blob');
    return new File([blob], filename, { type: 'application/pdf' });
  } finally { holder.remove(); }
}
// Squeeze a quote/invoice onto one page in steps; past that, lay it out over several pages
function invFit(el, pageH, offset = 0) {
  const room = pageH - offset * 2 - 6;
  let fit = 0;
  while (fit < 3 && el.offsetHeight > room) { fit++; el.classList.remove(`fit${fit - 1}`); el.classList.add(`fit${fit}`); }
  if (el.offsetHeight > room) { el.classList.remove('fit3'); el.classList.add('fit1', 'multi'); invPaginate(el, pageH, offset); }
}
// Print a quote/invoice the same way as the PDF (one page where possible, no browser clutter)
async function printPaper() {
  const src = document.querySelector('.inv-paper');
  if (!src) { window.print(); return; }
  await document.fonts?.ready;
  document.getElementById('print-root')?.remove();
  const root = document.createElement('div');
  root.id = 'print-root';
  const clone = src.cloneNode(true);
  clone.classList.add('pdf');
  root.appendChild(clone);
  document.body.appendChild(root);
  await Promise.all([...clone.querySelectorAll('img')].map(i => (i.complete ? null : i.decode?.().catch(() => {}))));
  const mm = 96 / 25.4;
  invFit(clone, 297 * mm, 8 * mm);
  document.body.classList.add('printing-inv');
  const done = () => { document.body.classList.remove('printing-inv'); root.remove(); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  window.print();
  setTimeout(() => { if (!matchMedia('print').matches) done(); }, 60000);
}
// Long quotes/invoices: push any item that would be cut by a page edge onto the next page
function invPaginate(el, pageH, offset = 0) {
  const top0 = () => el.getBoundingClientRect().top - offset;
  const blocks = [];
  el.querySelectorAll('.inv-body > *, .inv-footer').forEach(n => {
    if (n.matches('hr')) return;
    // a very long item can be split between its lines, but never through a line
    if (n.classList.contains('inv-category') && n.offsetHeight > pageH * 0.6) n.querySelectorAll('h4, p').forEach(x => blocks.push([x, x]));
    else blocks.push([n, n]);
  });
  // keep the footer with the bottom band and trim
  const foot = blocks.find(b => b[0].classList.contains('inv-footer'));
  if (foot) foot[1] = el.lastElementChild;
  for (const [first, last] of blocks) {
    const t = first.getBoundingClientRect().top - top0();
    const bottom = last.getBoundingClientRect().bottom - top0();
    if (bottom - t >= pageH) continue;
    const page = Math.floor(t / pageH);
    if (bottom > (page + 1) * pageH - 2) {
      const gap = document.createElement('div');
      gap.className = 'inv-gap';
      gap.style.height = `${Math.ceil((page + 1) * pageH - t + 18)}px`;
      first.before(gap);
    }
  }
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
  if (typeof talkStop === 'function') talkStop();
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
  const row = (S.data[table] || []).find(x => x.id === id);
  await db.remove(table, id);
  S.data[table] = S.data[table].filter(x => x.id !== id);
  if (row) {
    rememberDeleted([{ table, row }]);
    // photo files are only removed once the chance to undo has passed
    if (table === 'photos') S.undo.fileTimer = setTimeout(() => db.removeFiles([row.path]).catch(console.error), 15000);
  }
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
  async talk(fd, form) {
    const text = String(fd.get('text') || '').trim();
    if (!text) { toast('Say or type something first', true); return; }
    talkStop();
    await busy(form.querySelector('button.primary'), async () => {
      await saveRow('inbox_items', null, { kind: 'request', status: 'new', text, created_by: myEmail(), paid_by: S.meKnown ? S.me : null, updated_at: new Date().toISOString() });
      closeSheet(); render(); toast('Sent to Claude');
    });
  },
  async trip(fd, form) {
    await busy(form.querySelector('button.primary'), async () => {
      let miles = num(fd.get('miles'));
      if (!(miles > 0)) throw new Error('Put in the miles');
      if (fd.get('return') === 'on') miles *= 2;
      const row = { trip_date: fd.get('trip_date') || today(), who: fd.get('who') || 'a', miles: r2(miles), job_id: fd.get('job_id') || null, purpose: String(fd.get('purpose') || '').trim() || null };
      await saveRow('mileage', fd.get('id') || null, row);
      closeSheet(); render(); toast(`Trip saved — ${r2(miles)} miles`);
    });
  },
  async guarantee(fd) {
    await saveRow('jobs', fd.get('id'), { guarantee_until: fd.get('until') || null, guarantee_note: String(fd.get('note') || '').trim() || null });
    closeSheet(); render(); toast('Guarantee saved');
  },
  async service(fd) {
    await saveRow('jobs', fd.get('id'), { service_due: fd.get('due') || null });
    closeSheet(); render(); toast(fd.get('due') ? 'Service reminder set' : 'Saved');
  },
  async callback(fd) {
    const j = jobById(fd.get('id')); if (!j) return;
    const list = [...(Array.isArray(j.callbacks) ? j.callbacks : []), { date: fd.get('date') || today(), note: String(fd.get('note') || '').trim(), who: S.meKnown ? S.me : null, at: new Date().toISOString() }];
    await saveRow('jobs', j.id, { callbacks: list });
    closeSheet(); render(); toast('Call-back logged');
  },
  async contact(fd, form) {
    await busy(form.querySelector('button.primary'), async () => {
      const id = fd.get('id') || null;
      const val = k => String(fd.get(k) || '').trim() || null;
      const row = { kind: fd.get('kind') || 'other', name: val('name'), company: val('company'), phone: val('phone'), email: val('email'), address: val('address'), postcode: val('postcode') ? val('postcode').toUpperCase() : null, notes: val('notes'), updated_at: new Date().toISOString() };
      if (!row.name) throw new Error('Add a name');
      const saved = await saveRow('contacts', id, row);
      closeSheet(); toast('Contact saved');
      go(`#/contacts/${encodeURIComponent(saved.id)}`);
    });
  },
  async qSettings(fd, form) {
    await busy(form.querySelector('button.primary'), async () => {
      const pk = fd.get('_profile');
      const cur = set().doc_profiles || {};
      const prof = { ...(cur[pk] || {}) };
      for (const [k, v] of fd.entries()) if (!k.startsWith('_')) prof[k] = k === 'quoteStart' ? (parseInt(v, 10) || 1) : String(v).trim();
      const invoiceStart = parseInt(fd.get('_invoiceStart'), 10) || cur.invoiceStart || Q_INVOICE_START;
      const data = { ...set(), doc_profiles: { ...cur, [pk]: prof, invoiceStart } };
      S.lastWrite = Date.now();
      await db.saveSettings(data);
      S.data.settings = data;
      delete form.dataset.dirty;
      toast('Details saved'); render();
    });
  },
  async inbox(fd, form) {
    const text = (S.inboxText || fd.get('text') || '').trim();
    const files = S.inboxFiles.slice();
    if (!text && !files.length) { toast('Add an invoice or type what needs doing', true); return; }
    const btn = form.querySelector('#ib-send');
    btn.disabled = true; btn.classList.add('busy');
    const now = new Date().toISOString();
    const base = { job_id: S.inboxJob || null, paid_by: fd.get('paid_by') || null, text: text || null, created_by: myEmail(), updated_at: now };
    const toRead = [];
    try {
      if (!files.length) await saveRow('inbox_items', null, { ...base, kind: 'request', status: 'new' });
      for (const f of files) {
        const safe = f.name.replace(/[^\w.-]+/g, '_').slice(-60);
        const path = `inbox/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`;
        await db.upload(path, f.blob);
        const row = await saveRow('inbox_items', null, { ...base, kind: 'invoice', status: 'reading', file_path: path, file_name: f.name, file_type: f.type });
        S.reading[row.id] = 'Reading…';
        toRead.push([row, f.blob]);
        S.inboxFiles = S.inboxFiles.filter(x => x !== f);
      }
      files.forEach(f => f.url && URL.revokeObjectURL(f.url));
      S.inboxFiles = []; S.inboxText = ''; S.inboxJob = null; S.inboxJobQ = '';
      render();
      toast(files.length ? `Sent — reading ${files.length === 1 ? 'the file' : `${files.length} files`} now` : 'Sent to Claude');
      for (const [row, blob] of toRead) await readInboxFile(row, blob);
    } catch (e) {
      toast(friendly(e), true);
      btn.disabled = false; btn.classList.remove('busy');
      if (toRead.length) render();
    }
  },

  async inboxApprove(fd, form) {
    const it = inboxItems().find(x => x.id === fd.get('id'));
    if (!it) return;
    const chosen = new Set(fd.getAll('act').map(Number));
    const acts = structuredClone(it.proposal?.actions || []);
    if (acts.length && !acts.some((a, i) => chosen.has(i) && !a.done)) { toast('Tick at least one thing, or press Reject', true); return; }
    const btn = form.querySelector('button.primary');
    btn.disabled = true; btn.classList.add('busy');
    const keys = { ...(it.proposal?.keys || {}) };
    try {
      for (let i = 0; i < acts.length; i++) {
        if (!chosen.has(i) || acts[i].done) continue;
        acts[i].result_id = await applyAction(acts[i], keys);
        acts[i].done = true;
      }
      acts.forEach((a, i) => { if (!a.done && !chosen.has(i)) a.skipped = true; });
      await saveRow('inbox_items', it.id, { status: 'approved', proposal: { ...it.proposal, actions: acts, keys }, decided_by: myEmail(), decided_at: new Date().toISOString(), updated_at: new Date().toISOString() });
      render(); toast('Approved — added to the app');
    } catch (e) {
      // Remember what did go in, so pressing Approve again won't add it twice
      await saveRow('inbox_items', it.id, { proposal: { ...it.proposal, actions: acts, keys } }).catch(() => {});
      render(); toast(friendly(e), true);
    }
  },

  async inboxReply(fd) {
    const it = inboxItems().find(x => x.id === fd.get('id'));
    const text = String(fd.get('text') || '').trim();
    if (!it || !text) return;
    const who = S.meKnown ? nameOf(S.me) : 'Reply';
    const history = [it.question && it.status === 'question' ? `Claude asked: ${it.question}` : '', `${who}: ${text}`].filter(Boolean).join('\n');
    try {
      await saveRow('inbox_items', it.id, { status: 'new', answer: it.answer ? `${it.answer}\n${history}` : history, updated_at: new Date().toISOString() });
      closeSheet(); render(); toast('Sent back to Claude');
    } catch (e) { toast(friendly(e), true); }
  },

  async inboxReject(fd) {
    const it = inboxItems().find(x => x.id === fd.get('id'));
    if (!it) return;
    const why = String(fd.get('text') || '').trim();
    try {
      await saveRow('inbox_items', it.id, { status: 'rejected', decided_by: myEmail(), decided_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...(why ? { answer: it.answer ? `${it.answer}\nRejected: ${why}` : `Rejected: ${why}` } : {}) });
      closeSheet(); render(); toast('Rejected — nothing was added');
    } catch (e) { toast(friendly(e), true); }
  },
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
        source: fd.get('source') || (old?.source ?? null),
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
        toast(row.status === 'enquiry' ? 'Enquiry saved' : row.status === 'quoted' ? 'Quote saved' : 'Job created');
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
  talkSheet() { talkSheet(); },
  talkMic() { talkMic(); },
  tripSheet(d) { tripSheet(d.id, d.job); },
  tripClearJob() { const f = sheet.querySelector('form[data-form=trip]'); f.querySelector('[name=job_id]').value = ''; document.getElementById('trip-jobpick').innerHTML = '<input type="search" id="trip-jobq" placeholder="Start typing an address or name…" autocomplete="off" data-input="tripJobQ"><div id="trip-suggest"></div>'; },
  tripPickJob(d) {
    const j = jobById(d.id); const f = sheet.querySelector('form[data-form=trip]'); if (!j || !f) return;
    f.querySelector('[name=job_id]').value = j.id;
    document.getElementById('trip-jobpick').innerHTML = `<div class="job-chosen">${ICON.jobs}<span><b>${esc(jobName(j))}</b></span><button type="button" data-act="tripClearJob" aria-label="Clear">×</button></div>`;
  },
  tipDone(d) { const t = tipsSeen(); t[d.v] = 1; try { localStorage.setItem('cb-tips', JSON.stringify(t)); } catch { /* ignore */ } document.getElementById('tip')?.remove(); },
  setText(d) { try { localStorage.setItem('cb-text', d.k); } catch { /* ignore */ } lookApply(); const c = document.getElementById('look-card'); if (c) c.innerHTML = lookCardHtml(); },
  setSize(d) { try { localStorage.setItem('cb-size', d.k); } catch { /* ignore */ } lookApply(); const c = document.getElementById('look-card'); if (c) c.innerHTML = lookCardHtml(); },
  tipsReset() { try { localStorage.removeItem('cb-tips'); } catch { /* ignore */ } toast('Tips will show again'); },
  async phUse() {
    const total = phCalc();
    if (!total) { toast('Fill in materials or labour first', true); return; }
    const f = sheet.querySelector('form[data-form=price]');
    f.querySelector('[name=price]').value = total;
    // remember the mark-up and day rate for next time
    const mk = num(f.querySelector('[name=ph_markup]').value), rate = num(f.querySelector('[name=ph_rate]').value);
    const st = set();
    if (mk !== num(st.markup_pct) || (rate && rate !== num(st.day_rate))) { const data = { ...st, markup_pct: mk, day_rate: rate || st.day_rate }; db.saveSettings(data).then(() => { S.data.settings = data; }).catch(console.error); }
    toast(`Price set to ${money(total)} — tap Save`);
  },
  actFilter(d) { S.actF = d.f; render(); },
  pickPeriod(d, el) { const f = el.closest('form'); f.querySelector('input[type=date]').value = d.d; f.querySelectorAll('.chips .chip').forEach(c => c.classList.toggle('on', c === el)); },
  guaranteeSheet(d) {
    const j = jobById(d.id); if (!j) return;
    const base = jobBaseDate(j);
    openSheet(`<form data-form="guarantee" class="form">${sheetHead('Guarantee')}
      <input type="hidden" name="id" value="${j.id}">
      <p class="muted small">How long is the work guaranteed for? (from ${fmtDate(base)})</p>
      ${periodBtns(base, [[3, '3 months'], [6, '6 months'], [12, '1 year'], [24, '2 years'], [60, '5 years']]).replace('</div>', `<button type="button" class="chip" data-act="pickPeriod" data-d="${NO_END}">No end date</button></div>`)}
      <label>Guaranteed until<input type="date" name="until" value="${esc(j.guarantee_until || '')}"></label>
      <label>What's covered <span class="muted small">(optional)</span><textarea name="note" rows="2" placeholder="e.g. if the trap fails we come back and replace it">${esc(j.guarantee_note || '')}</textarea></label>
      <button class="btn primary wide big">Save</button>
      ${j.guarantee_until ? '<button type="button" class="link-btn danger-text" data-act="guaranteeClear" data-id="' + j.id + '">Remove guarantee</button>' : ''}
    </form>`);
  },
  async guaranteeClear(d) { await saveRow('jobs', d.id, { guarantee_until: null, guarantee_note: null }); closeSheet(); render(); toast('Guarantee removed'); },
  serviceSheet(d) {
    const j = jobById(d.id); if (!j) return;
    const base = jobBaseDate(j);
    openSheet(`<form data-form="service" class="form">${sheetHead('Service reminder')}
      <input type="hidden" name="id" value="${j.id}">
      <p class="muted small">When should this be serviced again? A to-do pops up a month before, so you can ring ${esc(j.customer_name || 'them')} and book it in.</p>
      ${periodBtns(base, [[6, '6 months'], [12, '1 year'], [24, '2 years']])}
      <label>Service due<input type="date" name="due" value="${esc(j.service_due || '')}"></label>
      <button class="btn primary wide big">Save</button>
      ${j.service_due ? '<button type="button" class="link-btn danger-text" data-act="serviceClear" data-id="' + j.id + '">No reminder</button>' : ''}
    </form>`);
  },
  async serviceClear(d) { await saveRow('jobs', d.id, { service_due: null }); closeSheet(); render(); toast('Reminder removed'); },
  callbackSheet(d) {
    const j = jobById(d.id); if (!j) return;
    openSheet(`<form data-form="callback" class="form">${sheetHead('Log a call-back')}
      <input type="hidden" name="id" value="${j.id}">
      <label>Date<input type="date" name="date" value="${today()}"></label>
      <label>What happened?<textarea name="note" rows="3" required placeholder="e.g. trap leaking again — replaced washer, no charge"></textarea></label>
      <button class="btn primary wide big">Save</button>
    </form>`);
    setTimeout(() => sheet.querySelector('textarea')?.focus(), 60);
  },
  async serviceBook(d, el) {
    const j = jobById(d.id); if (!j) return;
    await busy(el, async () => {
      const row = { title: /service/i.test(j.title || '') ? j.title : `Service — ${j.title || 'annual'}`, status: 'enquiry', source: 'repeat', who: j.who || 'both',
        customer_name: j.customer_name, customer_phone: j.customer_phone, customer_email: j.customer_email, address: j.address, postcode: j.postcode,
        notes: `Service follow-up from job #${j.ref ?? ''}`, price: 0, vat_applies: j.vat_applies, vat_rate: j.vat_rate, created_by: S.session?.user?.email || null };
      const n = await saveRow('jobs', null, row);
      await saveRow('jobs', j.id, { service_due: null });
      toast('Added as an enquiry'); location.hash = `#/job/${n.id}`;
    });
  },
  async serviceSkip(d) { await saveRow('jobs', d.id, { service_due: null }); render(); toast('Reminder cleared'); },
  homeToggle(d) { S.homeOpen = { ...(S.homeOpen || {}), [d.k]: !(S.homeOpen?.[d.k] ?? true) }; const el = document.getElementById('job-list'); if (el) el.innerHTML = homeGroupsHtml(); },
  contactsFilter(d) { S.contactsF = d.f; render(); },
  contactSheet(d) {
    const c = d.key ? contactList().find(x => x.key === d.key) : null;
    openSheet(contactSheetHtml(c));
    sheet.querySelectorAll('.seg4 input').forEach(i => i.addEventListener('change', () => sheet.querySelectorAll('.seg4 label').forEach(l => l.classList.toggle('on', l.contains(i) && i.checked))));
    if (!c) setTimeout(() => sheet.querySelector('input[name=name]')?.focus(), 60);
  },
  contactQuote(d) {
    const c = contactList().find(x => x.key === d.key);
    if (!c) return;
    const lines = String(c.address || '').split('\n').map(x => x.trim()).filter(Boolean);
    const q = qBlank(qDraft().profile, 'quote');
    q.customer = { name: c.name || '', addr1: lines[0] || '', town: lines.slice(1).join(', '), postcode: c.postcode || '' };
    S.qd = q; qKeep(); go('#/quotes');
    toast(`New quote for ${c.name}`);
  },
  contactDelete(d) {
    const c = (S.data.contacts || []).find(x => x.id === d.id);
    if (!c) return;
    openSheet(`<div class="form">${sheetHead(`Delete ${esc(c.name)}?`)}
      <p>Removes this contact from the book. Their jobs (if any) aren't touched${c.kind === 'customer' ? ', and they will still show as a customer from those jobs' : ''}.</p>
      <button class="btn danger wide big" data-act="contactDeleteGo" data-id="${c.id}">Delete</button></div>`);
  },
  async contactDeleteGo(d) {
    try { await deleteRow('contacts', d.id); closeSheet(); toast('Deleted'); go('#/contacts'); }
    catch (e) { toast(friendly(e), true); }
  },
  qProfile(d) {
    const q = qDraft();
    if (q.profile === d.p) return;
    q.profile = d.p;
    localStorage.setItem('cb-quote-profile', d.p);

    if (!q.id) q.number = null;
    qKeep(); render();
  },
  qType(d) {
    const q = qDraft();
    if (q.doc_type === d.t) return;
    q.doc_type = d.t;
    if (!q.id) q.number = null;
    if (d.t === 'invoice' && q.job_id && !num(q.paid_to_date)) {
      const j = jobById(q.job_id);
      if (j) { const f = qFromJob(j, 'invoice'); q.paid_to_date = f.paid_to_date; q.paid_note = f.paid_note; q.paid_in_full = f.paid_in_full; }
    }
    qKeep(); render();
  },
  qPickJob(d) {
    const j = jobById(d.id);
    if (!j) return;
    const keep = qDraft();
    const typed = keep.categories.some(c => String(c.heading).trim() || c.lines.some(l => String(l).trim()));
    S.qd = { ...qFromJob(j, keep.doc_type), id: keep.id, number: keep.id ? keep.number : null, profile: keep.profile };
    if (typed) { S.qd.categories = keep.categories; S.qd.materials_included = keep.materials_included; }
    if (keep.total !== '' && keep.total != null && num(keep.total) > 0) S.qd.total = keep.total;
    S.qJobQ = '';
    qKeep(); render();
    toast(typed ? 'Customer filled in from the job — kept your items' : 'Filled in from the job');
  },
  qClearJob() { qDraft().job_id = null; qKeep(); render(); setTimeout(() => document.getElementById('q-jobq')?.focus(), 30); },
  qNew() { S.qd = qBlank(qDraft().profile, qDraft().doc_type); qKeep(); render(); window.scrollTo(0, 0); },
  qAddCat() {
    qDraft().categories.push({ heading: '', lines: [] }); qKeep(); qRefreshCats();
    const hs = document.querySelectorAll('#q-cats .q-heading'); hs[hs.length - 1]?.focus();
  },
  qDelCat(d) { qDraft().categories.splice(+d.i, 1); qKeep(); qRefreshCats(); },
  qAddLine(d) {
    const c = qDraft().categories[+d.i]; c.lines.push(''); qKeep(); qRefreshCats();
    document.querySelector(`#q-cats [data-qline="${d.i}:${c.lines.length - 1}"]`)?.focus();
  },
  qDelLine(d) { const [ci, li] = d.i.split(':').map(Number); qDraft().categories[ci].lines.splice(li, 1); qKeep(); qRefreshCats(); },
  async qGenerate(d, el) {
    const q = qDraft();
    if (!String(q.customer.name || '').trim()) { toast('Add the customer name first', true); document.querySelector('[data-qf="customer.name"]')?.focus(); return; }
    if (!(num(q.total) > 0)) { toast('Add the total first', true); document.querySelector('[data-qf="total"]')?.focus(); return; }
    if (!q.categories.some(c => String(c.heading).trim() || c.lines.some(l => String(l).trim()))) { toast('Add at least one item of work', true); document.querySelector('[data-qcat="0"]')?.focus(); return; }
    await busy(el, async () => {
      const existing = q.id ? qDocs().find(x => x.id === q.id) : null;
      const number = q.number || (existing ? existing.number : qNextNumber(q.doc_type, q.profile));
      const clash = qDocs().find(x => x.id !== q.id && x.doc_type === q.doc_type && x.number === number && (q.doc_type === 'invoice' || x.profile === q.profile));
      if (clash) throw new Error(`${q.doc_type === 'quote' ? 'Quote' : 'Invoice'} *${number} is already used (${clash.customer?.name || 'another one'}) — pick another number`);
      const row = {
        profile: q.profile, doc_type: q.doc_type, number, job_id: q.job_id || null, from_quote: q.from_quote || null,
        customer: q.customer, doc_date: q.doc_date || today(),
        categories: q.categories.map(c => ({ heading: String(c.heading || '').trim(), lines: c.lines.map(l => String(l).trim()).filter(Boolean) })).filter(c => c.heading || c.lines.length) // empty boxes aren't printed
          .filter(c => c.lines.length || !/^all materials included\.?$/i.test(c.heading)), // that line is its own tick box now
        total: r2(num(q.total)), pay_to: q.pay_to || 'primary', materials_included: !!q.materials_included,
        paid_in_full: q.doc_type === 'invoice' && !!q.paid_in_full,
        paid_to_date: q.doc_type === 'invoice' ? (q.paid_in_full ? r2(num(q.total)) : r2(num(q.paid_to_date))) : 0, paid_note: q.doc_type === 'invoice' ? (q.paid_note || null) : null,
        business: qBusiness(q.profile, q.pay_to), updated_at: new Date().toISOString(),
      };
      let saved;
      try { saved = await saveRow('docs', q.id || null, row); }
      catch (e) {
        if (/duplicate key|23505|uniq/i.test(String(e?.message || e?.code || e))) {
          await loadData().catch(() => {});
          throw new Error(`Number ${number} was just used on the other phone — tap again for the next number`);
        }
        throw e;
      }
      localStorage.setItem('cb-quote-profile', q.profile);
      S.qd = qBlank(q.profile, q.doc_type); qKeep();
      toast(existing ? 'Saved changes' : `${q.doc_type === 'quote' ? 'Quote' : 'Invoice'} *${number} saved`);
      go(`#/quotes/view/${saved.id}`);
    });
  },
  qEdit(d) {
    const rec = qDocs().find(x => x.id === d.id);
    if (!rec) return;
    S.qd = {
      id: rec.id, profile: rec.profile, doc_type: rec.doc_type, number: rec.number, job_id: rec.job_id, from_quote: rec.from_quote,
      customer: { name: '', addr1: '', town: '', postcode: '', ...(rec.customer || {}) }, doc_date: rec.doc_date,
      categories: (rec.categories || []).map(c => ({ heading: c.heading || '', lines: [...(c.lines || [])] })),
      total: String(rec.total ?? ''), pay_to: rec.pay_to, paid_to_date: num(rec.paid_to_date), paid_note: rec.paid_note || '',
      materials_included: !!rec.materials_included, paid_in_full: !!rec.paid_in_full,
    };
    const old = S.qd.categories.findIndex(c => !c.lines.length && /^all materials included\.?$/i.test(c.heading.trim()));
    if (old >= 0) { S.qd.categories.splice(old, 1); S.qd.materials_included = true; }
    if (!S.qd.categories.length) S.qd.categories = [{ heading: '', lines: [] }];
    qKeep(); go('#/quotes');
  },
  qCopy(d) {
    ACT.qEdit(d);
    Object.assign(S.qd, { id: null, number: null, from_quote: null, doc_date: today(), paid_in_full: false, paid_to_date: 0, paid_note: "" });
    qKeep(); render(); toast('Copied — change what you need, then save');
  },
  qConvert(d) {
    const rec = qDocs().find(x => x.id === d.id);
    if (!rec) return;
    ACT.qEdit(d);
    Object.assign(S.qd, { id: null, number: null, doc_type: 'invoice', from_quote: rec.id, doc_date: today(), pay_to: 'primary' });
    const j = rec.job_id ? jobById(rec.job_id) : null;
    if (j) { const f = qFromJob(j, 'invoice'); S.qd.paid_to_date = f.paid_to_date; S.qd.paid_note = f.paid_note; S.qd.paid_in_full = f.paid_in_full; }
    qKeep(); render(); toast('Turned into an invoice — check it, then save');
  },
  qDelete(d) {
    const rec = qDocs().find(x => x.id === d.id);
    if (!rec) return;
    openSheet(`<div class="form">${sheetHead(`Delete ${rec.doc_type} *${rec.number}?`)}
      <p>${esc(rec.customer?.name || '')} · ${qMoney(rec.total)}. This can't be undone.</p>
      <button class="btn danger wide big" data-act="qDeleteGo" data-id="${rec.id}">Delete</button></div>`);
  },
  async qDeleteGo(d) {
    try { await deleteRow('docs', d.id); closeSheet(); toast('Deleted'); go('#/quotes/saved'); }
    catch (e) { toast(friendly(e), true); }
  },
  qSavedFilter(d) { S.qSavedF = d.f; render(); },
  qSetProfile(d) { S.qSetP = d.p; render(); },
  async qSend(d, el) {
    const rec = qDocs().find(x => x.id === d.id);
    if (!rec) return;
    const isQuote = rec.doc_type === 'quote';
    const biz = rec.business?.businessName || Q_PROFILES[rec.profile].label;
    const name = `${biz.replace(/[^\w]+/g, '')} ${isQuote ? 'Quote' : 'Invoice'} ${rec.number}${rec.customer?.name ? ` ${rec.customer.name.replace(/[^\w ]+/g, '')}` : ''}.pdf`;
    const text = `${biz} ${isQuote ? 'quote' : 'invoice'} ${rec.number}`;
    const j = rec.job_id ? jobById(rec.job_id) : null;
    const mark = async () => {
      if (!j) return;
      if (isQuote && !j.quote_date && isPre(j)) await saveRow('jobs', j.id, { quote_date: today(), status: 'quoted' }).catch(console.error);
      if (!isQuote) await setMark(j, 'chased_at').catch(console.error);
    };
    if (S.readyPdf && S.readyPdf.key === `doc/${rec.id}`) {
      const file = S.readyPdf.file; S.readyPdf = null; el.textContent = 'Send PDF';
      try { await navigator.share({ files: [file], title: file.name, text }); await mark(); }
      catch (e) { if (e.name !== 'AbortError') { saveFile(file); toast('PDF downloaded instead'); } }
      return;
    }
    const label = el.textContent;
    el.textContent = 'Making PDF…';
    await busy(el, async () => {
      const file = await makePdf(name, '.inv-paper', 700);
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: name, text }); }
        catch (e) {
          if (e.name === 'AbortError') return;
          if (e.name === 'NotAllowedError') { S.readyPdf = { key: `doc/${rec.id}`, file }; setTimeout(() => { el.textContent = 'PDF ready — tap to send'; el.classList.add('pulse'); }, 0); return; }
          throw e;
        }
      } else { saveFile(file); toast('PDF downloaded'); }
      await mark();
    });
    if (!S.readyPdf) el.textContent = label;
  },
  inboxPickJob(d) { S.inboxJob = d.id; S.inboxJobQ = ''; const el = document.getElementById('ib-jobpick'); if (el) el.innerHTML = inboxJobPickHtml(); },
  inboxClearJob() {
    S.inboxJob = null; S.inboxJobQ = '';
    const el = document.getElementById('ib-jobpick');
    if (el) { el.innerHTML = inboxJobPickHtml(); el.querySelector('input')?.focus(); }
  },
  inboxFileRemove(d) {
    const f = S.inboxFiles[+d.i];
    if (f?.url) URL.revokeObjectURL(f.url);
    S.inboxFiles.splice(+d.i, 1);
    render();
  },
  async inboxFile(d) {
    const it = inboxItems().find(x => x.id === d.id);
    if (!it?.file_path) return;
    const w = window.open('', '_blank');
    try {
      const url = (await db.fileUrls([it.file_path]))[it.file_path];
      if (w) w.location = url; else location.href = url;
    } catch (e) { w?.close(); toast(friendly(e), true); }
  },
  inboxReplySheet(d) {
    openSheet(`<form data-form="inboxReply" class="form">
      ${sheetHead('What needs changing?')}
      <input type="hidden" name="id" value="${esc(d.id)}">
      <label>Tell Claude what's wrong<textarea name="text" rows="4" required placeholder="e.g. the tiles were for Pevensey not Mill Lane, and Luke paid"></textarea></label>
      <button class="btn primary wide big">Send back to Claude</button>
      <p class="muted small">Claude will look again at the next check (8am / 5pm) or when you say "process invoices".</p>
    </form>`);
    setTimeout(() => sheet.querySelector('textarea')?.focus(), 60);
  },
  inboxRejectSheet(d) {
    openSheet(`<form data-form="inboxReject" class="form">
      ${sheetHead('Reject this?')}
      <input type="hidden" name="id" value="${esc(d.id)}">
      <p>Nothing will be added to the app.</p>
      <label>Why? <span class="muted small">(optional)</span><input name="text" placeholder="e.g. already added it myself"></label>
      <button class="btn danger wide big">Reject</button>
    </form>`);
  },
  inboxDelete(d) {
    const it = inboxItems().find(x => x.id === d.id);
    if (!it) return;
    openSheet(`<div class="form">
      ${sheetHead('Delete from inbox?')}
      <p>${esc(it.file_name || 'This request')} will be removed${it.file_path ? ', including the file' : ''}. Anything already approved stays in the app.</p>
      <button class="btn danger wide big" data-act="inboxDeleteGo" data-id="${it.id}">Delete</button>
    </div>`);
  },
  async inboxDeleteGo(d) {
    const it = inboxItems().find(x => x.id === d.id);
    if (!it) return;
    try {
      if (it.file_path) await db.removeFiles([it.file_path]).catch(console.error);
      await deleteRow('inbox_items', it.id);
      S.undo = null;
      closeSheet(); render(); toast('Removed from the inbox');
    } catch (e) { toast(friendly(e), true); }
  },
  async back() {
    const f = document.querySelector('form[data-form="job"]');
    if (f && f.dataset.dirty === '1' && !await ask('Discard your changes to this job?', 'Discard', true)) return;
    goBack();
  },
  async retry(d, el) { await busy(el, async () => { await loadData(); render(); }); render(); },
  noteSheet(d) { noteSheet(d.id); },
  msgSheet(d) { S.chatJump = true; S.chatJobOpen = false; S.chatJob = d.job || null; go(d.job ? `#/chat/${d.job}` : '#/chat'); },
  chatQuick(d) { const i = document.getElementById('chat-input'); S.chatDraft = d.t; i.value = d.t; growChat(i); i.focus(); },
  chatJobClear() { S.chatJob = null; render(); },
  chatJobOpen() {
    if (S.chatJobOpen) { ACT.chatJobClose(); return; }
    S.chatJobOpen = true; S.chatJobQ = ''; render();
    document.getElementById('chat-jobq')?.focus();
  },
  chatJobClose() { S.chatJobOpen = false; S.chatJobQ = ''; render(); document.getElementById('chat-input')?.focus(); },
  chatPickJob(d) { S.chatJob = d.id; ACT.chatJobClose(); },
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
      await saveRow('photos', null, { job_id: m.job_id, path, kind: isPre(j) ? 'before' : j.status === 'finished' ? 'after' : 'during', caption: m.text || null });
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
  print() { printPaper(); },
  async signout() {
    try { localStorage.removeItem(snapKey()); } catch { /* ignore */ }
    await db.signOut().catch(console.error); S.session = null; S.data = null; S.loadError = null; render(); },

  async status(d, el) {
    const j = jobById(d.id);
    const patch = { status: d.s };
    if (d.s === 'finished' || d.s === 'declined') patch.finished_date = j.finished_date || today();
    else patch.finished_date = null;
    if (d.s === 'finished' && !j.service_due && /service/i.test(j.title || '')) patch.service_due = addMonths(patch.finished_date, 12);
    if (d.s === 'finished') {
      const c = calc(j);
      if (c.balance > 0.004 && !await ask(`Mark finished? ${money(c.balance)} is still unpaid — it'll show under "Owed".`)) return;
    }
    await busy(el, async () => {
      await saveRow('jobs', j.id, patch);
      render();
      toast(`Marked ${STATUS[d.s]}${patch.service_due ? ' — service reminder set for next year' : d.s === 'finished' || d.s === 'declined' ? ' — moved to Finished jobs' : ''}`);
    });
  },

  async deleteRow(d, el) {
    await busy(el, async () => { await deleteRow(d.table, d.id); closeSheet(); render(); toast('Deleted'); });
  },
  undoDelete(d, el) { el.disabled = true; undoDelete().catch(e => toast(friendly(e), true)); },

  async deleteJob(d, el) {
    const j = jobById(d.id);
    if (!await ask(`Delete "${jobName(j)}" and all its costs, payments and photos?\n\nYou'll have 10 seconds to undo. Tip: mark it Finished or Declined instead to keep it.`, 'Delete job', true)) return;
    await busy(el, async () => {
      const paths = photosOf(j.id).map(p => p.path);
      const kids = ['costs', 'payments', 'photos'].flatMap(t => (S.data[t] || []).filter(x => x.job_id === j.id).map(row => ({ table: t, row })));
      const relink = [...(S.data.events || []).filter(e => e.job_id === j.id).map(e => ({ table: 'events', id: e.id, field: 'job_id', value: j.id })),
        ...(S.data.docs || []).filter(x => x.job_id === j.id).map(x => ({ table: 'docs', id: x.id, field: 'job_id', value: j.id }))];
      S.lastWrite = Date.now();
      await db.remove('jobs', j.id);
      rememberDeleted([{ table: 'jobs', row: j }, ...kids]);
      S.undo.relink = relink;
      S.undo.back = `#/job/${j.id}`;
      S.undo.fileTimer = setTimeout(() => db.removeFiles(paths).catch(console.error), 15000);
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
  if (e.target.id === 'inbox-file' && e.target.files?.length) {
    const files = [...e.target.files];
    e.target.value = '';
    addInboxFiles(files).catch(err => toast(friendly(err), true));
    return;
  }
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

// Quotes tab: typing into the form updates the draft without redrawing (keeps the keyboard up)
function qSetField(el) {
  const d = qDraft();
  if (el.dataset.qf) {
    const path = el.dataset.qf;
    let v = el.type === 'checkbox' ? el.checked : el.value;
    if (path === 'number') v = parseInt(v, 10) > 0 ? parseInt(v, 10) : null;
    if (path === 'paid_to_date') v = num(v);
    if (path.startsWith('customer.')) d.customer[path.slice(9)] = v; else d[path] = v;
    if (path === 'paid_in_full') { qKeep(); render(); return; }
    if (path === 'pay_to') el.closest('.seg3')?.querySelectorAll('label').forEach(l => l.classList.toggle('on', l.contains(el)));
  } else if (el.dataset.qcat != null) {
    d.categories[+el.dataset.qcat].heading = el.value;
    growChat(el);
  } else if (el.dataset.qline) {
    const [ci, li] = el.dataset.qline.split(':').map(Number);
    d.categories[ci].lines[li] = el.value;
    growChat(el);
  } else return;
  qKeep();
}
document.addEventListener('input', e => { if (e.target.closest?.('.q-form')) qSetField(e.target); if (e.target.classList?.contains('ph-in')) phCalc(); });
document.addEventListener('change', e => { if (e.target.closest?.('.q-form') && (e.target.type === 'radio' || e.target.type === 'checkbox')) qSetField(e.target); });

// Drag invoices onto the inbox page (computer)
['dragenter', 'dragover'].forEach(t => document.addEventListener(t, e => {
  if (route().view !== 'inbox' || !e.dataTransfer?.types?.includes('Files')) return;
  e.preventDefault();
  document.getElementById('ib-drop')?.classList.add('over');
}));
document.addEventListener('dragleave', e => { if (!e.relatedTarget) document.getElementById('ib-drop')?.classList.remove('over'); });
document.addEventListener('drop', e => {
  if (route().view !== 'inbox' || !e.dataTransfer?.files?.length) return;
  e.preventDefault();
  document.getElementById('ib-drop')?.classList.remove('over');
  addInboxFiles(e.dataTransfer.files).catch(err => toast(friendly(err), true));
});

// To-do steps: Enter adds the step; ticking strikes it through
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.id === 'chat-jobq') { e.preventDefault(); document.querySelector('#chat-suggest .job-opt')?.click(); }
  if (e.key === 'Enter' && e.target.id === 'q-jobq') { e.preventDefault(); document.querySelector('#q-suggest .job-opt')?.click(); }
  if (e.key === 'Enter' && e.target.id === 'ib-jobq') { e.preventDefault(); document.querySelector('#ib-suggest .job-opt')?.click(); }
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
  if (k === 'search') { S.search = e.target.value; const el = document.getElementById('job-list'); if (el) el.innerHTML = route().view === 'jobs' && !String(S.search).trim() ? homeGroupsHtml() : jobListHtml(); }
  if (k === 'chatDraft') { S.chatDraft = e.target.value; growChat(e.target); }
  if (k === 'chatJobQ') { S.chatJobQ = e.target.value; const el = document.getElementById('chat-suggest'); if (el) el.innerHTML = jobSuggestHtml(S.chatJobQ, 'chatPickJob', 5); }
  if (k === 'tripJobQ') { const el = document.getElementById('trip-suggest'); if (el) el.innerHTML = jobSuggestHtml(e.target.value, 'tripPickJob', 5); }
  if (k === 'srcpick') e.target.closest('.src-pick').querySelectorAll('label').forEach(l => l.classList.toggle('on', l.contains(e.target)));
  if (k === 'contactsQ') { S.contactsQ = e.target.value; const el = document.getElementById('ct-list'); if (el) el.innerHTML = contactRowsHtml(); }
  if (k === 'qJobQ') { S.qJobQ = e.target.value; const el = document.getElementById('q-suggest'); if (el) el.innerHTML = jobSuggestHtml(S.qJobQ, 'qPickJob'); }
  if (k === 'qSavedQ') { S.qSavedQ = e.target.value; const el = document.getElementById('q-saved-list'); if (el) el.innerHTML = qSavedRows(qSavedList()); }
  if (k === 'inboxText') S.inboxText = e.target.value;
  if (k === 'inboxJobQ') { S.inboxJobQ = e.target.value; const el = document.getElementById('ib-suggest'); if (el) el.innerHTML = jobSuggestHtml(S.inboxJobQ); }
  if (k === 'inboxPayer') { S.inboxPayer = e.target.value; e.target.closest('.seg3').querySelectorAll('label').forEach(l => l.classList.toggle('on', l.contains(e.target))); }
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
