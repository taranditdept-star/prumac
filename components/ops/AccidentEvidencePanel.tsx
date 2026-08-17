"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Paperclip } from "lucide-react";
import { EvidenceUploader } from "@/components/ops/EvidenceUploader";
import { EvidenceGallery, type GalleryItem } from "@/components/primitives/EvidenceGallery";
import { deleteAccidentMedia } from "@/actions/accident-evidence";

export function AccidentEvidencePanel({
  accidentId,
  items,
}: {
  accidentId: string;
  items: GalleryItem[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  function remove(id: string) {
    const it = items.find((x) => x.id === id);
    if (!confirm(`Remove ${it?.original_filename ?? "this attachment"}? This deletes the file permanently.`)) return;
    startTransition(async () => {
      const r = await deleteAccidentMedia(id);
      if ("error" in r) toast.error(r.error);
      else {
        toast.success("Attachment removed");
        router.refresh();
      }
    });
  }

  return (
    <section className="rounded-2xl border border-ink-200/70 bg-white p-6 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-bold text-ink-900">
            <Paperclip className="h-4 w-4 text-orange-600" /> Evidence
          </h2>
          <p className="mt-0.5 text-xs text-ink-500">
            Photos, video, audio statements and documents added by the committee.
          </p>
        </div>
        <span className="shrink-0 rounded-lg bg-ink-100 px-2 py-1 text-[11px] font-bold text-ink-600">
          {items.length} {items.length === 1 ? "file" : "files"}
        </span>
      </div>

      <EvidenceUploader accidentId={accidentId} />
      <EvidenceGallery items={items} onDelete={remove} />
    </section>
  );
}
