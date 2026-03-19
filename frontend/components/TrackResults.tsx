"use client";

import { useRef, useState } from "react";
import { Track } from "@/app/page";

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

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (playing) {
      ref.current?.pause();
      setPlaying(false);
    } else {
      ref.current?.play();
      setPlaying(true);
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
          flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg
          transition-colors
          ${playing ? "bg-mist text-coal" : "bg-ocean/60 text-foam group-hover:bg-ocean"}
        `}
      >
        {playing ? (
          <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
            <rect x="6" y="4" width="4" height="16" />
            <rect x="14" y="4" width="4" height="16" />
          </svg>
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
        onEnded={() => setPlaying(false)}
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
