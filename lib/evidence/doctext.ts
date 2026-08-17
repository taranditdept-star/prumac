import "server-only";
import { unzipSync, strFromU8 } from "fflate";

/**
 * Pull readable text out of an evidence document.
 *
 * A .docx is a ZIP containing word/document.xml, so this unzips it and strips the
 * WordprocessingML tags — paragraph and line breaks become newlines, table cells
 * become tab-separated. No external service and no API key; the file never leaves
 * the server.
 *
 * Deliberately NOT supported: .doc (old binary format), .pdf (needs a parser).
 * Those return null so the UI can say so honestly rather than showing gibberish.
 */
export function extractDocxText(bytes: Uint8Array): string | null {
  try {
    const files = unzipSync(bytes, { filter: (f) => f.name === "word/document.xml" });
    const xml = files["word/document.xml"];
    if (!xml) return null;
    return xmlToText(strFromU8(xml));
  } catch {
    return null;
  }
}

function xmlToText(xml: string): string {
  let s = xml;
  // Structure → whitespace, before tags are stripped.
  s = s.replace(/<w:tab\b[^>]*\/?>/g, "\t");
  s = s.replace(/<w:br\b[^>]*\/?>/g, "\n");
  s = s.replace(/<\/w:p>/g, "\n");
  s = s.replace(/<\/w:tc>/g, "\t");
  s = s.replace(/<\/w:tr>/g, "\n");
  // Drop every remaining tag.
  s = s.replace(/<[^>]+>/g, "");
  // XML entities.
  s = s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)));
  // Tidy whitespace without destroying paragraphs.
  s = s.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ");
  return s.trim();
}

/** True when we can actually read this file's text. */
export function canExtractText(mime: string | null, filename: string | null): boolean {
  const m = (mime ?? "").toLowerCase();
  const n = (filename ?? "").toLowerCase();
  if (m === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return true;
  if (m === "text/plain") return true;
  return n.endsWith(".docx") || n.endsWith(".txt");
}

export function extractText(bytes: Uint8Array, mime: string | null, filename: string | null): string | null {
  const m = (mime ?? "").toLowerCase();
  const n = (filename ?? "").toLowerCase();
  if (m === "text/plain" || n.endsWith(".txt")) {
    const t = strFromU8(bytes).trim();
    return t || null;
  }
  if (canExtractText(mime, filename)) return extractDocxText(bytes);
  return null;
}
