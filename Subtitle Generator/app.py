"""
╔══════════════════════════════════════════════════╗
║   Automatic Subtitle Generator — Flask Backend   ║
║   Windows-compatible version                     ║
╚══════════════════════════════════════════════════╝
"""

import os
import sys
import math
import uuid
import shutil
import logging
import tempfile
import traceback
from pathlib import Path

from flask import (
    Flask, request, jsonify,
    render_template, send_from_directory
)
from werkzeug.utils import secure_filename
from pydub import AudioSegment
import speech_recognition as sr

# ── Logging (must be first so startup messages appear) ───────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
log = logging.getLogger(__name__)

# ── App Configuration ────────────────────────────────────────────────────────

app = Flask(__name__)

BASE_DIR        = Path(__file__).resolve().parent
UPLOAD_FOLDER   = BASE_DIR / "uploads"
SUBTITLE_FOLDER = BASE_DIR / "subtitles"
ALLOWED_EXTS    = {"mp3", "wav", "m4a", "ogg", "flac"}
MAX_CONTENT_MB  = 50
CHUNK_SECS      = 10

app.config["UPLOAD_FOLDER"]      = str(UPLOAD_FOLDER)
app.config["SUBTITLE_FOLDER"]    = str(SUBTITLE_FOLDER)
app.config["MAX_CONTENT_LENGTH"] = MAX_CONTENT_MB * 1024 * 1024

UPLOAD_FOLDER.mkdir(exist_ok=True)
SUBTITLE_FOLDER.mkdir(exist_ok=True)


# ── ffmpeg / ffprobe auto-detection (critical on Windows) ────────────────────

def _find_ffmpeg() -> bool:
    """
    Try to locate ffmpeg automatically.
    Checks PATH first, then common Windows install locations.
    Sets pydub's converter paths if found outside PATH.
    Returns True if found, False otherwise.
    """
    # 1. Already on PATH?
    if shutil.which("ffmpeg"):
        log.info("✔  ffmpeg found on PATH")
        return True

    # 2. Common Windows locations
    candidates = [
        r"C:\ffmpeg\bin\ffmpeg.exe",
        r"C:\Program Files\ffmpeg\bin\ffmpeg.exe",
        r"C:\Program Files (x86)\ffmpeg\bin\ffmpeg.exe",
        os.path.join(os.environ.get("LOCALAPPDATA", ""), "ffmpeg", "bin", "ffmpeg.exe"),
        os.path.join(os.environ.get("USERPROFILE",  ""), "ffmpeg", "bin", "ffmpeg.exe"),
    ]
    for candidate in candidates:
        if Path(candidate).exists():
            ffprobe = candidate.replace("ffmpeg.exe", "ffprobe.exe")
            AudioSegment.converter  = candidate
            AudioSegment.ffprobe    = ffprobe if Path(ffprobe).exists() else candidate
            log.info("✔  ffmpeg found at %s", candidate)
            return True

    log.error(
        "✘  ffmpeg NOT found!\n"
        "   Download from https://www.gyan.dev/ffmpeg/builds/\n"
        "   Extract and add the 'bin' folder to your Windows PATH,\n"
        "   OR place ffmpeg.exe at C:\\ffmpeg\\bin\\ffmpeg.exe"
    )
    return False


FFMPEG_OK = _find_ffmpeg()


# ── Startup diagnostics ───────────────────────────────────────────────────────

log.info("=" * 55)
log.info("  SubtitleAI starting up")
log.info("  Python   : %s", sys.version.split()[0])
log.info("  Base dir : %s", BASE_DIR)
log.info("  Uploads  : %s", UPLOAD_FOLDER)
log.info("  Subtitles: %s", SUBTITLE_FOLDER)
log.info("  ffmpeg   : %s", "OK" if FFMPEG_OK else "MISSING — see error above")
log.info("=" * 55)


# ── Helpers ───────────────────────────────────────────────────────────────────

def allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTS


def ms_to_srt_time(ms: int) -> str:
    ms   = max(0, int(ms))
    secs = ms // 1000
    frac = ms % 1000
    h    = secs // 3600
    m    = (secs % 3600) // 60
    s    = secs % 60
    return f"{h:02d}:{m:02d}:{s:02d},{frac:03d}"


def audio_to_wav(src_path: str, work_dir: str) -> str:
    """
    Convert any supported audio format → 16 kHz mono WAV.
    Uses a caller-supplied work_dir so all temp files stay in one place
    (avoids Windows file-locking issues with the uploads folder).
    """
    if not FFMPEG_OK:
        raise RuntimeError(
            "ffmpeg is not installed or not on PATH. "
            "Download it from https://www.gyan.dev/ffmpeg/builds/ and add "
            "the 'bin' folder to your Windows PATH, then restart the server."
        )

    log.info("Converting audio: %s", src_path)
    audio = AudioSegment.from_file(src_path)
    audio = audio.set_channels(1).set_frame_rate(16_000)

    wav_path = os.path.join(work_dir, "converted.wav")
    audio.export(wav_path, format="wav")
    log.info("Converted WAV: %s  (%.1f s)", wav_path, len(audio) / 1000)
    return wav_path


def generate_srt(chunks_data: list) -> str:
    lines = []
    for item in chunks_data:
        lines.append(str(item["index"]))
        lines.append(
            f'{ms_to_srt_time(item["start_ms"])} --> {ms_to_srt_time(item["end_ms"])}'
        )
        lines.append(item["text"])
        lines.append("")
    return "\n".join(lines)


