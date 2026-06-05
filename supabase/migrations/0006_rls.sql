-- =============================================================================
-- 0006_rls.sql
-- Row-Level Security policies. Default: deny everything. Then grant per role.
--
-- Roles:
--   driver               - sees only their own data
--   fleet_manager        - sees everything operational; writes most things
--   subsidiary_billing   - sees only their subsidiary's invoices + related trips
--   admin                - everything (handled by app.role_is() including admin)
--
-- Authenticated users that have no profile row (or are inactive) get nothing.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Enable RLS on every table we created. Without this the policies below
-- would never engage.
-- ---------------------------------------------------------------------------
ALTER TABLE app.subsidiaries                ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.profiles                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.drivers                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.vehicles                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.vehicle_documents           ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.vehicle_assignments         ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.trips                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.trip_locations              ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.inspection_templates        ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.inspection_checklist_items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.inspections                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.inspection_item_results     ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.inspection_photos           ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.faults                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.fault_photos                ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.accidents                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.accident_photos             ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.alerts                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.billing_rates               ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.reconciliations             ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.reconciliation_reviews      ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.service_records             ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.service_record_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.invoices                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.invoice_line_items          ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.invoice_payments            ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit.log                       ENABLE ROW LEVEL SECURITY;

-- Helper used by several policies: the driver_id of the current user, if any
CREATE OR REPLACE FUNCTION app.current_driver_id()
RETURNS uuid
LANGUAGE sql STABLE
AS $$
    SELECT d.id FROM app.drivers d
    WHERE d.profile_id = auth.uid() AND d.is_active;
$$;

-- ---------------------------------------------------------------------------
-- subsidiaries
-- ---------------------------------------------------------------------------
CREATE POLICY subsidiaries_read_managers ON app.subsidiaries
    FOR SELECT TO authenticated
    USING (app.role_is('fleet_manager') OR app.role_is('admin'));

CREATE POLICY subsidiaries_read_own ON app.subsidiaries
    FOR SELECT TO authenticated
    USING (id = app.current_subsidiary_id());

CREATE POLICY subsidiaries_write_admin ON app.subsidiaries
    FOR ALL TO authenticated
    USING (app.role_is('admin'))
    WITH CHECK (app.role_is('admin'));

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
CREATE POLICY profiles_read_self ON app.profiles
    FOR SELECT TO authenticated
    USING (id = auth.uid());

CREATE POLICY profiles_read_managers ON app.profiles
    FOR SELECT TO authenticated
    USING (app.role_is('fleet_manager') OR app.role_is('admin'));

-- Subsidiary billing users can see other users in their subsidiary
CREATE POLICY profiles_read_subsidiary ON app.profiles
    FOR SELECT TO authenticated
    USING (app.role_is('subsidiary_billing')
           AND subsidiary_id IS NOT NULL
           AND subsidiary_id = app.current_subsidiary_id());

CREATE POLICY profiles_update_self ON app.profiles
    FOR UPDATE TO authenticated
    USING (id = auth.uid())
    WITH CHECK (
        id = auth.uid()
        -- A user cannot change their own role or subsidiary_id
        AND role = (SELECT role          FROM app.profiles WHERE id = auth.uid())
        AND subsidiary_id IS NOT DISTINCT FROM (SELECT subsidiary_id FROM app.profiles WHERE id = auth.uid())
    );

CREATE POLICY profiles_write_admin ON app.profiles
    FOR ALL TO authenticated
    USING (app.role_is('admin'))
    WITH CHECK (app.role_is('admin'));

-- ---------------------------------------------------------------------------
-- drivers
-- ---------------------------------------------------------------------------
CREATE POLICY drivers_read_self ON app.drivers
    FOR SELECT TO authenticated
    USING (profile_id = auth.uid());

CREATE POLICY drivers_read_managers ON app.drivers
    FOR SELECT TO authenticated
    USING (app.role_is('fleet_manager') OR app.role_is('admin'));

CREATE POLICY drivers_write_managers ON app.drivers
    FOR ALL TO authenticated
    USING (app.role_is('fleet_manager') OR app.role_is('admin'))
    WITH CHECK (app.role_is('fleet_manager') OR app.role_is('admin'));

