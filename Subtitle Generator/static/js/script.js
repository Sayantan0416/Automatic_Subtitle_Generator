/**
 * ══════════════════════════════════════════════════════════
 *  SubtitleAI — Frontend Controller
 *  Handles: drag-drop upload, progress simulation,
 *           subtitle rendering, SRT download
 * ══════════════════════════════════════════════════════════
 */

"use strict";

// ── DOM references ─────────────────────────────────────────────────────────
const dropZone      = document.getElementById("dropZone");
const fileInput     = document.getElementById("fileInput");
const browseBtn     = document.getElementById("browseBtn");
const audioPreview  = document.getElementById("audioPreview");
const audioName     = document.getElementById("audioName");
const audioSize     = document.getElementById("audioSize");
const audioPlayer   = document.getElementById("audioPlayer");
const clearBtn      = document.getElementById("clearBtn");
const generateBtn   = document.getElementById("generateBtn");

const uploadPanel   = document.getElementById("uploadPanel");
const progressPanel = document.getElementById("progressPanel");
const resultsPanel  = document.getElementById("resultsPanel");
const errorToast    = document.getElementById("errorToast");
const errorMsg      = document.getElementById("errorMsg");
const errorClose    = document.getElementById("errorClose");

const progressFill  = document.getElementById("progressFill");
const progressPct   = document.getElementById("progressPct");
const pSteps        = [
  document.getElementById("pstep1"),
  document.getElementById("pstep2"),
  document.getElementById("pstep3"),
  document.getElementById("pstep4"),
];

const statsRow      = document.getElementById("statsRow");
const subtitleList  = document.getElementById("subtitleList");
const srtRaw        = document.getElementById("srtRaw");
const downloadBtn   = document.getElementById("downloadBtn");
const newFileBtn    = document.getElementById("newFileBtn");
const copyBtn       = document.getElementById("copyBtn");

// ── State ──────────────────────────────────────────────────────────────────
let selectedFile    = null;
let currentSrtFile  = null;   // filename returned by server
let progressTimer   = null;

// ── Accepted MIME types + extensions ──────────────────────────────────────
const ALLOWED_TYPES = [
  "audio/mpeg", "audio/mp3",
  "audio/wav",  "audio/x-wav",
  "audio/m4a",  "audio/mp4",
  "audio/ogg",  "audio/flac",
  "audio/x-flac",
];
const ALLOWED_EXTS  = [".mp3", ".wav", ".m4a", ".ogg", ".flac"];

// ── Utility helpers ────────────────────────────────────────────────────────
const formatBytes = (bytes) => {
  if (bytes < 1024)          return bytes + " B";
  if (bytes < 1024 * 1024)   return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(2) + " MB";
};

const isAllowed = (file) => {
  const ext = "." + file.name.split(".").pop().toLowerCase();
  return ALLOWED_TYPES.includes(file.type) || ALLOWED_EXTS.includes(ext);
};

const show  = (el) => el.classList.remove("hidden");
const hide  = (el) => el.classList.add("hidden");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── File selection ─────────────────────────────────────────────────────────
function handleFileSelect(file) {
  if (!isAllowed(file)) {
    showError(
      `Unsupported file type "${file.name}". ` +
      `Please upload: MP3, WAV, M4A, OGG, or FLAC.`
    );
    return;
  }

  selectedFile = file;
  audioName.textContent = file.name;
  audioSize.textContent = formatBytes(file.size);

  // Load audio into player for preview
  const objectURL = URL.createObjectURL(file);
  audioPlayer.src = objectURL;

  show(audioPreview);
  show(generateBtn);
  hide(errorToast);
}

// ── Drag & drop wiring ─────────────────────────────────────────────────────
dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("drag-over");
});

dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("drag-over");
});

dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("drag-over");
  const file = e.dataTransfer.files[0];
  if (file) handleFileSelect(file);
});

dropZone.addEventListener("click", () => fileInput.click());

browseBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  fileInput.click();
});

fileInput.addEventListener("change", () => {
  if (fileInput.files[0]) handleFileSelect(fileInput.files[0]);
});

clearBtn.addEventListener("click", resetUpload);

// ── Progress simulation ────────────────────────────────────────────────────
/**
 * Simulate deterministic progress milestones while the server is working.
 * The actual completion signal comes from the fetch response.
 * Milestones:  0%→25% (upload) → 50% (convert) → 75% (recognise) → 90% (build)
 */
const MILESTONES = [
  { target: 25,  step: 0, label: 0 },
  { target: 50,  step: 1, label: 1 },
  { target: 75,  step: 2, label: 2 },
  { target: 90,  step: 3, label: 3 },
];

function startProgressSimulation() {
  let current = 0;
  let milestone = 0;

  setProgress(0);

  progressTimer = setInterval(() => {
    if (milestone >= MILESTONES.length) return;

    const { target, label } = MILESTONES[milestone];

    if (current < target) {
      // Ease the progress bar towards the next milestone
      current = Math.min(current + 1, target);
      setProgress(current);
    } else {
      activateStep(label);
      milestone++;
    }
  }, 80);  // 80 ms tick → each 25% band takes ~2 s
}

function stopProgressSimulation(toFull = true) {
  clearInterval(progressTimer);
  progressTimer = null;
  if (toFull) setProgress(100);
}

function setProgress(pct) {
  progressFill.style.width = pct + "%";
  progressPct.textContent  = pct + "%";
}

