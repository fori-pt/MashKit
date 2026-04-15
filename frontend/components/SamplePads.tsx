"use client";

import { useEffect, useRef, useState } from "react";
import TrimModal from "./TrimModal";

// ─── Shared AudioContext ───────────────────────────────────────────────────────
let _ctx: AudioContext | null = null;
function getCtx(): AudioContext {
  if (!_ctx || _ctx.state === "closed") _ctx = new AudioContext();
  if (_ctx.state === "suspended") _ctx.resume();
  return _ctx;
}

// ─── Play a decoded custom buffer ─────────────────────────────────────────────
function playBuffer(ctx: AudioContext, buf: AudioBuffer) {
  const src = ctx.createBufferSource();
  const gain = ctx.createGain();
  src.buffer = buf;
  gain.gain.value = 0.85;
  src.connect(gain);
  gain.connect(ctx.destination);
  src.start();
}

// ─── Default synthesized sounds ───────────────────────────────────────────────
function playAirhorn(ctx: AudioContext) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const dist = ctx.createWaveShaper();
  const curve = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const x = (i * 2) / 256 - 1;
    curve[i] = ((Math.PI + 300) * x) / (Math.PI + 300 * Math.abs(x));
  }
  dist.curve = curve;
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(900, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(210, ctx.currentTime + 2.2);
  gain.gain.setValueAtTime(0.55, ctx.currentTime);
  gain.gain.setValueAtTime(0.55, ctx.currentTime + 2.0);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 2.2);
  osc.connect(dist); dist.connect(gain); gain.connect(ctx.destination);
  osc.start(); osc.stop(ctx.currentTime + 2.2);
}

function playRiser(ctx: AudioContext) {
  const osc = ctx.createOscillator();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(60, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(2400, ctx.currentTime + 2.5);
  filter.type = "bandpass"; filter.Q.value = 3;
  filter.frequency.setValueAtTime(150, ctx.currentTime);
  filter.frequency.exponentialRampToValueAtTime(5000, ctx.currentTime + 2.5);
  gain.gain.setValueAtTime(0.2, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(0.7, ctx.currentTime + 2.3);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 2.5);
  osc.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
  osc.start(); osc.stop(ctx.currentTime + 2.5);
}

function playLaser(ctx: AudioContext) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(3200, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.35);
  gain.gain.setValueAtTime(0.6, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
  osc.connect(gain); gain.connect(ctx.destination);
  osc.start(); osc.stop(ctx.currentTime + 0.35);
}

function playCrash(ctx: AudioContext) {
  const len = ctx.sampleRate * 2;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  const hp = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  src.buffer = buf;
  hp.type = "highpass"; hp.frequency.value = 4500;
  gain.gain.setValueAtTime(0.7, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 2.0);
  src.connect(hp); hp.connect(gain); gain.connect(ctx.destination);
  src.start(); src.stop(ctx.currentTime + 2.0);
}

function playDropBass(ctx: AudioContext) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(90, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(28, ctx.currentTime + 0.7);
  gain.gain.setValueAtTime(0.9, ctx.currentTime);
  gain.gain.setValueAtTime(0.9, ctx.currentTime + 0.55);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
  osc.connect(gain); gain.connect(ctx.destination);
  osc.start(); osc.stop(ctx.currentTime + 0.8);
}

function playRewind(ctx: AudioContext) {
  const len = Math.round(ctx.sampleRate * 1.2);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    const t = i / ctx.sampleRate;
    const f = 600 * Math.exp(-2.5 * t);
    d[i] = Math.sin(2 * Math.PI * f * t) * 0.6 + (Math.random() - 0.5) * 0.08;
  }
  const src = ctx.createBufferSource();
  const gain = ctx.createGain();
  src.buffer = buf;
  src.playbackRate.setValueAtTime(3, ctx.currentTime);
  src.playbackRate.exponentialRampToValueAtTime(0.05, ctx.currentTime + 1.2);
  gain.gain.setValueAtTime(0.6, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2);
  src.connect(gain); gain.connect(ctx.destination);
  src.start(); src.stop(ctx.currentTime + 1.2);
}

function playStab(ctx: AudioContext) {
  const freqs = [261.63, 329.63, 392.0];
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass"; filter.frequency.value = 3000;
  gain.gain.setValueAtTime(0.35, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
  filter.connect(gain); gain.connect(ctx.destination);
  freqs.forEach((f) => {
    const osc = ctx.createOscillator();
    osc.type = "sawtooth"; osc.frequency.value = f;
    osc.connect(filter);
    osc.start(); osc.stop(ctx.currentTime + 0.25);
  });
}

function playAlarm(ctx: AudioContext) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "square";
  for (let i = 0; i < 6; i++) {
    osc.frequency.setValueAtTime(i % 2 === 0 ? 880 : 660, ctx.currentTime + i * 0.18);
  }
  gain.gain.setValueAtTime(0.4, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.1);
  osc.connect(gain); gain.connect(ctx.destination);
  osc.start(); osc.stop(ctx.currentTime + 1.1);
}

