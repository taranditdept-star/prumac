import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { readShareSession, shareCookieName } from "@/lib/evidence/share";
import { EVIDENCE_BUCKET } from "@/lib/evidence/limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Serves one evidence file to a password-verified viewer.
 *
 * Why this exists: handing the browser a 4-hour service-role signed URL meant
 * REVOKING a link didn't actually cut off access — those URLs are unauthenticated
 * bearer links and kept working for hours, which defeats the only off switch a
 * never-expiring link has. Every byte now goes through this route, which
 * re-checks the share (revoked? right password version? valid session?) on each
 * request and then redirects to a signed URL valid for ONE minute.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string; mediaId: string }> },
) {
  const { token, mediaId } = await params;
  const service = createServiceClient();

  const { data: share } = await service
    .schema("app")
    .from("accident_shares")
    .select("id, accident_id, revoked_at, password_version")
    .eq("token", token)
    .maybeSingle<{ id: string; accident_id: string; revoked_at: string | null; password_version: number }>();

  if (!share || share.revoked_at) {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  const store = await cookies();
  if (!readShareSession(store.get(shareCookieName(token))?.value, share.id, share.password_version ?? 1)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // The file must belong to THIS report — never trust the id alone.
  const { data: media } = await service
    .schema("app")
    .from("accident_media")
    .select("bucket, file_path, accident_id")
    .eq("id", mediaId)
    .eq("accident_id", share.accident_id)
    .maybeSingle<{ bucket: string; file_path: string; accident_id: string }>();

  if (!media) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: signed, error } = await service.storage
    .from(media.bucket || EVIDENCE_BUCKET)
    .createSignedUrl(media.file_path, 60);

  if (error || !signed?.signedUrl) {
    return NextResponse.json({ error: "Could not load the file" }, { status: 502 });
  }

  // 302 so <video>/<audio> range requests come back through this check.
  return NextResponse.redirect(signed.signedUrl, {
    status: 302,
    headers: { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" },
  });
}
