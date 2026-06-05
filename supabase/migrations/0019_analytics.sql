-- Migration 0019: Analytics RPCs powering the /reports dashboard
-- and per-subsidiary drill-downs.

-- ───────────────────────────────────────────────────────────────────────────
-- Monthly revenue + trip volume (last N months, default 12)
-- Revenue = sum of completed-trip charges using the effective rate.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app.fn_monthly_revenue(p_months integer DEFAULT 12)
RETURNS TABLE (
  month_label   text,
  month_start   date,
  revenue       numeric,
  trips         integer,
  km            numeric,
  active_vehicles integer
)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = app, public, pg_catalog
AS $$
  WITH months AS (
    SELECT generate_series(
      date_trunc('month', CURRENT_DATE - make_interval(months => p_months - 1))::date,
      date_trunc('month', CURRENT_DATE)::date,
      '1 month'::interval
    )::date AS month_start
  ),
  trip_lines AS (
    SELECT
      date_trunc('month', t.completed_at)::date AS month_start,
      t.vehicle_id,
      (t.end_odometer_km - t.start_odometer_km) AS km,
      COALESCE(
        (SELECT SUM(line_amount) FROM app.invoice_line_items li WHERE li.trip_id = t.id),
        0
      ) AS revenue
    FROM app.trips t
    WHERE t.status = 'completed'
      AND t.completed_at >= date_trunc('month', CURRENT_DATE - make_interval(months => p_months - 1))
  )
  SELECT
    to_char(m.month_start, 'Mon')                                AS month_label,
    m.month_start                                                AS month_start,
    COALESCE(ROUND(SUM(tl.revenue)::numeric, 2), 0)              AS revenue,
    COALESCE(COUNT(tl.vehicle_id)::integer, 0)                   AS trips,
    COALESCE(ROUND(SUM(tl.km)::numeric, 0), 0)                   AS km,
    COALESCE(COUNT(DISTINCT tl.vehicle_id)::integer, 0)          AS active_vehicles
  FROM months m
  LEFT JOIN trip_lines tl ON tl.month_start = m.month_start
  GROUP BY m.month_start
  ORDER BY m.month_start;
$$;

GRANT EXECUTE ON FUNCTION app.fn_monthly_revenue(integer) TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- Top vehicles by revenue + km in a date range
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app.fn_top_vehicles(
  p_limit       integer DEFAULT 10,
  p_period_start date    DEFAULT (CURRENT_DATE - INTERVAL '90 days')::date,
  p_period_end  date    DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  vehicle_id      uuid,
  plate_number    text,
  plate_country   app.country_code,
  make            text,
  model           text,
  trips           integer,
  km              numeric,
  revenue         numeric
)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = app, public, pg_catalog
AS $$
  SELECT
    v.id,
    v.plate_number,
    v.plate_country,
    v.make,
    v.model,
    COUNT(t.id)::integer                                                   AS trips,
    COALESCE(SUM(t.end_odometer_km - t.start_odometer_km), 0)::numeric     AS km,
    COALESCE((
      SELECT SUM(li.line_amount)
        FROM app.invoice_line_items li
        JOIN app.trips tt ON tt.id = li.trip_id
       WHERE tt.vehicle_id = v.id
         AND tt.completed_at::date BETWEEN p_period_start AND p_period_end
    ), 0)::numeric                                                         AS revenue
  FROM app.vehicles v
  LEFT JOIN app.trips t ON t.vehicle_id = v.id
    AND t.status = 'completed'
    AND t.completed_at::date BETWEEN p_period_start AND p_period_end
  WHERE v.status <> 'decommissioned'
  GROUP BY v.id, v.plate_number, v.plate_country, v.make, v.model
  ORDER BY revenue DESC NULLS LAST, km DESC NULLS LAST
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION app.fn_top_vehicles(integer, date, date) TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- Top drivers by km in a date range
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app.fn_top_drivers(
  p_limit       integer DEFAULT 10,
  p_period_start date    DEFAULT (CURRENT_DATE - INTERVAL '90 days')::date,
  p_period_end  date    DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  driver_id   uuid,
  full_name   text,
  trips       integer,
  km          numeric,
  avg_trip_km numeric
)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = app, public, pg_catalog
AS $$
  SELECT
    d.id,
    p.full_name,
    COUNT(t.id)::integer                                                AS trips,
    COALESCE(SUM(t.end_odometer_km - t.start_odometer_km), 0)::numeric  AS km,
    CASE WHEN COUNT(t.id) > 0
      THEN ROUND(COALESCE(SUM(t.end_odometer_km - t.start_odometer_km), 0) / COUNT(t.id), 0)
      ELSE 0
    END::numeric                                                        AS avg_trip_km
  FROM app.drivers d
  JOIN app.profiles p ON p.id = d.profile_id
  LEFT JOIN app.trips t ON t.driver_id = d.id
    AND t.status = 'completed'
    AND t.completed_at::date BETWEEN p_period_start AND p_period_end
  WHERE d.is_active
  GROUP BY d.id, p.full_name
  ORDER BY km DESC NULLS LAST
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION app.fn_top_drivers(integer, date, date) TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- Subsidiary breakdown: revenue + trips by subsidiary in a period
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app.fn_subsidiary_breakdown(
  p_period_start date DEFAULT (CURRENT_DATE - INTERVAL '90 days')::date,
  p_period_end  date DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  subsidiary_id  uuid,
  name           text,
  country        app.country_code,
  trips          integer,
  km             numeric,
  revenue        numeric,
  outstanding    numeric
)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = app, public, pg_catalog
AS $$
  SELECT
    s.id,
    s.name,
    s.country,
    COUNT(t.id)::integer                                                AS trips,
    COALESCE(SUM(t.end_odometer_km - t.start_odometer_km), 0)::numeric  AS km,
    COALESCE((
      SELECT SUM(li.line_amount)
        FROM app.invoice_line_items li
        JOIN app.invoices i ON i.id = li.invoice_id
       WHERE i.subsidiary_id = s.id
         AND i.status <> 'void'
         AND i.period_start >= p_period_start
         AND i.period_end <= p_period_end + INTERVAL '1 day'
    ), 0)::numeric                                                      AS revenue,
    COALESCE((
      SELECT SUM(total_due - amount_paid)
        FROM app.invoices
       WHERE subsidiary_id = s.id
         AND status IN ('issued','partially_paid','overdue')
    ), 0)::numeric                                                      AS outstanding
  FROM app.subsidiaries s
  LEFT JOIN app.trips t ON t.subsidiary_id = s.id
    AND t.status = 'completed'
    AND t.completed_at::date BETWEEN p_period_start AND p_period_end
  GROUP BY s.id, s.name, s.country
  ORDER BY revenue DESC NULLS LAST, trips DESC NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION app.fn_subsidiary_breakdown(date, date) TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- Fleet KPIs as of now (for the reports header)
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app.fn_fleet_kpis(
  p_period_start date DEFAULT (CURRENT_DATE - INTERVAL '30 days')::date,
  p_period_end  date DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  total_revenue          numeric,
  total_trips            integer,
  total_km               numeric,
  active_vehicles        integer,
  utilisation_pct        numeric,
  outstanding_balance    numeric,
  maintenance_spend      numeric,
  on_time_completion_pct numeric
)
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = app, public, pg_catalog
AS $$
DECLARE
  v_days integer := GREATEST((p_period_end - p_period_start), 1);
  v_total_vehicles integer;