-- ---------------------------------------------------------------------------
-- vehicles
-- ---------------------------------------------------------------------------
CREATE POLICY vehicles_read_authenticated ON app.vehicles
    FOR SELECT TO authenticated
    USING (
        app.role_is('fleet_manager') OR app.role_is('admin')
        OR (app.role_is('driver') AND id IN (
            SELECT vehicle_id FROM app.vehicle_assignments
            WHERE driver_id = app.current_driver_id() AND ended_at IS NULL
        ))
        OR (app.role_is('subsidiary_billing')
            AND default_subsidiary_id = app.current_subsidiary_id())
    );

CREATE POLICY vehicles_write_managers ON app.vehicles
    FOR ALL TO authenticated
    USING (app.role_is('fleet_manager') OR app.role_is('admin'))
    WITH CHECK (app.role_is('fleet_manager') OR app.role_is('admin'));

-- ---------------------------------------------------------------------------
-- vehicle_documents
-- ---------------------------------------------------------------------------
CREATE POLICY vehicle_documents_read_managers ON app.vehicle_documents
    FOR SELECT TO authenticated
    USING (app.role_is('fleet_manager') OR app.role_is('admin'));

CREATE POLICY vehicle_documents_read_driver ON app.vehicle_documents
    FOR SELECT TO authenticated
    USING (
        app.role_is('driver')
        AND vehicle_id IN (
            SELECT vehicle_id FROM app.vehicle_assignments
            WHERE driver_id = app.current_driver_id() AND ended_at IS NULL
        )
    );

CREATE POLICY vehicle_documents_write_managers ON app.vehicle_documents
    FOR ALL TO authenticated
    USING (app.role_is('fleet_manager') OR app.role_is('admin'))
    WITH CHECK (app.role_is('fleet_manager') OR app.role_is('admin'));

-- ---------------------------------------------------------------------------
-- vehicle_assignments
-- ---------------------------------------------------------------------------
CREATE POLICY assignments_read_managers ON app.vehicle_assignments
    FOR SELECT TO authenticated
    USING (app.role_is('fleet_manager') OR app.role_is('admin'));

CREATE POLICY assignments_read_self ON app.vehicle_assignments
    FOR SELECT TO authenticated
    USING (driver_id = app.current_driver_id());

CREATE POLICY assignments_write_managers ON app.vehicle_assignments
    FOR ALL TO authenticated
    USING (app.role_is('fleet_manager') OR app.role_is('admin'))
    WITH CHECK (app.role_is('fleet_manager') OR app.role_is('admin'));

-- ---------------------------------------------------------------------------
-- trips
-- ---------------------------------------------------------------------------
CREATE POLICY trips_read_managers ON app.trips
    FOR SELECT TO authenticated
    USING (app.role_is('fleet_manager') OR app.role_is('admin'));

CREATE POLICY trips_read_own ON app.trips
    FOR SELECT TO authenticated
    USING (driver_id = app.current_driver_id());

CREATE POLICY trips_read_subsidiary ON app.trips
    FOR SELECT TO authenticated
    USING (
        app.role_is('subsidiary_billing')
        AND subsidiary_id = app.current_subsidiary_id()
    );

-- Drivers can insert and update their own trips. The state-machine trigger
-- still enforces valid transitions.
CREATE POLICY trips_insert_driver ON app.trips
    FOR INSERT TO authenticated
    WITH CHECK (
        app.role_is('driver')
        AND driver_id = app.current_driver_id()
    );

CREATE POLICY trips_update_driver ON app.trips
    FOR UPDATE TO authenticated
    USING (driver_id = app.current_driver_id())
    WITH CHECK (driver_id = app.current_driver_id());

CREATE POLICY trips_write_managers ON app.trips
    FOR ALL TO authenticated
    USING (app.role_is('fleet_manager') OR app.role_is('admin'))
    WITH CHECK (app.role_is('fleet_manager') OR app.role_is('admin'));

-- ---------------------------------------------------------------------------
-- trip_locations
-- ---------------------------------------------------------------------------
CREATE POLICY trip_locations_read_managers ON app.trip_locations
    FOR SELECT TO authenticated
    USING (app.role_is('fleet_manager') OR app.role_is('admin'));

CREATE POLICY trip_locations_read_own ON app.trip_locations
    FOR SELECT TO authenticated
    USING (trip_id IN (
        SELECT id FROM app.trips WHERE driver_id = app.current_driver_id()
    ));

CREATE POLICY trip_locations_read_subsidiary ON app.trip_locations
    FOR SELECT TO authenticated
    USING (
        app.role_is('subsidiary_billing')
        AND trip_id IN (
            SELECT id FROM app.trips
            WHERE subsidiary_id = app.current_subsidiary_id()
        )
    );

