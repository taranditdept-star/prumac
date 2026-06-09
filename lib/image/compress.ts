"use client";

/**
 * Compress an image to a reasonably-sized JPEG entirely in the browser.
 * Normalises phone-camera formats (incl. HEIC where the browser can decode it)
 * to JPEG and keeps the upload small, so it stays well under the Server Action
 * body-size limit (and Vercel's hard request cap). Falls back to the original
 * file if the browser can't decode it.
 */
/** File → data URL (base64). Used for previews that survive a tab reload. */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

/** Reconstruct a File from a persisted data URL. */
export function dataUrlToFile(dataUrl: string, name: string): File {
  const [head, b64] = dataUrl.split(",");
  const mime = (head.match(/data:(.*?);/) || [])[1] || "image/jpeg";
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new File([arr], name, { type: mime });
}

/**
 * Small data-URL thumbnail (for previews persisted in sessionStorage — keeps
 * the quota tiny even with many high-res photos). Returns "" on failure.
 */
export async function makeThumbDataUrl(file: File, maxDim = 320, quality = 0.6): Promise<string> {
  try {
    const small = await compressImage(file, maxDim, quality);
    return await fileToDataUrl(small);
  } catch {
    return "";
  }
}

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
