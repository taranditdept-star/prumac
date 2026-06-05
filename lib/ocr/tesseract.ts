// Client-side OCR via tesseract.js. The library is dynamically imported so it
// (and the worker/WASM it pulls from the CDN) never touches the initial bundle.
// Runs entirely in the browser — no image leaves the device, no API key needed.

export type OcrProgress = (pct: number) => void;

export async function recognizeImage(file: File | Blob, onProgress?: OcrProgress): Promise<string> {
  const { createWorker } = await import("tesseract.js");

  const worker = await createWorker("eng", 1, {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === "recognizing text" && onProgress) {
        onProgress(Math.round(m.progress * 100));
      }
    },
  });

  try {
    const { data } = await worker.recognize(file);
    return data.text ?? "";
  } finally {
    await worker.terminate();
  }
}