-- Drivers can only insert pings for their own active trips
CREATE POLICY trip_locations_insert_driver ON app.trip_locations
    FOR INSERT TO authenticated
    WITH CHECK (
        trip_id IN (
            SELECT id FROM app.trips
            WHERE driver_id = app.current_driver_id()
              AND status IN ('in_progress','paused')
        )
    );

-- ---------------------------------------------------------------------------
-- inspections + checklists + photos
-- ---------------------------------------------------------------------------
CREATE POLICY inspection_templates_read ON app.inspection_templates
    FOR SELECT TO authenticated USING (true);
CREATE POLICY inspection_templates_write_admin ON app.inspection_templates
    FOR ALL TO authenticated
    USING (app.role_is('admin')) WITH CHECK (app.role_is('admin'));

CREATE POLICY inspection_checklist_items_read ON app.inspection_checklist_items
    FOR SELECT TO authenticated USING (true);
CREATE POLICY inspection_checklist_items_write_admin ON app.inspection_checklist_items
    FOR ALL TO authenticated
    USING (app.role_is('admin')) WITH CHECK (app.role_is('admin'));

CREATE POLICY inspections_read_managers ON app.inspections
    FOR SELECT TO authenticated
    USING (app.role_is('fleet_manager') OR app.role_is('admin'));

CREATE POLICY inspections_read_own ON app.inspections
    FOR SELECT TO authenticated
    USING (driver_id = app.current_driver_id());

CREATE POLICY inspections_insert_driver ON app.inspections
    FOR INSERT TO authenticated
    WITH CHECK (driver_id = app.current_driver_id());

CREATE POLICY inspections_write_managers ON app.inspections
    FOR ALL TO authenticated
    USING (app.role_is('fleet_manager') OR app.role_is('admin'))
    WITH CHECK (app.role_is('fleet_manager') OR app.role_is('admin'));

CREATE POLICY inspection_item_results_owner ON app.inspection_item_results
    FOR ALL TO authenticated
    USING (inspection_id IN (
        SELECT id FROM app.inspections WHERE driver_id = app.current_driver_id()
    ))
    WITH CHECK (inspection_id IN (
        SELECT id FROM app.inspections WHERE driver_id = app.current_driver_id()
    ));

CREATE POLICY inspection_item_results_managers ON app.inspection_item_results
    FOR ALL TO authenticated
    USING (app.role_is('fleet_manager') OR app.role_is('admin'))
    WITH CHECK (app.role_is('fleet_manager') OR app.role_is('admin'));

CREATE POLICY inspection_photos_owner ON app.inspection_photos
    FOR ALL TO authenticated
    USING (inspection_id IN (
        SELECT id FROM app.inspections WHERE driver_id = app.current_driver_id()
    ))
    WITH CHECK (inspection_id IN (
        SELECT id FROM app.inspections WHERE driver_id = app.current_driver_id()
    ));

CREATE POLICY inspection_photos_managers ON app.inspection_photos
    FOR SELECT TO authenticated
    USING (app.role_is('fleet_manager') OR app.role_is('admin'));

-- ---------------------------------------------------------------------------
-- faults
-- ---------------------------------------------------------------------------
CREATE POLICY faults_read_managers ON app.faults
    FOR SELECT TO authenticated
    USING (app.role_is('fleet_manager') OR app.role_is('admin'));

CREATE POLICY faults_read_self ON app.faults
    FOR SELECT TO authenticated
    USING (reported_by = app.current_driver_id());

CREATE POLICY faults_insert_driver ON app.faults
    FOR INSERT TO authenticated
    WITH CHECK (reported_by = app.current_driver_id());

CREATE POLICY faults_write_managers ON app.faults
    FOR UPDATE TO authenticated
    USING (app.role_is('fleet_manager') OR app.role_is('admin'))
    WITH CHECK (app.role_is('fleet_manager') OR app.role_is('admin'));

CREATE POLICY fault_photos_owner ON app.fault_photos
    FOR ALL TO authenticated
    USING (fault_id IN (
        SELECT id FROM app.faults WHERE reported_by = app.current_driver_id()
    ))
    WITH CHECK (fault_id IN (
        SELECT id FROM app.faults WHERE reported_by = app.current_driver_id()
    ));

CREATE POLICY fault_photos_managers ON app.fault_photos
    FOR SELECT TO authenticated
    USING (app.role_is('fleet_manager') OR app.role_is('admin'));

