# MashKit

A web-based DJ mixing and mashup app. Drop tracks into Deck A and Deck B, auto-detect BPM and key, search your local dataset for compatible matches, and mix live with crossfader, effects, loop deck, and sample pads.

---

## Requirements

- **Python 3.10+** (tested on 3.12)
- **Node.js 18+** and **npm**
- A folder of `.wav` audio files to use as the searchable dataset

---

## One-time Setup

### 1. Backend

Open a terminal and run:

```bash
cd "c:\Users\Dani\Music\interactive music\MashKit\backend"

# Create and activate a virtual environment
python -m venv .venv
.venv\Scripts\activate

# Install Python dependencies
pip install -r requirements.txt
```

### 2. Frontend

Open a second terminal and run:

```bash
cd "c:\Users\Dani\Music\interactive music\MashKit\frontend"

# Install Node dependencies
npm install
```

### 3. Dataset folder

The backend expects audio files at:

```
C:\Users\Dani\Music\interactive music\mashup_dataset\
```

Drop `.wav` files into that folder. They will be automatically analyzed (BPM, key, energy) on the next backend start. Results are cached in `analysis_cache.json` so only new files are re-analyzed each time.

---

## Starting the App

You need **two terminals running at the same time**.

### Terminal 1 — Backend

```bash
cd "c:\Users\Dani\Music\interactive music\MashKit\backend"
.venv\Scripts\activate
python main.py
```

The backend starts on `http://localhost:8000`.  
On first run it analyzes all files in the dataset folder — this can take a few minutes depending on how many tracks you have. Progress is printed to the terminal. Subsequent starts are instant (cache is loaded).

### Terminal 2 — Frontend

```bash
cd "c:\Users\Dani\Music\interactive music\MashKit\frontend"
npm run dev
```

Then open your browser at:

```
http://localhost:3000
```

---

## Using the App

### Decks

- **Deck A** — Drop or click to upload your own track. The app analyzes it for BPM and key.
- **Deck B** — Drop your own file, or click **Search Dataset for Match** to find a compatible track from your library. Results are ranked by key and BPM compatibility.

### Mixer Controls

| Control | Description |
|---|---|
| **Crossfader** | Blend between Deck A (left) and Deck B (right) |
| **BPM Sync** | Automatically matches Deck B playback speed to Deck A's BPM |
| **Smart Align** | Snaps both decks to their detected beat 1 |
| **4-Beat / 8-Beat Fade** | Auto-transitions the crossfader over the selected number of beats |
| **Vibe** | Normal / Sped Up (×1.2) / Slowed + Reverb (×0.85) |
| **Record Mix** | Records both decks to a `.webm` file and downloads it when you stop |

### Loop Deck

- Choose from 5 built-in synthesized drum loops (House, Trap, Lo-Fi, DnB, Acoustic)
- Click **Connect Folder** to load your own loops from a local folder — subfolders are scanned automatically
- User loops are analyzed for BPM in the background and tempo-matched to Deck A
- Deck B has an **Auto-Loop** button that loops an 8-bar region of the track

### Sample Pads

- 8 one-shot pads with synthesized sounds, triggered by keys **1–8**
- Hover a pad and click the edit icon to rename it or upload a custom audio file
- Files longer than **5 seconds** open a trim modal — drag the window to select the exact 5-second clip you want

---

## Adding New Tracks to the Dataset

1. Copy `.wav` files into `C:\Users\Dani\Music\interactive music\mashup_dataset\`
2. Restart the backend (`Ctrl+C` then `python main.py`)
3. Only the new files will be analyzed — existing cached tracks are untouched

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Backend says "Dataset still indexing" | Wait for the terminal to finish printing track names, then try again |
| No sound on Deck B | Make sure BPM Sync is not causing an extreme playback rate (check the rate shown on Deck B) |
| Loop folder picker not working | Use Chrome or Edge — Firefox does not support the File System Access API |
| Frontend shows blank page | Make sure the backend is running on port 8000 before opening the browser |
| `pip install` fails on librosa | Install Microsoft C++ Build Tools or use a pre-built wheel: `pip install librosa --prefer-binary` |
