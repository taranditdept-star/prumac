/**
 * The one list of trip purposes.
 *
 * This was duplicated across four forms and two validation schemas, so adding a
 * purpose meant editing six files and the enum — and any one of them drifting
 * silently broke a dropdown. Everything now reads from here; the values must
 * match the app.trip_purpose enum (migrations 0001 and 0073).
 *
 * Order is roughly by how often the fleet uses them, since drivers pick from a
 * dropdown on a phone and the common ones should be near the top.
 */
export const TRIP_PURPOSES = [
  ["delivery", "Delivery"],
  ["collection", "Collection"],
  ["sales", "Sales"],
  ["staff_transport", "Staff transport"],
  ["procurement", "Procurement / supplier run"],
  ["fuel_run", "Fuel run"],
  ["site_visit", "Site visit"],
  ["banking", "Banking"],
  ["maintenance_run", "Maintenance run"],
  ["vehicle_transfer", "Vehicle transfer"],
  ["airport_transfer", "Airport transfer"],
  ["training", "Training"],
  ["emergency", "Emergency"],
  ["admin", "Admin"],
  ["personal", "Personal"],
  ["other", "Other"],
] as const satisfies readonly (readonly [string, string])[];

export const TRIP_PURPOSE_VALUES = TRIP_PURPOSES.map(([v]) => v) as unknown as [
  string,
  ...string[],
];

export type TripPurpose = (typeof TRIP_PURPOSES)[number][0];

/** "staff_transport" -> "Staff transport". Falls back to the raw value. */
export function purposeLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return TRIP_PURPOSES.find(([v]) => v === value)?.[1] ?? value.replaceAll("_", " ");
}

/**
 * What to show for a trip: the driver's own words when they wrote any,
 * otherwise the picked purpose.
 */
export function purposeText(purpose: string | null | undefined, detail?: string | null): string {
  const label = purposeLabel(purpose);
  return detail?.trim() ? `${label} — ${detail.trim()}` : label;
}

export const PURPOSE_DETAIL_MAX = 200;
