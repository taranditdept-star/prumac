"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, X, SwitchCamera, Loader2 } from "lucide-react";

interface CameraCaptureProps {
  /** Called with a JPEG File for every shot taken. */
  onCapture: (file: File) => void;
  /** Close the camera (Done / X). */
  onClose: () => void;
  /** Camera not available/denied — caller should fall back to a file input. */
  onUnavailable: () => void;
}

/**
 * Full-screen IN-PAGE camera using getUserMedia. Unlike a `<input capture>`
 * file input (which launches the system camera app and lets Android discard
 * the web page while it's open — losing the photo and form state on return),
 * this keeps the user inside the page, so the very first shot works and the
 * captured frame is handed straight to the uploader. Tap the shutter as many
 * times as you like, then Done.
 */
export function CameraCapture({ onCapture, onClose, onUnavailable }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [ready, setReady] = useState(false);
  const [count, setCount] = useState(0);
  const [flash, setFlash] = useState(false);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(
    async (mode: "environment" | "user") => {
      stop();
      setReady(false);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: mode }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setReady(true);
      } catch {
        onUnavailable();
      }
    },
    [stop, onUnavailable],
  );

  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia) {
      onUnavailable();
      return;
    }
    void start(facing);
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function switchCam() {
    const next = facing === "environment" ? "user" : "environment";
    setFacing(next);
    void start(next);
  }

  function snap() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        onCapture(new File([blob], `capture-${Date.now()}.jpg`, { type: "image/jpeg" }));
        setCount((c) => c + 1);
        setFlash(true);
        window.setTimeout(() => setFlash(false), 140);
      },
      "image/jpeg",
      0.92,
    );
  }

  function done() {
    stop();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[110] flex flex-col bg-black">
      {flash && <div className="pointer-events-none absolute inset-0 z-20 bg-white" />}

      <div className="relative min-h-0 flex-1">
        <video ref={videoRef} playsInline muted autoPlay className="absolute inset-0 h-full w-full object-cover" />
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 text-white">
            <Loader2 className="h-5 w-5 animate-spin" /> Starting camera…
          </div>
        )}

        <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4">
          <button
            type="button"
            onClick={done}
            aria-label="Close camera"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white active:scale-95"
          >
            <X className="h-5 w-5" />
          </button>
          {count > 0 && (
            <span className="rounded-full bg-rose-600 px-3 py-1 text-xs font-bold text-white">{count} taken</span>
          )}
          <button
            type="button"
            onClick={switchCam}
            aria-label="Switch camera"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white active:scale-95"
          >
            <SwitchCamera className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between bg-black px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-5">
        <span className="w-16 text-sm font-semibold text-white/60">Tap to snap</span>
        <button
          type="button"
          onClick={snap}
          disabled={!ready}
          aria-label="Take photo"
          className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-white ring-4 ring-white/70 transition-transform active:scale-95 disabled:opacity-40"
        >
          <Camera className="h-7 w-7 text-ink-900" />
        </button>
        <button type="button" onClick={done} className="w-16 text-right text-base font-bold text-white">
          Done
        </button>
      </div>
    </div>
  );
}