function activateStep(index) {
  pSteps.forEach((el, i) => {
    if (i < index)  { el.classList.add("done");   el.classList.remove("active"); }
    if (i === index) el.classList.add("active");
    if (i > index)  el.classList.remove("active", "done");
  });
}

function resetSteps() {
  pSteps.forEach((el) => el.classList.remove("active", "done"));
}

// ── Generate subtitles ─────────────────────────────────────────────────────
generateBtn.addEventListener("click", generateSubtitles);

async function generateSubtitles() {
  if (!selectedFile) return;

  hide(errorToast);
  hide(uploadPanel);
  show(progressPanel);
  resetSteps();
  startProgressSimulation();

  const formData = new FormData();
  formData.append("audio", selectedFile);

  try {
    const res = await fetch("/upload", {
      method: "POST",
      body: formData,
    });

    const data = await res.json();

    if (!res.ok || data.error) {
      throw new Error(data.error || `Server error ${res.status}`);
    }

    // Mark all steps complete
    pSteps.forEach((el) => {
      el.classList.add("done");
      el.classList.remove("active");
    });
    stopProgressSimulation(true);
    await sleep(600);  // brief pause to let 100% register

    renderResults(data);

  } catch (err) {
    stopProgressSimulation(false);
    hide(progressPanel);
    show(uploadPanel);
    showError(err.message || "An unexpected error occurred.");
  }
}

// ── Render results ─────────────────────────────────────────────────────────
function renderResults(data) {
  hide(progressPanel);
  show(resultsPanel);

  currentSrtFile = data.srt_filename;

  // ── Stats row ──────────────────────────────────────────────────────────
  const totalSecs = data.segments.length > 0
    ? Math.round(data.segments.at(-1).end_ms / 1000)
    : 0;

  statsRow.innerHTML = `
    <div class="stat-chip">
      <span class="s-label">Segments</span>
      <span class="s-value">${data.segments.length}</span>
    </div>
    <div class="stat-chip">
      <span class="s-label">Duration</span>
      <span class="s-value">${formatDuration(totalSecs)}</span>
    </div>
    <div class="stat-chip">
      <span class="s-label">Words</span>
      <span class="s-value">${countWords(data.segments)}</span>
    </div>
    <div class="stat-chip">
      <span class="s-label">File</span>
      <span class="s-value">.srt</span>
    </div>
  `;

  // ── Subtitle list ──────────────────────────────────────────────────────
  subtitleList.innerHTML = "";
  data.segments.forEach((seg, i) => {
    const div = document.createElement("div");
    div.className = "sub-item";
    div.style.animationDelay = `${i * 50}ms`;
    div.innerHTML = `
      <span class="sub-index">${seg.index}</span>
      <div class="sub-body">
        <div class="sub-time">${msToSrtTime(seg.start_ms)} → ${msToSrtTime(seg.end_ms)}</div>
        <div class="sub-text">${escapeHtml(seg.text)}</div>
      </div>
    `;
    subtitleList.appendChild(div);
  });

  // ── Raw SRT ────────────────────────────────────────────────────────────
  srtRaw.textContent = data.srt_content;
}

// ── Download ───────────────────────────────────────────────────────────────
downloadBtn.addEventListener("click", () => {
  if (!currentSrtFile) return;
  const link = document.createElement("a");
  link.href  = `/download/${encodeURIComponent(currentSrtFile)}`;
  link.click();
});

// ── Copy to clipboard ──────────────────────────────────────────────────────
copyBtn.addEventListener("click", async () => {
  const text = srtRaw.textContent;
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    copyBtn.textContent = "Copied!";
    setTimeout(() => (copyBtn.textContent = "Copy"), 2000);
  } catch {
    copyBtn.textContent = "Error";
  }
});

// ── New file ───────────────────────────────────────────────────────────────
newFileBtn.addEventListener("click", resetAll);

function resetAll() {
  hide(resultsPanel);
  resetUpload();
}

function resetUpload() {
  selectedFile   = null;
  currentSrtFile = null;
  fileInput.value = "";
  audioPlayer.src = "";
  hide(audioPreview);
  hide(generateBtn);
  show(uploadPanel);
  hide(errorToast);
}

// ── Error display ──────────────────────────────────────────────────────────
function showError(message) {
  errorMsg.textContent = message;
  show(errorToast);
  errorToast.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

errorClose.addEventListener("click", () => hide(errorToast));

// ── Helpers ────────────────────────────────────────────────────────────────
/**
 * Convert milliseconds to SRT-style timestamp string.
 * e.g. 3723500 → "01:02:03,500"
 */
function msToSrtTime(ms) {
  ms = Math.max(0, Math.round(ms));
  const frac = ms % 1000;
  const secs = Math.floor(ms / 1000);
  const h    = Math.floor(secs / 3600);
  const m    = Math.floor((secs % 3600) / 60);
  const s    = secs % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad3(frac)}`;
}

const pad  = (n) => String(n).padStart(2, "0");
const pad3 = (n) => String(n).padStart(3, "0");

const formatDuration = (secs) => {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return h > 0
    ? `${h}h ${pad(m)}m`
    : `${pad(m)}m ${pad(s)}s`;
};

const countWords = (segments) =>
  segments.reduce((acc, s) => acc + s.text.split(/\s+/).length, 0);

const escapeHtml = (str) =>
  str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// ── Waveform bar indices for staggered CSS animation ──────────────────────
document.querySelectorAll(".bar").forEach((bar, i) => {
  bar.style.setProperty("--i", i);
});
