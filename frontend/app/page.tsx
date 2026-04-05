"use client";

import { useState } from "react";
import AudioUploader from "@/components/AudioUploader";
import AnalysisResults from "@/components/AnalysisResults";
import TrackResults from "@/components/TrackResults";
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

type Phase = "idle" | "analyzing" | "done" | "searching" | "tracks";

const API = "http://localhost:8000";

export default function Home() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [selected, setSelected] = useState<Track | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleUpload = async (f: File) => {
    setFile(f);
    setError(null);
    setSelected(null);
    setTracks([]);
    setPhase("analyzing");

    const fd = new FormData();
    fd.append("file", f);

    try {
      const res = await fetch(`${API}/analyze`, { method: "POST", body: fd });
      if (!res.ok) throw new Error(await res.text());
      setAnalysis(await res.json());
      setPhase("done");
    } catch (e: any) {
      setError(e.message || "Analysis failed");
      setPhase("idle");
    }
  };

  const handleSearch = async () => {
    if (!analysis) return;
    setPhase("searching");
    setError(null);

    const params = new URLSearchParams({
      bpm: String(analysis.bpm),
      key_num: String(analysis.key_num),
      mode: String(analysis.mode),
    });

    try {
      const res = await fetch(`${API}/search?${params}`);
      if (!res.ok) {
        const txt = await res.text();
        if (txt.includes("indexing")) {
          throw new Error(
            "Dataset is still being indexed. Please wait a moment and try again."
          );
        }
        throw new Error(txt);
      }
      const data = await res.json();
      setTracks(data.tracks);
      setPhase("tracks");
    } catch (e: any) {
      setError(e.message || "Search failed");
      setPhase("done");
    }
  };

  return (
    <main className="min-h-screen">
      {/* Header */}
      <header className="border-b border-ocean/40 px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-ocean to-mist font-bold text-coal">
            M
          </div>
          <h1 className="text-xl font-bold tracking-tight text-foam">
            MashKit
          </h1>
          <span className="ml-auto text-xs text-mist/60">
            BPM &middot; Key &middot; Match &middot; Mix
          </span>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-8 px-6 py-10">
        <AudioUploader
          onUpload={handleUpload}
          isAnalyzing={phase === "analyzing"}
        />

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
            {error}
          </div>
        )}

        {analysis && phase !== "analyzing" && (
          <AnalysisResults
            data={analysis}
            onSearch={handleSearch}
            isSearching={phase === "searching"}
            uploadedFile={file}
          />
        )}

        {phase === "tracks" && tracks.length > 0 && (
          <TrackResults
            tracks={tracks}
            sourceBpm={analysis!.bpm}
            selected={selected}
            onSelect={setSelected}
          />
        )}

        {selected && file && analysis && (
          <MashupPlayer
            sourceFile={file}
            sourceBpm={analysis.bpm}
            sourceFirstBeat={analysis.first_beat}
            track={selected}
          />
        )}
      </div>
    </main>
  );
}
