-- 0072 — odometer readings to one decimal place.
--
-- Every odometer reading was stored as a whole number, so a driver reading
-- 4890.4 off the dash had to round it. Over a month of trips that rounding
-- accumulates into the distance and fuel-consumption figures, and a replacement
-- instrument that starts at 4890.4 could not be entered at all.
--
-- numeric(10,1) — one decimal is what vehicle odometers and trip meters
-- actually show; asking for more invites false precision.
--
-- Interval settings (vehicles.service_interval_km, pm_plans.interval_km) stay
-- integer on purpose: a service policy is "every 5000 km", not 5000.4.

alter table app.accidents         alter column odometer_km            type numeric(10,1);
alter table app.faults            alter column odometer_km            type numeric(10,1);
alter table app.fuel_logs         alter column odometer_km            type numeric(10,1);
alter table app.inspections       alter column odometer_km            type numeric(10,1);
alter table app.repair_claims     alter column odometer_km            type numeric(10,1);
alter table app.service_records   alter column odometer_km            type numeric(10,1);
alter table app.tyre_events       alter column odometer_km            type numeric(10,1);
alter table app.tyres             alter column fitted_odometer_km     type numeric(10,1);
alter table app.vehicle_handovers alter column odometer_km            type numeric(10,1);
alter table app.pm_plans          alter column last_done_km           type numeric(10,1);

alter table app.trips
  alter column start_odometer_km type numeric(10,1),
  alter column end_odometer_km   type numeric(10,1);

alter table app.vehicles
  alter column current_odometer_km      type numeric(10,1),
  alter column last_service_odometer_km type numeric(10,1);

comment on column app.vehicles.current_odometer_km is
  'Latest odometer reading in km, to one decimal place.';
