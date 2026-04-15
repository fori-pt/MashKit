"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Track, AnalysisData } from "@/app/page";
import WaveformPlayer from "./WaveformPlayer";
import SamplePads from "./SamplePads";
import LoopDeck from "./LoopDeck";

const API = "http://localhost:8000";

type Vibe = "normal" | "nightcore" | "slowed";

interface DeckAData {
  file: File;
  url: string;
  bpm: number;
  firstBeat: number;
  key_num: number;
  mode: number;
}

interface DeckBData {
  track: Track;
  firstBeat: number;
  chorusStart: number | undefined;
  loopRegion: { start: number; end: number; bars: number } | null;
  isUserFile: boolean;
}

interface AudioEngine {
  ctx: AudioContext;
  srcSource: MediaElementAudioSourceNode;
  trkSource: MediaElementAudioSourceNode;
  dryGain: GainNode;
  wetGain: GainNode;
  convolver: ConvolverNode;
  masterGain: GainNode;
  recordDest: MediaStreamAudioDestinationNode;
}

// ─── Reverb IR ────────────────────────────────────────────────────────────────
function buildReverbIR(ctx: AudioContext): AudioBuffer {
  const duration = 3.0, decay = 2.5;
  const length = ctx.sampleRate * duration;
  const buf = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < length; i++)
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
  }
  return buf;
}

