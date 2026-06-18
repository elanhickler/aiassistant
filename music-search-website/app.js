const defaultConfig = {
  version: 1,
  discord_format: "[`music`:`{label}`](<{url}>)",
  known_song_sites: [
    { id: "spotify", label: "Spotify", url_template: "https://open.spotify.com/search/{query}" },
    { id: "apple_music", label: "Apple Music", url_template: "https://music.apple.com/search?term={query}" },
    { id: "youtube_music", label: "YouTube Music", url_template: "https://music.youtube.com/search?q={query}" },
    { id: "bandcamp", label: "Bandcamp", url_template: "https://bandcamp.com/search?q={query}" },
    { id: "soundcloud", label: "SoundCloud", url_template: "https://soundcloud.com/search?q={query}" },
    { id: "youtube", label: "YouTube", url_template: "https://www.youtube.com/results?search_query={query}" },
  ],
  vibe_sites: [
    { id: "youtube", label: "YouTube", url_template: "https://www.youtube.com/results?search_query={query}" },
  ],
};

const state = {
  config: defaultConfig,
  mode: "auto",
  selectedMarkdown: "",
  audioObjectUrl: "",
  imageObjectUrl: "",
  sandboxUrl: new URLSearchParams(window.location.search).get("sandbox") || "http://127.0.0.1:8766/",
};

const requestInput = document.querySelector("#requestInput");
const artistInput = document.querySelector("#artistInput");
const titleInput = document.querySelector("#titleInput");
const vibeInput = document.querySelector("#vibeInput");
const audioInput = document.querySelector("#audioInput");
const imageInput = document.querySelector("#imageInput");
const audioPlayer = document.querySelector("#audioPlayer");
const audioStatus = document.querySelector("#audioStatus");
const coverFrame = document.querySelector(".cover-frame");
const coverPreview = document.querySelector("#coverPreview");
const results = document.querySelector("#results");
const scopeDisplay = document.querySelector("#asciiscopeDisplay");
const scopeReadout = document.querySelector("#scopeReadout");
const sandboxEngine = document.querySelector("#sandboxSoundEngine");
const sandboxEngineStatus = document.querySelector("#sandboxEngineStatus");
const modeButtons = [...document.querySelectorAll(".mode-button")];
const infoTitle = document.querySelector("#infoTitle");
const infoArtist = document.querySelector("#infoArtist");
const infoVibe = document.querySelector("#infoVibe");
const infoSource = document.querySelector("#infoSource");
const scopeGlyphs = " .:-=+*#%@";
let renderTimer = null;

function setSandboxEngineStatus(text) {
  if (sandboxEngineStatus) {
    sandboxEngineStatus.textContent = text;
  }
}

function sendSandboxButtonEvent(button, name) {
  if (!sandboxEngine?.contentWindow) {
    setSandboxEngineStatus("sandbox unavailable");
    return;
  }
  sandboxEngine.contentWindow.postMessage({
    type: "soemdsp-sandbox-button-event",
    name,
    buttonId: button.id || "",
    label: button.textContent.trim().replace(/\s+/g, " "),
    source: "aiassistant-music-page",
  }, "*");
  setSandboxEngineStatus(`sent ${name}`);
}

function installSandboxButtonEvents(root = document) {
  for (const button of root.querySelectorAll("[data-sandbox-events]")) {
    if (button.dataset.sandboxEventsInstalled === "true") continue;
    button.dataset.sandboxEventsInstalled = "true";
    const events = new Set(String(button.dataset.sandboxEvents || "").split(/\s+/).filter(Boolean));
    if (events.has("click")) {
      button.addEventListener("click", () => sendSandboxButtonEvent(button, "click"));
    }
    if (events.has("hover")) {
      button.addEventListener("pointerenter", () => sendSandboxButtonEvent(button, "hover"));
      button.addEventListener("focus", () => sendSandboxButtonEvent(button, "hover"));
    }
    if (events.has("down")) {
      button.addEventListener("pointerdown", () => sendSandboxButtonEvent(button, "down"));
    }
    if (events.has("up")) {
      button.addEventListener("pointerup", () => sendSandboxButtonEvent(button, "up"));
    }
    if (events.has("enter")) {
      button.addEventListener("pointerenter", () => sendSandboxButtonEvent(button, "enter"));
    }
    if (events.has("leave")) {
      button.addEventListener("pointerleave", () => sendSandboxButtonEvent(button, "leave"));
    }
  }
}

const scope = {
  cols: 82,
  rows: 24,
  frame: 0,
  energy: 0,
  cells: [],
  frameRequest: null,
  audioContext: null,
  analyser: null,
  source: null,
  timeData: null,
};

