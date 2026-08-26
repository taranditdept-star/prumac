-- 0075 — memory for Chitsano's watchers.
--
-- The point of a watcher is to notice things nobody asked about: 11 licence
-- discs already expired, 92 invoices past 90 days, 24 drivers who have never
-- signed in. The danger is repetition — an alert that arrives every morning
-- stops being read by Wednesday, and then the one that matters is missed too.
--
-- So each finding is remembered. It is announced when it first appears, when it
-- gets worse, or once its cooldown has passed — never simply because the cron
-- ran again.

create table if not exists app.chitsano_alerts (
  id               uuid primary key default gen_random_uuid(),
  watcher          text not null,          -- 'documents', 'receivables', …
  subject_key      text not null,          -- stable id for the thing being watched
  level            text not null check (level in ('info','warn','urgent')),
  summary          text not null,
  first_seen_at    timestamptz not null default now(),
  last_announced_at timestamptz,
  times_announced  integer not null default 0,
  resolved_at      timestamptz,
  created_at       timestamptz not null default now(),
  unique (watcher, subject_key)
);

create index if not exists chitsano_alerts_open_idx
  on app.chitsano_alerts (watcher, resolved_at)
  where resolved_at is null;

alter table app.chitsano_alerts enable row level security;

-- Written by the cron through the service role. Managers may read the history.
create policy chitsano_alerts_read on app.chitsano_alerts
  for select using (app.role_is('fleet_manager') or app.role_is('admin'));

comment on table app.chitsano_alerts is
  'What Chitsano has already flagged, so a standing problem is not re-announced every morning.';
