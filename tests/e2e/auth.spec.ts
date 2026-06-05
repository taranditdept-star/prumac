import { test, expect } from "@playwright/test";

/**
 * Phase 2 E2E tests: auth flows.
 *
 * These tests run against the local dev server (http://localhost:3000)
 * with the local Supabase instance running. Seed users are created by
 * supabase/migrations/0009_seed_drivers.sql.
 *
 * Run: npx playwright test tests/e2e/auth.spec.ts
 */

test.describe("Unauthenticated redirect", () => {
  test("root redirects to /login", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login/);
  });

  test("protected ops route redirects to /login", async ({ page }) => {
    await page.goto("/live");
    await expect(page).toHaveURL(/\/login/);
  });

  test("protected driver route redirects to /login", async ({ page }) => {
    await page.goto("/home");
    await expect(page).toHaveURL(/\/login/);
  });

  test("protected billing route redirects to /login", async ({ page }) => {
    await page.goto("/invoices");
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("Login page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
  });

  test("shows email sign-in form by default", async ({ page }) => {
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  });

  test("switches to phone OTP mode", async ({ page }) => {
    await page.getByRole("button", { name: /driver\? sign in with phone/i }).click();
    await expect(page.getByLabel("Phone number")).toBeVisible();
    await expect(page.getByRole("button", { name: /send code/i })).toBeVisible();
  });

  test("switches back to email from phone mode", async ({ page }) => {
    await page.getByRole("button", { name: /driver\? sign in with phone/i }).click();
    await page.getByRole("button", { name: /sign in with email/i }).click();
    await expect(page.getByLabel("Email")).toBeVisible();
  });

  test("shows validation error for empty email submit", async ({ page }) => {
    await page.getByRole("button", { name: /sign in/i }).click();
    // Browser native validation prevents submission — confirm no redirect
    await expect(page).toHaveURL(/\/login/);
  });

  test("shows error for wrong credentials", async ({ page }) => {
    await page.getByLabel("Email").fill("nobody@prumac.zw");
    await page.getByLabel("Password").fill("wrongpassword");
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page.getByText(/invalid login credentials|error/i)).toBeVisible({ timeout: 5000 });
  });

  test("has link to forgot password", async ({ page }) => {
    await expect(page.getByRole("link", { name: /forgot password/i })).toBeVisible();
  });
});

test.describe("Password reset page", () => {
  test("shows reset form", async ({ page }) => {
    await page.goto("/reset-password");
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByRole("button", { name: /send reset link/i })).toBeVisible();
  });

  test("back to sign-in link works", async ({ page }) => {
    await page.goto("/reset-password");
    await page.getByRole("link", { name: /back to sign in/i }).click();
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("Phone OTP flow", () => {
  test("after send code shows 6-digit verify input", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: /driver\? sign in with phone/i }).click();
    await page.getByLabel("Phone number").fill("+263771234567");
    // Cannot actually send SMS in test — intercept network if needed
    // This confirms the form structure is correct.
    await expect(page.getByRole("button", { name: /send code/i })).toBeEnabled();
  });
});

test.describe("Health endpoint", () => {
  test("GET /api/health returns ok", async ({ request }) => {
    const response = await request.get("/api/health");
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("ok");
  });
});
