"use client";

import { useEffect, useRef, useState } from "react";
import { AnalysisData } from "@/app/page";

interface Props {
  data: AnalysisData;
  onSearch: () => void;
  isSearching: boolean;
  uploadedFile: File | null;
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-ocean/40 bg-ocean/20 p-5">
      <p className="text-xs uppercase tracking-widest text-mist/60">{label}</p>
      <p className="mt-1 text-3xl font-bold text-foam">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-mist/50">{sub}</p>}
    </div>
  );
}

function fmtDur(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function compatibleKeys(key: string): string {
  const keys = [
    "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
  ];
  const name = key.split(" ")[0];
  const minor = key.includes("minor");
  const i = keys.indexOf(name);
  if (i < 0) return key;

  const relative = minor
    ? `${keys[(i + 3) % 12]} Major`
    : `${keys[(i + 9) % 12]} minor`;
  const parallel = minor ? `${name} Major` : `${name} minor`;
  const fifth = minor
    ? `${keys[(i + 7) % 12]} minor`
    : `${keys[(i + 7) % 12]} Major`;

  return [key, relative, parallel, fifth].join("  /  ");
}

function SourcePlayer({ file }: { file: File }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [url, setUrl] = useState("");
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (audioRef.current) {
        setCurrentTime(audioRef.current.currentTime);
      }
    }, 250);
    return () => clearInterval(interval);
  }, []);

  const toggle = () => {
    if (!audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setPlaying(!playing);
  };

  const seek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const t = +e.target.value;
    if (audioRef.current) {
      audioRef.current.currentTime = t;
      setCurrentTime(t);
    }
  };

  return (
    <div className="flex items-center gap-3 rounded-xl border border-ocean/30 bg-ocean/10 p-3">
      <button
        onClick={toggle}
        className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg transition-colors ${
          playing ? "bg-mist text-coal" : "bg-ocean/60 text-foam hover:bg-ocean"
        }`}
      >
        {playing ? (
          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
            <rect x="6" y="4" width="4" height="16" />
            <rect x="14" y="4" width="4" height="16" />
          </svg>
        ) : (
          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>

      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex justify-between text-xs text-mist/50">
          <span className="truncate font-medium text-foam">{file.name}</span>
          <span className="flex-shrink-0 ml-2">
            {fmtDur(currentTime)} / {fmtDur(duration)}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={currentTime}
          onChange={seek}
          className="w-full"
        />
      </div>

      {url && (
        <audio
          ref={audioRef}
          src={url}
          onLoadedMetadata={() => {
            if (audioRef.current) setDuration(audioRef.current.duration);
          }}
          onEnded={() => setPlaying(false)}
        />
      )}
    </div>
  );
}

export default function AnalysisResults({
  data,
  onSearch,
  isSearching,
  uploadedFile,
}: Props) {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foam">Analysis Results</h2>
          <p className="text-sm text-mist/50">{data.filename}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-green-400" />
          <span className="text-sm text-green-400">Complete</span>
        </div>
      </div>

      {/* Player for uploaded track */}
      {uploadedFile && <SourcePlayer file={uploadedFile} />}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="BPM" value={String(data.bpm)} sub="Beats per minute" />
        <Stat label="Key" value={data.key} sub={`Camelot: ${data.camelot}`} />
        <Stat label="Energy" value={`${data.energy}%`} sub="RMS energy" />
        <Stat
          label="Duration"
          value={fmtDur(data.duration)}
          sub={`${data.beats} beats`}
        />
      </div>

      <div className="rounded-xl border border-mist/20 bg-mist/5 p-4 text-sm">
        <span className="font-medium text-mist">Compatible keys: </span>
        <span className="text-foam/80">{compatibleKeys(data.key)}</span>
      </div>

      <button
        onClick={onSearch}
        disabled={isSearching}
        className="w-full rounded-xl bg-gradient-to-r from-ocean to-mist py-3 text-sm font-bold text-coal transition-all hover:brightness-110 disabled:opacity-50"
      >
        {isSearching ? "Searching dataset..." : "Find Matching Tracks"}
      </button>
    </div>
  );
}
