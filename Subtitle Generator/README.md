# ◈ SubtitleAI — Automatic Subtitle Generator

> **Convert any audio file into a perfectly timestamped `.srt` subtitle file — right in your browser.**

![Python](https://img.shields.io/badge/Python-3.9%2B-blue?logo=python&logoColor=white)
![Flask](https://img.shields.io/badge/Flask-3.0-black?logo=flask)
![License](https://img.shields.io/badge/license-MIT-green)
![Status](https://img.shields.io/badge/status-Beta-orange)

---

## ✨ Features

| Feature | Details |
|---|---|
| 🎙️ Speech Recognition | Google Speech Recognition via `SpeechRecognition` |
| ⏱️ Auto Timestamps | Precise `HH:MM:SS,mmm → HH:MM:SS,mmm` SRT format |
| 🎵 Audio Formats | MP3 · WAV · M4A · OGG · FLAC |
| 🖱️ Drag & Drop | Modern glassmorphism UI with waveform preview |
| 📥 SRT Export | One-click download of the generated subtitle file |
| 📋 Preview | In-page subtitle viewer with raw SRT display |
| 🔒 Privacy | Uploaded files are deleted after processing |
| 📱 Responsive | Works on desktop, tablet, and mobile |

---

## 🖼️ Screenshots

```
┌──────────────────────────────────────┐
│  ◈ SubtitleAI          [Generator]  │
│                                      │
│   Turn Audio Into                    │
│   Subtitles.                         │
│                                      │
│  ┌────────────────────────────────┐  │
│  │  01  Drop Your Audio           │  │
│  │  ┌──────────────────────────┐  │  │
│  │  │  ↑  Drag & drop here     │  │  │
│  │  │  MP3  WAV  M4A  OGG     │  │  │
│  │  └──────────────────────────┘  │  │
│  └────────────────────────────────┘  │
└──────────────────────────────────────┘
```

---

## 🗂️ Project Structure

```
subtitle-generator/
│
├── app.py                  # Flask backend — upload, transcribe, SRT generation
├── requirements.txt        # Python dependencies
├── README.md               # This file
│
├── uploads/                # Temporary audio uploads (auto-cleaned)
├── subtitles/              # Generated .srt files
│
├── templates/
│   └── index.html          # Main dashboard (Jinja2 template)
│
└── static/
    ├── css/
    │   └── style.css       # Dark glassmorphism UI styles
    └── js/
        └── script.js       # Drag-drop, fetch API, progress, rendering
```

---

## ⚡ Quick Start

### 1 — Prerequisites

- Python **3.9+**
- `ffmpeg` installed and on your PATH (required by pydub)

```bash
# macOS
brew install ffmpeg

# Ubuntu / Debian
sudo apt install ffmpeg

# Windows — download from https://ffmpeg.org/download.html
# and add to PATH
```

### 2 — Clone & set up

```bash
git clone https://github.com/your-username/subtitle-generator.git
cd subtitle-generator
```

### 3 — Create virtual environment

```bash
# macOS / Linux
python3 -m venv venv
source venv/bin/activate

# Windows (PowerShell)
python -m venv venv
.\venv\Scripts\Activate.ps1
```

### 4 — Install dependencies

```bash
pip install -r requirements.txt
```

### 5 — Run the server

```bash
python app.py
```

Open [http://localhost:5000](http://localhost:5000) in your browser.

---

## 🧑‍💻 VS Code Setup

1. Open the project folder: `File → Open Folder → subtitle-generator/`
2. Select the Python interpreter: `Ctrl+Shift+P → Python: Select Interpreter → venv`
3. Open the terminal: `` Ctrl+` ``
4. Run:
   ```bash
   source venv/bin/activate   # or .\venv\Scripts\Activate.ps1 on Windows
   python app.py
   ```
5. Click the link in the terminal or open `http://127.0.0.1:5000`

**Recommended extensions:** Python, Pylance, Flask Snippets

---

## 📦 requirements.txt

```
Flask==3.0.3
SpeechRecognition==3.10.4
pydub==0.25.1
Werkzeug==3.0.3
requests==2.32.3
```

---

## 🔌 API Reference

### `POST /upload`

Upload an audio file and receive subtitle data.

**Request:** `multipart/form-data`

| Field | Type | Description |
|---|---|---|
| `audio` | File | Audio file (mp3/wav/m4a/ogg/flac, max 50 MB) |

**Response (200):**

```json
{
  "success": true,
  "srt_filename": "abc123_mypodcast.srt",
  "segments": [
    { "index": 1, "start_ms": 0, "end_ms": 10000, "text": "Hello world" }
  ],
  "srt_content": "1\n00:00:00,000 --> 00:00:10,000\nHello world\n\n"
}
```

**Error (4xx / 5xx):**

```json
{ "error": "Human-readable error message" }
```

---

### `GET /download/<filename>`

Stream the generated `.srt` file as a download.

---

### `GET /health`

Health check endpoint.

```json
{ "status": "ok", "service": "subtitle-generator" }
```

---

## ⚙️ Configuration

Edit `app.py` to change these constants:

| Constant | Default | Description |
|---|---|---|
| `MAX_CONTENT_MB` | `50` | Max upload size in megabytes |
| `CHUNK_SECS` | `10` | Audio chunk size for recognition |
| `ALLOWED_EXTS` | `{mp3,wav,m4a,ogg,flac}` | Allowed file types |

---

## 🚀 Upgrade Path — SaaS Version

| Upgrade | Tool |
|---|---|
| **Better accuracy** | OpenAI Whisper (`openai-whisper`) — local, offline, far more accurate |
| **Language detection** | Whisper auto-detects 99 languages |
| **Speaker diarization** | `pyannote.audio` — separate speakers |
| **User accounts** | Flask-Login + SQLAlchemy |
| **Job queue** | Celery + Redis — async processing |
| **Cloud storage** | AWS S3 / Cloudflare R2 for file persistence |
| **Payments** | Stripe API — credit-based pricing |
| **VTT export** | Convert SRT → WebVTT in-app |
| **Subtitle editor** | In-browser editor (React / Quill) |
| **Docker deploy** | `Dockerfile` + `docker-compose.yml` |
| **CI/CD** | GitHub Actions — lint, test, deploy |

---

## 🏗️ How It Works

```
User uploads audio
        │
        ▼
   pydub converts to 16 kHz mono WAV
        │
        ▼
   Audio split into N × 10-second chunks
        │
        ▼
   SpeechRecognition → Google Speech API
        │
        ▼
   Segments assembled with timestamps
        │
        ▼
   SRT file written to /subtitles/
        │
        ▼
   JSON returned → frontend renders preview
        │
        ▼
   User downloads .srt file
```

---

## 📄 License

MIT © 2024 — free to use, modify, and distribute.

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/whisper-backend`
3. Commit: `git commit -m "feat: add Whisper transcription engine"`
4. Push: `git push origin feature/whisper-backend`
5. Open a Pull Request

---

*Built with ❤️ using Flask, SpeechRecognition, pydub, and a lot of CSS variables.*
