-- =====================================================================
-- C&B Jobs — Supabase database setup
-- Paste this whole file into Supabase > SQL Editor > New query > Run.
-- BEFORE RUNNING: change the two email addresses in section 1 to the
-- emails you and your partner will log in with.
-- Safe to re-run: it won't delete existing data.
-- =====================================================================

-- 1. MEMBERS — only these emails can see or change anything ------------
create table if not exists public.members (
  email text primary key
);

insert into public.members (email) values
  ('lbaker3012000@gmail.com'),
  ('hc.jobs@outlook.com')
on conflict do nothing;

alter table public.members enable row level security;
-- No policies on members: it can't be read or changed from the app.

create or replace function public.is_member()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.members
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- 2. SETTINGS (one row of business details as JSON) --------------------
create table if not exists public.settings (
  id int primary key default 1 check (id = 1),
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
insert into public.settings (id) values (1) on conflict do nothing;

-- 3. JOBS --------------------------------------------------------------
create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  ref bigint generated always as identity,
  title text not null,
  status text not null default 'quoted'
    check (status in ('quoted', 'active', 'finished', 'declined')),
  customer_name text,
  customer_phone text,
  customer_email text,
  address text,
  postcode text,
  description text,          -- scope of works (shown on quote/invoice)
  notes text,                -- internal notes (never shown to customer)
  price numeric(12,2) not null default 0,   -- fixed price, ex-VAT
  vat_applies boolean not null default false,
  vat_rate numeric(5,2) not null default 20,
  chased_at date,                           -- last time quote/invoice was chased
  who text not null default 'both' check (who in ('both','a','b')), -- who did it: both = 50/50, a = Henry only, b = Luke only
  quote_date date,
  quote_valid_days int default 30,
  start_date date,
  end_date date,
  finished_date date,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 4. COSTS (materials etc. — who paid for them) -------------------------
create table if not exists public.costs (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  description text not null,
  category text not null default 'materials',
  qty numeric(12,3) not null default 1,
  unit_cost numeric(12,2) not null default 0,
  supplier text,
  paid_by text not null default 'a' check (paid_by in ('a', 'b')),
  cost_date date,
  created_at timestamptz not null default now()
);

-- 6. PAYMENTS (deposits, stage payments, final) -------------------------
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  pay_date date,
  amount numeric(12,2) not null default 0,
  kind text not null default 'deposit',
  method text default 'bank',
  received_by text not null default 'a' check (received_by in ('a', 'b')),
  note text,
  created_at timestamptz not null default now()
);

-- 7. PHOTOS (files live in the job-photos storage bucket) ---------------
create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  path text not null,
  kind text default 'site',
  caption text,
  created_at timestamptz not null default now()
);

-- 7b. OVERHEADS (regular business costs: Checkatrade, insurance, van...)
create table if not exists public.overheads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default 'other',
  amount numeric(12,2) not null default 0,
  frequency text not null default 'monthly'
    check (frequency in ('weekly', 'monthly', 'quarterly', 'yearly', 'oneoff')),
  paid_by text not null default 'a' check (paid_by in ('a', 'b', 'split')),
  start_date date,
  end_date date,          -- leave empty while it's still running
  notes text,
  created_at timestamptz not null default now()
);

-- 7c. CALENDAR ENTRIES (site visits, collections, holidays...)
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  kind text not null default 'visit'
    check (kind in ('visit', 'collect', 'vehicle', 'meeting', 'away', 'other')),
  event_date date not null,
  end_date date,            -- for multi-day entries like holidays
  start_time time,
  who text not null default 'both' check (who in ('a', 'b', 'both')),
  job_id uuid references public.jobs(id) on delete set null,
  notes text,
  done boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists events_date_idx on public.events(event_date);

-- 7d. TO DO ITEMS (typed in with the + on the To do box)
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  text text not null,
  done boolean not null default false,
  done_at timestamptz,
  created_by text,
  created_at timestamptz not null default now()
);