-- ---------------------------------------------------------------------------
-- accidents
-- ---------------------------------------------------------------------------
CREATE POLICY accidents_read_managers ON app.accidents
    FOR SELECT TO authenticated
    USING (app.role_is('fleet_manager') OR app.role_is('admin'));

CREATE POLICY accidents_read_self ON app.accidents
    FOR SELECT TO authenticated
    USING (reported_by = app.current_driver_id());

CREATE POLICY accidents_insert_driver ON app.accidents
    FOR INSERT TO authenticated
    WITH CHECK (reported_by = app.current_driver_id());

CREATE POLICY accidents_write_managers ON app.accidents
    FOR UPDATE TO authenticated
    USING (app.role_is('fleet_manager') OR app.role_is('admin'))
    WITH CHECK (app.role_is('fleet_manager') OR app.role_is('admin'));

CREATE POLICY accident_photos_owner ON app.accident_photos
    FOR ALL TO authenticated
    USING (accident_id IN (
        SELECT id FROM app.accidents WHERE reported_by = app.current_driver_id()
    ))
    WITH CHECK (accident_id IN (
        SELECT id FROM app.accidents WHERE reported_by = app.current_driver_id()
    ));

CREATE POLICY accident_photos_managers ON app.accident_photos
    FOR SELECT TO authenticated
    USING (app.role_is('fleet_manager') OR app.role_is('admin'));

-- ---------------------------------------------------------------------------
-- alerts
-- ---------------------------------------------------------------------------
CREATE POLICY alerts_read_managers ON app.alerts
    FOR SELECT TO authenticated
    USING (app.role_is('fleet_manager') OR app.role_is('admin'));

CREATE POLICY alerts_update_managers ON app.alerts
    FOR UPDATE TO authenticated
    USING (app.role_is('fleet_manager') OR app.role_is('admin'))
    WITH CHECK (app.role_is('fleet_manager') OR app.role_is('admin'));

-- (no driver / subsidiary read of alerts; alerts are an internal ops feed)

-- ---------------------------------------------------------------------------
-- billing_rates — admin only
-- ---------------------------------------------------------------------------
CREATE POLICY billing_rates_read_managers ON app.billing_rates
    FOR SELECT TO authenticated
    USING (app.role_is('fleet_manager') OR app.role_is('admin'));

CREATE POLICY billing_rates_read_subsidiary ON app.billing_rates
    FOR SELECT TO authenticated
    USING (
        app.role_is('subsidiary_billing')
        AND (subsidiary_id = app.current_subsidiary_id() OR subsidiary_id IS NULL)
    );

CREATE POLICY billing_rates_write_admin ON app.billing_rates
    FOR ALL TO authenticated
    USING (app.role_is('admin'))
    WITH CHECK (app.role_is('admin'));

-- ---------------------------------------------------------------------------
-- reconciliations
-- ---------------------------------------------------------------------------
CREATE POLICY reconciliations_read_managers ON app.reconciliations
    FOR SELECT TO authenticated
    USING (app.role_is('fleet_manager') OR app.role_is('admin'));

CREATE POLICY reconciliations_read_subsidiary ON app.reconciliations
    FOR SELECT TO authenticated
    USING (
        app.role_is('subsidiary_billing')
        AND trip_id IN (
            SELECT id FROM app.trips WHERE subsidiary_id = app.current_subsidiary_id()
        )
    );

-- Reconciliations are written by the edge function with service-role; no
-- per-user write policy here.

CREATE POLICY reconciliation_reviews_managers ON app.reconciliation_reviews
    FOR ALL TO authenticated
    USING (app.role_is('fleet_manager') OR app.role_is('admin'))
    WITH CHECK (app.role_is('fleet_manager') OR app.role_is('admin'));

-- ---------------------------------------------------------------------------
-- service_records
-- ---------------------------------------------------------------------------
CREATE POLICY service_records_read_managers ON app.service_records
    FOR SELECT TO authenticated
    USING (app.role_is('fleet_manager') OR app.role_is('admin'));

CREATE POLICY service_records_read_subsidiary ON app.service_records
    FOR SELECT TO authenticated
    USING (
        app.role_is('subsidiary_billing')
        AND reimburse_from_subsidiary_id = app.current_subsidiary_id()
    );

CREATE POLICY service_records_write_managers ON app.service_records
    FOR ALL TO authenticated
    USING (app.role_is('fleet_manager') OR app.role_is('admin'))
    WITH CHECK (app.role_is('fleet_manager') OR app.role_is('admin'));