function fitScopeGrid() {
  if (!scopeDisplay) return;
  const width = Math.max(320, scopeDisplay.clientWidth || 720);
  const height = Math.max(180, scopeDisplay.clientHeight || 300);
  const nextCols = Math.max(42, Math.min(118, Math.floor(width / 8.0)));
  const nextRows = Math.max(14, Math.min(34, Math.floor(height / 11.0)));
  if (nextCols === scope.cols && nextRows === scope.rows && scope.cells.length) return;
  scope.cols = nextCols;
  scope.rows = nextRows;
  scope.cells = Array.from({ length: scope.cols * scope.rows }, () => 0);
}

function putScopeCell(x, y, intensity) {
  if (x < 0 || x >= scope.cols || y < 0 || y >= scope.rows) return;
  const index = y * scope.cols + x;
  scope.cells[index] = Math.max(scope.cells[index], Math.max(0, Math.min(1, intensity)));
}

function drawScopeLine(x1, y1, x2, y2, intensity) {
  const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1), 1);
  for (let step = 0; step <= steps; step += 1) {
    const amount = step / steps;
    const x = Math.round(x1 + (x2 - x1) * amount);
    const y = Math.round(y1 + (y2 - y1) * amount);
    putScopeCell(x, y, intensity * (0.70 + amount * 0.30));
  }
}

function scopeGlyphHtml(value) {
  const glyph = scopeGlyphs[Math.min(scopeGlyphs.length - 1, Math.floor(value * (scopeGlyphs.length - 1)))];
  if (glyph === " ") return " ";
  const tone = value > 0.82
    ? "hot"
    : value > 0.58
      ? "cyan"
      : value > 0.32
        ? "violet"
        : "dim";
  return `<span class="scope-glyph scope-${tone}">${glyph}</span>`;
}

function renderScopeCells() {
  const lines = [];
  for (let y = 0; y < scope.rows; y += 1) {
    let line = "";
    for (let x = 0; x < scope.cols; x += 1) {
      line += scopeGlyphHtml(scope.cells[y * scope.cols + x]);
    }
    lines.push(line);
  }
  scopeDisplay.innerHTML = lines.join("\n");
}

function renderPausedScope() {
  if (!scopeDisplay) return;

  if (scope.frameRequest) {
    cancelAnimationFrame(scope.frameRequest);
    scope.frameRequest = null;
  }

  fitScopeGrid();
  scope.cells = Array.from({ length: scope.cols * scope.rows }, () => 0);

  const rows = Array.from({ length: scope.rows }, () => Array.from({ length: scope.cols }, () => " "));
  const centreY = Math.floor(scope.rows * 0.52);
  const left = Math.floor(scope.cols * 0.16);
  const right = Math.ceil(scope.cols * 0.84);

  for (let x = left; x <= right; x += 1) {
    rows[centreY][x] = x % 6 === 0 ? "." : "-";
  }

  const label = "ASCIISCOPE // NO AUDIO SIGNAL";
  const hint = "load audio and press play to wake the trace";
  const labelX = Math.max(0, Math.floor((scope.cols - label.length) * 0.5));
  const hintX = Math.max(0, Math.floor((scope.cols - hint.length) * 0.5));
  const labelY = Math.max(1, centreY - 2);
  const hintY = Math.min(scope.rows - 2, centreY + 2);

  for (let i = 0; i < label.length && labelX + i < scope.cols; i += 1) {
    rows[labelY][labelX + i] = label[i];
  }
  for (let i = 0; i < hint.length && hintX + i < scope.cols; i += 1) {
    rows[hintY][hintX + i] = hint[i];
  }

  scopeDisplay.innerHTML = rows
    .map((row, y) => {
      if (y === labelY) return `<span class="scope-glyph scope-cyan">${row.join("")}</span>`;
      if (y === hintY) return `<span class="scope-glyph scope-dim">${row.join("")}</span>`;
      return `<span class="scope-glyph scope-dim">${row.join("")}</span>`;
    })
    .join("\n");
  scopeReadout.textContent = "no audio // animation paused // waiting for playback";
}

function ensureAudioAnalyser() {
  if (scope.analyser) return;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    audioStatus.textContent = "Web Audio is not available in this browser.";
    return;
  }

  scope.audioContext = new AudioContextClass();
  scope.analyser = scope.audioContext.createAnalyser();
  scope.analyser.fftSize = 2048;
  scope.analyser.smoothingTimeConstant = 0.72;
  scope.timeData = new Uint8Array(scope.analyser.fftSize);
  scope.source = scope.audioContext.createMediaElementSource(audioPlayer);
  scope.source.connect(scope.analyser);
  scope.analyser.connect(scope.audioContext.destination);
}

