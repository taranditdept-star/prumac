-- 0074 — transport jobs: the missing link between a customer asking for a
-- truck and the invoice at the end.
--
-- Trips are recorded only once they are under way, so nothing in the system
-- knows a job was requested, what it was quoted at, or whether it was ever
-- billed. That is how 88 completed trips ended up with no invoice against them.
--
-- A job carries the request, the quote, the assignment, and a link to the trip
-- it becomes — one row followed from phone call to payment.

create type app.job_status as enum (
  'requested',   -- customer has asked for a vehicle
  'quoted',      -- a price has been worked out from the rate card
  'approved',    -- customer accepted the quote
  'assigned',    -- vehicle and driver allocated
  'in_progress', -- the driver has started the trip
  'completed',   -- trip finished; ready to invoice
  'declined',    -- customer did not accept
  'cancelled'
);

create table if not exists app.transport_jobs (
  id                uuid primary key default gen_random_uuid(),
  reference         text not null unique,

  -- who wants it
  subsidiary_id     uuid not null references app.subsidiaries(id) on delete restrict,
  requested_by      uuid references app.profiles(id) on delete set null,
  contact_name      text,
  contact_phone     text,

  -- what is being asked for
  pickup_label      text not null,
  dropoff_label     text not null,
  distance_km       numeric(10,1) check (distance_km is null or distance_km >= 0),
  cargo_description text,
  load_count        integer check (load_count is null or load_count >= 0),
  vehicle_class     app.vehicle_class,
  required_at       timestamptz,
  is_urgent         boolean not null default false,
  notes             text,

  -- the quote, priced off the same rate card the invoice will use
  quoted_rate_id    uuid references app.billing_rates(id) on delete set null,
  quoted_mode       app.billing_mode,
  quoted_unit       numeric(12,4),
  quoted_amount     numeric(14,2) check (quoted_amount is null or quoted_amount >= 0),
  quoted_currency   text default 'USD',
  quoted_at         timestamptz,
  quoted_by         uuid references app.profiles(id) on delete set null,
  quote_notes       text,

  -- allocation
  vehicle_id        uuid references app.vehicles(id) on delete set null,
  driver_id         uuid references app.drivers(id) on delete set null,
  assigned_at       timestamptz,
  assigned_by       uuid references app.profiles(id) on delete set null,

  -- what it became
  trip_id           uuid references app.trips(id) on delete set null,

  status            app.job_status not null default 'requested',
  closed_reason     text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- A job cannot be assigned without both a vehicle and a driver: half an
  -- allocation is how a truck ends up double-booked.
  constraint jobs_assigned_has_both check (
    status not in ('assigned','in_progress','completed')
    or (vehicle_id is not null and driver_id is not null)
  ),
  constraint jobs_quoted_has_amount check (
    status not in ('quoted','approved') or quoted_amount is not null
  )
);

create index if not exists transport_jobs_status_idx on app.transport_jobs (status, required_at);
create index if not exists transport_jobs_subsidiary_idx on app.transport_jobs (subsidiary_id);
create index if not exists transport_jobs_vehicle_idx on app.transport_jobs (vehicle_id)
  where vehicle_id is not null;
create index if not exists transport_jobs_trip_idx on app.transport_jobs (trip_id)
  where trip_id is not null;

-- JOB-2026-0001, restarting each year so the reference stays readable.
create sequence if not exists app.transport_job_seq;

create or replace function app.fn_next_job_reference()
returns text
language sql volatile
set search_path = app, pg_catalog
as $$
  select 'JOB-' || to_char(now(), 'YYYY') || '-' ||
         lpad(nextval('app.transport_job_seq')::text, 4, '0');
$$;

create or replace function app.tg_transport_jobs_touch()
returns trigger
language plpgsql
set search_path = app, pg_catalog
as $$
begin
  new.updated_at := now();
  if new.reference is null or new.reference = '' then
    new.reference := app.fn_next_job_reference();
  end if;
  return new;
end;
$$;

drop trigger if exists transport_jobs_touch on app.transport_jobs;
create trigger transport_jobs_touch
  before insert or update on app.transport_jobs
  for each row execute function app.tg_transport_jobs_touch();

-- Prices a job off the rate card, using the SAME resolver the invoice uses
-- (app.fn_effective_rate) so a quote can never disagree with the eventual bill.
create or replace function app.fn_quote_job(
  p_vehicle_id    uuid,
  p_subsidiary_id uuid,
  p_distance_km   numeric,
  p_load_count    integer default 1,
  p_at            date default current_date
)
returns table (rate_id uuid, mode app.billing_mode, unit_amount numeric,
               quantity numeric, amount numeric, currency text)
language plpgsql stable
set search_path = app, pg_catalog
as $$
declare
  v_rate app.billing_rates%rowtype;
begin
  v_rate := app.fn_effective_rate(p_vehicle_id, p_subsidiary_id, p_at);
  if v_rate.id is null then
    return;   -- no rate on file: the caller shows "no rate set" rather than guessing
  end if;

  rate_id := v_rate.id;
  mode := v_rate.mode;
  unit_amount := v_rate.rate_amount;
  currency := v_rate.currency;

  if v_rate.mode = 'per_km' then
    quantity := coalesce(p_distance_km, 0);
  elsif v_rate.mode = 'per_load' then
    quantity := greatest(coalesce(p_load_count, 1), 1);
  elsif v_rate.mode = 'fixed_monthly' then
    quantity := 1;
  else
    -- per_litre_100km depends on fuel actually burned, which is unknowable
    -- before the trip runs. Quote the distance and flag it in the UI.
    quantity := coalesce(p_distance_km, 0);
  end if;

  amount := round(quantity * unit_amount, 2);
  return next;
end;
$$;

grant execute on function app.fn_quote_job(uuid, uuid, numeric, integer, date)
  to authenticated, service_role;

alter table app.transport_jobs enable row level security;

-- Managers and admins run dispatch.
create policy transport_jobs_read_staff on app.transport_jobs
  for select using (app.role_is('fleet_manager') or app.role_is('admin'));
create policy transport_jobs_write_staff on app.transport_jobs
  for all using (app.role_is('fleet_manager') or app.role_is('admin'))
  with check (app.role_is('fleet_manager') or app.role_is('admin'));

-- A billing user sees only their own subsidiary's jobs — this is what a
-- customer portal will read.
create policy transport_jobs_read_own on app.transport_jobs
  for select using (
    app.role_is('subsidiary_billing')
    and subsidiary_id = (select subsidiary_id from app.profiles where id = auth.uid())
  );

-- A driver sees the job they are on, so the cab knows what it is carrying.
create policy transport_jobs_read_driver on app.transport_jobs
  for select using (driver_id = app.current_driver_id());

select app.fn_attach_audit('app.transport_jobs');

comment on table app.transport_jobs is
  'A transport request followed from enquiry through quote, assignment and trip to invoice.';
