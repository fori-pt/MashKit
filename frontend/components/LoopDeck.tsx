"use client";

import { useEffect, useRef, useState } from "react";

interface LoopDef {
  name: string;
  emoji: string;
  bpm: number;
  pattern: {
    kick: number[];
    snare: number[];
    hihat: number[];
  };
}

const LOOP_DEFS: LoopDef[] = [
  {
    name: "House Beat", emoji: "🏠", bpm: 128,
    pattern: {
      kick:  [1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0],
      snare: [0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0],
      hihat: [1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0],
    },
  },
  {
    name: "Trap Hats", emoji: "🎩", bpm: 140,
    pattern: {
      kick:  [1,0,0,0,0,0,0,1,0,0,1,0,0,0,0,0],
      snare: [0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0],
      hihat: [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    },
  },
  {
    name: "Lo-Fi Groove", emoji: "🎵", bpm: 85,
    pattern: {
      kick:  [1,0,0,0,0,0,1,0,1,0,0,0,0,0,0,0],
      snare: [0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,1],
      hihat: [1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0],
    },
  },
  {
    name: "DnB Break", emoji: "⚡", bpm: 174,
    pattern: {
      kick:  [1,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0],
      snare: [0,0,0,0,1,0,0,1,0,0,0,0,1,0,0,0],
      hihat: [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    },
  },
  {
    name: "Acoustic Perc", emoji: "🥁", bpm: 95,
    pattern: {
      kick:  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
      snare: [0,0,1,0,0,0,1,0,0,0,1,0,0,0,1,0],
      hihat: [0,1,0,1,0,1,0,1,0,1,0,1,0,1,0,1],
    },
  },
];

// ─── Drum synthesis ───────────────────────────────────────────────────────────
function generateLoop(ctx: AudioContext, def: LoopDef): AudioBuffer {
  const { bpm, pattern } = def;
  const stepDur = (60 / bpm) / 4; // 16th-note duration in seconds
  const barDur = 16 * stepDur;
  const len = Math.round(ctx.sampleRate * barDur);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  const L = buf.getChannelData(0);
  const R = buf.getChannelData(1);

  const addKick = (t: number) => {
    const s = Math.round(t * ctx.sampleRate);
    const n = Math.min(Math.round(0.35 * ctx.sampleRate), len - s);
    for (let i = 0; i < n; i++) {
      const x = i / ctx.sampleRate;
      const v = Math.sin(2 * Math.PI * (70 * Math.exp(-18 * x) + 28) * x) * Math.exp(-7 * x) * 0.85;
      L[s + i] += v; R[s + i] += v;
    }
  };

  const addSnare = (t: number) => {
    const s = Math.round(t * ctx.sampleRate);
    const n = Math.min(Math.round(0.22 * ctx.sampleRate), len - s);
    for (let i = 0; i < n; i++) {
      const x = i / ctx.sampleRate;
      const v = ((Math.random() * 2 - 1) * Math.exp(-18 * x) * 0.5
        + Math.sin(2 * Math.PI * 200 * x) * Math.exp(-25 * x) * 0.25) * 0.7;
      L[s + i] += v; R[s + i] += v;
    }
  };

  const addHihat = (t: number) => {
    const s = Math.round(t * ctx.sampleRate);
    const n = Math.min(Math.round(0.07 * ctx.sampleRate), len - s);
    for (let i = 0; i < n; i++) {
      const x = i / ctx.sampleRate;
      const v = (Math.random() * 2 - 1) * Math.exp(-50 * x) * 0.22;
      L[s + i] += v; R[s + i] += v;
    }
  };

  pattern.kick.forEach((on, step) => { if (on) addKick(step * stepDur); });
  pattern.snare.forEach((on, step) => { if (on) addSnare(step * stepDur); });
  pattern.hihat.forEach((on, step) => { if (on) addHihat(step * stepDur); });

  // Normalize
  let peak = 0;
  for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(L[i]));
  if (peak > 0.88) { const sc = 0.88 / peak; for (let i = 0; i < len; i++) { L[i] *= sc; R[i] *= sc; } }

  return buf;
}

// ─── Component ────────────────────────────────────────────────────────────────
interface Props { masterBpm: number; }

export default function LoopDeck({ masterBpm }: Props) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(70);

  const ctxRef = useRef<AudioContext | null>(null);
  const bufferCache = useRef<Map<number, AudioBuffer>>(new Map());
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);

  const getCtx = () => {
    if (!ctxRef.current || ctxRef.current.state === "closed") {
      ctxRef.current = new AudioContext();
    }
    return ctxRef.current;
  };

  // Stop current loop source
  const stopSource = () => {
    try { sourceRef.current?.stop(); } catch {}
    sourceRef.current = null;
  };

  // Start playback of a given loop index
  const startLoop = (idx: number) => {
    const ctx = getCtx();
    if (ctx.state === "suspended") ctx.resume();

    const def = LOOP_DEFS[idx];

    // Generate buffer if not cached
    if (!bufferCache.current.has(idx)) {
      bufferCache.current.set(idx, generateLoop(ctx, def));
    }
    const audioBuf = bufferCache.current.get(idx)!;

    // Gain node (create once per context)
    if (!gainRef.current) {
      gainRef.current = ctx.createGain();
      gainRef.current.connect(ctx.destination);
    }
    gainRef.current.gain.value = volume / 100;

    stopSource();

    const src = ctx.createBufferSource();
    src.buffer = audioBuf;
    src.loop = true;
    // Time-stretch: playbackRate = masterBpm / loopNativeBpm
    src.playbackRate.value = masterBpm / def.bpm;
    src.connect(gainRef.current);
    src.start();
    sourceRef.current = src;
  };

  // Update playback rate live when masterBpm changes
  useEffect(() => {
    const src = sourceRef.current;
    if (!src || selected === null) return;
    src.playbackRate.value = masterBpm / LOOP_DEFS[selected].bpm;
  }, [masterBpm, selected]);

  // Update gain live
  useEffect(() => {
    if (gainRef.current) gainRef.current.gain.value = volume / 100;
  }, [volume]);

  // Cleanup on unmount
  useEffect(() => () => { stopSource(); ctxRef.current?.close(); }, []);

  const handleSelect = (idx: number) => {
    if (selected === idx) return;
    setSelected(idx);
    if (playing) startLoop(idx);
  };

  const togglePlay = () => {
    if (playing) {
      stopSource();
      setPlaying(false);
    } else {
      if (selected === null) return;
      startLoop(selected);
      setPlaying(true);
    }
  };

  return (
    <div className="rounded-2xl border border-ocean/30 bg-ocean/5">
      {/* Header */}
      <button
        onClick={() => setOpen((p) => !p)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-widest text-mist/50">
            Loop Library
          </span>
          {playing && (
            <span className="flex items-center gap-1 rounded-full bg-green-500/20 px-2 py-0.5 text-[10px] font-semibold text-green-400">
              <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
              {LOOP_DEFS[selected!]?.name}
            </span>
          )}
        </div>
        <svg
          className={`h-4 w-4 text-mist/40 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="space-y-4 px-4 pb-4">
          {/* Scrollable loop list */}
          <div className="flex gap-2 overflow-x-auto pb-1">
            {LOOP_DEFS.map((def, i) => (
              <button
                key={def.name}
                onClick={() => handleSelect(i)}
                className={`flex flex-shrink-0 flex-col items-center gap-1.5 rounded-xl border px-4 py-3 transition-all ${
                  selected === i
                    ? "border-mist/60 bg-mist/15 text-mist"
                    : "border-ocean/30 text-mist/50 hover:border-ocean/60 hover:text-mist"
                }`}
              >
                <span className="text-2xl leading-none">{def.emoji}</span>
                <span className="text-xs font-semibold whitespace-nowrap">{def.name}</span>
                <span className="text-[10px] text-mist/30">{def.bpm} BPM</span>
              </button>
            ))}
          </div>

          {/* Controls */}
          <div className="flex items-center gap-3">
            <button
              onClick={togglePlay}
              disabled={selected === null}
              className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl transition-all disabled:opacity-30 ${
                playing
                  ? "bg-mist text-coal"
                  : "border border-ocean/50 text-mist hover:bg-ocean/20"
              }`}
            >
              {playing ? (
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" />
                </svg>
              ) : (
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>

            <div className="flex-1">
              <div className="mb-1 flex justify-between text-xs text-mist/40">
                <span>Loop Volume</span>
                <span>{volume}%</span>
              </div>
              <input
                type="range" min={0} max={100} value={volume}
                onChange={(e) => setVolume(+e.target.value)}
                className="w-full"
              />
            </div>

            {selected !== null && (
              <div className="text-right text-[10px] text-mist/30 flex-shrink-0">
                <div>Native: {LOOP_DEFS[selected].bpm} BPM</div>
                <div>Rate: ×{(masterBpm / LOOP_DEFS[selected].bpm).toFixed(2)}</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