async function startScopePlayback() {
  ensureAudioAnalyser();
  if (scope.audioContext?.state === "suspended") {
    await scope.audioContext.resume();
  }
  if (!scope.frameRequest) {
    scope.frameRequest = requestAnimationFrame(renderScopeFrame);
  }
}

function stopScopePlayback() {
  renderPausedScope();
}

function renderScopeFrame() {
  if (!scopeDisplay || !scope.analyser || audioPlayer.paused || audioPlayer.ended) {
    renderPausedScope();
    return;
  }

  fitScopeGrid();
  scope.analyser.getByteTimeDomainData(scope.timeData);
  scope.frame += 1;

  for (let i = 0; i < scope.cells.length; i += 1) {
    scope.cells[i] *= 0.905;
    if (scope.cells[i] < 0.014) scope.cells[i] = 0;
  }

  const cols = scope.cols;
  const rows = scope.rows;
  const mid = Math.floor(rows * 0.50);
  const sampleStride = Math.max(1, Math.floor(scope.timeData.length / cols));
  let previousX = 0;
  let previousY = mid;
  let peak = 0;
  let sum = 0;

  for (let x = 0; x < cols; x += 1) {
    const sample = (scope.timeData[x * sampleStride] - 128) / 128;
    const abs = Math.abs(sample);
    peak = Math.max(peak, abs);
    sum += sample * sample;
    const y = Math.round(mid - sample * rows * 0.44);
    drawScopeLine(previousX, previousY, x, y, 0.72 + abs * 0.28);
    previousX = x;
    previousY = y;

    if (x % 3 === 0) {
      const bar = Math.floor(abs * rows * 0.34);
      for (let by = 0; by < bar; by += 1) {
        putScopeCell(x, rows - 2 - by, 0.18 + by / Math.max(1, bar) * 0.38);
      }
    }
  }

  const rms = Math.sqrt(sum / cols);
  scope.energy += (rms - scope.energy) * 0.16;
  renderScopeCells();
  scopeReadout.textContent = `audio live // rms ${scope.energy.toFixed(2)} // peak ${peak.toFixed(2)} // cpu glyph`;
  scope.frameRequest = requestAnimationFrame(renderScopeFrame);
}