// ─── Drop Zone ────────────────────────────────────────────────────────────────
function DeckDropZone({
  label,
  onFile,
  loading,
}: {
  label: string;
  onFile: (f: File) => void;
  loading: boolean;
}) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const f = e.dataTransfer.files[0];
        if (f) onFile(f);
      }}
      onClick={() => !loading && inputRef.current?.click()}
      className={`flex h-36 cursor-pointer flex-col items-center justify-center gap-2.5 rounded-xl border-2 border-dashed transition-all select-none ${
        dragOver
          ? "border-mist/60 bg-mist/10 scale-[1.02]"
          : "border-ocean/30 hover:border-ocean/60 hover:bg-ocean/5"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
      {loading ? (
        <>
          <svg
            className="h-6 w-6 animate-spin text-mist/60"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="10" strokeOpacity="0.2" />
            <path d="M12 2a10 10 0 0 1 10 10" />
          </svg>
          <span className="text-xs text-mist/50">Analyzing…</span>
        </>
      ) : (
        <>
          <svg
            className="h-7 w-7 text-mist/30"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth="1.5"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z"
            />
          </svg>
          <p className="text-xs text-mist/40">
            Drop {label} or{" "}
            <span className="text-mist/60 underline underline-offset-2">
              click to upload
            </span>
          </p>
        </>
      )}
    </div>
  );
}

// ─── Match quality helpers ────────────────────────────────────────────────────
function matchLabel(keyDist: number, bpmDiff: number) {
  if (keyDist === 0 && bpmDiff <= 1)  return { text: "Perfect",    cls: "bg-green-500/25 text-green-300" };
  if (keyDist <= 1 && bpmDiff <= 4)   return { text: "Great",      cls: "bg-green-500/20 text-green-400" };
  if (keyDist <= 1 && bpmDiff <= 10)  return { text: "Good BPM",   cls: "bg-teal-500/20  text-teal-400"  };
  if (keyDist === 0)                  return { text: "Same Key",   cls: "bg-cyan-500/20  text-cyan-400"  };
  if (keyDist <= 2 && bpmDiff <= 8)   return { text: "Compatible", cls: "bg-yellow-500/20 text-yellow-400" };
  if (keyDist <= 3 || bpmDiff <= 12)  return { text: "OK",         cls: "bg-orange-500/20 text-orange-400" };
  return                                     { text: "Clash",      cls: "bg-red-500/20   text-red-400"   };
}

function keyCompatLabel(dist: number) {
  if (dist === 0) return { text: "Same key",   cls: "text-green-400" };
  if (dist === 1) return { text: "Adjacent",   cls: "text-green-400" };
  if (dist === 2) return { text: "2 steps",    cls: "text-yellow-400" };
  if (dist <= 4)  return { text: `${dist} steps`, cls: "text-orange-400" };
  return               { text: "Key clash",   cls: "text-red-400" };
}

function bpmMatchLabel(trackBpm: number, sourceBpm: number) {
  const direct = Math.abs(trackBpm - sourceBpm);
  const half   = Math.abs(trackBpm - sourceBpm / 2);
  const double = Math.abs(trackBpm - sourceBpm * 2);
  const best   = Math.min(direct, half, double);
  if (best < 0.5)           return { text: "Exact BPM",   cls: "text-green-400"  };
  if (best === half)        return { text: `½ time  ≈${half.toFixed(0)} off`,  cls: "text-yellow-400" };
  if (best === double)      return { text: `×2 time  ≈${double.toFixed(0)} off`, cls: "text-yellow-400" };
  if (direct <= 3)          return { text: `±${direct.toFixed(0)} BPM`,  cls: "text-green-400"  };
  if (direct <= 8)          return { text: `±${direct.toFixed(0)} BPM`,  cls: "text-yellow-400" };
  return                           { text: `±${direct.toFixed(0)} BPM`,  cls: "text-red-400"    };
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function MashupPlayer() {
  const srcRef = useRef<HTMLAudioElement>(null);
  const trkRef = useRef<HTMLAudioElement>(null);
  const engineRef = useRef<AudioEngine | null>(null);

  // Deck state
  const [deckA, setDeckA] = useState<DeckAData | null>(null);
  const [deckALoading, setDeckALoading] = useState(false);
  const [deckB, setDeckB] = useState<DeckBData | null>(null);
  const [deckBLoading, setDeckBLoading] = useState(false);

  // Dataset search panel (Deck B)
  const [showSearch, setShowSearch] = useState(false);
  const [searchResults, setSearchResults] = useState<Track[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [keyFilterEnabled, setKeyFilterEnabled] = useState(false);

  // Mixer state
  const [playingA, setPlayingA] = useState(false);
  const [playingB, setPlayingB] = useState(false);
  const [srcVol, setSrcVol] = useState(80);
  const [trkVol, setTrkVol] = useState(80);
  const [crossfade, setCrossfade] = useState(50);
  const [sync, setSync] = useState(true);
  const [vibe, setVibe] = useState<Vibe>("normal");
  const [loopEnabled, setLoopEnabled] = useState(false);
  const loopRef = useRef(false);
  const loopRegionRef = useRef<{ start: number; end: number; bars: number } | null>(null);
  const [fading, setFading] = useState(false);
  const fadeRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [recording, setRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Derived values
  const sourceBpm = deckA?.bpm ?? 120;
  const sourceFirstBeat = deckA?.firstBeat ?? 0;
  const srcUrl = deckA?.url ?? "";
  const trkFirstBeat = deckB?.firstBeat ?? 0;
  const trkChorusStart = deckB?.chorusStart;
  const loopRegion = deckB?.loopRegion ?? null;
  const vibeRate = vibe === "nightcore" ? 1.2 : vibe === "slowed" ? 0.85 : 1.0;
  const baseRate =
    sync && deckB?.track.bpm ? sourceBpm / deckB.track.bpm : 1;
  const playing = playingA || playingB;

  // ── Engine teardown helper ──────────────────────────────────────────────────
  const teardownEngine = () => {
    engineRef.current?.ctx.close();
    engineRef.current = null;
  };

  // ── Deck A upload ───────────────────────────────────────────────────────────
  const handleDeckADrop = async (file: File) => {
    srcRef.current?.pause();
    setPlayingA(false);
    teardownEngine();
    if (deckA?.url) URL.revokeObjectURL(deckA.url);

    setDeckALoading(true);
    const url = URL.createObjectURL(file);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch(`${API}/analyze`, { method: "POST", body: fd });
      if (!res.ok) throw new Error("Analysis failed");
      const analysis: AnalysisData = await res.json();
      setDeckA({
        file,
        url,
        bpm: analysis.bpm,
        firstBeat: analysis.first_beat,
        key_num: analysis.key_num,
        mode: analysis.mode,
      });
    } catch {
      URL.revokeObjectURL(url);
    } finally {
      setDeckALoading(false);
    }
  };

  // ── Deck B upload (user's own file) ────────────────────────────────────────
  const handleDeckBDrop = async (file: File) => {
    trkRef.current?.pause();
    setPlayingB(false);
    teardownEngine();
    if (deckB?.isUserFile) URL.revokeObjectURL(deckB.track.audio_url);

    setDeckBLoading(true);
    const url = URL.createObjectURL(file);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch(`${API}/analyze`, { method: "POST", body: fd });
      if (!res.ok) throw new Error("Analysis failed");
      const analysis: AnalysisData = await res.json();
      const track: Track = {
        filename: file.name,
        artist: "Uploaded",
        title: file.name.replace(/\.[^.]+$/, ""),
        bpm: analysis.bpm,
        key: analysis.key,
        key_num: analysis.key_num,
        mode: analysis.mode,
        camelot: analysis.camelot,
        energy: analysis.energy,
        duration: analysis.duration,
        bpm_diff: 0,
        key_distance: 0,
        score: 0,
        audio_url: url,
      };
      setDeckB({
        track,
        firstBeat: analysis.first_beat,
        chorusStart: undefined,
        loopRegion: null,
        isUserFile: true,
      });
      setShowSearch(false);
      setLoopEnabled(false);
    } catch {
      URL.revokeObjectURL(url);
    } finally {
      setDeckBLoading(false);
    }
  };

  // ── Dataset search ──────────────────────────────────────────────────────────
  const handleSearch = async () => {
    if (!deckA) return;
    setSearching(true);
    setSearchError(null);
    const params = new URLSearchParams({
      bpm: String(deckA.bpm),
      key_num: String(deckA.key_num),
      mode: String(deckA.mode),
    });
    try {
      const res = await fetch(`${API}/search?${params}`);
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(
          txt.includes("indexing")
            ? "Dataset still indexing — try again in a moment"
            : txt
        );
      }
      const data = await res.json();
      setSearchResults((data.tracks as Track[]).slice(0, 20));
    } catch (e: any) {
      setSearchError(e.message ?? "Search failed");
    } finally {
      setSearching(false);
    }
  };

  // ── Select dataset track for Deck B ────────────────────────────────────────
  const selectDatasetTrack = async (track: Track) => {
    trkRef.current?.pause();
    setPlayingB(false);
    teardownEngine();
    if (deckB?.isUserFile) URL.revokeObjectURL(deckB.track.audio_url);

    setDeckBLoading(true);
    setShowSearch(false);
    setLoopEnabled(false);
    try {
      const [fbRes, chRes, lrRes] = await Promise.all([
        fetch(`${API}/first_beat/${encodeURIComponent(track.filename)}`).then(
          (r) => r.json()
        ),
        fetch(
          `${API}/chorus_time/${encodeURIComponent(track.filename)}`
        ).then((r) => r.json()),
        fetch(
          `${API}/loop_region/${encodeURIComponent(track.filename)}`
        ).then((r) => r.json()),
      ]);
      setDeckB({
        track,
        firstBeat: fbRes.first_beat ?? 0,
        chorusStart: chRes.start ?? undefined,
        loopRegion: lrRes,
        isUserFile: false,
      });
    } catch {
      setDeckB({
        track,
        firstBeat: 0,
        chorusStart: undefined,
        loopRegion: null,
        isUserFile: false,
      });
    } finally {
      setDeckBLoading(false);
    }
  };

  // ── Volume from crossfader ──────────────────────────────────────────────────
  useEffect(() => {
    const left =
      (crossfade <= 50 ? 1 : (100 - crossfade) / 50) * (srcVol / 100);
    const right =
      (crossfade >= 50 ? 1 : crossfade / 50) * (trkVol / 100);
    if (srcRef.current)
      srcRef.current.volume = Math.max(0, Math.min(1, left));
    if (trkRef.current)
      trkRef.current.volume = Math.max(0, Math.min(1, right));
  }, [srcVol, trkVol, crossfade]);

  // ── Web Audio engine (lazy, only for reverb / recording) ───────────────────
  const getEngine = useCallback((): AudioEngine | null => {
    if (engineRef.current) return engineRef.current;
    if (!srcRef.current || !trkRef.current) return null;
    const ctx = new AudioContext();
    const srcSource = ctx.createMediaElementSource(srcRef.current);
    const trkSource = ctx.createMediaElementSource(trkRef.current);
    const convolver = ctx.createConvolver();
    convolver.buffer = buildReverbIR(ctx);
    const dryGain = ctx.createGain();
    const wetGain = ctx.createGain();
    const masterGain = ctx.createGain();
    const recordDest = ctx.createMediaStreamDestination();
    srcSource.connect(dryGain);
    trkSource.connect(dryGain);
    srcSource.connect(convolver);
    trkSource.connect(convolver);
    convolver.connect(wetGain);
    dryGain.connect(masterGain);
    wetGain.connect(masterGain);
    masterGain.connect(ctx.destination);
    masterGain.connect(recordDest);
    dryGain.gain.value = 1;
    wetGain.gain.value = 0;
    const engine = {
      ctx,
      srcSource,
      trkSource,
      dryGain,
      wetGain,
      convolver,
      masterGain,
      recordDest,
    };
    engineRef.current = engine;
    return engine;
  }, []);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (vibe === "slowed") {
      engine.dryGain.gain.linearRampToValueAtTime(
        0.75,
        engine.ctx.currentTime + 0.1
      );
      engine.wetGain.gain.linearRampToValueAtTime(
        0.45,
        engine.ctx.currentTime + 0.1
      );
    } else {
      engine.dryGain.gain.linearRampToValueAtTime(
        1,
        engine.ctx.currentTime + 0.1
      );
      engine.wetGain.gain.linearRampToValueAtTime(
        0,
        engine.ctx.currentTime + 0.1
      );
    }
  }, [vibe]);

  // ── Auto-Loop ───────────────────────────────────────────────────────────────
  // Keep refs up to date so callbacks always read the latest values
  useEffect(() => { loopRef.current = loopEnabled; }, [loopEnabled]);
  useEffect(() => { loopRegionRef.current = loopRegion; }, [loopRegion]);

  // Attach timeupdate listener whenever the Deck B track changes.
  // Depend on `deckB` (not `loopRegion`) so the effect re-runs after the
  // <audio> element is mounted in the DOM and trkRef.current is valid.
  useEffect(() => {
    const el = trkRef.current;
    if (!el) return;
    const check = () => {
      const lr = loopRegionRef.current;
      if (!loopRef.current || !lr) return;
      if (el.currentTime >= lr.end) el.currentTime = lr.start;
    };
    el.addEventListener("timeupdate", check);
    return () => el.removeEventListener("timeupdate", check);
  }, [deckB]); // re-attach whenever the track (and therefore the element) changes

  // ── Smart Align ─────────────────────────────────────────────────────────────
  const doSmartAlign = () => {
    if (srcRef.current) srcRef.current.currentTime = sourceFirstBeat;
    if (trkRef.current) trkRef.current.currentTime = trkFirstBeat;
  };

  // ── Crossfade + auto-fade ───────────────────────────────────────────────────
  const swap = () => setCrossfade(100);

  const autoFade = (beats: 4 | 8) => {
    if (fading) {
      if (fadeRef.current) clearInterval(fadeRef.current);
      setFading(false);
      return;
    }
    const stepMs = ((60 / sourceBpm) * beats * 1000) / 60;
    const delta = (100 - crossfade) / 60;
    let tick = 0;
    setFading(true);
    fadeRef.current = setInterval(() => {
      tick++;
      setCrossfade((prev) => {
        const next = Math.min(100, prev + delta);
        if (tick >= 60 || next >= 100) {
          if (fadeRef.current) clearInterval(fadeRef.current);
          setFading(false);
          return 100;
        }
        return next;
      });
    }, stepMs);
  };

  // ── Playback ────────────────────────────────────────────────────────────────
  const ensureEngine = async () => {
    const engine = getEngine();
    if (!engine) return;
    await engine.ctx.resume();
    engine.dryGain.gain.value = vibe === "slowed" ? 0.75 : 1;
    engine.wetGain.gain.value = vibe === "slowed" ? 0.45 : 0;
  };

  const toggleA = () => {
    if (playingA) {
      srcRef.current?.pause();
      setPlayingA(false);
    } else {
      if (vibe === "slowed") ensureEngine();
      if (srcRef.current) {
        srcRef.current.playbackRate = vibeRate;
        srcRef.current.play();
      }
      setPlayingA(true);
    }
  };

  const toggleB = () => {
    if (playingB) {
      trkRef.current?.pause();
      setPlayingB(false);
    } else {
      if (vibe === "slowed") ensureEngine();
      if (trkRef.current) {
        trkRef.current.playbackRate = baseRate * vibeRate;
        trkRef.current.play();
      }
      setPlayingB(true);
    }
  };

  const toggleBoth = () => {
    if (playingA && playingB) {
      srcRef.current?.pause();
      trkRef.current?.pause();
      setPlayingA(false);
      setPlayingB(false);
    } else {
      if (vibe === "slowed") ensureEngine();
      if (srcRef.current) {
        srcRef.current.playbackRate = vibeRate;
        srcRef.current.play();
      }
      if (trkRef.current) {
        trkRef.current.playbackRate = baseRate * vibeRate;
        trkRef.current.play();
      }
      setPlayingA(true);
      setPlayingB(true);
    }
  };

  const stop = () => {
    srcRef.current?.pause();
    trkRef.current?.pause();
    if (srcRef.current) srcRef.current.currentTime = 0;
    if (trkRef.current) trkRef.current.currentTime = 0;
    setPlayingA(false);
    setPlayingB(false);
  };

  // ── Keyboard shortcut: Space → toggle both ──────────────────────────────────
  const toggleBothRef = useRef(toggleBoth);
  useEffect(() => {
    toggleBothRef.current = toggleBoth;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;
      if (e.code === "Space") {
        e.preventDefault();
        toggleBothRef.current();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // ── Update rates live ───────────────────────────────────────────────────────
  useEffect(() => {
    if (playingA && srcRef.current) srcRef.current.playbackRate = vibeRate;
    if (playingB && trkRef.current)
      trkRef.current.playbackRate = baseRate * vibeRate;
  }, [vibe, sync, playingA, playingB, vibeRate, baseRate]);

  // ── Record & Export ─────────────────────────────────────────────────────────
  const startRecording = async () => {
    const engine = getEngine();
    if (!engine) return;
    await engine.ctx.resume();
    chunksRef.current = [];
    const mr = new MediaRecorder(engine.recordDest.stream, {
      mimeType: "audio/webm",
    });
    mr.ondataavailable = (e) => chunksRef.current.push(e.data);
    mr.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: "audio/webm" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `mashkit-mix-${Date.now()}.webm`;
      a.click();
    };
    mr.start();
    recorderRef.current = mr;
    setRecording(true);
    if (!playingA && !playingB) {
      if (srcRef.current) {
        srcRef.current.playbackRate = vibeRate;
        srcRef.current.play();
      }
      if (trkRef.current) {
        trkRef.current.playbackRate = baseRate * vibeRate;
        trkRef.current.play();
      }
      setPlayingA(true);
      setPlayingB(true);
    }
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
  };

  const vibeLabel: Record<Vibe, string> = {
    normal: "Normal",
    nightcore: "🐇 Sped Up",
    slowed: "🐢 Slowed + Reverb",
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5 rounded-2xl border border-ocean/40 bg-ocean/10 p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-full bg-mist/20 px-3 py-1 text-xs font-semibold text-mist">
          MASHUP STUDIO
        </span>
        {recording && (
          <span className="flex items-center gap-1.5 rounded-full bg-red-500/20 px-3 py-1 text-xs font-semibold text-red-400">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" />
            RECORDING
          </span>
        )}
      </div>

      {/* Vibe presets */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-mist/50">Vibe:</span>
        {(["normal", "nightcore", "slowed"] as Vibe[]).map((v) => (
          <button
            key={v}
            onClick={() => setVibe(v)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
              vibe === v
                ? "bg-mist text-coal shadow-lg shadow-mist/20"
                : "border border-ocean/40 text-mist/60 hover:bg-ocean/20"
            }`}
          >
            {vibeLabel[v]}
          </button>
        ))}
      </div>

      {/* ── Decks ───────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Deck A */}
        <div className="space-y-3 rounded-xl border border-ocean/30 bg-coal/60 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-mist" />
              <span className="text-xs uppercase tracking-widest text-mist/50">
                Deck A
              </span>
            </div>
            {deckA && (
              <span className="text-xs text-mist/40">
                {deckA.bpm} BPM
                {vibe === "nightcore" && (
                  <span className="ml-1 text-amber-400">×1.2</span>
                )}
                {vibe === "slowed" && (
                  <span className="ml-1 text-blue-400">×0.85</span>
                )}
              </span>
            )}
          </div>

          {!deckA ? (
            <DeckDropZone
              label="your track"
              onFile={handleDeckADrop}
              loading={deckALoading}
            />
          ) : (
            <>
              <div className="flex items-center gap-2">
                <p className="min-w-0 flex-1 truncate text-sm font-medium text-foam">
                  {deckA.file.name}
                </p>
                <button
                  onClick={() => {
                    srcRef.current?.pause();
                    setPlayingA(false);
                    URL.revokeObjectURL(deckA.url);
                    setDeckA(null);
                  }}
                  className="flex-shrink-0 rounded p-0.5 text-mist/30 hover:text-mist/60"
                  title="Remove track"
                >
                  <svg
                    className="h-3.5 w-3.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    strokeWidth="2"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
              {srcUrl && (
                <WaveformPlayer
                  src={srcUrl}
                  label="Your Track"
                  bpm={sourceBpm}
                  audioRef={srcRef}
                  color="rgba(165,201,202,0.25)"
                  progressColor="#A5C9CA"
                />
              )}
              <div className="flex items-center gap-3">
                <button
                  onClick={toggleA}
                  className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg transition-colors ${
                    playingA
                      ? "bg-mist text-coal"
                      : "border border-ocean/50 text-mist hover:bg-ocean/30"
                  }`}
                >
                  {playingA ? (
                    <svg
                      className="h-3.5 w-3.5"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <rect x="6" y="4" width="4" height="16" />
                      <rect x="14" y="4" width="4" height="16" />
                    </svg>
                  ) : (
                    <svg
                      className="h-3.5 w-3.5"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  )}
                </button>
                <div className="flex-1">
                  <div className="mb-1 flex justify-between text-xs text-mist/40">
                    <span>Volume</span>
                    <span>{srcVol}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={srcVol}
                    onChange={(e) => setSrcVol(+e.target.value)}
                    className="w-full"
                  />
                </div>
              </div>
            </>
          )}
        </div>

        {/* Deck B */}
        <div className="space-y-3 rounded-xl border border-ocean/30 bg-coal/60 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-foam" />
              <span className="text-xs uppercase tracking-widest text-mist/50">
                Deck B
              </span>
            </div>
            {deckB && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-mist/40">
                  {deckB.track.bpm} BPM
                  {sync && deckB.track.bpm !== sourceBpm && (
                    <span className="text-mist/30"> → {sourceBpm}</span>
                  )}
                </span>
                {loopRegion && (
                  <button
                    onClick={() => setLoopEnabled((p) => !p)}
                    className={`rounded px-2 py-0.5 text-[10px] font-semibold transition-colors ${
                      loopEnabled
                        ? "border border-mist/40 bg-mist/20 text-mist"
                        : "border border-ocean/30 text-mist/40 hover:text-mist"
                    }`}
                    title={`Loop ${loopRegion.bars}-bar region`}
                  >
                    {loopEnabled ? "🔁 Looping" : "🔁 Loop Beat"}
                  </button>
                )}
              </div>
            )}
          </div>

          {!deckB ? (
            <div className="space-y-2">
              <DeckDropZone
                label="a track"
                onFile={handleDeckBDrop}
                loading={deckBLoading}
              />

              {deckA && (
                <button
                  onClick={() => {
                    if (!showSearch) {
                      setShowSearch(true);
                      handleSearch();
                    } else {
                      setShowSearch(false);
                    }
                  }}
                  className="w-full rounded-xl border border-ocean/40 py-2 text-xs font-semibold text-mist/60 transition-colors hover:bg-ocean/20 hover:text-mist"
                >
                  {showSearch ? "✕ Close Search" : "🔍 Search Dataset for Match"}
                </button>
              )}

              {showSearch && (
                <div className="space-y-2">
                  {searching && (
                    <p className="py-2 text-center text-xs text-mist/40">
                      Searching…
                    </p>
                  )}
                  {searchError && (
                    <p className="text-center text-xs text-red-400">
                      {searchError}
                    </p>
                  )}
                  {searchResults.length > 0 && (
                    <>
                      {/* Filter bar */}
                      <div className="flex items-center justify-between rounded-lg border border-ocean/20 bg-ocean/10 px-2.5 py-1.5">
                        <label className="flex cursor-pointer items-center gap-1.5 text-[10px] text-mist/60">
                          <input
                            type="checkbox"
                            checked={keyFilterEnabled}
                            onChange={(e) => setKeyFilterEnabled(e.target.checked)}
                            className="accent-mist"
                          />
                          Compatible keys only
                        </label>
                        <span className="text-[10px] text-mist/30">
                          {(keyFilterEnabled
                            ? searchResults.filter((t) => t.key_distance <= 1)
                            : searchResults
                          ).length}{" "}
                          results
                        </span>
                      </div>

                      {/* Results list */}
                      <div className="max-h-56 space-y-0.5 overflow-y-auto rounded-xl border border-ocean/20 p-1.5">
                        {(keyFilterEnabled
                          ? searchResults.filter((t) => t.key_distance <= 1)
                          : searchResults
                        ).map((t) => {
                          const ml  = matchLabel(t.key_distance, t.bpm_diff);
                          const kl  = keyCompatLabel(t.key_distance);
                          const bl  = deckA ? bpmMatchLabel(t.bpm, deckA.bpm) : null;
                          return (
                            <button
                              key={t.filename}
                              onClick={() => selectDatasetTrack(t)}
                              className="flex w-full flex-col gap-0.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-ocean/20"
                            >
                              {/* Row 1: title + match badge */}
                              <div className="flex items-start justify-between gap-1">
                                <p className="min-w-0 flex-1 truncate text-xs font-medium text-foam">
                                  {t.title}
                                </p>
                                <span className={`flex-shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold ${ml.cls}`}>
                                  {ml.text}
                                </span>
                              </div>
                              {/* Row 2: artist + key/bpm chips */}
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-[10px] text-mist/40 truncate max-w-[90px]">
                                  {t.artist}
                                </span>
                                <span className="text-mist/20">·</span>
                                <span className={`text-[10px] font-semibold ${kl.cls}`}>
                                  {kl.text}
                                </span>
                                <span className="text-mist/20">·</span>
                                {bl && (
                                  <span className={`text-[10px] font-semibold ${bl.cls}`}>
                                    {bl.text}
                                  </span>
                                )}
                                <span className="ml-auto text-[10px] text-mist/30">
                                  {t.bpm} BPM · {t.camelot}
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foam">
                    {deckB.track.title}
                  </p>
                  {!deckB.isUserFile && (
                    <p className="truncate text-[11px] text-mist/40">
                      {deckB.track.artist}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => {
                    trkRef.current?.pause();
                    setPlayingB(false);
                    if (deckB.isUserFile)
                      URL.revokeObjectURL(deckB.track.audio_url);
                    setDeckB(null);
                    setLoopEnabled(false);
                  }}
                  className="flex-shrink-0 rounded p-0.5 text-mist/30 hover:text-mist/60"
                  title="Remove track"
                >
                  <svg
                    className="h-3.5 w-3.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    strokeWidth="2"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
              <WaveformPlayer
                src={deckB.track.audio_url}
                label={deckB.track.artist}
                bpm={deckB.track.bpm}
                audioRef={trkRef}
                color="rgba(231,246,242,0.2)"
                progressColor="#E7F6F2"
                chorousStart={trkChorusStart}
              />
              <div className="flex items-center gap-3">
                <button
                  onClick={toggleB}
                  className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg transition-colors ${
                    playingB
                      ? "bg-foam text-coal"
                      : "border border-ocean/50 text-foam/70 hover:bg-ocean/30"
                  }`}
                >
                  {playingB ? (
                    <svg
                      className="h-3.5 w-3.5"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <rect x="6" y="4" width="4" height="16" />
                      <rect x="14" y="4" width="4" height="16" />
                    </svg>
                  ) : (
                    <svg
                      className="h-3.5 w-3.5"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  )}
                </button>
                <div className="flex-1">
                  <div className="mb-1 flex justify-between text-xs text-mist/40">
                    <span>Volume</span>
                    <span>{trkVol}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={trkVol}
                    onChange={(e) => setTrkVol(+e.target.value)}
                    className="w-full"
                  />
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Crossfader + transitions ─────────────────────────────────────────── */}
      <div>
        <div className="mb-1 flex justify-between text-xs text-mist/40">
          <span>A</span>
          <span>Crossfader</span>
          <span>B</span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={crossfade}
          onChange={(e) => {
            if (fading && fadeRef.current) {
              clearInterval(fadeRef.current);
              setFading(false);
            }
            setCrossfade(+e.target.value);
          }}
          className="w-full"
        />
        <div className="mt-2 flex gap-2">
          <button
            onClick={swap}
            disabled={!playing}
            className="flex-1 rounded-lg border border-ocean/40 py-1.5 text-xs font-semibold text-mist transition-colors hover:bg-ocean/20 disabled:opacity-30"
          >
            ⚡ Swap
          </button>
          <button
            onClick={() => autoFade(4)}
            disabled={!(playingA && playingB)}
            className={`flex-1 rounded-lg border py-1.5 text-xs font-semibold transition-colors disabled:opacity-30 ${
              fading
                ? "border-mist/60 bg-mist/10 text-mist"
                : "border-ocean/40 text-mist hover:bg-ocean/20"
            }`}
          >
            {fading ? "⏹ Cancel Fade" : "🌊 4-Beat Fade"}
          </button>
          <button
            onClick={() => autoFade(8)}
            disabled={!(playingA && playingB) || fading}
            className="flex-1 rounded-lg border border-ocean/40 py-1.5 text-xs font-semibold text-mist transition-colors hover:bg-ocean/20 disabled:opacity-30"
          >
            🌊 8-Beat Fade
          </button>
        </div>
      </div>

      {/* ── Controls ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={toggleBoth}
          disabled={!srcUrl}
          className="flex-1 rounded-xl bg-gradient-to-r from-ocean to-mist py-3 text-sm font-bold text-coal transition-all hover:brightness-110 disabled:opacity-40"
        >
          {playingA && playingB ? "⏸ Pause Both" : "▶ Play Both"}
        </button>
        <button
          onClick={stop}
          className="rounded-xl border border-ocean/40 px-5 py-3 text-sm font-medium text-mist transition-colors hover:bg-ocean/20"
        >
          Stop
        </button>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-mist/60">
          <input
            type="checkbox"
            checked={sync}
            onChange={(e) => setSync(e.target.checked)}
            className="accent-mist"
          />
          BPM Sync
        </label>
        <button
          onClick={doSmartAlign}
          className="rounded-xl border border-mist/30 px-4 py-3 text-xs font-semibold text-mist transition-colors hover:bg-mist/10"
          title={`Snap A to beat 1 (${sourceFirstBeat.toFixed(2)}s) · B to beat 1 (${trkFirstBeat.toFixed(2)}s)`}
        >
          🧲 Smart Align
        </button>
        {!recording ? (
          <button
            onClick={startRecording}
            disabled={!srcUrl}
            className="rounded-xl border border-red-500/40 px-4 py-3 text-xs font-semibold text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-30"
          >
            ⏺ Record Mix
          </button>
        ) : (
          <button
            onClick={stopRecording}
            className="rounded-xl border border-red-400 bg-red-500/20 px-4 py-3 text-xs font-semibold text-red-400 transition-colors hover:bg-red-500/30"
          >
            ⏹ Stop & Export
          </button>
        )}
      </div>

      {/* ── Loop Deck ────────────────────────────────────────────────────────── */}
      <LoopDeck masterBpm={sourceBpm} />

      {/* ── Sample Pads ──────────────────────────────────────────────────────── */}
      <SamplePads />

      {/* Hidden audio elements */}
      {srcUrl && <audio ref={srcRef} src={srcUrl} />}
      {deckB && (
        <audio
          ref={trkRef}
          src={deckB.track.audio_url}
          {...(!deckB.isUserFile
            ? { crossOrigin: "anonymous" as const }
            : {})}
        />
      )}
    </div>
  );
}
