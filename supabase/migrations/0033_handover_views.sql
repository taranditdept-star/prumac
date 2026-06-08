-- 0033_handover_views.sql
-- ---------------------------------------------------------------------------
-- Drivers can only read their own driver/profile rows (RLS), so they cannot
-- resolve the other party's name when listing handovers via PostgREST joins.
-- This SECURITY DEFINER RPC returns the caller's handovers with display fields.
-- ---------------------------------------------------------------------------
BEGIN;

CREATE OR REPLACE FUNCTION app.fn_my_handovers()
RETURNS TABLE (
    id                uuid,
    vehicle_id        uuid,
    plate_number      text,
    plate_country     app.country_code,
    make              text,
    model             text,
    status            app.handover_status,
    direction         text,
    other_party_name  text,
    from_overall      app.inspection_result,
    to_overall        app.inspection_result,
    odometer_km       integer,
    notes             text,
    reject_reason     text,
    created_at        timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = app, pg_catalog
AS $$
    SELECT
        h.id, h.vehicle_id, v.plate_number, v.plate_country, v.make, v.model,
        h.status,
        CASE WHEN h.from_driver_id = app.current_driver_id() THEN 'outgoing' ELSE 'incoming' END,
        CASE WHEN h.from_driver_id = app.current_driver_id() THEN pto.full_name ELSE pfrom.full_name END,
        fi.overall_result, ti.overall_result,
        h.odometer_km, h.notes, h.reject_reason, h.created_at
    FROM app.vehicle_handovers h
    JOIN app.vehicles v ON v.id = h.vehicle_id
    JOIN app.drivers dfrom ON dfrom.id = h.from_driver_id
    JOIN app.profiles pfrom ON pfrom.id = dfrom.profile_id
    JOIN app.drivers dto ON dto.id = h.to_driver_id
    JOIN app.profiles pto ON pto.id = dto.profile_id
    LEFT JOIN app.inspections fi ON fi.id = h.from_inspection_id
    LEFT JOIN app.inspections ti ON ti.id = h.to_inspection_id
    WHERE h.from_driver_id = app.current_driver_id()
       OR h.to_driver_id = app.current_driver_id()
    ORDER BY h.created_at DESC;
$$;
GRANT EXECUTE ON FUNCTION app.fn_my_handovers() TO authenticated, service_role;

COMMIT;
