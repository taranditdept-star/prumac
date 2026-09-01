-- 0076 — let a driver work with no signal.
--
-- Drivers lose signal constantly: depot yards, mine sites, most of the road
-- between Bulawayo and Gwanda. Today a trip start simply fails there, so the
-- odometer gets written on a hand and typed in hours later, or not at all —
-- which is why 15 of last month's trips carry no distance.
--
-- Work done offline is queued on the phone and replayed when signal returns.
-- Replay is the dangerous part: a flaky connection retries, and without a key
-- the driver ends up with three copies of the same trip. Every queued record
-- therefore carries a client_ref generated on the phone, unique per table, so a
-- replay updates rather than duplicates.

alter table app.trips add column if not exists client_ref uuid;
alter table app.inspections add column if not exists client_ref uuid;
alter table app.faults add column if not exists client_ref uuid;

create unique index if not exists trips_client_ref_key
  on app.trips (client_ref) where client_ref is not null;
create unique index if not exists inspections_client_ref_key
  on app.inspections (client_ref) where client_ref is not null;
create unique index if not exists faults_client_ref_key
  on app.faults (client_ref) where client_ref is not null;

comment on column app.trips.client_ref is
  'Client-generated id for work captured offline, so replaying the queue cannot duplicate the trip.';

-- The phone also records WHEN something happened, which is not when it arrives.
-- A trip started at 06:10 with no signal and synced at 11:40 must read 06:10,
-- otherwise every distance and duration figure is wrong.
alter table app.trips add column if not exists captured_offline boolean not null default false;
alter table app.inspections add column if not exists captured_offline boolean not null default false;
alter table app.faults add column if not exists captured_offline boolean not null default false;

comment on column app.trips.captured_offline is
  'True when the record was queued on a phone with no signal and synced later.';