// ─── Pad definitions ──────────────────────────────────────────────────────────
const DEFAULT_PADS = [
  { label: "Airhorn",   emoji: "📣", key: "1", color: "from-yellow-500/20 to-orange-500/20 border-yellow-500/40 text-yellow-300",  fn: playAirhorn  },
  { label: "Riser",     emoji: "🚀", key: "2", color: "from-blue-500/20 to-cyan-500/20 border-blue-500/40 text-blue-300",          fn: playRiser    },
  { label: "Laser",     emoji: "⚡", key: "3", color: "from-purple-500/20 to-pink-500/20 border-purple-500/40 text-purple-300",    fn: playLaser    },
  { label: "Crash",     emoji: "💥", key: "4", color: "from-red-500/20 to-orange-500/20 border-red-500/40 text-red-300",           fn: playCrash    },
  { label: "Drop Bass", emoji: "🔊", key: "5", color: "from-indigo-500/20 to-blue-500/20 border-indigo-500/40 text-indigo-300",    fn: playDropBass },
  { label: "Rewind",    emoji: "⏪", key: "6", color: "from-teal-500/20 to-cyan-500/20 border-teal-500/40 text-teal-300",          fn: playRewind   },
  { label: "Stab",      emoji: "🎺", key: "7", color: "from-green-500/20 to-teal-500/20 border-green-500/40 text-green-300",       fn: playStab     },
  { label: "Alarm",     emoji: "🚨", key: "8", color: "from-pink-500/20 to-red-500/20 border-pink-500/40 text-pink-300",           fn: playAlarm    },
] as const;

type PadIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

interface CustomPad {
  label: string;
  fileName: string;
  buffer: AudioBuffer;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function SamplePads() {
  const [active, setActive] = useState<number | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [custom, setCustom] = useState<(CustomPad | null)[]>(Array(8).fill(null));
  const [loading, setLoading] = useState<number | null>(null);
  const [editLabel, setEditLabel] = useState("");

  // Trim modal state
  const [trimBuffer, setTrimBuffer] = useState<AudioBuffer | null>(null);
  const [trimFileName, setTrimFileName] = useState("");
  const [trimTargetIdx, setTrimTargetIdx] = useState<number | null>(null);

  const flashRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editingIdxRef = useRef<number | null>(null);

  const flash = (idx: number) => {
    setActive(idx);
    if (flashRef.current) clearTimeout(flashRef.current);
    flashRef.current = setTimeout(() => setActive(null), 180);
  };

  const trigger = (idx: number) => {
    const ctx = getCtx();
    const c = custom[idx];
    if (c) {
      playBuffer(ctx, c.buffer);
    } else {
      DEFAULT_PADS[idx].fn(ctx);
    }
    flash(idx);
  };

  // Keyboard 1–8
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const idx = parseInt(e.key) - 1;
      if (idx >= 0 && idx < 8) trigger(idx);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [custom]);

  // Open edit popover for a pad
  const openEdit = (idx: number) => {
    const c = custom[idx];
    setEditLabel(c ? c.label : DEFAULT_PADS[idx].label);
    setEditing(idx);
  };

  const closeEdit = () => setEditing(null);

  // Trigger file picker
  const pickFile = (idx: number) => {
    editingIdxRef.current = idx;
    fileInputRef.current?.click();
  };

  // Handle file chosen
  const onFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const idx = editingIdxRef.current;
    if (!file || idx === null) return;
    e.target.value = "";

