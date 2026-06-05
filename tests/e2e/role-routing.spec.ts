import { test, expect, type Page } from "@playwright/test";

/**
 * Role-based routing tests.
 * These require seeded auth users with known credentials.
 * Until real credentials exist, they document the expected behaviour.
 *
 * To run against a real local Supabase:
 *   DRIVER_EMAIL=driver@test.prumac DRIVER_PASS=... npx playwright test role-routing
 */

async function signInWithEmail(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
}

// These tests are skipped by default and enabled when env vars are set.
const driverEmail = process.env.DRIVER_EMAIL;
const driverPass = process.env.DRIVER_PASS;
const managerEmail = process.env.MANAGER_EMAIL;
const managerPass = process.env.MANAGER_PASS;
const billingEmail = process.env.BILLING_EMAIL;
const billingPass = process.env.BILLING_PASS;

test.describe("Driver role routing", () => {
  test.skip(!driverEmail || !driverPass, "DRIVER_EMAIL / DRIVER_PASS not set");

  test("driver lands on /home after sign-in", async ({ page }) => {
    await signInWithEmail(page, driverEmail!, driverPass!);
    await expect(page).toHaveURL(/\/home/, { timeout: 8000 });
  });

  test("driver cannot access /live (ops)", async ({ page }) => {
    await signInWithEmail(page, driverEmail!, driverPass!);
    await page.goto("/live");
    // Should redirect away from /live
    await expect(page).not.toHaveURL(/\/live/);
  });

  test("driver cannot access /invoices (billing)", async ({ page }) => {
    await signInWithEmail(page, driverEmail!, driverPass!);
    await page.goto("/invoices");
    await expect(page).not.toHaveURL(/\/invoices/);
  });

  test("driver sees bottom tab navigation", async ({ page }) => {
    await signInWithEmail(page, driverEmail!, driverPass!);
    await page.goto("/home");
    await expect(page.getByRole("navigation")).toBeVisible();
    await expect(page.getByRole("link", { name: /home/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /trip/i })).toBeVisible();
  });
});

test.describe("Fleet manager role routing", () => {
  test.skip(!managerEmail || !managerPass, "MANAGER_EMAIL / MANAGER_PASS not set");

  test("fleet_manager lands on /live after sign-in", async ({ page }) => {
    await signInWithEmail(page, managerEmail!, managerPass!);
    await expect(page).toHaveURL(/\/live/, { timeout: 8000 });
  });

  test("fleet_manager sees sidebar navigation", async ({ page }) => {
    await signInWithEmail(page, managerEmail!, managerPass!);
    await page.goto("/live");
    await expect(page.getByRole("navigation")).toBeVisible();
    await expect(page.getByRole("link", { name: /live ops/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /vehicles/i })).toBeVisible();
  });

  test("fleet_manager cannot access /rates (admin-only billing)", async ({ page }) => {
    await signInWithEmail(page, managerEmail!, managerPass!);
    await page.goto("/rates");
    await expect(page).not.toHaveURL(/\/rates/);
  });
});

test.describe("Billing role routing", () => {
  test.skip(!billingEmail || !billingPass, "BILLING_EMAIL / BILLING_PASS not set");

  test("subsidiary_billing lands on /invoices after sign-in", async ({ page }) => {
    await signInWithEmail(page, billingEmail!, billingPass!);
    await expect(page).toHaveURL(/\/invoices/, { timeout: 8000 });
  });

  test("billing user cannot access /live", async ({ page }) => {
    await signInWithEmail(page, billingEmail!, billingPass!);
    await page.goto("/live");
    await expect(page).not.toHaveURL(/\/live/);
  });
});
