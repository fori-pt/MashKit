"use client";

import { useEffect, useRef, useState } from "react";
import { Track } from "@/app/page";

interface Props {
  sourceFile: File;
  sourceBpm: number;
  track: Track;
}

export default function MashupPlayer({ sourceFile, sourceBpm, track }: Props) {
  const srcRef = useRef<HTMLAudioElement>(null);
  const trkRef = useRef<HTMLAudioElement>(null);
  const [srcUrl, setSrcUrl] = useState("");
  const [playing, setPlaying] = useState(false);
  const [srcVol, setSrcVol] = useState(80);
  const [trkVol, setTrkVol] = useState(80);
  const [crossfade, setCrossfade] = useState(50);
  const [sync, setSync] = useState(true);
  const [srcTime, setSrcTime] = useState(0);
  const [trkTime, setTrkTime] = useState(0);

  useEffect(() => {
    const url = URL.createObjectURL(sourceFile);
    setSrcUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [sourceFile]);

  // volumes from crossfader
  useEffect(() => {
    const left =
      (crossfade <= 50 ? 1 : (100 - crossfade) / 50) * (srcVol / 100);
    const right =
      (crossfade >= 50 ? 1 : crossfade / 50) * (trkVol / 100);
    if (srcRef.current) srcRef.current.volume = Math.max(0, Math.min(1, left));
    if (trkRef.current)
      trkRef.current.volume = Math.max(0, Math.min(1, right));
  }, [srcVol, trkVol, crossfade]);

  // time tracking
  useEffect(() => {
    const interval = setInterval(() => {
      if (srcRef.current) setSrcTime(srcRef.current.currentTime);
      if (trkRef.current) setTrkTime(trkRef.current.currentTime);
    }, 250);
    return () => clearInterval(interval);
  }, []);

  const rate = sync && track.bpm ? sourceBpm / track.bpm : 1;

  const toggle = () => {
    if (playing) {
      srcRef.current?.pause();
      trkRef.current?.pause();
      setPlaying(false);
    } else {
      if (srcRef.current) {
        srcRef.current.playbackRate = 1;
        srcRef.current.play();
      }
      if (trkRef.current) {
        trkRef.current.playbackRate = rate;
        trkRef.current.play();
      }
      setPlaying(true);
    }
  };

  const stop = () => {
    if (srcRef.current) {
      srcRef.current.pause();
      srcRef.current.currentTime = 0;
    }
    if (trkRef.current) {
      trkRef.current.pause();
      trkRef.current.currentTime = 0;
    }
    setPlaying(false);
    setSrcTime(0);
    setTrkTime(0);
  };

  const fmtTime = (t: number) => {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="space-y-5 rounded-2xl border border-ocean/40 bg-ocean/10 p-6">
      {/* Badge */}
      <div className="flex items-center gap-3">
        <span className="rounded-full bg-mist/20 px-3 py-1 text-xs font-semibold text-mist">
          MASHUP STUDIO
        </span>
        <span className="text-xs text-mist/40">Gimmick Mode</span>
      </div>

      {/* Decks */}
      <div className="grid grid-cols-2 gap-4">
        {/* Deck A */}
        <div className="space-y-3 rounded-xl border border-ocean/30 bg-coal/60 p-4">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-mist" />
            <span className="text-xs uppercase tracking-widest text-mist/50">
              Deck A — Your Track
            </span>
          </div>
          <p className="truncate text-sm font-medium text-foam">
            {sourceFile.name}
          </p>
          <p className="font-mono text-xs text-mist">
            {sourceBpm} BPM &middot; {fmtTime(srcTime)}
          </p>
          {/* Progress */}
          <div className="h-1 overflow-hidden rounded-full bg-ocean/40">
            <div
              className="h-full rounded-full bg-mist transition-all"
              style={{
                width: srcRef.current?.duration
                  ? `${(srcTime / srcRef.current.duration) * 100}%`
                  : "0%",
              }}
            />
          </div>
          <div>
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

        {/* Deck B */}
        <div className="space-y-3 rounded-xl border border-ocean/30 bg-coal/60 p-4">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-foam" />
            <span className="text-xs uppercase tracking-widest text-mist/50">
              Deck B — {track.artist}
            </span>
          </div>
          <p className="truncate text-sm font-medium text-foam">
            {track.title}
          </p>
          <p className="font-mono text-xs text-foam/70">
            {track.bpm} BPM
            {sync && track.bpm !== sourceBpm && (
              <span className="text-mist/40"> synced to {sourceBpm}</span>
            )}
            <span className="text-mist/40"> &middot; {fmtTime(trkTime)}</span>
          </p>
          {/* Progress */}
          <div className="h-1 overflow-hidden rounded-full bg-ocean/40">
            <div
              className="h-full rounded-full bg-foam/60 transition-all"
              style={{
                width: trkRef.current?.duration
                  ? `${(trkTime / trkRef.current.duration) * 100}%`
                  : "0%",
              }}
            />
          </div>
          <div>
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
      </div>

      {/* Crossfader */}
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
          onChange={(e) => setCrossfade(+e.target.value)}
          className="w-full"
        />
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3">
        <button
          onClick={toggle}
          disabled={!srcUrl}
          className="flex-1 rounded-xl bg-gradient-to-r from-ocean to-mist py-3 text-sm font-bold text-coal transition-all hover:brightness-110 disabled:opacity-40"
        >
          {playing ? "Pause Mix" : "Play Mix"}
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
      </div>

      {/* Hidden audio */}
      {srcUrl && <audio ref={srcRef} src={srcUrl} />}
      <audio ref={trkRef} src={track.audio_url} />
    </div>
  );
}
