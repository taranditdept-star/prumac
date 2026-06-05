-- =============================================================================
-- 0022_driver_cluster.sql
-- Phase 12 — Driver cluster:
--   A. Driver scorecard / safety rating (read-side functions over existing data)
--   B. Leave & availability (driver_leave table + availability function)
-- =============================================================================

BEGIN;

-- =============================================================================
-- A. DRIVER SCORECARD / SAFETY RATING
-- =============================================================================
-- Aggregates a driver's trips, punctuality, inspections, faults, accidents and
-- reconciliation flags into a 0-100 score. No new tables — pure derivation.
--
-- Scoring:
--   safety_score  = 100 − accident weight (minor 8 / moderate 18 / severe 30 /
--                   fatal 50) − recon_critical×8 − recon_flagged×3 − insp_fail×4
--   overall_score = safety×0.6 + punctuality×0.2 + completion×0.2
-- where punctuality = % of completed trips started within 15 min of plan, and
-- completion = completed / (completed + cancelled). Both default to 100 when
-- there is nothing to measure (benefit of the doubt for new drivers).

CREATE OR REPLACE FUNCTION app.fn_driver_scorecard(
    p_driver_id    uuid,
    p_period_start date DEFAULT NULL,
    p_period_end   date DEFAULT NULL
)
RETURNS TABLE (
    trips_completed       int,
    trips_cancelled       int,
    completion_rate       numeric,
    total_km              numeric,
    punctual_starts       int,
    measurable_starts     int,
    punctuality_pct       numeric,
    inspection_total      int,
    inspection_fail_count int,
    fault_count           int,
    accident_count        int,
    recon_flag_count      int,
    recon_critical_count  int,
    safety_score          numeric,
    overall_score         numeric,
    rating                text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = app, public, pg_catalog
AS $$
DECLARE
    v_completed int; v_cancelled int; v_km numeric;
    v_punctual int; v_measurable int;
    v_insp_total int; v_insp_fail int;
    v_faults int; v_acc_count int; v_acc_weight numeric;
    v_recon_flag int; v_recon_crit int;
    v_completion numeric; v_punctuality numeric; v_safety numeric; v_overall numeric;
    v_rating text;
BEGIN
    SELECT
        count(*) FILTER (WHERE status = 'completed'),
        count(*) FILTER (WHERE status = 'cancelled'),
        COALESCE(SUM(CASE WHEN status = 'completed' AND end_odometer_km IS NOT NULL AND start_odometer_km IS NOT NULL
                          THEN GREATEST(0, end_odometer_km - start_odometer_km) END), 0),
        count(*) FILTER (WHERE status = 'completed' AND planned_start_at IS NOT NULL AND started_at IS NOT NULL
                          AND started_at <= planned_start_at + interval '15 minutes'),
        count(*) FILTER (WHERE status = 'completed' AND planned_start_at IS NOT NULL AND started_at IS NOT NULL)
    INTO v_completed, v_cancelled, v_km, v_punctual, v_measurable
    FROM app.trips
    WHERE driver_id = p_driver_id
      AND (p_period_start IS NULL OR COALESCE(started_at, created_at)::date >= p_period_start)
      AND (p_period_end   IS NULL OR COALESCE(started_at, created_at)::date <= p_period_end);

    SELECT count(*), count(*) FILTER (WHERE overall_result = 'fail')
    INTO v_insp_total, v_insp_fail
    FROM app.inspections
    WHERE driver_id = p_driver_id
      AND (p_period_start IS NULL OR completed_at::date >= p_period_start)
      AND (p_period_end   IS NULL OR completed_at::date <= p_period_end);

    SELECT count(*) INTO v_faults
    FROM app.faults
    WHERE reported_by = p_driver_id
      AND (p_period_start IS NULL OR reported_at::date >= p_period_start)
      AND (p_period_end   IS NULL OR reported_at::date <= p_period_end);

    SELECT count(*),
        COALESCE(SUM(CASE severity
            WHEN 'minor' THEN 8 WHEN 'moderate' THEN 18
            WHEN 'severe' THEN 30 WHEN 'fatal' THEN 50 ELSE 10 END), 0)
    INTO v_acc_count, v_acc_weight
    FROM app.accidents
    WHERE reported_by = p_driver_id
      AND (p_period_start IS NULL OR occurred_at::date >= p_period_start)
      AND (p_period_end   IS NULL OR occurred_at::date <= p_period_end);

    SELECT
        count(*) FILTER (WHERE r.status = 'flagged'),
        count(*) FILTER (WHERE r.status = 'critical')
    INTO v_recon_flag, v_recon_crit
    FROM app.reconciliations r
    JOIN app.trips t ON t.id = r.trip_id
    WHERE r.is_current AND t.driver_id = p_driver_id
      AND (p_period_start IS NULL OR r.computed_at::date >= p_period_start)
      AND (p_period_end   IS NULL OR r.computed_at::date <= p_period_end);

    v_completion := CASE WHEN (v_completed + v_cancelled) > 0
                         THEN round(v_completed::numeric / (v_completed + v_cancelled) * 100, 1)
                         ELSE 100 END;
    v_punctuality := CASE WHEN v_measurable > 0
                          THEN round(v_punctual::numeric / v_measurable * 100, 1)
                          ELSE 100 END;
    v_safety := GREATEST(0, 100 - v_acc_weight - v_recon_crit * 8 - v_recon_flag * 3 - v_insp_fail * 4);
    v_overall := round(v_safety * 0.6 + v_punctuality * 0.2 + v_completion * 0.2, 1);
    v_rating := CASE
        WHEN v_overall >= 85 THEN 'excellent'
        WHEN v_overall >= 70 THEN 'good'
        WHEN v_overall >= 50 THEN 'fair'
        ELSE 'poor' END;

    RETURN QUERY SELECT
        v_completed, v_cancelled, v_completion, v_km,
        v_punctual, v_measurable, v_punctuality,
        v_insp_total, v_insp_fail, v_faults,
        v_acc_count, v_recon_flag, v_recon_crit,
        v_safety, v_overall, v_rating;
END;
$$;

-- Leaderboard: every active driver scored, best first.
CREATE OR REPLACE FUNCTION app.fn_driver_scorecards(
    p_period_start date DEFAULT NULL,
    p_period_end   date DEFAULT NULL
)
RETURNS TABLE (
    driver_id             uuid,
    full_name             text,
    trips_completed       int,
    total_km              numeric,
    completion_rate       numeric,
    punctuality_pct       numeric,
    accident_count        int,
    recon_flag_count      int,
    recon_critical_count  int,
    inspection_fail_count int,
    safety_score          numeric,
    overall_score         numeric,
    rating                text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = app, public, pg_catalog
AS $$
    SELECT
        d.id, p.full_name,
        s.trips_completed, s.total_km, s.completion_rate, s.punctuality_pct,
        s.accident_count, s.recon_flag_count, s.recon_critical_count, s.inspection_fail_count,
        s.safety_score, s.overall_score, s.rating
    FROM app.drivers d
    JOIN app.profiles p ON p.id = d.profile_id
    CROSS JOIN LATERAL app.fn_driver_scorecard(d.id, p_period_start, p_period_end) s
    WHERE d.is_active
    ORDER BY s.overall_score DESC, s.total_km DESC;
$$;

-- =============================================================================
-- B. LEAVE & AVAILABILITY
-- =============================================================================
CREATE TYPE app.leave_type   AS ENUM ('annual', 'sick', 'unpaid', 'compassionate', 'study', 'other');
CREATE TYPE app.leave_status AS ENUM ('pending', 'approved', 'rejected', 'cancelled');

CREATE TABLE app.driver_leave (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id    uuid NOT NULL REFERENCES app.drivers(id) ON DELETE CASCADE,
    leave_type   app.leave_type NOT NULL DEFAULT 'annual',
    start_date   date NOT NULL,
    end_date     date NOT NULL,
    status       app.leave_status NOT NULL DEFAULT 'pending',
    reason       text,
    requested_by uuid REFERENCES app.profiles(id),
    reviewed_by  uuid REFERENCES app.profiles(id),
    reviewed_at  timestamptz,
    review_notes text,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT driver_leave_dates_valid CHECK (end_date >= start_date)
);

CREATE TRIGGER driver_leave_touch BEFORE UPDATE ON app.driver_leave
    FOR EACH ROW EXECUTE FUNCTION app.fn_touch_updated_at();

CREATE INDEX driver_leave_driver_idx ON app.driver_leave (driver_id, start_date DESC);
CREATE INDEX driver_leave_status_idx ON app.driver_leave (status) WHERE status = 'pending';
CREATE INDEX driver_leave_range_idx  ON app.driver_leave (start_date, end_date) WHERE status = 'approved';

COMMENT ON TABLE app.driver_leave IS
    'Driver leave requests. Approved rows in a date range make a driver '
    'unavailable for dispatch (see app.fn_driver_availability).';

SELECT app.fn_attach_audit('app.driver_leave');

-- Availability board: a driver is unavailable if on approved leave for the date
-- or currently on an open trip.
CREATE OR REPLACE FUNCTION app.fn_driver_availability(p_on_date date DEFAULT current_date)
RETURNS TABLE (
    driver_id       uuid,
    full_name       text,
    is_available    boolean,
    reason          text,
    leave_type      app.leave_type,
    current_trip_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = app, public, pg_catalog
AS $$
    SELECT
        d.id,
        p.full_name,
        (lv.id IS NULL AND tr.id IS NULL) AS is_available,
        CASE WHEN lv.id IS NOT NULL THEN 'on_leave'
             WHEN tr.id IS NOT NULL THEN 'on_trip'
             ELSE 'available' END AS reason,
        lv.leave_type,
        tr.id
    FROM app.drivers d
    JOIN app.profiles p ON p.id = d.profile_id
    LEFT JOIN LATERAL (
        SELECT l.id, l.leave_type
        FROM app.driver_leave l
        WHERE l.driver_id = d.id
          AND l.status = 'approved'
          AND p_on_date BETWEEN l.start_date AND l.end_date
        LIMIT 1
    ) lv ON true
    LEFT JOIN LATERAL (
        SELECT t.id
        FROM app.trips t
        WHERE t.driver_id = d.id
          AND t.status IN ('in_progress', 'paused', 'ended')
        LIMIT 1
    ) tr ON true
    WHERE d.is_active
    ORDER BY is_available DESC, p.full_name;
$$;

-- =============================================================================
-- RLS
-- =============================================================================
ALTER TABLE app.driver_leave ENABLE ROW LEVEL SECURITY;

-- Managers/admin manage all leave (approve / reject / file on behalf).
CREATE POLICY driver_leave_manage ON app.driver_leave
    FOR ALL TO authenticated
    USING (app.role_is('fleet_manager') OR app.role_is('admin'))
    WITH CHECK (app.role_is('fleet_manager') OR app.role_is('admin'));

-- Drivers see, file and amend their own requests.
CREATE POLICY driver_leave_driver_read ON app.driver_leave
    FOR SELECT TO authenticated
    USING (driver_id = app.current_driver_id());

CREATE POLICY driver_leave_driver_insert ON app.driver_leave
    FOR INSERT TO authenticated
    WITH CHECK (driver_id = app.current_driver_id() AND status = 'pending');

CREATE POLICY driver_leave_driver_update ON app.driver_leave
    FOR UPDATE TO authenticated
    USING (driver_id = app.current_driver_id())
    WITH CHECK (driver_id = app.current_driver_id());

GRANT EXECUTE ON FUNCTION app.fn_driver_scorecard(uuid, date, date)  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.fn_driver_scorecards(date, date)       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.fn_driver_availability(date)           TO authenticated, service_role;

COMMIT;
