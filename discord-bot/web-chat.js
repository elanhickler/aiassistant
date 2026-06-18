import { createServer } from "node:http";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildOpenRouterMessages } from "./context.js";

const runtimeFolder = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(runtimeFolder, "..");
const globalSettingsPath = path.join(repoRoot, "settings.jsonc");
const globalPersonaPath = path.join(repoRoot, "global-persona.md");
const webChatRoot = path.join(repoRoot, "web-chat");
const musicPageRoot = path.join(repoRoot, "music-search-website");

function stripJsonComments(text) {
  return String(text || "").replace(/^\s*\/\/.*$/gm, "");
}

async function readTextFile(filePath, { required = true } = {}) {
  try {
    return (await readFile(filePath, "utf8")).trim();
  } catch (error) {
    if (error.code === "ENOENT" && !required) return "";
    if (error.code === "ENOENT") throw new Error(`Missing required file: ${filePath}`);
    throw error;
  }
}

async function loadJsonc(filePath) {
  return JSON.parse(stripJsonComments(await readTextFile(filePath)));
}

function mergeSettings(globalSettings, agentSettings) {
  const merged = { ...globalSettings };
  for (const [key, value] of Object.entries(agentSettings || {})) {
    const existingValue = merged[key];
    if (
      value &&
      existingValue &&
      typeof value === "object" &&
      typeof existingValue === "object" &&
      !Array.isArray(value) &&
      !Array.isArray(existingValue)
    ) {
      merged[key] = mergeSettings(existingValue, value);
    } else {
      merged[key] = value;
    }
  }
  return merged;
}

function formatGlobalPersonaDefaults(globalPrompt) {
  const trimmed = String(globalPrompt || "").trim();
  if (!trimmed) return "";
  return [
    "# Global Persona Defaults",
    "These instructions apply to every model generation for this agent, including replies, thoughts, dreams, journals, dream journals, stories, memory updates, status updates, utility decisions, and text transformation.",
    "",
    trimmed,
  ].join("\n");
}

function jsonResponse(response, statusCode, body) {
  const text = JSON.stringify(body);
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(text);
}

function textResponse(response, statusCode, text, contentType = "text/plain; charset=utf-8") {
  response.writeHead(statusCode, {
    "content-type": contentType,
    "cache-control": "no-store",
  });
  response.end(text);
}

function redirectResponse(response, location) {
  response.writeHead(302, {
    location,
    "cache-control": "no-store",
  });
  response.end();
}

function contentTypeForPath(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".html") return "text/html; charset=utf-8";
  if (extension === ".css") return "text/css; charset=utf-8";
  if (extension === ".js") return "text/javascript; charset=utf-8";
  if (extension === ".json") return "application/json; charset=utf-8";
  return "application/octet-stream";
}

async function serveFile(response, filePath) {
  const body = await readFile(filePath);
  response.writeHead(200, {
    "content-type": contentTypeForPath(filePath),
    "cache-control": "no-store",
  });
  response.end(body);
}

async function readRequestJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text.trim()) return {};
  return JSON.parse(text);
}

