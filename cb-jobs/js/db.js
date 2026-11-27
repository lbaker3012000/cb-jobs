// Data layer: Supabase when configured, otherwise a local demo store.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js?v=20261127a';

export const DEMO = !SUPABASE_URL || !SUPABASE_ANON_KEY;
const TABLES = ['jobs', 'costs', 'payments', 'photos'];
const BUCKET = 'job-photos';

// ---------------------------------------------------------------- Supabase
let sb = null;
async function client() {
  if (!sb) {
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
    sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }
  return sb;
}
// Supabase returns max 1000 rows per request, so page through everything
async function fetchAll(c, table) {
  const size = 1000;
  let from = 0;
  const rows = [];
  for (;;) {
    const { data, error } = await c.from(table).select('*').order('id').range(from, from + size - 1);
    if (error) return { data: null, error };
    rows.push(...data);
    if (data.length < size) return { data: rows, error: null };
    from += size;
  }
}
function check({ data, error }) {
  if (error) throw new Error(error.message || String(error));
  return data;
}

const remote = {
  async session() {
    const c = await client();
    return check(await c.auth.getSession()).session;
  },
  async onAuth(cb) {
    const c = await client();
    c.auth.onAuthStateChange((event, session) => cb(session, event));
  },
  async signIn(email, password) {
    const c = await client();
    return check(await c.auth.signInWithPassword({ email, password })).session;
  },
  async signOut() {
    const c = await client();
    await c.auth.signOut();
  },
  async resetPassword(email) {
    const c = await client();
    check(await c.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname }));
  },
  async updatePassword(password) {
    const c = await client();
    check(await c.auth.updateUser({ password }));
  },
  // Live updates from the other phone
  async subscribe(cb) {
    const c = await client();
    c.channel('cb-all').on('postgres_changes', { event: '*', schema: 'public' }, payload => cb(payload)).subscribe();
  },
  async loadAll() {
    const c = await client();
    const out = {};
    const results = await Promise.all([
      ...TABLES.map(t => fetchAll(c, t)),
      c.from('settings').select('*').eq('id', 1),
      fetchAll(c, 'overheads'),
      fetchAll(c, 'events'),
      fetchAll(c, 'tasks'),
      fetchAll(c, 'notes'),
      c.from('messages').select('*').order('created_at', { ascending: false }).limit(100),
      c.from('members').select('email, who'),
      c.from('inbox_items').select('*').order('created_at', { ascending: false }).limit(200),
      c.from('docs').select('*').order('created_at', { ascending: false }).limit(500),
      c.from('contacts').select('*').order('name').limit(2000),
      c.from('activity').select('*').order('at', { ascending: false }).limit(400),
      c.from('mileage').select('*').order('trip_date', { ascending: false }).limit(2000),
    ]);
    TABLES.forEach((t, i) => { out[t] = check(results[i]); });
    const s = check(results[TABLES.length]);
    // Overheads table is optional: the app still works if schema.sql hasn't been re-run
    const oh = results[TABLES.length + 1];
    out.overheads = oh.error ? [] : oh.data;
    out.overheadsMissing = !!oh.error;
    // Calendar entries table is optional: the app still works if schema.sql hasn't been re-run
    const ev = results[TABLES.length + 2];
    out.events = ev.error ? [] : ev.data;
    out.eventsMissing = !!ev.error;
    // To do items table is optional: the app still works if schema.sql hasn't been re-run
    const tk = results[TABLES.length + 3];
    out.tasks = tk.error ? [] : tk.data;
    out.tasksMissing = !!tk.error;
    // Notes table is optional: the app still works if schema.sql hasn't been re-run
    const nt = results[TABLES.length + 4];
    out.notes = nt.error ? [] : nt.data;
    out.notesMissing = !!nt.error;
    // Messages and the member list are optional too
    const ms = results[TABLES.length + 5];
    out.messages = ms.error ? [] : ms.data;
    out.messagesMissing = !!ms.error;
    const mb = results[TABLES.length + 6];
    out.members = mb.error ? [] : mb.data;
    // Inbox for Claude (invoices and requests) is optional too
    const ib = results[TABLES.length + 7];
    out.inbox_items = ib.error ? [] : ib.data;
    out.inboxMissing = !!ib.error;
    // Quotes & invoices from the Quotes tab
    const dc = results[TABLES.length + 8];
    out.docs = dc.error ? [] : dc.data;
    out.docsMissing = !!dc.error;
    // Contact book
    const ct = results[TABLES.length + 9];
    out.contacts = ct.error ? [] : ct.data;
    out.contactsMissing = !!ct.error;
    // Who changed what
    const ac = results[TABLES.length + 10];
    out.activity = ac.error ? [] : ac.data;
    out.activityMissing = !!ac.error;
    const mi = results[TABLES.length + 11];
    out.mileage = mi.error ? [] : mi.data;
    out.mileageMissing = !!mi.error;
    out.settingsMissing = !s.length;
    out.settings = s[0]?.data || {};
    return out;
  },
  async insert(table, row) {
    const c = await client();
    return check(await c.from(table).insert(row).select().single());
  },
  async update(table, id, patch) {
    const c = await client();
    return check(await c.from(table).update(patch).eq('id', id).select().single());
  },
  async remove(table, id) {
    const c = await client();
    check(await c.from(table).delete().eq('id', id));
  },
  async saveSettings(data) {
    const c = await client();
    check(await c.from('settings').upsert({ id: 1, data }));
  },
  async upload(path, blob) {
    const c = await client();
    check(await c.storage.from(BUCKET).upload(path, blob, { contentType: blob.type || 'image/jpeg', upsert: false }));
  },
  async fileUrls(paths) {
    if (!paths.length) return {};
    const c = await client();
    const data = check(await c.storage.from(BUCKET).createSignedUrls(paths, 60 * 60 * 6));
    const map = {};
    data.forEach(d => { if (d.signedUrl) map[d.path] = d.signedUrl; });
    return map;
  },
  async removeFiles(paths) {
    if (!paths.length) return;
    const c = await client();
    check(await c.storage.from(BUCKET).remove(paths));
  },
  // ----- Phone notifications (one row per phone that has them turned on)
  pushSupported: true,
  async pushGet(endpoint) {
    const c = await client();
    const { data, error } = await c.from('push_subs').select('*').eq('endpoint', endpoint).maybeSingle();
    if (error) throw error;
    return data;
  },
  async pushSave(sub, prefs, device) {
    const c = await client();
    const j = sub.toJSON();
    const row = { endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, device, updated_at: new Date().toISOString() };
    if (prefs) row.prefs = prefs;
    return check(await c.from('push_subs').upsert(row, { onConflict: 'endpoint' }).select().single());
  },
  async pushPrefs(endpoint, prefs) {
    const c = await client();
    check(await c.from('push_subs').update({ prefs, updated_at: new Date().toISOString() }).eq('endpoint', endpoint));
  },
  async pushRemove(endpoint) {
    const c = await client();
    check(await c.from('push_subs').delete().eq('endpoint', endpoint));
  },
  async sendMessage(row) {
    const c = await client();
    const saved = check(await c.from('messages').insert(row).select().single());
    const { data, error } = await c.functions.invoke('notify', { body: { message_id: saved.id } });
    return { saved, delivered: error ? 0 : data?.delivered || 0, phones: error ? 0 : data?.phones || 0, error: error?.message };
  },
  async pushTest(endpoint) {
    const c = await client();
    const { data, error } = await c.functions.invoke('notify', { body: { test: true, endpoint } });
    if (error) throw error;
    return data;
  },
};

