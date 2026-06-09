import { PushAlerts } from "@/components/pwa/PushAlerts";
import { EmergencyAlarm } from "@/components/ops/EmergencyAlarm";

/**
 * Bundles the manager-facing emergency alerting:
 *  - PushAlerts: opt-in + keeps the Web Push subscription registered (fires
 *    even when the app is closed).
 *  - EmergencyAlarm: loud in-app siren + overlay when an accident is reported
 *    while the dashboard is open.
 * Mounted once in the (ops) and (billing) layouts.
 */
export function ManagerAlerting() {
  return (
    <>
      <PushAlerts />
      <EmergencyAlarm />
    </>
  );
}
