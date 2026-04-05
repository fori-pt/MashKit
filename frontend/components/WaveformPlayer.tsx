"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  src: string;
  label: string;
  bpm: number;
  onTimeUpdate?: (t: number) => void;
  audioRef?: React.RefObject<HTMLAudioElement>;
  color?: string;
  progressColor?: string;
  chorousStart?: number;
}

export default function WaveformPlayer({
  src,
  label,
  bpm,
  onTimeUpdate,
  audioRef,
  color = "rgba(165,201,202,0.3)",
  progressColor = "#A5C9CA",
  chorousStart,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    if (!containerRef.current || !src) return;

    let ws: any;
    let active = true;

    (async () => {
      const WaveSurfer = (await import("wavesurfer.js")).default;
      if (!active || !containerRef.current) return;

      ws = WaveSurfer.create({
        container: containerRef.current,
        waveColor: color,
        progressColor,
        height: 64,
        barWidth: 2,
        barGap: 1,
        barRadius: 2,
        cursorColor: "rgba(165,201,202,0.8)",
        cursorWidth: 1,
        interact: true,
        // Don't pass `media` here — we keep our own <audio> for playback
        // and sync WaveSurfer's visual cursor from timeupdate events below
      });

      wsRef.current = ws;

      ws.on("ready", () => {
        if (!active) return;
        setReady(true);
        setDuration(ws.getDuration());
      });

      // Suppress WaveSurfer's own audio output — we handle playback externally
      ws.on("interaction", (newTime: number) => {
        // When user clicks the waveform, seek the real audio element too
        if (audioRef?.current) {
          audioRef.current.currentTime = newTime;
        }
      });

      // Ignore WaveSurfer-internal errors (e.g. cross-origin decode)
      ws.on("error", () => {});

      if (!active) {
        ws.destroy();
        return;
      }

      try {
        await ws.load(src);
      } catch (e: any) {
        // AbortError is expected when the component unmounts mid-load — ignore it
        if (e?.name !== "AbortError") {
          console.warn("WaveSurfer load error:", e);
        }
      }
    })();

    // Sync waveform cursor from the real audio element
    const syncCursor = () => {
      const el = audioRef?.current;
      if (!el || !ws || !ws.getDuration()) return;
      const t = el.currentTime;
      setCurrentTime(t);
      onTimeUpdate?.(t);
      try {
        ws.seekTo(t / ws.getDuration());
      } catch {}
    };

    const el = audioRef?.current;
    el?.addEventListener("timeupdate", syncCursor);

    return () => {
      active = false;
      el?.removeEventListener("timeupdate", syncCursor);
      // Delay destroy slightly so any in-flight load can settle first
      setTimeout(() => {
        try { ws?.destroy(); } catch {}
        if (wsRef.current === ws) wsRef.current = null;
      }, 0);
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  const fmtTime = (t: number) => {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const snapToChorus = () => {
    const el = audioRef?.current;
    if (el && chorousStart !== undefined) {
      el.currentTime = chorousStart;
    }
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-mist/50">
        <span>{label}</span>
        <div className="flex items-center gap-3">
          {chorousStart !== undefined && ready && (
            <button
              onClick={snapToChorus}
              className="rounded px-2 py-0.5 text-[10px] font-semibold border border-mist/30 text-mist hover:bg-mist/10 transition-colors"
              title={`Jump to chorus at ${fmtTime(chorousStart)}`}
            >
              ▶ Start at Chorus
            </button>
          )}
          <span className="font-mono">
            {fmtTime(currentTime)} / {fmtTime(duration)}
          </span>
        </div>
      </div>
      <div
        ref={containerRef}
        className={`overflow-hidden rounded-lg bg-ocean/20 transition-opacity ${
          ready ? "opacity-100" : "opacity-40"
        }`}
        style={{ minHeight: 64 }}
      />
      {!ready && (
        <p className="text-center text-[10px] text-mist/30 animate-pulse">
          Loading waveform…
        </p>
      )}
    </div>
  );
}