// ---------------------------------------------------------------- Demo store
const KEY = 'cbjobs-demo-v1';
function readStore() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && s.jobs) return s;
  } catch { /* ignore */ }
  return { jobs: [], costs: [], payments: [], photos: [], overheads: [], events: [], tasks: [], notes: [], messages: [], settings: {}, files: {} };
}
function writeStore(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); }
  catch { throw new Error('Demo storage is full — remove some photos (real setup has no such limit).'); }
}

// Demo photos live in IndexedDB (much more room than localStorage)
function idbOpen() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('cbjobs-files', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('files');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbDo(mode, fn) {
  const d = await idbOpen();
  return new Promise((res, rej) => {
    const tx = d.transaction('files', mode);
    const req = fn(tx.objectStore('files'));
    tx.oncomplete = () => res(req?.result);
    tx.onerror = () => rej(tx.error);
  });
}
const blobUrls = {};

const local = {
  async session() { return { user: { email: 'demo@local' } }; },
  async onAuth() {},
  async signIn() { return this.session(); },
  async signOut() {},
  async resetPassword() { throw new Error('Not available in demo mode'); },
  async updatePassword() { throw new Error('Not available in demo mode'); },
  async subscribe() {},
  async loadAll() {
    const s = readStore();
    const out = { settings: s.settings || {}, settingsMissing: false };
    [...TABLES, 'overheads', 'events', 'tasks', 'notes', 'messages', 'inbox_items', 'docs', 'contacts', 'activity', 'mileage'].forEach(t => { out[t] = structuredClone(s[t] || []); });
    out.messages.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    out.members = [];
    return out;
  },
  async sendMessage(row) {
    const saved = await this.insert('messages', { from_email: 'demo@local', read_at: null, ...row });
    return { saved, delivered: 0, phones: 0, demo: true };
  },
  async insert(table, row) {
    const s = readStore();
    const r = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...row };
    if (table === 'jobs') {
      r.ref = (s.jobs.reduce((m, j) => Math.max(m, j.ref || 0), 0)) + 1;
      r.updated_at = r.created_at;
    }
    (s[table] ||= []).push(r);
    writeStore(s);
    return structuredClone(r);
  },
  async update(table, id, patch) {
    const s = readStore();
    const r = (s[table] || []).find(x => x.id === id);
    if (!r) throw new Error('Not found');
    Object.assign(r, patch);
    if (table === 'jobs') r.updated_at = new Date().toISOString();
    writeStore(s);
    return structuredClone(r);
  },
  async remove(table, id) {
    const s = readStore();
    s[table] = (s[table] || []).filter(x => x.id !== id);
    if (table === 'jobs') {
      (s.events || []).forEach(e => { if (e.job_id === id) e.job_id = null; });
      ['costs', 'payments', 'photos'].forEach(t => {
        s[t] = s[t].filter(x => x.job_id !== id);
      });
    }
    writeStore(s);
  },
  async saveSettings(data) {
    const s = readStore();
    s.settings = data;
    writeStore(s);
  },
  async upload(path, blob) {
    try { await idbDo('readwrite', st => st.put(blob, path)); return; } catch { /* fall back to localStorage */ }
    const dataUrl = await new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result);
      fr.onerror = rej;
      fr.readAsDataURL(blob);
    });
    const s = readStore();
    s.files = s.files || {};
    s.files[path] = dataUrl;
    writeStore(s);
  },
  async fileUrls(paths) {
    const s = readStore();
    const map = {};
    for (const p of paths) {
      if (s.files?.[p]) { map[p] = s.files[p]; continue; }
      if (blobUrls[p]) { map[p] = blobUrls[p]; continue; }
      try {
        const b = await idbDo('readonly', st => st.get(p));
        if (b) map[p] = blobUrls[p] = URL.createObjectURL(b);
      } catch { /* ignore */ }
    }
    return map;
  },
  async removeFiles(paths) {
    const s = readStore();
    paths.forEach(p => { delete s.files?.[p]; });
    writeStore(s);
    for (const p of paths) { try { await idbDo('readwrite', st => st.delete(p)); } catch { /* ignore */ } }
  },
  resetDemo() { localStorage.removeItem(KEY); try { indexedDB.deleteDatabase('cbjobs-files'); } catch { /* ignore */ } },
};

export const db = DEMO ? local : remote;
