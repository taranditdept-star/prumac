import { z } from "zod";

/**
 * One shared rule for every odometer reading in the system.
 *
 * Readings carry one decimal place, because that is what the dash and the trip
 * meter actually show — a driver reading 4890.4 should not have to round, and
 * over a month those roundings add up in the distance and fuel figures.
 * Anything finer is false precision, so extra decimals are snapped to 0.1
 * rather than rejected: a driver who types 4890.44 gets 4890.4, not an error.
 *
 * Matches numeric(10,1) in the database (migration 0072).
 */
const ONE_DP = (n: number) => Math.round(n * 10) / 10;

export const odometerKm = () =>
  z.coerce
    .number({ message: "Enter the odometer reading" })
    .min(0, "Odometer cannot be negative")
    .max(9_999_999, "That odometer reading is too large")
    .transform(ONE_DP);

/** Same rule, for fields that may legitimately be left blank. */
export const odometerKmOptional = () => odometerKm().nullable().optional();

/** Formats a reading for display: 4890.4 -> "4,890.4", 88854 -> "88,854". */
export function formatKm(km: number | string | null | undefined): string {
  if (km === null || km === undefined || km === "") return "—";
  const n = typeof km === "string" ? Number(km) : km;
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-GB", { maximumFractionDigits: 1 });
}
