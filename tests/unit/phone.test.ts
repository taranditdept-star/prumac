/**
 * Unit tests for phone normalisation used in auth.ts.
 * Run: npx vitest tests/unit/phone.test.ts
 */

import { describe, it, expect } from "vitest";
import { normalisePhone } from "@/lib/utils/phone";

describe("normalisePhone", () => {
  it("leaves already-prefixed ZW numbers alone", () => {
    expect(normalisePhone("+263773456789")).toBe("+263773456789");
  });

  it("leaves already-prefixed SA numbers alone", () => {
    expect(normalisePhone("+27731234567")).toBe("+27731234567");
  });

  it("expands ZW local 077 format", () => {
    expect(normalisePhone("0773456789")).toBe("+263773456789");
  });

  it("expands ZW local 071 format", () => {
    expect(normalisePhone("0712345678")).toBe("+263712345678");
  });

  it("strips spaces and dashes", () => {
    expect(normalisePhone("077 345 6789")).toBe("+263773456789");
    expect(normalisePhone("263-77-345-6789")).toBe("+263773456789");
  });

  it("handles 263 prefix without +", () => {
    expect(normalisePhone("263773456789")).toBe("+263773456789");
  });
});
