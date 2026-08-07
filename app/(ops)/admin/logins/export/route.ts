import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import * as XLSX from "xlsx";
import { requireRole } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Passwords are stored one-way hashed and cannot be read back, so the only way
// to put a password in the sheet is to set a fresh one. mode=new resets only
// drivers who have never signed in (safe); mode=all resets every active driver
// so the admin can see them all (destructive — everyone's password changes).

function genPassword(len = 10): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const b = randomBytes(len);
  let o = "";
  for (let i = 0; i < len; i++) o += chars[b[i] % chars.length];
  return o;
}

interface DriverRow {
  employee_number: string | null;
  is_active: boolean | null;
  profile_id: string;
  profiles: { full_name: string | null; phone: string | null } | null;
}

export async function POST(request: NextRequest) {
  await requireRole("admin");
  const mode = request.nextUrl.searchParams.get("mode") === "all" ? "all" : "new";
  const service = createServiceClient();

  const [{ data: drivers }, { data: list }] = await Promise.all([
    service
      .schema("app")
      .from("drivers")
      .select("employee_number, is_active, profile_id, profiles(full_name, phone)")
      .returns<DriverRow[]>(),
    service.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);
  const authById = new Map((list?.users ?? []).map((u) => [u.id, u]));

  const rows: Record<string, string>[] = [];
  for (const d of drivers ?? []) {
    const name = d.profiles?.full_name ?? "";
    const username = d.employee_number ?? "";
    const phone = d.profiles?.phone ?? "";
    const au = authById.get(d.profile_id);
    const neverLoggedIn = !au?.last_sign_in_at;

    let password = "";
    let status = "";
    if (d.is_active === false) {
      status = "Inactive account";
    } else if (mode === "all" || neverLoggedIn) {
      password = genPassword();
      const { error } = await service.auth.admin.updateUserById(d.profile_id, { password });
      if (error) {
        password = "";
        status = "Password reset failed";
      } else {
        status = neverLoggedIn ? "New login — give this password to the driver" : "Password reset to the one shown";
      }
    } else {
      status = "Already signed in — password unchanged";
    }
    rows.push({ Name: name, "Driver ID (username)": username, Phone: phone, Password: password, Status: status });
  }
  rows.sort((a, b) => (a["Driver ID (username)"] || "").localeCompare(b["Driver ID (username)"] || ""));

  const header = ["Name", "Driver ID (username)", "Phone", "Password", "Status"];
  const ws = XLSX.utils.json_to_sheet(rows, { header });
  ws["!cols"] = [{ wch: 26 }, { wch: 20 }, { wch: 16 }, { wch: 14 }, { wch: 42 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Driver logins");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

  const today = new Date().toISOString().slice(0, 10);
  const filename = `prumac-driver-logins-${today}.xlsx`;
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