function safeVisitorId(rawId) {
  const cleaned = String(rawId || "anonymous")
    .trim()
    .replace(/[^a-z0-9_-]/gi, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
  return cleaned || "anonymous";
}

function openRouterProviderOptions(settings) {
  const ignore = (settings.openrouter_provider_routing?.ignore || [])
    .map((providerName) => String(providerName).trim())
    .filter(Boolean);
  if (ignore.length === 0) return undefined;
  return { ignore };
}

function trimReply(text, limit) {
  const reply = String(text || "").trim();
  if (!Number.isFinite(limit) || limit < 1 || reply.length <= limit) return reply;
  return `${reply.slice(0, Math.max(0, limit - 20)).trimEnd()}\n\n[reply truncated]`;
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function ensureVisitorMemory(agentName, visitorId) {
  const folder = path.join(webChatRoot, "visitors", agentName, visitorId);
  await mkdir(folder, { recursive: true });
  const filePath = path.join(folder, "shortmemory.jsonl");
  await writeFile(filePath, "", { flag: "a" });
  return filePath;
}

async function appendVisitorMemory(shortMemoryPath, entry) {
  await appendFile(shortMemoryPath, `${JSON.stringify({
    timestamp: new Date().toISOString(),
    source: "web_chat",
    ...entry,
  })}\n`);
}

async function createAgentRuntime(agentName, globalSettings) {
  const agentFolder = path.join(repoRoot, "agents", agentName);
  const agentSettingsPath = path.join(agentFolder, "settings.jsonc");
  const agentSettings = await loadJsonc(agentSettingsPath);
  const settings = mergeSettings(globalSettings, agentSettings);
  const systemPromptFile = String(settings.system_prompt_file || "soul/persona.md");
  const personaPath = path.join(agentFolder, systemPromptFile);
  const persona = [
    await readTextFile(personaPath),
    formatGlobalPersonaDefaults(await readTextFile(globalPersonaPath)),
  ].filter(Boolean).join("\n\n");
  const apiKey = await readTextFile(path.join(agentFolder, "secrets", "openrouter_api_key.txt"));
  return {
    agentFolder,
    apiKey,
    persona,
    settings,
  };
}

async function callOpenRouter({ agentName, agentRuntime, currentUserContent, visitorId, visitorMemoryPath }) {
  const settings = agentRuntime.settings;
  const messages = await buildOpenRouterMessages({
    agentName,
    agentFolder: agentRuntime.agentFolder,
    conversationHistory: [],
    conversationHistoryLimit: Number(settings.web_chat?.visitor_context_entries || 100),
    legacyMemorySumPath: path.join(agentRuntime.agentFolder, "soul", "memorysummary.txt"),
    legacyLongMemoryPath: path.join(agentRuntime.agentFolder, "soul", "longmemory.txt"),
    memorySumPath: path.join(agentRuntime.agentFolder, "soul", "memorysum.txt"),
    message: {
      content: currentUserContent,
      author: { username: visitorId, id: visitorId },
      channelId: `web-chat:${visitorId}`,
      guildId: null,
    },
    originSummaryPath: path.join(agentRuntime.agentFolder, "soul", "origin_summary.md"),
    persona: agentRuntime.persona,
    shortMemoryPath: visitorMemoryPath,
    statusPath: path.join(agentRuntime.agentFolder, "soul", "status.json"),
    settings,
    skills: [],
    timePassages: [],
  });

  messages.push({ role: "user", content: currentUserContent });

  const response = await fetch(`${settings.openrouter_base_url}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${agentRuntime.apiKey}`,
      "http-referer": "http://127.0.0.1",
      "x-title": "aiassistant web chat",
    },
    body: JSON.stringify({
      model: settings.model,
      messages,
      provider: openRouterProviderOptions(settings),
    }),
  });

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`OpenRouter error ${response.status}: ${responseText}`);
  }
  const data = JSON.parse(responseText);
  const reply = data.choices?.[0]?.message?.content?.trim();
  if (!reply) throw new Error("OpenRouter returned an empty reply.");
  return trimReply(reply, Number(settings.web_chat?.max_reply_characters || 4000));
}

