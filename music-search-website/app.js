const state = {
  config: null,
  mode: "auto",
  selectedMarkdown: "",
};

const requestInput = document.querySelector("#requestInput");
const artistInput = document.querySelector("#artistInput");
const titleInput = document.querySelector("#titleInput");
const vibeInput = document.querySelector("#vibeInput");
const siteToggles = document.querySelector("#siteToggles");
const results = document.querySelector("#results");

function encodeQuery(value) {
  return encodeURIComponent(value.trim().replace(/\s+/g, " "));
}

function formatDiscordLink(label, url) {
  const cleanLabel = label.replaceAll("`", "'").replace(/\s+/g, " ").trim();
  return `[\`🎵📽️\`:\`${cleanLabel}\`](<${url}>)`;
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

function enabledSite(site) {
  const input = document.querySelector(`[data-site-id="${site.id}"]`);
  return input?.checked;
}

function urlFromTemplate(template, query) {
  return template.replace("{query}", encodeQuery(query));
}

function buildLinks(intent) {
  const sites = intent.mode === "known" ? state.config.known_song_sites : state.config.vibe_sites;
  return sites
    .filter(enabledSite)
    .map((site) => {
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

function renderToggles() {
  const allSites = [...state.config.known_song_sites, ...state.config.vibe_sites];
  const uniqueSites = [...new Map(allSites.map((site) => [site.id, site])).values()];
  siteToggles.innerHTML = "";

  for (const site of uniqueSites) {
    const row = document.createElement("label");
    row.className = "toggle";
    row.innerHTML = `
      <span>${site.label}</span>
      <input data-site-id="${site.id}" type="checkbox" checked>
    `;
    row.querySelector("input").addEventListener("change", renderResults);
    siteToggles.append(row);
  }
}

function renderResults() {
  const inferred = inferRequest();
  const intent = state.mode === "known"
    ? { ...inferred, mode: "known" }
    : state.mode === "vibe"
      ? { ...inferred, mode: "vibe" }
      : inferred;
  const links = intent.query ? buildLinks(intent) : [];

  results.innerHTML = "";
  state.selectedMarkdown = links[0]?.markdown || "";

  if (!links.length) {
    results.innerHTML = `<div class="result"><strong>no links yet</strong><span>Enter a request, artist/title, or vibe.</span></div>`;
    return;
  }

  for (const link of links) {
    const card = document.createElement("article");
    card.className = "result";
    card.innerHTML = `
      <strong>${link.label}</strong>
      <a href="${link.url}" target="_blank" rel="noreferrer">${link.url}</a>
      <code>${link.markdown}</code>
      <button type="button">copy this</button>
    `;
    card.querySelector("button").addEventListener("click", () => copyText(link.markdown));
    results.append(card);
  }
}

async function copyText(text) {
  if (!text) return;
  await navigator.clipboard.writeText(text);
}

async function loadConfig() {
  const response = await fetch("music-sites.json", { cache: "no-store" });
  if (!response.ok) throw new Error(`Could not load music-sites.json: ${response.status}`);
  state.config = await response.json();
}

document.querySelector("#knownButton").addEventListener("click", () => {
  state.mode = "known";
  renderResults();
});

document.querySelector("#vibeButton").addEventListener("click", () => {
  state.mode = "vibe";
  renderResults();
});

document.querySelector("#autoButton").addEventListener("click", () => {
  state.mode = "auto";
  renderResults();
});

document.querySelector("#copySelectedButton").addEventListener("click", () => copyText(state.selectedMarkdown));

document.querySelector("#copyConfigButton").addEventListener("click", () => {
  copyText(new URL("music-sites.json", window.location.href).href);
});

for (const input of [requestInput, artistInput, titleInput, vibeInput]) {
  input.addEventListener("input", renderResults);
}

loadConfig()
  .then(() => {
    renderToggles();
    renderResults();
  })
  .catch((error) => {
    results.innerHTML = `<div class="result"><strong>error</strong><span>${error.message}</span></div>`;
  });
