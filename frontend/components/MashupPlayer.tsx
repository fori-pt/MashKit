"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Track } from "@/app/page";
import WaveformPlayer from "./WaveformPlayer";
import SamplePads from "./SamplePads";
import LoopDeck from "./LoopDeck";

const API = "http://localhost:8000";

type Vibe = "normal" | "nightcore" | "slowed";

interface Props {
  sourceFile: File;
  sourceBpm: number;
  sourceFirstBeat: number;
  track: Track;
}

// Generates a synthetic reverb impulse response in memory
function buildReverbIR(ctx: AudioContext): AudioBuffer {
  const duration = 3.0;
  const decay = 2.5;
  const length = ctx.sampleRate * duration;
  const buf = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  return buf;
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

export default function MashupPlayer({ sourceFile, sourceBpm, sourceFirstBeat, track }: Props) {
  const srcRef = useRef<HTMLAudioElement>(null);
  const trkRef = useRef<HTMLAudioElement>(null);
  const engineRef = useRef<AudioEngine | null>(null);

  const [srcUrl, setSrcUrl] = useState("");
  const [playingA, setPlayingA] = useState(false);
  const [playingB, setPlayingB] = useState(false);
  const [srcVol, setSrcVol] = useState(80);
  const [trkVol, setTrkVol] = useState(80);
  const [crossfade, setCrossfade] = useState(50);
  const [sync, setSync] = useState(true);

  // Feature 1: Vibe Presets
  const [vibe, setVibe] = useState<Vibe>("normal");

  // Feature 2: Auto-Align
  const [trkFirstBeat, setTrkFirstBeat] = useState(0);

  // Feature 3: Auto-Loop (Deck B)
  const [loopEnabled, setLoopEnabled] = useState(false);
  const [loopRegion, setLoopRegion] = useState<{ start: number; end: number; bars: number } | null>(null);
  const loopRef = useRef(false); // mirror for event listener

  // Auto-Transitions
  const [fading, setFading] = useState(false);
  const fadeRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Chorus markers
  const [trkChorusStart, setTrkChorusStart] = useState<number | undefined>(undefined);

  // Recording
  const [recording, setRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // ─── Object URL ───────────────────────────────────────────────
  useEffect(() => {
    const url = URL.createObjectURL(sourceFile);
    setSrcUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [sourceFile]);

  // ─── Chorus + Loop region fetch ───────────────────────────────
  useEffect(() => {
    fetch(`${API}/chorus_time/${encodeURIComponent(track.filename)}`)
      .then((r) => r.json())
      .then((d) => setTrkChorusStart(d.start ?? undefined))
      .catch(() => {});

    fetch(`${API}/first_beat/${encodeURIComponent(track.filename)}`)
      .then((r) => r.json())
      .then((d) => setTrkFirstBeat(d.first_beat ?? 0))
      .catch(() => {});

    fetch(`${API}/loop_region/${encodeURIComponent(track.filename)}`)
      .then((r) => r.json())
      .then((d) => setLoopRegion(d))
      .catch(() => {});
  }, [track.filename]);

  // ─── Volume from crossfader ────────────────────────────────────
  useEffect(() => {
    const left = (crossfade <= 50 ? 1 : (100 - crossfade) / 50) * (srcVol / 100);
    const right = (crossfade >= 50 ? 1 : crossfade / 50) * (trkVol / 100);
    if (srcRef.current) srcRef.current.volume = Math.max(0, Math.min(1, left));
    if (trkRef.current) trkRef.current.volume = Math.max(0, Math.min(1, right));
  }, [srcVol, trkVol, crossfade]);

  // ─── Vibe: playback rate ───────────────────────────────────────
  const vibeRate = vibe === "nightcore" ? 1.2 : vibe === "slowed" ? 0.85 : 1.0;

  // ─── Web Audio engine (lazy init for reverb + recording) ──────
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

    // dry path: src/trk → dryGain → masterGain → speakers + record
    srcSource.connect(dryGain);
    trkSource.connect(dryGain);
    // wet path: src/trk → convolver → wetGain → masterGain
    srcSource.connect(convolver);
    trkSource.connect(convolver);
    convolver.connect(wetGain);

    dryGain.connect(masterGain);
    wetGain.connect(masterGain);
    masterGain.connect(ctx.destination);
    masterGain.connect(recordDest);

    // default: no reverb
    dryGain.gain.value = 1;
    wetGain.gain.value = 0;

    const engine = { ctx, srcSource, trkSource, dryGain, wetGain, convolver, masterGain, recordDest };
    engineRef.current = engine;
    return engine;
  }, []);

  // Apply reverb wet/dry when vibe changes
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (vibe === "slowed") {
      engine.dryGain.gain.linearRampToValueAtTime(0.75, engine.ctx.currentTime + 0.1);
      engine.wetGain.gain.linearRampToValueAtTime(0.45, engine.ctx.currentTime + 0.1);
    } else {
      engine.dryGain.gain.linearRampToValueAtTime(1, engine.ctx.currentTime + 0.1);
      engine.wetGain.gain.linearRampToValueAtTime(0, engine.ctx.currentTime + 0.1);
    }
  }, [vibe]);

  // ─── Auto-Loop listener ────────────────────────────────────────
  useEffect(() => {
    loopRef.current = loopEnabled;
  }, [loopEnabled]);

  useEffect(() => {
    const el = trkRef.current;
    if (!el || !loopRegion) return;
    const check = () => {
      if (loopRef.current && el.currentTime >= loopRegion.end) {
        el.currentTime = loopRegion.start;
      }
    };
    el.addEventListener("timeupdate", check);
    return () => el.removeEventListener("timeupdate", check);
  }, [loopRegion]);

  // ─── Smart Align ──────────────────────────────────────────────
  const doSmartAlign = () => {
    if (srcRef.current) srcRef.current.currentTime = sourceFirstBeat;
    if (trkRef.current) trkRef.current.currentTime = trkFirstBeat;
  };

  // ─── Transitions ─────────────────────────────────────────────
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

  // ─── Playback ─────────────────────────────────────────────────
  const baseRate = sync && track.bpm ? sourceBpm / track.bpm : 1;
  const playing = playingA || playingB; // at least one deck is running

  // Only init Web Audio engine when genuinely needed (reverb or recording).
  // Normal/nightcore playback goes directly through the <audio> elements.
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
      if (srcRef.current) { srcRef.current.playbackRate = vibeRate; srcRef.current.play(); }
      setPlayingA(true);
    }
  };

  const toggleB = () => {
    if (playingB) {
      trkRef.current?.pause();
      setPlayingB(false);
    } else {
      if (vibe === "slowed") ensureEngine();
      if (trkRef.current) { trkRef.current.playbackRate = baseRate * vibeRate; trkRef.current.play(); }
      setPlayingB(true);
    }
  };

  const toggleBoth = () => {
    const bothPlaying = playingA && playingB;
    if (bothPlaying) {
      srcRef.current?.pause();
      trkRef.current?.pause();
      setPlayingA(false);
      setPlayingB(false);
    } else {
      if (vibe === "slowed") ensureEngine();
      if (srcRef.current) { srcRef.current.playbackRate = vibeRate; srcRef.current.play(); }
      if (trkRef.current) { trkRef.current.playbackRate = baseRate * vibeRate; trkRef.current.play(); }
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

  // ─── Keyboard shortcut: Space → Play/Pause both ──────────────
  const toggleBothRef = useRef(toggleBoth);
  useEffect(() => { toggleBothRef.current = toggleBoth; });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === "Space") { e.preventDefault(); toggleBothRef.current(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Update rates live when vibe/sync changes while playing
  useEffect(() => {
    if (playingA && srcRef.current) srcRef.current.playbackRate = vibeRate;
    if (playingB && trkRef.current) trkRef.current.playbackRate = baseRate * vibeRate;
  }, [vibe, sync, playingA, playingB, vibeRate, baseRate]);

  // ─── Record & Export ──────────────────────────────────────────
  const startRecording = async () => {
    const engine = getEngine();
    if (!engine) return;
    await engine.ctx.resume();
    chunksRef.current = [];
    const mr = new MediaRecorder(engine.recordDest.stream, { mimeType: "audio/webm" });
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
      if (srcRef.current) { srcRef.current.playbackRate = vibeRate; srcRef.current.play(); }
      if (trkRef.current) { trkRef.current.playbackRate = baseRate * vibeRate; trkRef.current.play(); }
      setPlayingA(true);
      setPlayingB(true);
    }
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
  };

  // ─── Vibe label helper ────────────────────────────────────────
  const vibeLabel = { normal: "Normal", nightcore: "🐇 Sped Up", slowed: "🐢 Slowed + Reverb" };

  return (
    <div className="space-y-5 rounded-2xl border border-ocean/40 bg-ocean/10 p-6">
      {/* Header row */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-full bg-mist/20 px-3 py-1 text-xs font-semibold text-mist">
          MASHUP STUDIO
        </span>
        {recording && (
          <span className="flex items-center gap-1.5 rounded-full bg-red-500/20 px-3 py-1 text-xs font-semibold text-red-400">
            <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" />
            RECORDING
          </span>
        )}
      </div>

      {/* ── Vibe Presets ─────────────────────────────────────── */}
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

      {/* ── Waveform Decks ───────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Deck A */}
        <div className="space-y-3 rounded-xl border border-ocean/30 bg-coal/60 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-mist" />
              <span className="text-xs uppercase tracking-widest text-mist/50">Deck A</span>
            </div>
            <span className="text-xs text-mist/40">
              {sourceBpm} BPM
              {vibe === "nightcore" && <span className="ml-1 text-amber-400">×1.2</span>}
              {vibe === "slowed" && <span className="ml-1 text-blue-400">×0.85</span>}
            </span>
          </div>
          <p className="truncate text-sm font-medium text-foam">{sourceFile.name}</p>
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
              disabled={!srcUrl}
              className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg transition-colors disabled:opacity-30 ${
                playingA ? "bg-mist text-coal" : "border border-ocean/50 text-mist hover:bg-ocean/30"
              }`}
            >
              {playingA ? (
                <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" />
                </svg>
              ) : (
                <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>
            <div className="flex-1">
              <div className="mb-1 flex justify-between text-xs text-mist/40">
                <span>Volume</span><span>{srcVol}%</span>
              </div>
              <input type="range" min={0} max={100} value={srcVol}
                onChange={(e) => setSrcVol(+e.target.value)} className="w-full" />
            </div>
          </div>
        </div>

        {/* Deck B */}
        <div className="space-y-3 rounded-xl border border-ocean/30 bg-coal/60 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-foam" />
              <span className="text-xs uppercase tracking-widest text-mist/50">Deck B</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-mist/40">
                {track.bpm} BPM{sync && track.bpm !== sourceBpm && <span className="text-mist/30"> → {sourceBpm}</span>}
              </span>
              {/* Auto-Loop toggle */}
              {loopRegion && (
                <button
                  onClick={() => setLoopEnabled((p) => !p)}
                  className={`rounded px-2 py-0.5 text-[10px] font-semibold transition-colors ${
                    loopEnabled
                      ? "bg-mist/20 text-mist border border-mist/40"
                      : "border border-ocean/30 text-mist/40 hover:text-mist"
                  }`}
                  title={`Loop ${loopRegion.bars}-bar region (${loopRegion.start.toFixed(1)}s–${loopRegion.end.toFixed(1)}s)`}
                >
                  {loopEnabled ? "🔁 Looping" : "🔁 Loop Beat"}
                </button>
              )}
            </div>
          </div>
          <p className="truncate text-sm font-medium text-foam">{track.title}</p>
          <WaveformPlayer
            src={track.audio_url}
            label={track.artist}
            bpm={track.bpm}
            audioRef={trkRef}
            color="rgba(231,246,242,0.2)"
            progressColor="#E7F6F2"
            chorousStart={trkChorusStart}
          />
          <div className="flex items-center gap-3">
            <button
              onClick={toggleB}
              className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg transition-colors ${
                playingB ? "bg-foam text-coal" : "border border-ocean/50 text-foam/70 hover:bg-ocean/30"
              }`}
            >
              {playingB ? (
                <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" />
                </svg>
              ) : (
                <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>
            <div className="flex-1">
              <div className="mb-1 flex justify-between text-xs text-mist/40">
                <span>Volume</span><span>{trkVol}%</span>
              </div>
              <input type="range" min={0} max={100} value={trkVol}
                onChange={(e) => setTrkVol(+e.target.value)} className="w-full" />
            </div>
          </div>
        </div>
      </div>

      {/* ── Crossfader + Smart Transitions ──────────────────── */}
      <div>
        <div className="mb-1 flex justify-between text-xs text-mist/40">
          <span>A</span><span>Crossfader</span><span>B</span>
        </div>
        <input
          type="range" min={0} max={100} value={crossfade}
          onChange={(e) => {
            if (fading && fadeRef.current) { clearInterval(fadeRef.current); setFading(false); }
            setCrossfade(+e.target.value);
          }}
          className="w-full"
        />
        <div className="mt-2 flex gap-2">
          <button onClick={swap} disabled={!playing}
            className="flex-1 rounded-lg border border-ocean/40 py-1.5 text-xs font-semibold text-mist transition-colors hover:bg-ocean/20 disabled:opacity-30">
            ⚡ Swap
          </button>
          <button onClick={() => autoFade(4)} disabled={!(playingA && playingB)}
            className={`flex-1 rounded-lg border py-1.5 text-xs font-semibold transition-colors disabled:opacity-30 ${fading ? "border-mist/60 bg-mist/10 text-mist" : "border-ocean/40 text-mist hover:bg-ocean/20"}`}>
            {fading ? "⏹ Cancel Fade" : "🌊 4-Beat Fade"}
          </button>
          <button onClick={() => autoFade(8)} disabled={!(playingA && playingB) || fading}
            className="flex-1 rounded-lg border border-ocean/40 py-1.5 text-xs font-semibold text-mist transition-colors hover:bg-ocean/20 disabled:opacity-30">
            🌊 8-Beat Fade
          </button>
        </div>
      </div>

      {/* ── Controls ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={toggleBoth} disabled={!srcUrl}
          className="flex-1 rounded-xl bg-gradient-to-r from-ocean to-mist py-3 text-sm font-bold text-coal transition-all hover:brightness-110 disabled:opacity-40">
          {playingA && playingB ? "⏸ Pause Both" : "▶ Play Both"}
        </button>
        <button onClick={stop}
          className="rounded-xl border border-ocean/40 px-5 py-3 text-sm font-medium text-mist transition-colors hover:bg-ocean/20">
          Stop
        </button>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-mist/60">
          <input type="checkbox" checked={sync} onChange={(e) => setSync(e.target.checked)} className="accent-mist" />
          BPM Sync
        </label>
        {/* Smart Align */}
        <button
          onClick={doSmartAlign}
          className="rounded-xl border border-mist/30 px-4 py-3 text-xs font-semibold text-mist transition-colors hover:bg-mist/10"
          title={`Snap A to beat 1 (${sourceFirstBeat.toFixed(2)}s) · B to beat 1 (${trkFirstBeat.toFixed(2)}s)`}
        >
          🧲 Smart Align
        </button>
        {/* Record & Export */}
        {!recording ? (
          <button onClick={startRecording} disabled={!srcUrl}
            className="rounded-xl border border-red-500/40 px-4 py-3 text-xs font-semibold text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-30">
            ⏺ Record Mix
          </button>
        ) : (
          <button onClick={stopRecording}
            className="rounded-xl border border-red-400 bg-red-500/20 px-4 py-3 text-xs font-semibold text-red-400 transition-colors hover:bg-red-500/30">
            ⏹ Stop & Export
          </button>
        )}
      </div>

      {/* ── Loop Deck ─────────────────────────────────────────── */}
      <LoopDeck masterBpm={sourceBpm} />

      {/* ── Sample Pads ──────────────────────────────────────── */}
      <SamplePads />

      {/* Hidden audio elements */}
      {srcUrl && <audio ref={srcRef} src={srcUrl} />}
      <audio ref={trkRef} src={track.audio_url} crossOrigin="anonymous" />
    </div>
  );
}
