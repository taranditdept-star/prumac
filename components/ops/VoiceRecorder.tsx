"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Square, Loader2, X } from "lucide-react";

/**
 * Records a voice note in the browser (MediaRecorder) so the committee can
 * capture a driver's statement without leaving the report — no phone-to-computer
 * transfer, no WhatsApp round trip. Produces audio/webm (Chromium) or audio/mp4
 * (Safari), both of which the evidence bucket accepts.
 */
export function VoiceRecorder({
  onRecorded,
  onClose,
}: {
  onRecorded: (file: File) => void;
  onClose: () => void;
}) {
  const [state, setState] = useState<"idle" | "asking" | "recording" | "error">("idle");
  const [seconds, setSeconds] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    return () => {
      // Always release the microphone.
      recRef.current?.state === "recording" && recRef.current.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  useEffect(() => {
    if (state !== "recording") return;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [state]);

  async function start() {
    setMessage(null);
    setState("asking");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
      const rec = new MediaRecorder(stream, { mimeType: mime });
      chunks.current = [];
      rec.ondataavailable = (e) => e.data.size > 0 && chunks.current.push(e.data);
      rec.onstop = () => {
        const blob = new Blob(chunks.current, { type: mime });
        const ext = mime === "audio/webm" ? "webm" : "m4a";
        const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
        onRecorded(new File([blob], `statement-${stamp}.${ext}`, { type: mime }));
        streamRef.current?.getTracks().forEach((t) => t.stop());
        onClose();
      };
      recRef.current = rec;
      rec.start();
      setSeconds(0);
      setState("recording");
    } catch (e) {
      setState("error");
      setMessage(
        e instanceof Error && e.name === "NotAllowedError"
          ? "Microphone access was blocked. Allow it in the browser address bar, then try again."
          : "No microphone available on this device.",
      );
    }
  }

  const mmss = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-ink-900">Record a statement</p>
          <p className="mt-0.5 text-xs text-ink-500">
            Records here and attaches straight to this report. Keep it under {Math.round(50)} MB — roughly an hour.
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="text-ink-400 hover:text-ink-700">
          <X className="h-4 w-4" />
        </button>
      </div>

      {message && <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{message}</p>}

      <div className="mt-3 flex items-center gap-3">
        {state !== "recording" ? (
          <button
            type="button"
            onClick={start}
            disabled={state === "asking"}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-bold text-white hover:bg-violet-700 disabled:opacity-50"
          >
            {state === "asking" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
            {state === "asking" ? "Waiting for microphone…" : "Start recording"}
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => recRef.current?.stop()}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-rose-600 px-4 text-sm font-bold text-white hover:bg-rose-700"
            >
              <Square className="h-4 w-4" /> Stop &amp; attach
            </button>
            <span className="inline-flex items-center gap-2 font-plate text-sm font-bold text-rose-700">
              <span className="h-2 w-2 animate-pulse rounded-full bg-rose-500" /> {mmss}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