function chatHtml(settings) {
  const displayTitle = String(settings.display_title || settings.default_agent || "aiassistant");
  const htmlDisplayTitle = escapeHtml(displayTitle);
  const jsDisplayTitle = JSON.stringify(displayTitle);
  const disclosure = settings.show_ai_disclosure
    ? "<p class=\"notice\">AI character chat. Do not share secrets here.</p>"
    : "";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${htmlDisplayTitle}</title>
  <style>
    :root { color-scheme: dark; --bg:#070b0b; --panel:#111817; --line:#293331; --text:#e8e2d6; --muted:#9ba7a1; --accent:#63d6aa; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: var(--bg); color: var(--text); font: 16px/1.45 system-ui, sans-serif; }
    main { display: grid; grid-template-rows: auto 1fr auto; height: 100vh; max-width: 920px; margin: 0 auto; padding: 14px; gap: 10px; }
    header, form, #messages { border: 1px solid var(--line); background: var(--panel); border-radius: 8px; }
    header { padding: 12px 14px; }
    h1 { margin: 0; font-size: 20px; }
    header { display: flex; align-items: center; justify-content: space-between; gap: 14px; }
    nav { display: flex; gap: 8px; flex-wrap: wrap; }
    nav a { color: var(--text); text-decoration: none; border: 1px solid var(--line); border-radius: 7px; padding: 7px 10px; background: #18201f; font-size: 13px; font-weight: 700; }
    nav a:hover { border-color: var(--accent); }
    .notice { margin: 4px 0 0; color: var(--muted); font-size: 13px; }
    #messages { padding: 14px; overflow: auto; }
    .msg { max-width: 78%; padding: 10px 12px; margin: 0 0 10px; border: 1px solid var(--line); border-radius: 8px; white-space: pre-wrap; }
    .user { margin-left: auto; background: #13211d; }
    .agent { margin-right: auto; background: #101518; }
    .meta { color: var(--muted); font-size: 12px; margin-bottom: 4px; }
    form { display: grid; grid-template-columns: 1fr auto; gap: 0; padding: 10px; }
    textarea { width: 100%; min-height: 82px; resize: vertical; color: var(--text); background: #18201f; border: 1px solid var(--line); border-radius: 7px 0 0 7px; padding: 10px; font: inherit; }
    button { color: var(--text); background: #193329; border: 1px solid #3b715d; border-radius: 0 7px 7px 0; min-width: 96px; font: inherit; font-weight: 700; cursor: pointer; }
    button:disabled { opacity: .55; cursor: wait; }
    #status { color: var(--muted); font-size: 13px; min-height: 18px; padding: 0 2px; }
  </style>
</head>
<body>
  <main>
    <header>
      <div><h1>${htmlDisplayTitle}</h1>${disclosure}</div>
      <nav aria-label="Yculth pages">
        <a href="/chat">Chat</a>
        <a href="/music/">Music</a>
      </nav>
    </header>
    <section id="messages"></section>
    <div>
      <form id="chatForm">
        <textarea id="message" placeholder="write a message"></textarea>
        <button id="sendButton" type="submit">Send</button>
      </form>
      <div id="status"></div>
    </div>
  </main>
  <script>
    const messages = document.getElementById("messages");
    const form = document.getElementById("chatForm");
    const input = document.getElementById("message");
    const button = document.getElementById("sendButton");
    const statusLine = document.getElementById("status");
    let sending = false;
    const visitorId = localStorage.getItem("aiassistantVisitorId") || crypto.randomUUID();
    localStorage.setItem("aiassistantVisitorId", visitorId);
    statusLine.textContent = "ready";
    function addMessage(kind, text) {
      const el = document.createElement("div");
      el.className = "msg " + kind;
      const meta = document.createElement("div");
      meta.className = "meta";
      meta.textContent = kind === "user" ? "you" : ${jsDisplayTitle};
      const body = document.createElement("div");
      body.textContent = text;
      el.append(meta, body);
      messages.append(el);
      messages.scrollTop = messages.scrollHeight;
    }
    async function sendMessage() {
      if (sending) return;
      const text = input.value.trim();
      if (!text) return;
      sending = true;
      addMessage("user", text);
      input.value = "";
      button.disabled = true;
      statusLine.textContent = ${jsDisplayTitle} + " is thinking...";
      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ visitor_id: visitorId, message: text })
        });
        const raw = await response.text();
        let data = {};
        try {
          data = raw ? JSON.parse(raw) : {};
        } catch (error) {
          throw new Error(raw || "chat returned invalid JSON");
        }
        if (!response.ok) throw new Error(data.error || "chat failed");
        addMessage("agent", data.reply);
        statusLine.textContent = "ready";
      } catch (error) {
        statusLine.textContent = error.message;
      } finally {
        button.disabled = false;
        sending = false;
        input.focus();
      }
    }
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      sendMessage();
    });
    button.addEventListener("click", (event) => {
      event.preventDefault();
      sendMessage();
    });
    input.addEventListener("keydown", (event) => {
      if (!event.ctrlKey || event.key !== "Enter") return;
      event.preventDefault();
      sendMessage();
    });
  </script>