    setLoading(idx);
    try {
      const arrayBuf = await file.arrayBuffer();
      const ctx = getCtx();
      const audioBuf = await ctx.decodeAudioData(arrayBuf);

      if (audioBuf.duration > 5) {
        // File too long — open the trim modal
        setTrimBuffer(audioBuf);
        setTrimFileName(file.name);
        setTrimTargetIdx(idx);
        setEditing(null); // close the edit popover
      } else {
        const label = editLabel.trim() || file.name.replace(/\.[^.]+$/, "");
        setCustom((prev) => {
          const next = [...prev];
          next[idx] = { label, fileName: file.name, buffer: audioBuf };
          return next;
        });
        flash(idx);
        playBuffer(ctx, audioBuf);
      }
    } catch {
      // unsupported format — silently ignore
    } finally {
      setLoading(null);
    }
  };

  const handleTrimConfirm = (croppedBuffer: AudioBuffer) => {
    if (trimTargetIdx === null) return;
    const label = editLabel.trim() || trimFileName.replace(/\.[^.]+$/, "") || "Custom";
    setCustom((prev) => {
      const next = [...prev];
      next[trimTargetIdx] = { label, fileName: trimFileName, buffer: croppedBuffer };
      return next;
    });
    flash(trimTargetIdx);
    playBuffer(getCtx(), croppedBuffer);
    setTrimBuffer(null);
    setTrimTargetIdx(null);
  };

  const handleTrimCancel = () => {
    setTrimBuffer(null);
    setTrimTargetIdx(null);
  };

  // Save label change only
  const saveLabel = (idx: number) => {
    const label = editLabel.trim();
    if (!label) return;
    setCustom((prev) => {
      const next = [...prev];
      if (next[idx]) next[idx] = { ...next[idx]!, label };
      return next;
    });
    closeEdit();
  };

  // Reset a pad to default
  const resetPad = (idx: number) => {
    setCustom((prev) => {
      const next = [...prev];
      next[idx] = null;
      return next;
    });
    closeEdit();
  };

  return (
    <div className="rounded-2xl border border-ocean/30 bg-ocean/5 p-4">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={onFileChosen}
      />

      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-widest text-mist/50">
          DJ Sample Pads
        </span>
        <span className="text-[10px] text-mist/30">Keys 1–8 · Hover to edit</span>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {DEFAULT_PADS.map((pad, i) => {
          const c = custom[i];
          const isActive = active === i;
          const isLoading = loading === i;
          const label = c ? c.label : pad.label;
          const emoji = c ? "🎵" : pad.emoji;
          const isEditing = editing === i;

          return (
            <div key={i} className="relative">
              {/* Main pad button */}
              <button
                onPointerDown={() => !isEditing && trigger(i)}
                className={`
                  group relative flex w-full flex-col items-center justify-center gap-1
                  rounded-xl border bg-gradient-to-br p-3 text-center
                  transition-all duration-75 select-none
                  ${pad.color}
                  ${c ? "ring-1 ring-mist/30" : ""}
                  ${isActive ? "scale-95 brightness-150 shadow-lg" : "hover:brightness-110 active:scale-95"}
                `}
              >
                {/* Flash overlay */}
                {isActive && (
                  <span className="pointer-events-none absolute inset-0 rounded-xl bg-white/10 animate-ping" />
                )}

                {/* Loading spinner */}
                {isLoading ? (
                  <svg className="h-5 w-5 animate-spin text-mist/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" strokeOpacity="0.2" />
                    <path d="M12 2a10 10 0 0 1 10 10" />
                  </svg>
                ) : (
                  <span className="text-xl leading-none">{emoji}</span>
                )}

                <span className="w-full truncate text-[10px] font-semibold leading-tight px-0.5">
                  {label}
                </span>
                <span className="text-[9px] opacity-40">[{pad.key}]</span>

                {/* Custom indicator dot */}
                {c && (
                  <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-mist/60" />
                )}

                {/* Edit button — appears on hover */}
                <button
                  onPointerDown={(e) => { e.stopPropagation(); openEdit(i); }}
                  className="absolute bottom-1.5 right-1.5 rounded-md bg-black/30 p-0.5 opacity-0 transition-opacity group-hover:opacity-100"
                  title="Edit pad"
                >
                  <svg className="h-3 w-3 text-mist/70" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 13l-4 1 1-4 9.293-9.293a1 1 0 011.414 0l2.586 2.586a1 1 0 010 1.414L9 13z" />
                  </svg>
                </button>
              </button>

              {/* Edit popover */}
              {isEditing && (
                <>
                  {/* Backdrop */}
                  <div className="fixed inset-0 z-10" onPointerDown={closeEdit} />
                  <div className="absolute bottom-full left-1/2 z-20 mb-2 w-52 -translate-x-1/2 rounded-xl border border-ocean/50 bg-deep p-3 shadow-xl space-y-2">
                    <p className="text-xs font-semibold text-mist">Edit Pad {i + 1}</p>

                    {/* Label rename */}
                    <div>
                      <label className="mb-1 block text-[10px] text-mist/40">Label</label>
                      <input
                        autoFocus
                        value={editLabel}
                        onChange={(e) => setEditLabel(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") saveLabel(i); if (e.key === "Escape") closeEdit(); }}
                        className="w-full rounded-lg bg-ocean/20 px-2 py-1.5 text-xs text-foam outline-none focus:ring-1 focus:ring-mist/40"
                        placeholder="Pad name"
                      />
                    </div>

                    {/* Show current custom file name */}
                    {c && (
                      <p className="truncate text-[10px] text-mist/40">
                        📁 {c.fileName}
                      </p>
                    )}

                    {/* Upload button */}
                    <button
                      onClick={() => pickFile(i)}
                      className="w-full rounded-lg border border-ocean/40 py-1.5 text-[11px] font-semibold text-mist transition-colors hover:bg-ocean/20"
                    >
                      {c ? "Replace Audio" : "Upload Audio"}
                    </button>

                    <div className="flex gap-2">
                      <button
                        onClick={() => saveLabel(i)}
                        className="flex-1 rounded-lg bg-mist/20 py-1.5 text-[11px] font-semibold text-mist transition-colors hover:bg-mist/30"
                      >
                        Save
                      </button>
                      {c && (
                        <button
                          onClick={() => resetPad(i)}
                          className="flex-1 rounded-lg border border-red-500/30 py-1.5 text-[11px] font-semibold text-red-400 transition-colors hover:bg-red-500/10"
                        >
                          Reset
                        </button>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Trim Modal */}
      {trimBuffer && (
        <TrimModal
          buffer={trimBuffer}
          fileName={trimFileName}
          onConfirm={handleTrimConfirm}
          onCancel={handleTrimCancel}
        />
      )}
    </div>
  );
}
