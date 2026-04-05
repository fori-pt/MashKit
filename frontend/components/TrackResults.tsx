"use client";

import { useRef, useState, useEffect } from "react";
import { Track } from "@/app/page";

const API = "http://localhost:8000";

interface Props {
  tracks: Track[];
  sourceBpm: number;
  selected: Track | null;
  onSelect: (t: Track) => void;
}

function Card({
  track,
  active,
  onSelect,
}: {
  track: Track;
  active: boolean;
  onSelect: () => void;
}) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // cleanup on unmount
  useEffect(() => () => {
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
  }, []);

  const stopAudio = () => {
    ref.current?.pause();
    if (ref.current) ref.current.currentTime = 0;
    setPlaying(false);
    setPreviewing(false);
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
  };

  const toggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (playing || previewing) {
      stopAudio();
      return;
    }
    // fetch chorus start time, then play 10 s preview
    setPreviewing(true);
    try {
      const res = await fetch(`${API}/chorus_time/${encodeURIComponent(track.filename)}`);
      const data = await res.json();
      const start: number = data.start ?? 0;
      if (ref.current) {
        ref.current.currentTime = start;
        await ref.current.play();
        setPlaying(true);
        previewTimerRef.current = setTimeout(stopAudio, 10_000);
      }
    } catch {
      // fallback: play from beginning
      if (ref.current) {
        await ref.current.play();
        setPlaying(true);
        previewTimerRef.current = setTimeout(stopAudio, 10_000);
      }
    } finally {
      setPreviewing(false);
    }
  };

  const matchClr =
    track.score < 15
      ? "text-green-400"
      : track.score < 30
        ? "text-yellow-400"
        : "text-orange-400";

  const matchLabel =
    track.score < 15
      ? "Great match"
      : track.score < 30
        ? "Good match"
        : "Okay match";

  return (
    <div
      onClick={onSelect}
      className={`
        group flex cursor-pointer gap-3 rounded-xl border p-3 transition-all
        ${
          active
            ? "border-mist/60 bg-mist/10"
            : "border-ocean/30 bg-ocean/10 hover:border-mist/30 hover:bg-ocean/20"
        }
      `}
    >
      {/* Play button */}
      <button
        onClick={toggle}
        className={`
          relative flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg
          transition-colors
          ${playing ? "bg-mist text-coal" : "bg-ocean/60 text-foam group-hover:bg-ocean"}
        `}
        title={playing ? "Stop preview" : "Play 10s chorus preview"}
      >
        {previewing ? (
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
            <path d="M12 2a10 10 0 0 1 10 10" />
          </svg>
        ) : playing ? (
          <>
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
              <rect x="6" y="4" width="4" height="16" />
              <rect x="14" y="4" width="4" height="16" />
            </svg>
            <span className="absolute -bottom-1 -right-1 rounded-full bg-green-400 px-1 text-[9px] font-bold text-coal leading-tight">10s</span>
          </>
        ) : (
          <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foam">{track.title}</p>
        <p className="truncate text-xs text-mist/50">{track.artist}</p>
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
          <span className="font-mono text-xs text-mist">
            {track.bpm} BPM
          </span>
          <span className="text-xs text-mist/60">{track.key}</span>
          <span className="text-xs text-mist/40">{track.camelot}</span>
          <span className={`text-xs font-medium ${matchClr}`}>
            {matchLabel}
          </span>
        </div>
      </div>

      {/* Select radio */}
      <div className="flex items-center">
        <div
          className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${
            active ? "border-mist bg-mist" : "border-ocean"
          }`}
        >
          {active && <div className="h-2 w-2 rounded-full bg-coal" />}
        </div>
      </div>

      <audio
        ref={ref}
        src={track.audio_url}
        onEnded={stopAudio}
      />
    </div>
  );
}

export default function TrackResults({
  tracks,
  selected,
  onSelect,
}: Props) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-foam">Matching Tracks</h2>
        <p className="text-sm text-mist/50">
          {tracks.length} tracks from dataset &middot; Sorted by compatibility
          &middot; Select one to mashup
        </p>
      </div>

      <div className="grid max-h-[520px] grid-cols-1 gap-2 overflow-y-auto pr-1 md:grid-cols-2">
        {tracks.map((t) => (
          <Card
            key={t.filename}
            track={t}
            active={selected?.filename === t.filename}
            onSelect={() => onSelect(t)}
          />
        ))}
      </div>
    </div>
  );
}
