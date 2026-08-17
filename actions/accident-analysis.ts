"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import { requireRole } from "@/lib/auth/session";
import { EVIDENCE_BUCKET } from "@/lib/evidence/limits";
import { canExtractText, extractText } from "@/lib/evidence/doctext";
import { reviewAccident } from "@/lib/chitsano/accident-review";

export type AnalysisResult<T = void> = { error: string } | { success: true; data?: T };

const CHITSANO = "Chitsano AI";

/**
 * Read the words out of an attached document (the committee's interview report)
 * and store them, so the statement can be shown and compared.
 */
export async function extractMediaText(mediaId: string): Promise<AnalysisResult<{ chars: number }>> {
  await requireRole("fleet_manager", "admin");
  const service = createServiceClient();

  const { data: row } = await service
    .schema("app")
    .from("accident_media")
    .select("id, accident_id, bucket, file_path, mime_type, original_filename")
    .eq("id", mediaId)
    .maybeSingle<{
      id: string;
      accident_id: string;
      bucket: string;
      file_path: string;
      mime_type: string | null;
      original_filename: string | null;
    }>();
  if (!row) return { error: "That attachment no longer exists." };

  if (!canExtractText(row.mime_type, row.original_filename)) {
    return {
      error:
        "Text can only be read from Word (.docx) and plain-text files. For a PDF or a scanned page, use the OCR option on a photo of it.",
    };
  }

  const { data: file, error: dlErr } = await service.storage
    .from(row.bucket || EVIDENCE_BUCKET)
    .download(row.file_path);
  if (dlErr || !file) return { error: "Couldn't open that file." };

  const bytes = new Uint8Array(await file.arrayBuffer());
  const text = extractText(bytes, row.mime_type, row.original_filename);
  if (!text) return { error: "No readable text was found in that document." };

  const { error } = await service
    .schema("app")
    .from("accident_media")
    .update({ extracted_text: text.slice(0, 200_000), extracted_at: new Date().toISOString() })
    .eq("id", mediaId);
  if (error) return { error: error.message };

  revalidatePath(`/accidents/${row.accident_id}`);
  return { success: true, data: { chars: text.length } };
}

/** Store OCR text the browser produced for a photo (client-side tesseract). */
export async function saveMediaOcrText(mediaId: string, text: string): Promise<AnalysisResult> {
  await requireRole("fleet_manager", "admin");
  const clean = (text ?? "").trim();
  if (!clean) return { error: "No text was recognised in that image." };

  const service = createServiceClient();
  const { data: row } = await service
    .schema("app")
    .from("accident_media")
    .select("accident_id")
    .eq("id", mediaId)
    .maybeSingle<{ accident_id: string }>();
  if (!row) return { error: "That attachment no longer exists." };

  const { error } = await service
    .schema("app")
    .from("accident_media")
    .update({ extracted_text: clean.slice(0, 50_000), extracted_at: new Date().toISOString() })
    .eq("id", mediaId);
  if (error) return { error: error.message };

  revalidatePath(`/accidents/${row.accident_id}`);
  return { success: true };
}

/**
 * Run Chitsano's comparison of the driver's account against the committee's
 * report and record it as a verdict alongside the human ones. Re-running
 * replaces the previous Chitsano row (unique partial index in 0067).
 */
export async function runChitsanoAccidentReview(
  accidentId: string,
): Promise<AnalysisResult<{ discrepancies: number; verdict: string }>> {
  await requireRole("fleet_manager", "admin");
  const service = createServiceClient();

  const [{ data: accident }, { data: media }] = await Promise.all([
    service
      .schema("app")
      .from("accidents")
      .select("id, description, severity, injuries, other_parties_involved, police_report_number, occurred_at")
      .eq("id", accidentId)
      .maybeSingle<{
        id: string;
        description: string;
        severity: string;
        injuries: boolean;
        other_parties_involved: boolean;
        police_report_number: string | null;
        occurred_at: string;
      }>(),
    service
      .schema("app")
      .from("accident_media")
      .select("kind, source, extracted_text")
      .eq("accident_id", accidentId)
      .returns<{ kind: string; source: string; extracted_text: string | null }[]>(),
  ]);
  if (!accident) return { error: "Accident not found." };

  const all = media ?? [];
  // Committee text = extracted text from documents (or anything tagged committee).
  const committeeText = all
    .filter((m) => m.extracted_text && (m.kind === "document" || m.source === "committee"))
    .map((m) => m.extracted_text as string)
    .join("\n\n");
  const imageText = all
    .filter((m) => m.extracted_text && m.kind === "photo")
    .map((m) => m.extracted_text as string)
    .join("\n\n");

  const result = reviewAccident({
    driverStatement: accident.description ?? "",
    committeeText,
    imageText,
    facts: {
      severity: accident.severity,
      injuries: accident.injuries,
      otherParties: accident.other_parties_involved,
      policeReport: accident.police_report_number,
      occurredAt: accident.occurred_at,
    },
    counts: {
      photos: all.filter((m) => m.kind === "photo").length,
      videos: all.filter((m) => m.kind === "video").length,
      audios: all.filter((m) => m.kind === "audio").length,
      documents: all.filter((m) => m.kind === "document").length,
    },
  });

  // Replace any previous Chitsano assessment for this accident.
  await service
    .schema("app")
    .from("accident_verdicts")
    .delete()
    .eq("accident_id", accidentId)
    .eq("author_name", CHITSANO);

  const { error } = await service.schema("app").from("accident_verdicts").insert({
    accident_id: accidentId,
    share_id: null,
    author_name: CHITSANO,
    author_role: "Automated review",
    verdict: result.verdict,
    comment: result.comment,
  });
  if (error) return { error: error.message };

  revalidatePath(`/accidents/${accidentId}`);
  return { success: true, data: { discrepancies: result.discrepancyCount, verdict: result.verdict } };
}
