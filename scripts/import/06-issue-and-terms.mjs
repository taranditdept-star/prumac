// 1) Issue all draft invoices as real receivables (issued at each period end,
//    due 30 days later). 2) Replace the placeholder trip T&C with a proper
//    default vehicle-use + privacy agreement (superseded as a new version).
import { pgClient } from "./lib.mjs";

const TERMS = `PRUMAC VEHICLE-USE AGREEMENT, TERMS & PRIVACY NOTICE

By starting this trip you confirm and agree to the following.

1. ELIGIBILITY & FITNESS
   • You hold a valid, unexpired driver's licence for this class of vehicle and are medically and mentally fit to drive.
   • You are not under the influence of alcohol, drugs or any substance that impairs driving.

2. VEHICLE CONDITION
   • You have completed the vehicle checklist and the vehicle is roadworthy, with valid licensing and insurance.
   • You will report any fault, damage or accident immediately through the app and will not continue to operate an unsafe vehicle.

3. AUTHORISED USE
   • The vehicle will be used only for the stated business purpose and authorised routes.
   • No unauthorised passengers, cargo, sub-letting or personal use without written approval.
   • You will obey all road traffic laws and observe speed limits at all times.

4. MONITORING & SPOT CHECKS
   • PRUMAC may conduct random spot checks on this vehicle at any time, including verification of mileage logs, fuel usage, vehicle condition and driver conduct.
   • Your GPS location, speed, odometer readings and trip details are recorded for the duration of the trip.

5. PRIVACY NOTICE
   • Location, odometer, fuel, and trip data are collected and processed solely for fleet operations: safety, routing, maintenance, billing and compliance.
   • Data is retained for as long as needed for these purposes and for legal record-keeping, and is not sold or shared except as required to operate the fleet or by law.
   • You may request access to your personal trip records through your fleet manager.

6. LIABILITY & RESPONSIBILITY
   • You are responsible for the vehicle, its keys, documents and contents while it is in your care.
   • Fines, penalties or damage arising from negligence, misuse or breach of these terms may be recovered from you in accordance with company policy.

7. BREACH
   • Failure to cooperate with checks, falsifying records, or any attempt to conceal misuse is a breach of contract and may result in disciplinary action, financial liability, or termination of employment/engagement.

By tapping "I accept" you confirm you have read, understood and agree to these terms and the processing of your data as described, for this trip.`;

const c = await pgClient();
try {
  const admin = (await c.query("SELECT id FROM app.profiles WHERE role='admin' LIMIT 1")).rows[0].id;

  // 1) issue all drafts
  const issue = await c.query(
    `UPDATE app.invoices
        SET status='issued',
            issued_at = period_end,
            due_at    = period_end + INTERVAL '30 days',
            issued_by = $1
      WHERE status='draft'`, [admin]);
  const totals = (await c.query(
    `SELECT count(*)::int n,
            count(*) FILTER (WHERE due_at < CURRENT_DATE)::int overdue,
            round(sum(balance_outstanding))::int outstanding
       FROM app.invoices WHERE status IN ('issued','overdue','partially_paid')`)).rows[0];
  console.log(`Invoices issued: ${issue.rowCount}`);
  console.log(`Now issued/outstanding: ${totals.n} invoices · $${totals.outstanding} outstanding · ${totals.overdue} past due-date`);

  // 2) supersede the placeholder trip_terms with the real default
  const cur = (await c.query("SELECT version FROM app.agreements WHERE kind='trip_terms' AND is_active")).rows[0];
  const nextVer = (cur?.version ?? 0) + 1;
  await c.query("UPDATE app.agreements SET is_active=false WHERE kind='trip_terms' AND is_active");
  await c.query(
    `INSERT INTO app.agreements (kind, version, title, body_md, is_active)
     VALUES ('trip_terms', $1, 'PRUMAC Vehicle-Use Agreement, Terms & Privacy Notice', $2, true)`,
    [nextVer, TERMS]);
  console.log(`Trip T&C replaced — now version ${nextVer} (drivers re-accept on next trip).`);
} finally {
  await c.end();
}
