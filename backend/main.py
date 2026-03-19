from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
import librosa
import numpy as np
import threading
import tempfile
import json
import re
import os

DATASET_DIR = r"C:\Users\Asus\Documents\FEUP\Musica Interativa\mashup_dataset-20260318T213329Z-3-001\mashup_dataset"
CACHE_PATH = os.path.join(os.path.dirname(DATASET_DIR), "analysis_cache.json")

KEY_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

MAJOR_PROFILE = np.array(
    [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
)
MINOR_PROFILE = np.array(
    [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]
)

CAMELOT = {
    (0, 1): "8B",  (1, 1): "3B",  (2, 1): "10B", (3, 1): "5B",
    (4, 1): "12B", (5, 1): "7B",  (6, 1): "2B",  (7, 1): "9B",
    (8, 1): "4B",  (9, 1): "11B", (10, 1): "6B", (11, 1): "1B",
    (0, 0): "5A",  (1, 0): "12A", (2, 0): "7A",  (3, 0): "2A",
    (4, 0): "9A",  (5, 0): "4A",  (6, 0): "11A", (7, 0): "6A",
    (8, 0): "1A",  (9, 0): "8A",  (10, 0): "3A", (11, 0): "10A",
}

# ---------- audio analysis helpers ----------

def detect_key(y: np.ndarray, sr: int) -> tuple:
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
    chroma_vals = np.mean(chroma, axis=1)
    major_corrs = [
        np.corrcoef(np.roll(MAJOR_PROFILE, i), chroma_vals)[0, 1] for i in range(12)
    ]
    minor_corrs = [
        np.corrcoef(np.roll(MINOR_PROFILE, i), chroma_vals)[0, 1] for i in range(12)
    ]
    best_maj = int(np.argmax(major_corrs))
    best_min = int(np.argmax(minor_corrs))
    if major_corrs[best_maj] >= minor_corrs[best_min]:
        return KEY_NAMES[best_maj], best_maj, 1
    return KEY_NAMES[best_min], best_min, 0


def analyze_file(filepath: str) -> dict:
    y, sr = librosa.load(filepath, sr=None, mono=True)
    tempo, beats = librosa.beat.beat_track(y=y, sr=sr)
    bpm = float(np.atleast_1d(tempo)[0])
    key_name, key_num, mode = detect_key(y, sr)
    camelot = CAMELOT.get((key_num, mode), "N/A")
    rms = librosa.feature.rms(y=y)
    energy = float(np.mean(rms))
    duration = float(librosa.get_duration(y=y, sr=sr))
    return {
        "bpm": round(bpm, 1),
        "key": f"{key_name} {'Major' if mode else 'minor'}",
        "key_num": key_num,
        "mode": mode,
        "camelot": camelot,
        "energy": round(min(energy * 1000, 100), 1),
        "duration": round(duration, 2),
        "beats": len(beats),
    }


def parse_track_name(filename: str) -> tuple[str, str]:
    name = re.sub(r"_30s\.wav$", "", filename)
    if "." in name and not name[0].isdigit():
        artist_raw, title_raw = name.split(".", 1)
        artist = re.sub(r"(?<=[a-z])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])", " ", artist_raw)
        title = re.sub(r"(?<=[a-z])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])", " ", title_raw)
        return artist.strip(), title.strip()
    name = re.sub(r"^\d+_", "", name)
    title = name.replace("_", " ").title()
    return "Unknown", title.strip()


# ---------- dataset indexing ----------

dataset_tracks: list[dict] = []
index_status = {"ready": False, "progress": 0, "total": 0, "current": ""}


def build_index():
    global dataset_tracks
    if os.path.exists(CACHE_PATH):
        with open(CACHE_PATH, encoding="utf-8") as f:
            dataset_tracks = json.load(f)
        cached = {t["filename"] for t in dataset_tracks}
        all_files = {f for f in os.listdir(DATASET_DIR) if f.endswith(".wav")}
        if all_files <= cached:
            index_status["ready"] = True
            index_status["progress"] = len(dataset_tracks)
            index_status["total"] = len(dataset_tracks)
            print(f"Loaded cache with {len(dataset_tracks)} tracks")
            return

    files = sorted(f for f in os.listdir(DATASET_DIR) if f.endswith(".wav"))
    index_status["total"] = len(files)
    dataset_tracks = []

    for i, fname in enumerate(files):
        index_status["progress"] = i
        index_status["current"] = fname
        artist, title = parse_track_name(fname)
        try:
            info = analyze_file(os.path.join(DATASET_DIR, fname))
            dataset_tracks.append({"filename": fname, "artist": artist, "title": title, **info})
            print(f"  [{i+1}/{len(files)}] {artist} - {title}: {info['bpm']} BPM, {info['key']}")
        except Exception as e:
            print(f"  [{i+1}/{len(files)}] FAILED {fname}: {e}")

    with open(CACHE_PATH, "w", encoding="utf-8") as f:
        json.dump(dataset_tracks, f, indent=2)

    index_status["progress"] = len(files)
    index_status["ready"] = True
    print(f"Dataset indexed: {len(dataset_tracks)} tracks cached")


# ---------- key compatibility ----------

def key_distance(k1: int, m1: int, k2: int, m2: int) -> int:
    """Camelot-wheel distance (0 = perfect, lower = more compatible)."""
    c1 = CAMELOT.get((k1, m1), "")
    c2 = CAMELOT.get((k2, m2), "")
    if not c1 or not c2:
        return 99
    num1, letter1 = int(c1[:-1]), c1[-1]
    num2, letter2 = int(c2[:-1]), c2[-1]
    num_dist = min(abs(num1 - num2), 12 - abs(num1 - num2))
    mode_dist = 0 if letter1 == letter2 else 1
    return num_dist + mode_dist


# ---------- app ----------

@asynccontextmanager
async def lifespan(app):
    thread = threading.Thread(target=build_index, daemon=True)
    thread.start()
    yield

app = FastAPI(title="MashKit API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/audio", StaticFiles(directory=DATASET_DIR), name="audio")


@app.get("/dataset/status")
async def dataset_status():
    return index_status


@app.get("/dataset/tracks")
async def all_tracks():
    if not index_status["ready"]:
        raise HTTPException(status_code=503, detail="Dataset still indexing")
    return {"tracks": dataset_tracks}


@app.post("/analyze")
async def analyze(file: UploadFile = File(...)):
    ext = os.path.splitext(file.filename or ".mp3")[1] or ".mp3"
    with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name
    try:
        info = analyze_file(tmp_path)
        return {**info, "filename": file.filename}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        os.unlink(tmp_path)


@app.get("/search")
async def search_tracks(bpm: float, key_num: int, mode: int):
    if not index_status["ready"]:
        raise HTTPException(status_code=503, detail="Dataset still indexing, please wait")

    results = []
    for t in dataset_tracks:
        bpm_diff = abs(t["bpm"] - bpm)
        # also check half / double tempo
        half_diff = abs(t["bpm"] - bpm / 2)
        double_diff = abs(t["bpm"] - bpm * 2)
        best_bpm_diff = min(bpm_diff, half_diff, double_diff)

        kd = key_distance(key_num, mode, t["key_num"], t["mode"])

        # score: lower = better match (weighted BPM + key)
        score = best_bpm_diff * 1.0 + kd * 8.0

        results.append({
            **t,
            "bpm_diff": round(best_bpm_diff, 1),
            "key_distance": kd,
            "score": round(score, 1),
            "audio_url": f"http://localhost:8000/audio/{t['filename']}",
        })

    results.sort(key=lambda x: x["score"])
    return {"tracks": results}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
