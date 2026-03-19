"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";

interface Props {
  onUpload: (file: File) => void;
  isAnalyzing: boolean;
}

export default function AudioUploader({ onUpload, isAnalyzing }: Props) {
  const [name, setName] = useState<string | null>(null);

  const onDrop = useCallback(
    (files: File[]) => {
      if (files[0]) {
        setName(files[0].name);
        onUpload(files[0]);
      }
    },
    [onUpload]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "audio/*": [".mp3", ".wav", ".flac", ".aiff", ".m4a", ".ogg"] },
    multiple: false,
    disabled: isAnalyzing,
  });

  return (
    <div
      {...getRootProps()}
      className={`
        cursor-pointer rounded-2xl border-2 border-dashed p-14 text-center
        transition-all duration-300
        ${
          isDragActive
            ? "border-mist bg-mist/10"
            : "border-ocean/40 bg-ocean/5 hover:border-mist/50 hover:bg-ocean/10"
        }
        ${isAnalyzing ? "pointer-events-none opacity-60" : ""}
      `}
    >
      <input {...getInputProps()} />

      {isAnalyzing ? (
        <div className="space-y-4">
          <div className="flex items-end justify-center gap-1">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="w-1.5 rounded-full bg-mist"
                style={{
                  animation: `eq 0.8s ease-in-out ${i * 0.12}s infinite`,
                  height: "8px",
                }}
              />
            ))}
          </div>
          <p className="font-medium text-mist">Analyzing your track...</p>
          <p className="text-sm text-mist/50">
            Detecting BPM, key, and audio features
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="text-4xl">
            <svg
              className="mx-auto h-12 w-12 text-mist/60"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m9 9 10.5-3m0 6.553v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 1 1-.99-3.467l2.31-.66a2.25 2.25 0 0 0 1.632-2.163Zm0 0V4.846a1.5 1.5 0 0 0-1.998-1.416l-6.75 2.25A1.5 1.5 0 0 0 3 7.096v6.654a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 0 0-.99 3.467l2.31-.66A2.25 2.25 0 0 0 3 16.934V7.096"
              />
            </svg>
          </div>
          <p className="text-lg font-medium text-foam">
            {name ? `Uploaded: ${name}` : isDragActive ? "Drop it here!" : "Drop a track to analyze"}
          </p>
          <p className="text-sm text-mist/50">
            MP3, WAV, FLAC, AIFF, M4A, OGG
          </p>
          {!name && (
            <button
              type="button"
              className="mt-1 rounded-lg bg-ocean px-5 py-2 text-sm font-medium text-foam transition-colors hover:bg-mist/30"
            >
              Browse files
            </button>
          )}
        </div>
      )}
    </div>
  );
}
