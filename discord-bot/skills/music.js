import { readShortMemoryEntries } from "../memory.js";

export function createMusicSkill(context) {
  const {
    bot,
    model,
    openrouterApiKey,
    requiredSetting,
    safeReply,
    shortMemoryPath,
    writeRawOpenRouterText,
  } = context;
  const musicSkillSettings = requiredSetting("music_skill");
  const musicThreadId = String(musicSkillSettings.music_thread_id || "");
  if (!musicThreadId) {
    throw new Error("Missing required music_skill.music_thread_id because the music skill is enabled.");
  }
  const websiteConfigUrl = String(musicSkillSettings.website_config_url || "");
  const youtubeEnabled = Boolean(musicSkillSettings.youtube_enabled);
  const defaultMusicSites = {
    known_song_sites: [
      { id: "spotify", label: "Spotify", enabled_key: "spotify_enabled", url_template: "https://open.spotify.com/search/{query}" },
      { id: "apple_music", label: "Apple Music", enabled_key: "apple_music_enabled", url_template: "https://music.apple.com/search?term={query}" },
      { id: "youtube_music", label: "YouTube Music", enabled_key: "youtube_music_enabled", url_template: "https://music.youtube.com/search?q={query}" },
      { id: "bandcamp", label: "Bandcamp", enabled_key: "bandcamp_enabled", url_template: "https://bandcamp.com/search?q={query}" },
      { id: "soundcloud", label: "SoundCloud", enabled_key: "soundcloud_enabled", url_template: "https://soundcloud.com/search?q={query}" },
    ],
    vibe_sites: [
      { id: "youtube", label: "YouTube", enabled_key: "youtube_enabled", url_template: "https://www.youtube.com/results?search_query={query}" },
    ],
  };
  let musicSitesConfig;

  async function musicSites() {
    if (musicSitesConfig) return musicSitesConfig;
    if (!websiteConfigUrl) {
      musicSitesConfig = defaultMusicSites;
      return musicSitesConfig;
    }

    const response = await fetch(websiteConfigUrl, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`Could not load music website config ${websiteConfigUrl}: HTTP ${response.status}`);
    musicSitesConfig = await response.json();
    return musicSitesConfig;
  }

  function urlFromTemplate(template, query) {
    return template.replace("{query}", encodeURIComponent(query));
  }

  async function readRecentShortMemory(limit = 30) {
    return (await readShortMemoryEntries(shortMemoryPath)).slice(-limit);
  }

  async function inferMusicIntent(sourceText) {
    const text = sourceText || (await recentShortMemoryText());
    if (!text) throw new Error("shortmemory has no recent conversation to infer music from.");
    const messages = [
      {
        role: "system",
        content: [
          "Find the most recent music request or music-related desire in the text.",
          "If the request is for a specific song, return known_song with artist and title when possible.",
          "If the request is only a mood, scene, genre, playlist, mix, or vibe, return vibe with one concise search_query.",
          "Use nearby context to resolve vague phrases like 'that', 'this', 'same vibe', or 'for her'.",
          "Ignore older music topics if a newer one appears.",
          "Return only strict JSON in this shape:",
          "{\"mode\":\"known_song\",\"artist\":\"artist name\",\"title\":\"song title\",\"search_query\":\"artist song title\"}",
          "or:",
          "{\"mode\":\"vibe\",\"artist\":\"\",\"title\":\"\",\"search_query\":\"concise music search query\"}",
        ].join(" "),
      },
      {
        role: "user",
        content: text,
      },
    ];
    await writeRawOpenRouterText?.(messages, "music intent");

    const response = await fetch(`${requiredSetting("openrouter_base_url")}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openrouterApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.2,
        max_tokens: 120,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenRouter error ${response.status}: ${await response.text()}`);
    }

    const payload = await response.json();
    const raw = payload.choices?.[0]?.message?.content?.trim();
    if (!raw) throw new Error("Could not infer a music request from context.");

    const jsonText = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
    const intent = JSON.parse(jsonText);
    const searchQuery = String(intent.search_query || "").trim();
    if (!searchQuery) throw new Error("Could not infer a music search query.");

    return {
      mode: intent.mode === "known_song" ? "known_song" : "vibe",
      artist: String(intent.artist || "").trim(),
      title: String(intent.title || "").trim(),
      searchQuery,
    };
  }

  async function shouldRespondWithMusic(sourceText) {
    const recentText = await recentShortMemoryText();
    const messages = [
      {
        role: "system",
        content: [
          "Decide whether the latest user message is asking the bot to post or find music now.",
          "Return true for direct natural requests like 'music', 'play something', 'find a song', 'queue something up', 'send me a music link', or '@agent music'.",
          "Return true when context makes a short request like 'yes, show me' clearly refer to music.",
          "Return false if the bot merely mentioned music itself, or if the user is only chatting about music without asking for a link/result now.",
          "Return only strict JSON: {\"should_post_music\":true,\"reason\":\"short reason\"}",
        ].join(" "),
      },
      {
        role: "user",
        content: [
          "# Recent Conversation",
          recentText || "(empty)",
          "",
          "# Latest User Message",
          sourceText,
        ].join("\n"),
      },
    ];
    await writeRawOpenRouterText?.(messages, "music natural intent");

    const response = await fetch(`${requiredSetting("openrouter_base_url")}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openrouterApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0,
        max_tokens: 80,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenRouter error ${response.status}: ${await response.text()}`);
    }

    const payload = await response.json();
    const raw = payload.choices?.[0]?.message?.content?.trim();
    if (!raw) return false;
    const jsonText = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
    const decision = JSON.parse(jsonText);
    return Boolean(decision.should_post_music);
  }

  async function recentShortMemoryText() {
    const entries = await readRecentShortMemory();
    const recentText = entries
      .map((entry) => `${entry.role || "unknown"}: ${entry.content || ""}`)
      .filter((line) => line.trim() && !line.includes("/music") && !/\|\|[\s\S]*\bmusic\b[\s\S]*\|\|/i.test(line))
      .join("\n")
      .trim();

    return recentText;
  }

  function musicUrlSite(text) {
    try {
      const url = new URL(text);
      const hostname = url.hostname.toLowerCase();
      if (["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"].includes(hostname)) return "YouTube";
      if (hostname === "music.youtube.com") return "YouTube Music";
      if (hostname === "open.spotify.com") return "Spotify";
      if (hostname === "music.apple.com") return "Apple Music";
      if (hostname.endsWith("bandcamp.com")) return "Bandcamp";
      if (hostname === "soundcloud.com" || hostname.endsWith(".soundcloud.com")) return "SoundCloud";
      return "";
    } catch {
      return "";
    }
  }

  function formatMusicLink(title, url) {
    const cleanTitle = title.replaceAll("`", "'").replace(/\s+/g, " ").trim();
    return `[\`\u{1F3B5}\u{1F4FD}\uFE0F\`:\`${cleanTitle}\`](<${url}>)`;
  }

  function parseMusicLinkInput(input) {
    const match = input.match(/^(.*?)\s*\|\s*(https?:\/\/\S+)$/);
    if (!match) return null;

    const title = match[1].trim();
    const url = match[2].trim();
    if (!title || !musicUrlSite(url)) return null;
    return { title, url };
  }

  async function enabledKnownSongSites() {
    const config = await musicSites();
    return config.known_song_sites
      .filter((site) => Boolean(musicSkillSettings[site.enabled_key]))
      .map((site) => ({
        id: site.id,
        label: site.label,
        urlForQuery: (query) => urlFromTemplate(site.url_template, query),
      }));
  }

  async function chooseKnownSongCandidate(intent) {
    const sites = await enabledKnownSongSites();
    if (sites.length === 0) return null;

    const site = sites[Math.floor(Math.random() * sites.length)];
    const query = intent.artist && intent.title ? `${intent.artist} ${intent.title}` : intent.searchQuery;
    const label = intent.artist && intent.title
      ? `${site.label} - ${intent.artist} - ${intent.title}`
      : `${site.label} - ${intent.searchQuery}`;

    return {
      title: label,
      url: site.urlForQuery(query),
    };
  }

  async function postMusicArchive(formattedMusicLink) {
    const musicThread = await bot.channels.fetch(musicThreadId);
    if (!musicThread?.send) throw new Error(`Could not send to music forum post/thread: ${musicThreadId}`);
    await musicThread.send(formattedMusicLink);
  }

  function findKeyValue(object, targetKey) {
    if (!object || typeof object !== "object") return null;
    if (Object.prototype.hasOwnProperty.call(object, targetKey)) return object[targetKey];

    for (const value of Object.values(object)) {
      const found = findKeyValue(value, targetKey);
      if (found !== null && found !== undefined) return found;
    }

    return null;
  }

  function textFromYouTubeRuns(value) {
    if (!value) return "";
    if (typeof value.simpleText === "string") return value.simpleText;
    if (Array.isArray(value.runs)) return value.runs.map((run) => run.text || "").join("").trim();
    return "";
  }

  function collectVideoRenderers(object, results = []) {
    if (!object || typeof object !== "object") return results;
    if (object.videoRenderer) results.push(object.videoRenderer);

    for (const value of Object.values(object)) {
      if (value && typeof value === "object") collectVideoRenderers(value, results);
    }

    return results;
  }

  function extractInitialYouTubeData(html) {
    const marker = "var ytInitialData = ";
    const start = html.indexOf(marker);
    if (start === -1) throw new Error("YouTube search response did not include result data.");

    const jsonStart = start + marker.length;
    const end = html.indexOf(";</script>", jsonStart);
    if (end === -1) throw new Error("Could not parse YouTube result data.");

    return JSON.parse(html.slice(jsonStart, end));
  }

  async function findYouTubeVideo(searchQuery) {
    if (!youtubeEnabled) throw new Error("YouTube is disabled in music_skill.youtube_enabled.");

    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}`;
    const response = await fetch(searchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    if (!response.ok) {
      throw new Error(`YouTube search failed with HTTP ${response.status}`);
    }

    const initialData = extractInitialYouTubeData(await response.text());
    const videoRenderers = collectVideoRenderers(initialData)
      .filter((video) => video.videoId)
      .slice(0, 4);
    const videoRenderer = videoRenderers[Math.floor(Math.random() * videoRenderers.length)];
    if (!videoRenderer) return null;

    const title = textFromYouTubeRuns(videoRenderer.title) || searchQuery;
    const channel =
      textFromYouTubeRuns(videoRenderer.ownerText) ||
      textFromYouTubeRuns(findKeyValue(videoRenderer, "shortBylineText")) ||
      "YouTube";

    return {
      title: `${channel} - ${title}`,
      url: `https://www.youtube.com/watch?v=${videoRenderer.videoId}`,
    };
  }

  async function runMusicRequest(input = "") {
    const parsedMusicLink = input ? parseMusicLinkInput(input) : null;

    if (parsedMusicLink) {
      const formattedMusicLink = formatMusicLink(parsedMusicLink.title, parsedMusicLink.url);
      await postMusicArchive(formattedMusicLink);
      return formattedMusicLink;
    }

    const inputSite = input ? musicUrlSite(input) : "";
    if (inputSite) {
      const formattedMusicLink = formatMusicLink(`${inputSite} - Music Link`, input);
      await postMusicArchive(formattedMusicLink);
      return formattedMusicLink;
    }

    const intent = await inferMusicIntent(input || "");
    if (intent.mode === "known_song") {
      const candidate = await chooseKnownSongCandidate(intent);
      if (candidate) {
        const formattedMusicLink = formatMusicLink(candidate.title, candidate.url);
        await postMusicArchive(formattedMusicLink);
        return formattedMusicLink;
      }
    }

    if (!youtubeEnabled) {
      throw new Error("This looks like a vibe request, but YouTube discovery is disabled.");
    }

    const video = await findYouTubeVideo(intent.searchQuery);
    if (video) {
      const formattedMusicLink = formatMusicLink(video.title, video.url);
      await postMusicArchive(formattedMusicLink);
      return formattedMusicLink;
    }

    const fallbackUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(intent.searchQuery)}`;
    const formattedMusicLink = formatMusicLink(intent.searchQuery, fallbackUrl);
    await postMusicArchive(formattedMusicLink);
    return formattedMusicLink;
  }

  async function runNaturalMusicRequest(sourceText = "") {
    if (parseMusicLinkInput(sourceText) || musicUrlSite(sourceText)) {
      return runMusicRequest(sourceText);
    }

    return runMusicRequest([
      "# Recent Conversation",
      await recentShortMemoryText() || "(empty)",
      "",
      "# Latest User Message",
      sourceText,
    ].join("\n"));
  }

  async function handlePipeCommand(command, message) {
    if (command?.kind !== "music") return false;

    try {
      await safeReply(message, await runMusicRequest(command.content));
    } catch (error) {
      await safeReply(message, `Error finding music: ${error.message}`);
    }

    return true;
  }

  return {
    name: "music",
    requiredSettings() {
      return ["music_skill.music_thread_id", "music_skill"];
    },
    getContextBlocks() {
      return {
        title: "Music Skill",
        content: "The music skill is available through pipe text, such as ||@agent music|| or ||@agent music: description||, and through a music note reaction on a bot reply. Do not post music links in ordinary replies unless the user asks for music.",
        source: "discord-bot/skills/music.js",
        priority: 10,
        enabled: true,
      };
    },
    handlePipeCommand,
    runMusicRequest,
    runNaturalMusicRequest,
    shouldRespondWithMusic,
    onReady() {
      if (musicThreadId) console.log(`Music forum post/thread: ${musicThreadId}`);
    },
  };
}