-- Added later: safe to run on an existing database
alter table public.jobs add column if not exists who text not null default 'both';

-- General notes: anything that doesn't fit a job (codes, supplier info, ideas...)
create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  text text not null default '',
  pinned boolean not null default false,
  created_by text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists costs_job_idx on public.costs(job_id);
create index if not exists payments_job_idx on public.payments(job_id);
create index if not exists photos_job_idx on public.photos(job_id);

-- keep jobs.updated_at fresh
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists jobs_touch on public.jobs;
create trigger jobs_touch before update on public.jobs
  for each row execute function public.touch_updated_at();
drop trigger if exists notes_touch on public.notes;
create trigger notes_touch before update on public.notes
  for each row execute function public.touch_updated_at();

drop trigger if exists settings_touch on public.settings;
create trigger settings_touch before update on public.settings
  for each row execute function public.touch_updated_at();

-- 8. ROW LEVEL SECURITY — members only ----------------------------------
do $$
declare t text;
begin
  foreach t in array array['settings','jobs','costs','payments','photos','overheads','events','tasks','notes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "members only" on public.%I', t);
    execute format(
      'create policy "members only" on public.%I for all to authenticated
         using (public.is_member()) with check (public.is_member())', t);
  end loop;
end $$;

-- 9. PHOTO STORAGE (private bucket) -------------------------------------
insert into storage.buckets (id, name, public)
values ('job-photos', 'job-photos', false)
on conflict (id) do nothing;

drop policy if exists "members read photos" on storage.objects;
drop policy if exists "members add photos" on storage.objects;
drop policy if exists "members delete photos" on storage.objects;

create policy "members read photos" on storage.objects
  for select to authenticated
  using (bucket_id = 'job-photos' and public.is_member());

create policy "members add photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'job-photos' and public.is_member());

create policy "members delete photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'job-photos' and public.is_member());

-- 10. LIVE SYNC between phones ----------------------------------------
do $$
declare t text;
begin
  foreach t in array array['jobs','costs','payments','photos','overheads','settings','events','tasks','notes'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- ============================================================
-- Phone notifications (added 17 Nov 2026)
-- The sender lives in supabase/functions/notify. Its keys are kept in
-- app_secrets, which the app itself can never read.
-- ============================================================
alter table public.members add column if not exists who text check (who in ('a','b'));  -- a = Henry, b = Luke

create table if not exists public.push_subs (
  id uuid primary key default gen_random_uuid(),
  email text not null default lower(auth.jwt() ->> 'email'),
  who text check (who in ('a','b')),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  prefs jsonb not null default '{"morning":true,"visits":true,"jobs":true,"money":true,"changes":false}',
  device text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.push_subs enable row level security;
drop policy if exists "own devices" on public.push_subs;
create policy "own devices" on public.push_subs for all to authenticated
  using (public.is_member() and lower(email) = lower(auth.jwt() ->> 'email'))
  with check (public.is_member() and lower(email) = lower(auth.jwt() ->> 'email'));

create table if not exists public.push_log (key text primary key, sent_at timestamptz not null default now());
alter table public.push_log enable row level security;
create table if not exists public.app_secrets (key text primary key, value text not null);
alter table public.app_secrets enable row level security;

alter table public.costs add column if not exists created_by text default lower(auth.jwt() ->> 'email');
alter table public.payments add column if not exists created_by text default lower(auth.jwt() ->> 'email');
alter table public.events add column if not exists created_by text default lower(auth.jwt() ->> 'email');
-- The 15-minute schedule (pg_cron + pg_net) is created once in Supabase; see README.

-- To-dos: due dates and multi-step lists (added 17 Nov 2026)
alter table public.tasks add column if not exists due_date date;
alter table public.tasks add column if not exists steps jsonb;  -- null = quick to-do; [{id,text,done,done_at}] = multi-step

-- Messages between Henry and Luke (added 17 Nov 2026)
drop policy if exists "members can read members" on public.members;
create policy "members can read members" on public.members for select to authenticated using (public.is_member());
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  from_email text not null default lower(auth.jwt() ->> 'email'),
  to_who text not null check (to_who in ('a','b')),
  text text not null check (length(trim(text)) > 0),
  job_id uuid references public.jobs(id) on delete set null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists messages_created_idx on public.messages (created_at desc);
alter table public.messages enable row level security;
drop policy if exists "members only" on public.messages;
create policy "members only" on public.messages for all to authenticated using (public.is_member()) with check (public.is_member());
-- Photos in messages (added 17 Nov 2026). Stored in the job-photos bucket under chat/
alter table public.messages add column if not exists photo_path text;
alter table public.messages drop constraint if exists messages_text_check;
alter table public.messages add constraint messages_text_check check (length(trim(text)) > 0 or photo_path is not null);
alter table public.messages alter column text set default '';

-- Inbox: invoices and requests for Claude to sort out, with an Approve step (added 17 Nov 2026)
-- status: reading (phone still reading the file) → new → proposed / question → approved / rejected
create table if not exists public.inbox_items (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'invoice' check (kind in ('invoice','request')),
  text text,                 -- what was typed (request, or a note with the invoice)
  file_path text,            -- in the job-photos bucket under inbox/
  file_name text,
  file_type text,
  extracted_text text,       -- invoice text read on the phone (PDF text or photo OCR)
  job_id uuid references public.jobs(id) on delete set null,
  paid_by text check (paid_by in ('a','b')),
  status text not null default 'new' check (status in ('reading','new','proposed','question','approved','rejected')),
  proposal jsonb,            -- {summary, actions:[{type,label,...}]}
  question text,             -- Claude's question
  answer text,               -- reply to the question / change request
  claude_note text,
  processed_at timestamptz,
  decided_by text,
  decided_at timestamptz,
  created_by text default lower(auth.jwt() ->> 'email'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists inbox_status_idx on public.inbox_items (status, created_at);
alter table public.inbox_items enable row level security;
drop policy if exists "members only" on public.inbox_items;
create policy "members only" on public.inbox_items for all to authenticated using (public.is_member()) with check (public.is_member());
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'inbox_items') then
    alter publication supabase_realtime add table public.inbox_items;
  end if;
end $$;

-- Quotes & invoices made in the Quotes tab (added 19 Nov 2026)
-- profile: 'cb' = Cunningham & Baker, 'htp' = Henry The Plumber
create table if not exists public.docs (
  id uuid primary key default gen_random_uuid(),
  profile text not null default 'cb' check (profile in ('cb','htp')),
  doc_type text not null default 'quote' check (doc_type in ('quote','invoice')),
  number integer not null,
  job_id uuid references public.jobs(id) on delete set null,
  customer jsonb not null default '{}'::jsonb,     -- {name, addr1, town, postcode}
  doc_date date not null default current_date,
  categories jsonb not null default '[]'::jsonb,   -- [{heading, lines:[...]}]
  total numeric(12,2) not null default 0,
  pay_to text not null default 'primary' check (pay_to in ('primary','second')),
  paid_to_date numeric(12,2) not null default 0,
  paid_note text,
  business jsonb,                                  -- business & bank details as printed
  from_quote uuid references public.docs(id) on delete set null,
  created_by text default lower(auth.jwt() ->> 'email'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists docs_job_idx on public.docs (job_id);
alter table public.docs enable row level security;
drop policy if exists "members only" on public.docs;
create policy "members only" on public.docs for all to authenticated using (public.is_member()) with check (public.is_member());
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'docs') then
    alter publication supabase_realtime add table public.docs;
  end if;
end $$;
-- "All materials included" printed on its own after the list of works (19 Nov 2026)
alter table public.docs add column if not exists materials_included boolean not null default false;