def transcribe_audio(wav_path: str, work_dir: str,
                     chunk_secs: int = CHUNK_SECS) -> list:
    """
    Splits WAV into chunks and transcribes each via Google Speech Recognition.
    All chunk temp files are written to work_dir (avoids Windows path issues).
    """
    recognizer = sr.Recognizer()
    recognizer.pause_threshold       = 0.8
    recognizer.energy_threshold      = 300   # tune for quiet audio
    recognizer.dynamic_energy_threshold = True

    audio    = AudioSegment.from_wav(wav_path)
    total_ms = len(audio)
    chunk_ms = chunk_secs * 1000
    n_chunks = math.ceil(total_ms / chunk_ms)

    log.info("Transcribing: %.1f s  |  %d chunks  |  %d s each",
             total_ms / 1000, n_chunks, chunk_secs)

    results   = []
    sub_index = 1

    for i in range(n_chunks):
        start_ms = i * chunk_ms
        end_ms   = min(start_ms + chunk_ms, total_ms)
        chunk    = audio[start_ms:end_ms]

        # Write chunk to a safe path inside work_dir
        tmp_path = os.path.join(work_dir, f"chunk_{i:04d}.wav")
        chunk.export(tmp_path, format="wav")

        try:
            with sr.AudioFile(tmp_path) as source:
                # Adjust for ambient noise on the first chunk only
                if i == 0:
                    recognizer.adjust_for_ambient_noise(source, duration=0.5)
                audio_data = recognizer.record(source)

            text = recognizer.recognize_google(audio_data)
            if text.strip():
                results.append({
                    "index":    sub_index,
                    "start_ms": start_ms,
                    "end_ms":   end_ms,
                    "text":     text.strip(),
                })
                sub_index += 1
                log.info("  Chunk %d/%d → \"%s\"", i + 1, n_chunks, text[:70])

        except sr.UnknownValueError:
            log.info("  Chunk %d/%d → (no speech)", i + 1, n_chunks)

        except sr.RequestError as exc:
            # Google API unreachable — give a clear actionable message
            raise RuntimeError(
                "Google Speech Recognition is unavailable. "
                "Please check your internet connection and try again. "
                f"(Detail: {exc})"
            ) from exc

        finally:
            # Windows: close the file handle before deleting
            try:
                Path(tmp_path).unlink(missing_ok=True)
            except PermissionError:
                pass   # file still locked — skip cleanup, OS will handle it

    return results


# ── Routes ────────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/upload", methods=["POST"])
def upload():
    # ── Validate ──────────────────────────────────────────────────────────────
    if "audio" not in request.files:
        return jsonify({"error": "No audio file provided."}), 400

    file = request.files["audio"]
    if not file or file.filename == "":
        return jsonify({"error": "No file selected."}), 400

    if not allowed_file(file.filename):
        ext_list = ", ".join(sorted(ALLOWED_EXTS)).upper()
        return jsonify({"error": f"Unsupported file type. Allowed: {ext_list}"}), 415

    if not FFMPEG_OK:
        return jsonify({
            "error": (
                "ffmpeg is not installed. "
                "Download it from https://www.gyan.dev/ffmpeg/builds/ "
                "and add the 'bin' folder to your Windows PATH, "
                "then restart app.py."
            )
        }), 503

    # ── Save upload ───────────────────────────────────────────────────────────
    original_name = secure_filename(file.filename)
    uid           = uuid.uuid4().hex[:8]
    saved_path    = str(UPLOAD_FOLDER / f"{uid}_{original_name}")
    file.save(saved_path)
    log.info("Saved: %s", saved_path)

    
    work_dir = tempfile.mkdtemp(prefix="subtitleai_")
    log.info("Work dir: %s", work_dir)

    wav_path = None
    try:
        wav_path = audio_to_wav(saved_path, work_dir)
        segments = transcribe_audio(wav_path, work_dir)

        if not segments:
            return jsonify({
                "error": (
                    "No speech was detected in the audio. "
                    "Make sure the file contains clear spoken audio and "
                    "your internet connection is active (Google Speech API is used)."
                )
            }), 422

        srt_content  = generate_srt(segments)
        srt_filename = f"{uid}_{Path(original_name).stem}.srt"
        srt_path     = str(SUBTITLE_FOLDER / srt_filename)

        with open(srt_path, "w", encoding="utf-8") as fh:
            fh.write(srt_content)

        log.info("SRT saved: %s  (%d segments)", srt_path, len(segments))

        return jsonify({
            "success":      True,
            "srt_filename": srt_filename,
            "segments":     segments,
            "srt_content":  srt_content,
        })

    except RuntimeError as exc:
        log.error("Processing error: %s", exc)
        return jsonify({"error": str(exc)}), 503

    except Exception as exc:
        log.error("Unexpected error:\n%s", traceback.format_exc())
        return jsonify({"error": f"Unexpected error: {exc}"}), 500

    finally:
        # Remove original upload
        try:
            Path(saved_path).unlink(missing_ok=True)
        except Exception:
            pass

        # Remove entire work directory
        try:
            shutil.rmtree(work_dir, ignore_errors=True)
        except Exception:
            pass


@app.route("/download/<filename>")
def download(filename: str):
    safe_name = secure_filename(filename)
    return send_from_directory(
        str(SUBTITLE_FOLDER),
        safe_name,
        as_attachment=True,
        download_name=safe_name,
    )


@app.route("/health")
def health():
    return jsonify({
        "status":  "ok",
        "ffmpeg":  FFMPEG_OK,
        "service": "subtitle-generator",
    })



if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)
