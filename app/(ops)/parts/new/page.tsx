import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/lib/auth/session";
import { PartForm } from "@/components/ops/PartForm";

export const dynamic = "force-dynamic";

export default async function NewPartPage() {
  await requireRole("fleet_manager", "admin");

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto space-y-6">
      <Link
        href="/parts"
        className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-900 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to parts
      </Link>

      <div>
        <h1 className="text-2xl lg:text-3xl font-bold text-ink-900 tracking-tight">Add part</h1>
        <p className="text-sm text-ink-500 mt-1">
          Add a part to the catalogue. Opening stock is recorded as the first movement.
        </p>
      </div>

      <PartForm />
    </div>
  );
}