CREATE POLICY service_record_items_read_managers ON app.service_record_items
    FOR SELECT TO authenticated
    USING (app.role_is('fleet_manager') OR app.role_is('admin'));

CREATE POLICY service_record_items_read_subsidiary ON app.service_record_items
    FOR SELECT TO authenticated
    USING (
        app.role_is('subsidiary_billing')
        AND service_record_id IN (
            SELECT id FROM app.service_records
            WHERE reimburse_from_subsidiary_id = app.current_subsidiary_id()
        )
    );

CREATE POLICY service_record_items_write_managers ON app.service_record_items
    FOR ALL TO authenticated
    USING (app.role_is('fleet_manager') OR app.role_is('admin'))
    WITH CHECK (app.role_is('fleet_manager') OR app.role_is('admin'));

-- ---------------------------------------------------------------------------
-- invoices + line items + payments
-- ---------------------------------------------------------------------------
CREATE POLICY invoices_read_managers ON app.invoices
    FOR SELECT TO authenticated
    USING (app.role_is('fleet_manager') OR app.role_is('admin'));

CREATE POLICY invoices_read_subsidiary ON app.invoices
    FOR SELECT TO authenticated
    USING (
        app.role_is('subsidiary_billing')
        AND subsidiary_id = app.current_subsidiary_id()
        AND status <> 'draft'           -- subsidiary contact never sees drafts
    );

CREATE POLICY invoices_write_admin ON app.invoices
    FOR ALL TO authenticated
    USING (app.role_is('admin'))
    WITH CHECK (app.role_is('admin'));

-- Fleet managers can generate (insert) and update drafts, but only admin
-- can issue/void
CREATE POLICY invoices_insert_manager ON app.invoices
    FOR INSERT TO authenticated
    WITH CHECK (
        (app.role_is('fleet_manager') OR app.role_is('admin'))
        AND status = 'draft'
    );

CREATE POLICY invoices_update_manager_draft ON app.invoices
    FOR UPDATE TO authenticated
    USING ((app.role_is('fleet_manager') OR app.role_is('admin')) AND status = 'draft')
    WITH CHECK ((app.role_is('fleet_manager') OR app.role_is('admin')) AND status = 'draft');

CREATE POLICY invoice_line_items_read_managers ON app.invoice_line_items
    FOR SELECT TO authenticated
    USING (app.role_is('fleet_manager') OR app.role_is('admin'));

CREATE POLICY invoice_line_items_read_subsidiary ON app.invoice_line_items
    FOR SELECT TO authenticated
    USING (
        app.role_is('subsidiary_billing')
        AND invoice_id IN (
            SELECT id FROM app.invoices
            WHERE subsidiary_id = app.current_subsidiary_id()
              AND status <> 'draft'
        )
    );

CREATE POLICY invoice_line_items_write_managers ON app.invoice_line_items
    FOR ALL TO authenticated
    USING (
        (app.role_is('fleet_manager') OR app.role_is('admin'))
        AND invoice_id IN (
            SELECT id FROM app.invoices WHERE status = 'draft'
        )
    )
    WITH CHECK (
        (app.role_is('fleet_manager') OR app.role_is('admin'))
        AND invoice_id IN (
            SELECT id FROM app.invoices WHERE status = 'draft'
        )
    );

CREATE POLICY invoice_payments_read_managers ON app.invoice_payments
    FOR SELECT TO authenticated
    USING (app.role_is('fleet_manager') OR app.role_is('admin'));

CREATE POLICY invoice_payments_read_subsidiary ON app.invoice_payments
    FOR SELECT TO authenticated
    USING (
        app.role_is('subsidiary_billing')
        AND invoice_id IN (
            SELECT id FROM app.invoices WHERE subsidiary_id = app.current_subsidiary_id()
        )
    );

CREATE POLICY invoice_payments_write_admin ON app.invoice_payments
    FOR ALL TO authenticated
    USING (app.role_is('admin'))
    WITH CHECK (app.role_is('admin'));

-- ---------------------------------------------------------------------------
-- audit.log — append-only, admin-readable
-- ---------------------------------------------------------------------------
CREATE POLICY audit_log_read_admin ON audit.log
    FOR SELECT TO authenticated
    USING (app.role_is('admin'));

-- No INSERT/UPDATE/DELETE policies → only the SECURITY DEFINER trigger
-- function can write to audit.log, and nobody can mutate it through SQL.

COMMIT;
