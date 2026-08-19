-- 0073 — four more billing subsidiaries, and a wider set of trip purposes.
--
-- 1. Flora Gas, Flora Solar, Mountplus and Sbali now get charged for transport,
--    so they need to exist as billing entities. Country defaults to ZW; change
--    it on the subsidiary screen if any of them bills out of South Africa.
--
-- 2. The seven original purposes did not cover most of what the fleet actually
--    does — ferrying staff, fetching fuel, banking runs, moving a vehicle
--    between branches. Drivers were forced into "other", which tells the office
--    nothing when it comes to allocating cost.
--
-- 3. purpose_detail lets a driver say in their own words what the trip was for.
--    It is always available, not only under "other": even a delivery is easier
--    to bill when the note says which customer.

insert into app.subsidiaries (code, name, country, is_active) values
  ('FLORA_GAS',   'Flora Gas',   'ZW', true),
  ('FLORA_SOLAR', 'Flora Solar', 'ZW', true),
  ('MOUNTPLUS',   'Mountplus',   'ZW', true),
  ('SBALI',       'Sbali',       'ZW', true)
on conflict (code) do nothing;

alter type app.trip_purpose add value if not exists 'staff_transport';
alter type app.trip_purpose add value if not exists 'fuel_run';
alter type app.trip_purpose add value if not exists 'procurement';
alter type app.trip_purpose add value if not exists 'site_visit';
alter type app.trip_purpose add value if not exists 'banking';
alter type app.trip_purpose add value if not exists 'airport_transfer';
alter type app.trip_purpose add value if not exists 'vehicle_transfer';
alter type app.trip_purpose add value if not exists 'training';
alter type app.trip_purpose add value if not exists 'emergency';

alter table app.trips add column if not exists purpose_detail text;

comment on column app.trips.purpose_detail is
  'Driver''s own words for what the trip was for — free text, always optional.';