BEGIN
  SELECT COUNT(*) INTO v_total_vehicles
  FROM app.vehicles WHERE status <> 'decommissioned';

  SELECT
    COALESCE(SUM(line_amount), 0)
  INTO total_revenue
  FROM app.invoice_line_items li
  JOIN app.invoices i ON i.id = li.invoice_id
  WHERE i.status <> 'void'
    AND i.period_start >= p_period_start
    AND i.period_end <= p_period_end + INTERVAL '1 day';

  SELECT
    COUNT(*)::integer,
    COALESCE(SUM(end_odometer_km - start_odometer_km), 0)
  INTO total_trips, total_km
  FROM app.trips
  WHERE status = 'completed'
    AND completed_at::date BETWEEN p_period_start AND p_period_end;

  SELECT COUNT(DISTINCT vehicle_id)::integer
  INTO active_vehicles
  FROM app.trips
  WHERE status = 'completed'
    AND completed_at::date BETWEEN p_period_start AND p_period_end;

  -- Utilisation = active vehicles / total vehicles
  utilisation_pct := CASE WHEN v_total_vehicles > 0
    THEN ROUND(active_vehicles * 100.0 / v_total_vehicles, 1)
    ELSE 0 END;

  SELECT COALESCE(SUM(total_due - amount_paid), 0)
  INTO outstanding_balance
  FROM app.invoices
  WHERE status IN ('issued','partially_paid','overdue');

  SELECT COALESCE(SUM(total_amount), 0)
  INTO maintenance_spend
  FROM app.service_records
  WHERE performed_at BETWEEN p_period_start AND p_period_end;

  -- On-time completion = % of completed trips with accepted reconciliation
  SELECT CASE WHEN COUNT(*) > 0
    THEN ROUND(SUM(CASE WHEN r.status = 'accepted' THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 1)
    ELSE 100 END
  INTO on_time_completion_pct
  FROM app.trips t
  LEFT JOIN app.reconciliations r ON r.trip_id = t.id AND r.is_current
  WHERE t.status = 'completed'
    AND t.completed_at::date BETWEEN p_period_start AND p_period_end;

  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION app.fn_fleet_kpis(date, date) TO authenticated, service_role;
