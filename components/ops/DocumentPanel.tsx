"use client";

import { useState, useTransition, useRef } from "react";
import { toast } from "sonner";
import { ExpiryBadge } from "@/components/primitives/ExpiryBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OcrButton } from "@/components/ocr/OcrButton";
import { parseLicenceDisc } from "@/lib/ocr/parse";
import { upsertDocument, uploadDocumentFile, deactivateDocument } from "@/actions/documents";
import type { DocumentRow, DocumentType, InsuranceType } from "@/types/domain";

const DOC_TYPES: [DocumentType, string][] = [
  ["license_disc", "License disc"],
  ["insurance", "Insurance"],
  ["fitness", "Certificate of fitness"],
  ["registration", "Registration"],
  ["cross_border", "Cross-border permit"],
];

const INSURANCE_TYPES: [InsuranceType, string][] = [
  ["third_party", "Third party"],
  ["full_cover", "Full cover"],
  ["champions", "Champions Insurance"],
  ["old_mutual_full_cover", "Old Mutual full cover"],
  ["miway_full_cover", "MiWay full cover"],
  ["other", "Other"],
];

interface DocumentPanelProps {
  vehicleId: string;
  documents: DocumentRow[];
}

export function DocumentPanel({ vehicleId, documents }: DocumentPanelProps) {
  const [addingType, setAddingType] = useState<DocumentType | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const expiryRef = useRef<HTMLInputElement>(null);
  const docNumRef = useRef<HTMLInputElement>(null);

  // License-disc / document OCR → prefill expiry + number (user reviews).
  function handleDiscScan(text: string) {
    const f = parseLicenceDisc(text);
    if (f.expires_at && expiryRef.current) expiryRef.current.value = f.expires_at;
    if (f.document_number && docNumRef.current) docNumRef.current.value = f.document_number;
    const got = [f.expires_at && "expiry date", f.document_number && "number"].filter(Boolean);
    toast.success(got.length ? `Scanned ${got.join(", ")} — please review` : "Scan complete — review the fields");
  }

  function handleAddDoc(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("vehicle_id", vehicleId);
    startTransition(async () => {
      const result = await upsertDocument(fd);
      if ("error" in result) {
        toast.error(result.error);
      } else {
        toast.success("Document saved.");
        // Upload file if selected
        const file = fileRef.current?.files?.[0];
        if (file && result.data?.id) {
          const uploadResult = await uploadDocumentFile(result.data.id, vehicleId, file);
          if ("error" in uploadResult) toast.error(`File upload failed: ${uploadResult.error}`);
        }
        setAddingType(null);
      }
    });
  }

  function handleDeactivate(docId: string) {
    startTransition(async () => {
      const result = await deactivateDocument(docId, vehicleId);
      if ("error" in result) toast.error(result.error);
      else toast.success("Document removed.");
    });
  }

  const docMap = new Map(documents.map((d) => [d.document_type, d]));

  return (
    <div className="rounded-lg border border-slate-200 bg-white divide-y divide-slate-100">
      {DOC_TYPES.map(([type, label]) => {
        const doc = docMap.get(type);
        return (
          <div key={type} className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-ink-900 w-48">{label}</span>
              {doc ? (
                <div className="flex items-center gap-2">
                  <ExpiryBadge expiresAt={doc.expires_at} showDate />
                  {doc.insurance_type && (
                    <span className="text-xs text-muted-foreground">
                      {INSURANCE_TYPES.find(([t]) => t === doc.insurance_type)?.[1]}
                    </span>
                  )}
                  {doc.file_path && (
                    <span className="text-xs text-orange-600">📎</span>
                  )}
                </div>
              ) : (
                <span className="text-xs text-muted-foreground italic">No document on file</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {doc && (
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-rose-600 transition-colors"
                  onClick={() => handleDeactivate(doc.id)}
                  disabled={isPending}
                >
                  Remove
                </button>
              )}
              <button
                type="button"
                className="text-xs text-orange-600 hover:underline"
                onClick={() => setAddingType(addingType === type ? null : type)}
              >
                {doc ? "Update" : "Add"}
              </button>
            </div>
          </div>
        );
      })}

      {/* Inline add/update form */}
      {addingType && (
        <div className="px-4 py-4 bg-slate-50">
          <form onSubmit={handleAddDoc} className="space-y-3">
            <input type="hidden" name="document_type" value={addingType} />
            <div className="flex items-center justify-between gap-3 rounded-lg bg-orange-50/60 border border-orange-100 px-3 py-2">
              <p className="text-xs text-ink-600">
                Snap the {DOC_TYPES.find(([t]) => t === addingType)?.[1].toLowerCase()} to auto-fill the expiry and number.
              </p>
              <OcrButton
                label="Scan"
                onText={handleDiscScan}
                className="inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg border border-ink-200 bg-white text-ink-700 text-xs font-semibold hover:bg-ink-50 transition-all disabled:opacity-60"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Expiry date *</Label>
                <Input ref={expiryRef} name="expires_at" type="date" required />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Issue date</Label>
                <Input name="issued_at" type="date" />
              </div>
            </div>
            {addingType === "insurance" && (
              <div className="space-y-1">
                <Label className="text-xs">Insurance type *</Label>
                <select
                  name="insurance_type"
                  className="flex h-8 w-full rounded-md border border-input bg-background px-3 text-xs shadow-xs focus:outline-none focus:ring-1 focus:ring-ring"
                  required
                >
                  <option value="">— select —</option>
                  {INSURANCE_TYPES.map(([val, label]) => (
                    <option key={val} value={val}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Document number</Label>
                <Input ref={docNumRef} name="document_number" className="h-8 text-xs font-plate" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Issuer</Label>
                <Input name="issuer" className="h-8 text-xs" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Upload document (PDF / image)</Label>
              <Input ref={fileRef} type="file" accept="application/pdf,image/*" className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Notes</Label>
              <Input name="notes" className="h-8 text-xs" />
            </div>
            <div className="flex gap-2">
              <Button
                type="submit"
                size="sm"
                className="h-8 bg-orange-500 hover:bg-orange-600 text-white text-xs"
                disabled={isPending}
              >
                {isPending ? "Saving…" : "Save document"}
              </Button>
              <button
                type="button"
                className="text-xs text-muted-foreground hover:underline"
                onClick={() => setAddingType(null)}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
