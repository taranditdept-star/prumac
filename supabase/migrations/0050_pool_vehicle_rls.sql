-- 0050_pool_vehicle_rls.sql
-- ---------------------------------------------------------------------------
-- Let drivers see (and therefore start trips / do checklists on) POOL vehicles,
-- not just the ones assigned to them. Pool cars belong to a department and
-- anyone can drive them, so every driver may read them.
-- ---------------------------------------------------------------------------
BEGIN;

DROP POLICY IF EXISTS vehicles_read_authenticated ON app.vehicles;

CREATE POLICY vehicles_read_authenticated ON app.vehicles
    FOR SELECT TO authenticated
    USING (
        app.role_is('fleet_manager') OR app.role_is('admin')
        OR (app.role_is('driver') AND (
            is_pool
            OR id IN (
                SELECT vehicle_id FROM app.vehicle_assignments
                WHERE driver_id = app.current_driver_id() AND ended_at IS NULL
            )
        ))
        OR (app.role_is('subsidiary_billing')
            AND default_subsidiary_id = app.current_subsidiary_id())
    );

COMMIT;
