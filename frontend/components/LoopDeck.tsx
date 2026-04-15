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

// ─── User loop type ───────────────────────────────────────────────────────────
interface UserLoop {
  id: string;       // unique key (file name + size)
  name: string;
  file: File;
  bpm: number | null;   // null = not yet analyzed
  key: string | null;
}

const API = "http://localhost:8000";

// ─── Component ────────────────────────────────────────────────────────────────
interface Props { masterBpm: number; }

export default function LoopDeck({ masterBpm }: Props) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(70);

  // User-loaded loops from local folder
  const [userLoops, setUserLoops] = useState<UserLoop[]>([]);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [scanningFolder, setScanningFolder] = useState(false);
  const userBufferCache = useRef<Map<string, AudioBuffer>>(new Map());

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
    if (!src) return;
    if (selected !== null) {
      src.playbackRate.value = masterBpm / LOOP_DEFS[selected].bpm;
    } else if (selectedUser) {
      const loop = userLoops.find((l) => l.id === selectedUser);
      if (loop?.bpm) src.playbackRate.value = masterBpm / loop.bpm;
    }
  }, [masterBpm, selected, selectedUser, userLoops]);

  // Update gain live
  useEffect(() => {
    if (gainRef.current) gainRef.current.gain.value = volume / 100;
  }, [volume]);

  // Cleanup on unmount
  useEffect(() => () => { stopSource(); ctxRef.current?.close(); }, []);

  // ── Recursive audio file collector ───────────────────────────────────────
  const collectAudioFiles = async (
    // @ts-ignore
    dirHandle,
    AUDIO_EXTS: RegExp,
    prefix = ""
  ): Promise<UserLoop[]> => {
    const loops: UserLoop[] = [];
    // @ts-ignore
    for await (const [name, handle] of dirHandle.entries()) {
      const fullPath = prefix ? `${prefix}/${name}` : name;
      if (handle.kind === "file" && AUDIO_EXTS.test(name)) {
        const file: File = await handle.getFile();
        loops.push({
          id: `${fullPath}-${file.size}`,
          name: name.replace(/\.[^.]+$/, ""), // display name: just filename
          file,
          bpm: null,
          key: null,
        });
      } else if (handle.kind === "directory") {
        // Recurse into subfolder
        const sub = await collectAudioFiles(handle, AUDIO_EXTS, fullPath);
        loops.push(...sub);
      }
    }
    return loops;
  };

  // ── Folder scanner + background analysis ─────────────────────────────────
  const scanFolder = async () => {
    if (!("showDirectoryPicker" in window)) {
      alert("Your browser doesn't support folder access (try Chrome or Edge).");
      return;
    }
    setScanningFolder(true);
    try {
      // @ts-ignore — File System Access API not yet in TS lib
      const dirHandle = await window.showDirectoryPicker({ mode: "read" });
      const AUDIO_EXTS = /\.(wav|mp3|flac|aiff?|m4a|ogg)$/i;
      const loops = await collectAudioFiles(dirHandle, AUDIO_EXTS);
      loops.sort((a, b) => a.name.localeCompare(b.name));
      setUserLoops(loops);
      userBufferCache.current.clear();

      // Analyze all files in the background (3 at a time)
      const CONCURRENCY = 3;
      for (let i = 0; i < loops.length; i += CONCURRENCY) {
        await Promise.all(
          loops.slice(i, i + CONCURRENCY).map(async (loop) => {
            const fd = new FormData();
            fd.append("file", loop.file);
            try {
              const res = await fetch(`${API}/analyze`, { method: "POST", body: fd });
              if (res.ok) {
                const data = await res.json();
                setUserLoops((prev) =>
                  prev.map((l) =>
                    l.id === loop.id ? { ...l, bpm: data.bpm, key: data.key } : l
                  )
                );
              }
            } catch {}
          })
        );
      }
    } catch {
      // User cancelled picker — ignore
    } finally {
      setScanningFolder(false);
    }
  };

  // ── User loop playback ────────────────────────────────────────────────────
  const playUserLoop = async (loop: UserLoop) => {
    const ctx = getCtx();
    if (ctx.state === "suspended") ctx.resume();

    // Decode if not cached
    if (!userBufferCache.current.has(loop.id)) {
      const ab = await loop.file.arrayBuffer();
      const decoded = await ctx.decodeAudioData(ab);
      userBufferCache.current.set(loop.id, decoded);
    }
    const audioBuf = userBufferCache.current.get(loop.id)!;

    if (!gainRef.current) {
      gainRef.current = ctx.createGain();
      gainRef.current.connect(ctx.destination);
    }
    gainRef.current.gain.value = volume / 100;

    stopSource();
    const src = ctx.createBufferSource();
    src.buffer = audioBuf;
    src.loop = true;
    // If we know the loop's BPM, tempo-match to master; else play at native rate
    src.playbackRate.value = loop.bpm ? masterBpm / loop.bpm : 1;
    src.connect(gainRef.current);
    src.start();
    sourceRef.current = src;
  };

  const handleUserSelect = async (loop: UserLoop) => {
    setSelectedUser(loop.id);
    setSelected(null); // deselect preset
    if (playing) await playUserLoop(loop);
  };

  const handleSelect = (idx: number) => {
    if (selected === idx) return;
    setSelected(idx);
    setSelectedUser(null);
    if (playing) startLoop(idx);
  };

  const togglePlay = async () => {
    if (playing) {
      stopSource();
      setPlaying(false);
    } else {
      if (selectedUser !== null) {
        const loop = userLoops.find((l) => l.id === selectedUser);
        if (loop) { await playUserLoop(loop); setPlaying(true); }
      } else if (selected !== null) {
        startLoop(selected);
        setPlaying(true);
      }
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
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-400" />
              {selectedUser
                ? userLoops.find((l) => l.id === selectedUser)?.name ?? "Loop"
                : LOOP_DEFS[selected!]?.name}
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

            {selected !== null && !selectedUser && (
              <div className="flex-shrink-0 text-right text-[10px] text-mist/30">
                <div>Native: {LOOP_DEFS[selected].bpm} BPM</div>
                <div>Rate: ×{(masterBpm / LOOP_DEFS[selected].bpm).toFixed(2)}</div>
              </div>
            )}
            {selectedUser && (() => {
              const loop = userLoops.find((l) => l.id === selectedUser);
              return loop ? (
                <div className="flex-shrink-0 text-right text-[10px] text-mist/30">
                  {loop.bpm ? (
                    <>
                      <div>Native: {loop.bpm} BPM</div>
                      <div>Rate: ×{(masterBpm / loop.bpm).toFixed(2)}</div>
                    </>
                  ) : (
                    <div>Analyzing BPM…</div>
                  )}
                </div>
              ) : null;
            })()}
          </div>

          {/* ── Local Folder ─────────────────────────────────────────────────── */}
          <div className="space-y-2 border-t border-ocean/20 pt-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-mist/30">
                Local Loops
              </span>
              <button
                onClick={scanFolder}
                disabled={scanningFolder}
                className="flex items-center gap-1.5 rounded-lg border border-ocean/40 px-2.5 py-1 text-[10px] font-semibold text-mist/60 transition-colors hover:bg-ocean/20 hover:text-mist disabled:opacity-40"
              >
                {scanningFolder ? (
                  <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" strokeOpacity="0.2" />
                    <path d="M12 2a10 10 0 0 1 10 10" />
                  </svg>
                ) : (
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h3l2 2h7a2 2 0 012 2v7a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
                  </svg>
                )}
                {scanningFolder ? "Scanning…" : userLoops.length > 0 ? `${userLoops.length} files · Change` : "Connect Folder"}
              </button>
            </div>

            {userLoops.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {userLoops.map((loop) => {
                  const isSelected = selectedUser === loop.id;
                  const analyzing = loop.bpm === null;
                  const rate = loop.bpm ? masterBpm / loop.bpm : null;
                  return (
                    <button
                      key={loop.id}
                      onClick={() => handleUserSelect(loop)}
                      className={`flex flex-shrink-0 flex-col items-center gap-1 rounded-xl border px-3 py-2 transition-all ${
                        isSelected
                          ? "border-mist/60 bg-mist/15 text-mist"
                          : "border-ocean/30 text-mist/50 hover:border-ocean/60 hover:text-mist"
                      }`}
                    >
                      {/* Icon / spinner */}
                      {analyzing ? (
                        <svg className="h-4 w-4 animate-spin text-mist/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="10" strokeOpacity="0.2" />
                          <path d="M12 2a10 10 0 0 1 10 10" />
                        </svg>
                      ) : (
                        <span className="text-lg leading-none">🎵</span>
                      )}
                      <span className="max-w-[80px] truncate text-[10px] font-semibold">
                        {loop.name}
                      </span>
                      {loop.bpm !== null && (
                        <span className="text-[9px] text-mist/40">
                          {loop.bpm} BPM
                        </span>
                      )}
                      {loop.key && (
                        <span className="text-[9px] text-mist/30">
                          {loop.key}
                        </span>
                      )}
                      {rate !== null && isSelected && (
                        <span className="text-[9px] text-mist/40">
                          ×{rate.toFixed(2)}
                        </span>
                      )}
                      {analyzing && (
                        <span className="text-[9px] text-mist/25">analyzing…</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {userLoops.length === 0 && !scanningFolder && (
              <p className="text-center text-[10px] text-mist/20">
                Connect a folder to load your own loops
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
