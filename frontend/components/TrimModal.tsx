"use client";

import { useEffect, useRef, useState } from "react";

const TRIM_DURATION = 5; // seconds

interface Props {
  buffer: AudioBuffer;
  fileName: string;
  onConfirm: (cropped: AudioBuffer) => void;
  onCancel: () => void;
}

function cropBuffer(
  ctx: AudioContext,
  buffer: AudioBuffer,
  startSec: number
): AudioBuffer {
  const sr = buffer.sampleRate;
  const startSample = Math.floor(startSec * sr);
  const length = Math.min(
    Math.floor(TRIM_DURATION * sr),
    buffer.length - startSample
  );
  const cropped = ctx.createBuffer(buffer.numberOfChannels, length, sr);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const src = buffer.getChannelData(ch);
    const dst = cropped.getChannelData(ch);
    for (let i = 0; i < length; i++) dst[i] = src[startSample + i] ?? 0;
  }
  return cropped;
}

export default function TrimModal({ buffer, fileName, onConfirm, onCancel }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<AudioBufferSourceNode | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);

  const maxStart = Math.max(0, buffer.duration - TRIM_DURATION);
  const [startSec, setStartSec] = useState(0);
  const [previewing, setPreviewing] = useState(false);

  // Draw waveform + selection
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;

    const W = canvas.width;
    const H = canvas.height;
    const data = buffer.getChannelData(0);
    const step = Math.ceil(data.length / W);

    ctx2d.clearRect(0, 0, W, H);

    // Background
    ctx2d.fillStyle = "rgba(10,20,30,0.8)";
    ctx2d.fillRect(0, 0, W, H);

    // Waveform bars
    ctx2d.strokeStyle = "rgba(165,201,202,0.45)";
    ctx2d.lineWidth = 1;
    ctx2d.beginPath();
    for (let x = 0; x < W; x++) {
      let peak = 0;
      for (let j = 0; j < step; j++) {
        peak = Math.max(peak, Math.abs(data[x * step + j] ?? 0));
      }
      const mid = H / 2;
      const amp = peak * (H / 2) * 0.9;
      ctx2d.moveTo(x + 0.5, mid - amp);
      ctx2d.lineTo(x + 0.5, mid + amp);
    }
    ctx2d.stroke();

    // Selection window
    const selX = (startSec / buffer.duration) * W;
    const selW = (TRIM_DURATION / buffer.duration) * W;

    // Dim outside selection
    ctx2d.fillStyle = "rgba(0,0,0,0.45)";
    ctx2d.fillRect(0, 0, selX, H);
    ctx2d.fillRect(selX + selW, 0, W - selX - selW, H);

    // Selection highlight
    ctx2d.fillStyle = "rgba(165,201,202,0.12)";
    ctx2d.fillRect(selX, 0, selW, H);

    // Selection borders
    ctx2d.strokeStyle = "#A5C9CA";
    ctx2d.lineWidth = 2;
    ctx2d.strokeRect(selX + 1, 1, selW - 2, H - 2);

    // Time labels
    ctx2d.fillStyle = "rgba(165,201,202,0.7)";
    ctx2d.font = "11px monospace";
    ctx2d.fillText(`${startSec.toFixed(1)}s`, selX + 4, 14);
    ctx2d.fillText(
      `${(startSec + TRIM_DURATION).toFixed(1)}s`,
      Math.min(selX + selW - 38, W - 42),
      14
    );
  }, [buffer, startSec]);

  const stopPreview = () => {
    try { previewRef.current?.stop(); } catch {}
    previewRef.current = null;
    setPreviewing(false);
  };

  const togglePreview = () => {
    if (previewing) { stopPreview(); return; }
    if (!ctxRef.current || ctxRef.current.state === "closed")
      ctxRef.current = new AudioContext();
    const ctx = ctxRef.current;
    if (ctx.state === "suspended") ctx.resume();
    const cropped = cropBuffer(ctx, buffer, startSec);
    const src = ctx.createBufferSource();
    src.buffer = cropped;
    src.connect(ctx.destination);
    src.start();
    src.onended = () => setPreviewing(false);
    previewRef.current = src;
    setPreviewing(true);
  };

  const handleConfirm = () => {
    stopPreview();
    const ctx = ctxRef.current ?? new AudioContext();
    onConfirm(cropBuffer(ctx, buffer, startSec));
  };

  // Cleanup on unmount
  useEffect(() => () => { stopPreview(); ctxRef.current?.close(); }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onCancel}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-lg space-y-4 rounded-2xl border border-ocean/50 bg-deep p-6 shadow-2xl">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-sm font-bold text-foam">Trim Sample</h2>
            <p className="mt-0.5 truncate text-[11px] text-mist/40">{fileName}</p>
          </div>
          <button
            onClick={onCancel}
            className="rounded-lg p-1 text-mist/40 hover:text-mist"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <p className="text-[11px] text-mist/50">
          File is{" "}
          <span className="text-mist/70">{buffer.duration.toFixed(1)}s</span> —
          select a <span className="text-mist/70">5-second</span> window to
          assign to the pad.
        </p>

        {/* Waveform canvas */}
        <canvas
          ref={canvasRef}
          width={480}
          height={96}
          className="w-full rounded-xl"
          style={{ imageRendering: "pixelated" }}
        />

        {/* Start-time slider */}
        <div>
          <div className="mb-1.5 flex justify-between text-[10px] text-mist/40">
            <span>Start: {startSec.toFixed(2)}s</span>
            <span>End: {(startSec + TRIM_DURATION).toFixed(2)}s</span>
          </div>
          <input
            type="range"
            min={0}
            max={maxStart}
            step={0.01}
            value={startSec}
            onChange={(e) => { stopPreview(); setStartSec(+e.target.value); }}
            className="w-full"
          />
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={togglePreview}
            className={`flex items-center gap-1.5 rounded-xl border px-4 py-2 text-xs font-semibold transition-colors ${
              previewing
                ? "border-mist/60 bg-mist/10 text-mist"
                : "border-ocean/40 text-mist/70 hover:bg-ocean/20"
            }`}
          >
            {previewing ? (
              <>
                <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="6" y="4" width="4" height="16" />
                  <rect x="14" y="4" width="4" height="16" />
                </svg>
                Stop
              </>
            ) : (
              <>
                <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
                Preview
              </>
            )}
          </button>
          <button
            onClick={onCancel}
            className="flex-1 rounded-xl border border-ocean/40 py-2 text-xs font-semibold text-mist/60 transition-colors hover:bg-ocean/20"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 rounded-xl bg-gradient-to-r from-ocean to-mist py-2 text-xs font-bold text-coal transition-all hover:brightness-110"
          >
            Use This Clip
          </button>
        </div>
      </div>
    </div>
  );
}
