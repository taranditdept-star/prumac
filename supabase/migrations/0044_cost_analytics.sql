-- 0044_cost_analytics.sql
-- ---------------------------------------------------------------------------
-- Operating-cost analytics for the reports/costs dashboard: cost-per-km, fuel
-- efficiency, and maintenance spend.
--   Maintenance = service_records.total_amount (reliable).
--   Fuel        = fuel_logs (litres + total_cost) ONLY — trips.fuel_amount is
--                 import-derived and semantically ambiguous (for tankers it is
--                 cargo value, not diesel cost), so it is deliberately excluded.
--   km          = completed-trip odometer deltas.
-- Fuel figures therefore reflect logged fuel-card fills and grow as drivers log
-- fuel; maintenance and distance are complete.
-- ---------------------------------------------------------------------------
BEGIN;

CREATE OR REPLACE FUNCTION app.fn_fleet_cost_summary(p_start date, p_end date)
RETURNS TABLE (
  total_km            numeric,
  fuel_spend          numeric,
  fuel_litres         numeric,
  maintenance_spend   numeric,
  maintenance_routine numeric,
  maintenance_repair  numeric,
  operating_cost      numeric,
  cost_per_km         numeric,
  avg_l_100km         numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app, pg_catalog AS $$
  WITH km AS (
    SELECT COALESCE(SUM(GREATEST(end_odometer_km - start_odometer_km, 0)), 0)::numeric AS v
    FROM app.trips
    WHERE status = 'completed' AND completed_at::date >= p_start AND completed_at::date < p_end
  ),
  lf AS (
    SELECT COALESCE(SUM(total_cost), 0)::numeric AS cost, COALESCE(SUM(litres), 0)::numeric AS litres
    FROM app.fuel_logs
    WHERE filled_at::date >= p_start AND filled_at::date < p_end
  ),
  mt AS (
    SELECT COALESCE(SUM(total_amount), 0)::numeric AS total,
           COALESCE(SUM(total_amount) FILTER (WHERE is_routine_service), 0)::numeric AS routine,
           COALESCE(SUM(total_amount) FILTER (WHERE NOT is_routine_service), 0)::numeric AS repair
    FROM app.service_records
    WHERE performed_at >= p_start AND performed_at < p_end
  )
  SELECT
    km.v,
    lf.cost,
    lf.litres,
    mt.total, mt.routine, mt.repair,
    (lf.cost + mt.total),
    CASE WHEN km.v > 0 THEN ROUND((lf.cost + mt.total) / km.v, 4) END,
    CASE WHEN km.v > 0 AND lf.litres > 0 THEN ROUND(lf.litres / km.v * 100, 2) END
  FROM km, lf, mt;
$$;
GRANT EXECUTE ON FUNCTION app.fn_fleet_cost_summary(date, date) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION app.fn_vehicle_cost_breakdown(p_start date, p_end date)
RETURNS TABLE (
  vehicle_id        uuid,
  plate_number      text,
  plate_country     app.country_code,
  make              text,
  model             text,
  km                numeric,
  fuel_spend        numeric,
  maintenance_spend numeric,
  operating_cost    numeric,
  cost_per_km       numeric,
  l_100km           numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app, pg_catalog AS $$
  WITH km AS (
    SELECT vehicle_id, SUM(GREATEST(end_odometer_km - start_odometer_km, 0))::numeric AS km
    FROM app.trips
    WHERE status = 'completed' AND completed_at::date >= p_start AND completed_at::date < p_end
    GROUP BY vehicle_id
  ),
  lf AS (
    SELECT vehicle_id, SUM(total_cost)::numeric AS fuel, SUM(litres)::numeric AS litres
    FROM app.fuel_logs WHERE filled_at::date >= p_start AND filled_at::date < p_end GROUP BY vehicle_id
  ),
  mt AS (
    SELECT vehicle_id, SUM(total_amount)::numeric AS maint
    FROM app.service_records WHERE performed_at >= p_start AND performed_at < p_end GROUP BY vehicle_id
  )
  SELECT
    v.id, v.plate_number, v.plate_country, v.make, v.model,
    COALESCE(km.km, 0),
    COALESCE(lf.fuel, 0),
    COALESCE(mt.maint, 0),
    COALESCE(lf.fuel, 0) + COALESCE(mt.maint, 0),
    CASE WHEN COALESCE(km.km, 0) > 0
         THEN ROUND((COALESCE(lf.fuel, 0) + COALESCE(mt.maint, 0)) / km.km, 4) END,
    CASE WHEN COALESCE(km.km, 0) > 0 AND COALESCE(lf.litres, 0) > 0
         THEN ROUND(COALESCE(lf.litres, 0) / km.km * 100, 2) END
  FROM app.vehicles v
  LEFT JOIN km ON km.vehicle_id = v.id
  LEFT JOIN lf ON lf.vehicle_id = v.id
  LEFT JOIN mt ON mt.vehicle_id = v.id
  WHERE v.status <> 'decommissioned'
    AND (km.vehicle_id IS NOT NULL OR lf.vehicle_id IS NOT NULL OR mt.vehicle_id IS NOT NULL)
  ORDER BY (COALESCE(lf.fuel, 0) + COALESCE(mt.maint, 0)) DESC, COALESCE(km.km, 0) DESC;
$$;
GRANT EXECUTE ON FUNCTION app.fn_vehicle_cost_breakdown(date, date) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION app.fn_maintenance_spend_trend(p_months integer DEFAULT 12)
RETURNS TABLE (month_start date, month_label text, routine numeric, repair numeric, total numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = app, pg_catalog AS $$
  WITH months AS (
    SELECT (date_trunc('month', now()) - (interval '1 month' * g))::date AS ms
    FROM generate_series(0, p_months - 1) AS g
  )
  SELECT
    m.ms,
    to_char(m.ms, 'Mon YYYY'),
    COALESCE(SUM(sr.total_amount) FILTER (WHERE sr.is_routine_service), 0)::numeric,
    COALESCE(SUM(sr.total_amount) FILTER (WHERE NOT sr.is_routine_service), 0)::numeric,
    COALESCE(SUM(sr.total_amount), 0)::numeric
  FROM months m
  LEFT JOIN app.service_records sr ON date_trunc('month', sr.performed_at)::date = m.ms
  GROUP BY m.ms
  ORDER BY m.ms;
$$;
GRANT EXECUTE ON FUNCTION app.fn_maintenance_spend_trend(integer) TO authenticated, service_role;

COMMIT;
