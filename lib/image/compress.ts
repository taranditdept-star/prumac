"use client";

/**
 * Compress an image to a reasonably-sized JPEG entirely in the browser.
 * Normalises phone-camera formats (incl. HEIC where the browser can decode it)
 * to JPEG and keeps the upload small, so it stays well under the Server Action
 * body-size limit (and Vercel's hard request cap). Falls back to the original
 * file if the browser can't decode it.
 */
export async function compressImage(file: File, maxDim = 1600, quality = 0.72): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, "image/jpeg", quality));
    if (!blob || blob.size === 0) return file;
    const base = file.name.replace(/\.[^.]+$/, "") || "photo";
    return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
  } catch {
    return file;
  }
}
