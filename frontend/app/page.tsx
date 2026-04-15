"use client";

import MashupPlayer from "@/components/MashupPlayer";

export interface AnalysisData {
  bpm: number;
  key: string;
  key_num: number;
  mode: number;
  camelot: string;
  energy: number;
  duration: number;
  beats: number;
  first_beat: number;
  filename: string;
}

export interface Track {
  filename: string;
  artist: string;
  title: string;
  bpm: number;
  key: string;
  key_num: number;
  mode: number;
  camelot: string;
  energy: number;
  duration: number;
  bpm_diff: number;
  key_distance: number;
  score: number;
  audio_url: string;
}

export default function Home() {
  return (
    <main className="min-h-screen">
      <header className="border-b border-ocean/40 px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-ocean to-mist font-bold text-coal">
            M
          </div>
          <h1 className="text-xl font-bold tracking-tight text-foam">MashKit</h1>
          <span className="ml-auto text-xs text-mist/60">BPM · Key · Match · Mix</span>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-6 py-10">
        <MashupPlayer />
      </div>
    </main>
  );
}