function encodeQuery(value) {
  return encodeURIComponent(value.trim().replace(/\s+/g, " "));
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDiscordLink(label, url) {
  const cleanLabel = label.replaceAll("`", "'").replace(/\s+/g, " ").trim();
  const template = state.config.discord_format || defaultConfig.discord_format;
  return template
    .replace("{label}", cleanLabel)
    .replace("{url}", url);
}

function inferRequest() {
  const request = requestInput.value.trim();
  const artist = artistInput.value.trim();
  const title = titleInput.value.trim();
  const vibe = vibeInput.value.trim();

  if (artist && title) return { mode: "known", artist, title, query: `${artist} ${title}` };
  const dashMatch = request.match(/^(.+?)\s+-\s+(.+)$/);
  if (dashMatch && state.mode !== "vibe") {
    return {
      mode: "known",
      artist: dashMatch[1].trim(),
      title: dashMatch[2].trim(),
      query: `${dashMatch[1].trim()} ${dashMatch[2].trim()}`,
    };
  }

  return { mode: "vibe", artist: "", title: "", query: vibe || request };
}

function urlFromTemplate(template, query) {
  return template.replace("{query}", encodeQuery(query));
}

function configuredSites() {
  const sites = [...state.config.known_song_sites, ...state.config.vibe_sites];
  return [...new Map(sites.map((site) => [site.id, site])).values()];
}

function buildLinks(intent) {
  return configuredSites().map((site) => {
    const label = intent.mode === "known"
      ? `${site.label} - ${intent.artist} - ${intent.title}`
      : `${site.label} - ${intent.query}`;
    const url = urlFromTemplate(site.url_template, intent.query);
    return {
      site,
      label,
      url,
      markdown: formatDiscordLink(label, url),
    };
  });
}

function renderModeButtons() {
  for (const button of modeButtons) {
    const isActive = button.dataset.mode === state.mode;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", isActive ? "true" : "false");
  }
}

function setMode(mode) {
  state.mode = mode;
  renderModeButtons();
  scheduleRenderResults(80);
}

function scheduleRenderResults(delay = 420) {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(renderResults, delay);
}

function renderMusicInfo(intent) {
  infoTitle.textContent = intent.title || "unknown";
  infoArtist.textContent = intent.artist || "unknown";
  infoVibe.textContent = vibeInput.value.trim() || requestInput.value.trim() || "waiting for description";
  infoSource.textContent = audioPlayer.src ? "local audio file" : "none";
}

function renderResults() {
  const inferred = inferRequest();
  const intent = state.mode === "known"
    ? { ...inferred, mode: "known" }
    : state.mode === "vibe"
      ? { ...inferred, mode: "vibe" }
      : inferred;
  const links = intent.query ? buildLinks(intent) : [];
  state.selectedMarkdown = links.map((link) => link.markdown).join("\n");
  renderMusicInfo(intent);

  results.innerHTML = "";
  if (!links.length) {
    results.innerHTML = `<div class="result"><strong>no links yet</strong><span>Enter a description, artist/title, or vibe.</span></div>`;
    return;
  }

  for (const link of links) {
    const card = document.createElement("article");
    card.className = "result";
    card.innerHTML = `
      <strong>${escapeHtml(link.label)}</strong>
      <a class="result-url" href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(link.url)}</a>
      <code>${escapeHtml(link.markdown)}</code>
      <div class="result-actions">
        <button type="button" data-copy="markdown" data-sandbox-events="click down up enter leave">copy post</button>
        <button type="button" data-copy="url" data-sandbox-events="click down up enter leave">copy url</button>
      </div>
    `;
    card.querySelector('[data-copy="markdown"]').addEventListener("click", () => copyText(link.markdown));
    card.querySelector('[data-copy="url"]').addEventListener("click", () => copyText(link.url));
    installSandboxButtonEvents(card);
    results.append(card);
  }
}

function loadAudioFile(file) {
  if (!file) return;
  if (state.audioObjectUrl) URL.revokeObjectURL(state.audioObjectUrl);
  state.audioObjectUrl = URL.createObjectURL(file);
  audioPlayer.src = state.audioObjectUrl;
  audioStatus.textContent = file.name;
  infoSource.textContent = file.name;

  const name = file.name.replace(/\.[^.]+$/, "");
  const dashMatch = name.match(/^(.+?)\s+-\s+(.+)$/);
  if (dashMatch && !artistInput.value.trim() && !titleInput.value.trim()) {
    artistInput.value = dashMatch[1].trim();
    titleInput.value = dashMatch[2].trim();
  }
  renderResults();
}

function loadImageFile(file) {
  if (!file) return;
  if (state.imageObjectUrl) URL.revokeObjectURL(state.imageObjectUrl);
  state.imageObjectUrl = URL.createObjectURL(file);
  coverPreview.src = state.imageObjectUrl;
  coverFrame.classList.add("has-image");
}

async function copyText(text) {
  if (!text) return;
  await navigator.clipboard.writeText(text);
}

async function loadConfig() {
  try {
    const response = await fetch("music-sites.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.config = await response.json();
  } catch {
    state.config = defaultConfig;
  }
}

for (const button of modeButtons) {
  button.addEventListener("click", () => setMode(button.dataset.mode));
}

for (const input of [requestInput, artistInput, titleInput, vibeInput]) {
  input.addEventListener("input", () => scheduleRenderResults());
}

audioInput.addEventListener("change", () => loadAudioFile(audioInput.files?.[0]));
imageInput.addEventListener("change", () => loadImageFile(imageInput.files?.[0]));
audioPlayer.addEventListener("play", () => startScopePlayback());
audioPlayer.addEventListener("pause", () => stopScopePlayback());
audioPlayer.addEventListener("ended", () => stopScopePlayback());

document.querySelector("#copySelectedButton").addEventListener("click", () => copyText(state.selectedMarkdown));
document.querySelector("#copyConfigButton").addEventListener("click", () => {
  copyText(new URL("music-sites.json", window.location.href).href);
});

document.addEventListener("dragover", (event) => {
  event.preventDefault();
});

document.addEventListener("drop", (event) => {
  event.preventDefault();
  const files = [...event.dataTransfer.files];
  const audioFile = files.find((file) => file.type.startsWith("audio/"));
  const imageFile = files.find((file) => file.type.startsWith("image/"));
  loadAudioFile(audioFile);
  loadImageFile(imageFile);
});

loadConfig().then(() => {
  if (sandboxEngine) {
    sandboxEngine.src = state.sandboxUrl;
    sandboxEngine.addEventListener("load", () => setSandboxEngineStatus("sandbox ready"));
  }
  installSandboxButtonEvents();
  renderModeButtons();
  renderResults();
  renderPausedScope();
});
