// C&B Jobs: sends phone notifications.
// Called every 15 minutes by a schedule in the database (with a shared secret),
// or by a signed-in member to send a message to their partner, or a test notification.
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { dueNotifications, londonNow, NAMES } from './logic.js';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-notify-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

async function secrets() {
  const { data, error } = await db.from('app_secrets').select('key, value');
  if (error) throw error;
  return Object.fromEntries((data || []).map(r => [r.key, r.value]));
}

async function all(table: string, cols = '*') {
  const { data, error } = await db.from(table).select(cols).limit(5000);
  if (error) throw new Error(`${table}: ${error.message}`);
  return data || [];
}

async function send(sub: any, payload: unknown) {
  try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload), { TTL: 60 * 60 * 6, urgency: 'high' });
    return 'sent';
  } catch (e: any) {
    // Phone has turned notifications off or reinstalled the app: forget this device
    if (e?.statusCode === 404 || e?.statusCode === 410) {
      await db.from('push_subs').delete().eq('id', sub.id);
      return 'gone';
    }
    console.error('push failed', e?.statusCode, e?.body || e?.message);
    return `failed ${e?.statusCode || ''}`.trim();
  }
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const s = await secrets();
    webpush.setVapidDetails(s.vapid_subject, s.vapid_public, s.vapid_private);
    const body = await req.json().catch(() => ({}));

    const auth = req.headers.get('Authorization') || '';
    const userEmail = async () => {
      const { data: u } = await db.auth.getUser(auth.replace(/^Bearer\s+/i, ''));
      return u?.user?.email?.toLowerCase() || null;
    };

    // A message from Henry to Luke (or the other way): deliver it now
    if (body.message_id) {
      const email = await userEmail();
      if (!email) return json({ error: 'Not signed in' }, 401);
      const { data: msg } = await db.from('messages').select('*').eq('id', body.message_id).maybeSingle();
      if (!msg || String(msg.from_email).toLowerCase() !== email) return json({ error: 'Message not found' }, 404);
      const members = (await all('members', 'email, who')) as any[];
      const fromWho = members.find(m => String(m.email).toLowerCase() === email)?.who;
      const toEmails = members.filter(m => m.who === msg.to_who).map(m => String(m.email).toLowerCase());
      const { data: subs } = await db.from('push_subs').select('*');
      let job: any = null;
      if (msg.job_id) job = (await db.from('jobs').select('id, address, title').eq('id', msg.job_id).maybeSingle()).data;
      const jobLabel = job ? (String(job.address || '').split('\n').map((x: string) => x.trim()).filter(Boolean).join(', ') || job.title) : '';
      const title = `Message from ${fromWho ? NAMES[fromWho as 'a' | 'b'] : email.split('@')[0]}${jobLabel ? ` · ${jobLabel}` : ''}`;
      let delivered = 0, phones = 0;
      for (const sub of (subs || []) as any[]) {
        if (!toEmails.includes(String(sub.email).toLowerCase())) continue;
        phones++;
        if (sub.prefs && sub.prefs.messages === false) continue;
        if ((await send(sub, { title, body: msg.text, url: job ? `#/job/${job.id}` : '#/jobs', tag: `msg:${msg.id}` })) === 'sent') delivered++;
      }
      return json({ delivered, phones });
    }

    // A member asking for a test notification on their own phones
    if (body.test) {
      const email = await userEmail();
      if (!email) return json({ error: 'Not signed in' }, 401);
      const { data: subs } = await db.from('push_subs').select('*').ilike('email', email);
      const results = [];
      for (const sub of subs || []) {
        if (body.endpoint && sub.endpoint !== body.endpoint) continue;
        results.push(await send(sub, { title: 'C&B Jobs', body: 'Notifications are working ✓', url: '#/settings', tag: 'test' }));
      }
      return json({ results });
    }

    // The 15-minute schedule
    if (req.headers.get('x-notify-secret') !== s.notify_secret) return json({ error: 'Forbidden' }, 403);

    const [jobs, costs, payments, events, tasks, overheads, settingsRows, subs] = await Promise.all([
      all('jobs'), all('costs'), all('payments'), all('events'), all('tasks'), all('overheads'), all('settings'), all('push_subs'),
    ]);
    if (!subs.length) return json({ sent: 0, note: 'no devices' });
    const nameByEmail: Record<string, string> = {};
    for (const m of (await all('members', 'email, who')) as any[]) if (m.who) nameByEmail[String(m.email).toLowerCase()] = NAMES[m.who as 'a' | 'b'];
    const whoByEmail: Record<string, string> = {};
    for (const [email, name] of Object.entries(nameByEmail)) whoByEmail[email] = name === NAMES.a ? 'a' : 'b';
    for (const sub of subs as any[]) {
      const email = String(sub.email).toLowerCase();
      if (!sub.who && whoByEmail[email]) sub.who = whoByEmail[email]; // Henry's phone gets Henry's visits
      if (sub.who && !nameByEmail[email]) nameByEmail[email] = NAMES[sub.who as 'a' | 'b'];
    }

    const now = londonNow();
    const since = body.since || new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const due = dueNotifications({ jobs, costs, payments, events, tasks, overheads, settings: (settingsRows[0] as any)?.data || {}, subs, nameByEmail }, now, since);
    if (body.dryRun) return json({ now, due: due.map(d => ({ to: d.sub.email, type: d.type, key: d.key, title: d.title, body: d.body })) });

    let sent = 0;
    const out = [];
    for (const d of due) {
      // Claim the key first so a notification can never go out twice
      const { error } = await db.from('push_log').insert({ key: d.key });
      if (error) continue; // already sent
      const r = await send(d.sub, { title: d.title, body: d.body, url: d.url, tag: d.key });
      if (r === 'sent') sent++;
      out.push({ key: d.key, r });
    }
    // Keep the log small
    await db.from('push_log').delete().lt('sent_at', new Date(Date.now() - 45 * 86400000).toISOString());
    return json({ now, sent, out });
  } catch (e: any) {
    console.error(e);
    return json({ error: String(e?.message || e) }, 500);
  }
});