</body>
</html>`;
}

async function handleChatRequest(request, response, globalSettings) {
  const webChatSettings = globalSettings.web_chat || {};
  if (!webChatSettings.enabled) {
    jsonResponse(response, 403, { error: "web_chat.enabled is false" });
    return;
  }

  const body = await readRequestJson(request);
  const inviteCode = String(webChatSettings.invite_code || "");
  if (inviteCode && String(body.invite_code || "") !== inviteCode) {
    jsonResponse(response, 403, { error: "invalid invite code" });
    return;
  }

  const allowedAgents = new Set((webChatSettings.allowed_agents || []).map((agent) => String(agent)));
  const requestedAgent = String(body.agent || webChatSettings.default_agent || "").trim();
  const agentName = allowedAgents.has(requestedAgent) ? requestedAgent : String(webChatSettings.default_agent || "");
  if (!agentName || !allowedAgents.has(agentName)) {
    jsonResponse(response, 403, { error: "agent is not allowed for web chat" });
    return;
  }

  const message = String(body.message || "").trim();
  const maxMessageLength = Number(webChatSettings.max_message_length || 2000);
  if (!message) {
    jsonResponse(response, 400, { error: "message is required" });
    return;
  }
  if (message.length > maxMessageLength) {
    jsonResponse(response, 400, { error: `message is too long; max ${maxMessageLength} characters` });
    return;
  }

  const visitorId = safeVisitorId(body.visitor_id);
  const agentRuntime = await createAgentRuntime(agentName, globalSettings);
  const visitorMemoryPath = await ensureVisitorMemory(agentName, visitorId);
  await appendVisitorMemory(visitorMemoryPath, {
    role: "user",
    username: visitorId,
    user_id: visitorId,
    channel_id: `web-chat:${visitorId}`,
    content: message,
  });

  const reply = await callOpenRouter({
    agentName,
    agentRuntime,
    currentUserContent: message,
    visitorId,
    visitorMemoryPath,
  });

  await appendVisitorMemory(visitorMemoryPath, {
    role: "assistant",
    username: agentName,
    user_id: agentName,
    channel_id: `web-chat:${visitorId}`,
    content: reply,
  });
  jsonResponse(response, 200, { agent: agentName, reply });
}

async function main() {
  const globalSettings = await loadJsonc(globalSettingsPath);
  const webChatSettings = globalSettings.web_chat || {};
  const host = String(webChatSettings.host || "127.0.0.1");
  const port = Number(webChatSettings.port || 8787);

  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", `http://${request.headers.host || `${host}:${port}`}`);
      if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/chat")) {
        textResponse(response, 200, chatHtml(webChatSettings), "text/html; charset=utf-8");
        return;
      }
      if (request.method === "GET" && url.pathname === "/music") {
        redirectResponse(response, "/music/");
        return;
      }
      if (request.method === "GET" && url.pathname === "/music/") {
        await serveFile(response, path.join(musicPageRoot, "index.html"));
        return;
      }
      if (request.method === "GET" && url.pathname.startsWith("/music/")) {
        const assetName = path.basename(url.pathname);
        const allowedAssets = new Set(["styles.css", "app.js", "music-sites.json"]);
        if (allowedAssets.has(assetName)) {
          await serveFile(response, path.join(musicPageRoot, assetName));
          return;
        }
      }
      if (request.method === "GET" && url.pathname === "/api/health") {
        jsonResponse(response, 200, {
          ok: true,
          enabled: Boolean(webChatSettings.enabled),
          allowed_agents: webChatSettings.allowed_agents || [],
          default_agent: webChatSettings.default_agent || "",
        });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/chat") {
        await handleChatRequest(request, response, globalSettings);
        return;
      }
      jsonResponse(response, 404, { error: "not found" });
    } catch (error) {
      console.error(error?.stack || error);
      jsonResponse(response, 500, { error: error.message || "internal error" });
    }
  });

  server.listen(port, host, () => {
    console.log(`aiassistant web chat listening at http://${host}:${port}/chat`);
    console.log(`allowed agents: ${(webChatSettings.allowed_agents || []).join(", ") || "(none)"}`);
  });
}

await main();
