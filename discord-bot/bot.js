import { createRequire } from "node:module";
import { readFileSync, unlinkSync } from "node:fs";
import { appendFile, mkdir, open, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildOpenRouterMessages } from "./context.js";
import { createMusicSkill } from "./skills/music.js";
import { plannedSkillNames } from "./skills/placeholders.js";
import { createTimeSkill } from "./skills/time.js";

const require = createRequire(import.meta.url);
const { Client, GatewayIntentBits, Partials } = require("./regenerated/node_modules/discord.js");

async function readTextFile(path) {
  try {
    return (await readFile(path, "utf8")).trim();
  } catch (error) {
    if (error.code === "ENOENT") throw new Error(`Missing required file: ${path}`);
    throw error;
  }
}

async function loadJson(path) {
  const text = await readTextFile(path);
  return JSON.parse(text.replace(/^\s*\/\/.*$/gm, ""));
}

async function appendConversationLog(entry) {
  const shortMemoryEntry = { timestamp: new Date().toISOString(), ...entry };
  await appendFile(shortMemoryPath, `${JSON.stringify(shortMemoryEntry)}\n`);
  await appendShortMemoryThread(shortMemoryEntry);
  scheduleAutoSummarization();
}

async function appendShortMemoryEntries(entries) {
  if (entries.length === 0) return;

  await appendFile(shortMemoryPath, entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n");
  for (const entry of entries) {
    await appendShortMemoryThread(entry);
  }
}

function requiredSetting(name) {
  if (!(name in settings)) throw new Error(`Missing required setting: ${name}`);
  return settings[name];
}

async function replyWithTemporaryError(message, text) {
  const errorMessage = await safeReply(message, text);
  setTimeout(() => {
    errorMessage.delete().catch(() => {});
  }, 30000);
}

async function replyTemporarily(message, text, milliseconds = 30000) {
  const reply = await safeReply(message, text);
  setTimeout(() => {
    reply.delete().catch(() => {});
  }, milliseconds);
  return reply;
}

async function safeReply(message, text) {
  try {
    return await message.reply(text);
  } catch (error) {
    console.error(`message.reply failed in ${message.channelId}: ${error.message}. Falling back to channel.send.`);
    if (!message.channel?.send) throw error;
    return message.channel.send(text);
  }
}

function isDeleteReactionEmoji(emoji) {
  const emojiName = String(emoji?.name || "");
  const emojiIdentifier = String(emoji?.identifier || "");
  return emojiName === "❌" || emojiName.toLowerCase() === "x" || emojiIdentifier.includes("%E2%9D%8C");
}

const agentName = process.env.AGENT_NAME || "Stardust";
const lockFolder = path.join("regenerated", "locks");
const lockPath = path.join(lockFolder, `${agentName.toLowerCase()}.lock`);
const summaryStateFolder = path.join("regenerated", "summary-state");
const summaryStatePath = path.join(summaryStateFolder, `${agentName.toLowerCase()}.json`);

async function processIsRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

async function acquireAgentLock() {
  await mkdir(lockFolder, { recursive: true });

  try {
    const lockFile = await open(lockPath, "wx");
    await lockFile.writeFile(String(process.pid));
    await lockFile.close();
    return;
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }

  const existingPidText = await readFile(lockPath, "utf8").catch(() => "");
  const existingPid = Number(existingPidText.trim());

  if (Number.isInteger(existingPid) && existingPid > 0 && (await processIsRunning(existingPid))) {
    throw new Error(
      `${agentName} is already running in process ${existingPid}. Stop that window before starting another copy.`,
    );
  }

  await unlink(lockPath).catch(() => {});
  return acquireAgentLock();
}

async function releaseAgentLock() {
  const existingPidText = await readFile(lockPath, "utf8").catch(() => "");
  if (existingPidText.trim() === String(process.pid)) {
    await unlink(lockPath).catch(() => {});
  }
}

function releaseAgentLockSync() {
  try {
    if (readFileSync(lockPath, "utf8").trim() === String(process.pid)) {
      unlinkSync(lockPath);
    }
  } catch {
  }
}

await acquireAgentLock();
process.on("exit", () => {
  releaseAgentLockSync();
});
process.on("SIGINT", async () => {
  await releaseAgentLock();
  process.exit(0);
});
process.on("SIGTERM", async () => {
  await releaseAgentLock();
  process.exit(0);
});
process.on("unhandledRejection", (error) => {
  console.error(`Unhandled rejection: ${error?.stack || error}`);
});
process.on("uncaughtException", async (error) => {
  console.error(`Uncaught exception: ${error?.stack || error}`);
  await releaseAgentLock();
  process.exit(1);
});

const agentFolder = path.join("..", "agents", agentName);
const settings = await loadJson(path.join(agentFolder, "settings.jsonc"));
const soulFolder = path.join(agentFolder, "soul");
const longMemoryPath = path.join(soulFolder, "longmemory.txt");
const shortMemoryPath = path.join(soulFolder, "shortmemory.jsonl");
const statusPath = path.join(soulFolder, "status.json");
const secretsFolder = path.join(agentFolder, "secrets");
const discordToken = await readTextFile(path.join(secretsFolder, "discord_token.txt"));
const openrouterApiKey = await readTextFile(path.join(secretsFolder, "openrouter_api_key.txt"));
const identity = requiredSetting("identity");
const name = String(identity.name);
const model = requiredSetting("model");
const systemPromptFile = requiredSetting("system_prompt_file");
const personaSourceThreadId = String(requiredSetting("persona_source_thread_id"));
const accessThreadId = String(requiredSetting("access_thread_id"));
let shortMemoryThreadId = String(requiredSetting("shortmemory_thread_id"));
const memoryForumChannelId = String(requiredSetting("memory_forum_channel_id"));
const memoryForumPosts = requiredSetting("memory_forum_posts").map((postName) => String(postName));
if (!memoryForumChannelId) {
  throw new Error(
    `Missing required memory_forum_channel_id for ${agentName}. Create a Discord forum channel for this agent's memory, copy the forum channel ID, and paste it into agents/${agentName}/settings.jsonc.`,
  );
}
const systemPromptPath = path.join(agentFolder, systemPromptFile);
async function loadSystemPrompt({ allowEmpty = false } = {}) {
  const prompt = await readTextFile(systemPromptPath);
  if (!prompt && !allowEmpty) throw new Error(`Persona file is empty: ${systemPromptPath}`);
  return prompt;
}
let systemPrompt = await loadSystemPrompt({ allowEmpty: Boolean(personaSourceThreadId) });

const locationReplyPolicy = requiredSetting("location_reply_policy");
const locationReplyMode = String(locationReplyPolicy.mode);
const replyToChannelIds = new Set(
  locationReplyPolicy.reply_to_channel_ids.map((channelId) => String(channelId)),
);
const replyToServerIds = new Set(
  locationReplyPolicy.reply_to_server_ids.map((serverId) => String(serverId)),
);
const doNotReplyToChannelIds = new Set(
  locationReplyPolicy.do_not_reply_to_channel_ids.map((channelId) => String(channelId)),
);
const doNotReplyToServerIds = new Set(
  locationReplyPolicy.do_not_reply_to_server_ids.map((serverId) => String(serverId)),
);
const userReplyPolicy = requiredSetting("user_reply_policy");
const userReplyMode = String(userReplyPolicy.mode);
const replyToUserIds = new Set(userReplyPolicy.reply_to_user_ids.map((userId) => String(userId)));
const doNotReplyToUserIds = new Set(
  userReplyPolicy.do_not_reply_to_user_ids.map((userId) => String(userId)),
);
const botReplyPolicy = requiredSetting("bot_reply_policy");
const replyToBotIds = new Set(botReplyPolicy.reply_to_bot_ids.map((botId) => String(botId)));
const conversationHistoryLimit = Number(requiredSetting("conversation_history_limit"));
const discordReplyCharacterLimit = Number(requiredSetting("discord_reply_character_limit"));
const summarizationSettings = requiredSetting("summarization_settings");
const replyWhenMentioned = Boolean(requiredSetting("reply_when_mentioned"));
const replyWhenNameUsed = Boolean(requiredSetting("reply_when_name_used"));
const replyWhenNameNotUsed = Boolean(requiredSetting("reply_when_name_not_used"));
const doNotReplyWhenAtIsNotAboutBot = Boolean(
  requiredSetting("do_not_reply_when_at_is_not_about_bot"),
);
const botNames = [name, ...identity.nicknames].map((botName) => String(botName).toLowerCase());
const conversationHistory = [];
const lastReplyByChannelId = new Map();
const pendingTimePassages = [];
const handledDeleteReactionKeys = new Set();
let summarizationTimer = null;
let summarizationRunning = false;

const bot = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.DirectMessageReactions,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel, Partials.Message, Partials.Reaction, Partials.User],
});

const enabledSkills = requiredSetting("enabled_skills");
const allowedStatusModes = new Set(["awake", "sleepy", "sleeping", "dreaming", "busy", "away"]);

async function readStatus() {
  const status = await loadJson(statusPath);
  if (!allowedStatusModes.has(String(status.mode))) {
    throw new Error(`Invalid status.mode in ${statusPath}: ${status.mode}`);
  }
  return status;
}

async function writeStatus(status) {
  if (!allowedStatusModes.has(String(status.mode))) {
    throw new Error(`Invalid status.mode: ${status.mode}`);
  }
  await writeFile(statusPath, `${JSON.stringify(status, null, 2)}\n`, "utf8");
}

const statusApi = {
  async get() {
    return readStatus();
  },
  async setMode(mode, currentActivity = "", source = "setMode") {
    const status = await readStatus();
    const nextStatus = {
      ...status,
      mode,
      status: {
        ...(status.status || {}),
        awake: mode === "awake",
        sleeping: mode === "sleeping",
        dreaming: mode === "dreaming",
        busy: mode === "busy",
        away: mode === "away",
        sleepy: mode === "sleepy" || Boolean(status.status?.sleepy),
      },
      current_activity: currentActivity,
      last_status_change: new Date().toISOString(),
    };
    await writeStatus(nextStatus);
    await appendStatusMemoryDump(status, nextStatus, source);
    return nextStatus;
  },
  async update(changes) {
    const status = await readStatus();
    const nextStatus = {
      ...status,
      ...changes,
      status: {
        ...(status.status || {}),
        ...(changes.status || {}),
      },
    };
    await writeStatus(nextStatus);
    await appendStatusMemoryDump(status, nextStatus, "update");
    return nextStatus;
  },
  async requireMode(modes, actionName) {
    const status = await readStatus();
    const allowedModes = new Set(modes);
    if (!allowedModes.has(String(status.mode))) {
      throw new Error(
        `${agentName} cannot ${actionName} while status.mode is "${status.mode}". Allowed modes: ${[...allowedModes].join(", ")}.`,
      );
    }
    return status;
  },
};

function statusDumpText(previousStatus, nextStatus, source) {
  return [
    "status:",
    `timestamp: ${new Date().toISOString()}`,
    `agent: ${agentName}`,
    `source: ${source}`,
    `previous_mode: ${previousStatus?.mode || ""}`,
    `mode: ${nextStatus.mode}`,
    `energy: ${nextStatus.energy ?? ""}`,
    `current_activity: ${nextStatus.current_activity || ""}`,
    "flags:",
    JSON.stringify(nextStatus.status || {}, null, 2),
  ].join("\n");
}

async function appendStatusMemoryDump(previousStatus, nextStatus, source) {
  if (JSON.stringify(previousStatus) === JSON.stringify(nextStatus)) return;

  const dump = statusDumpText(previousStatus, nextStatus, source);
  const statusPost = await findMemoryForumPostByName("status").catch(() => null);
  if (statusPost?.send) {
    await statusPost.send(dump.length <= 1900 ? dump : `${dump.slice(0, 1900)}\n...`);
  }
}

async function addTimePassage(minutes) {
  if (!Number.isInteger(minutes) || minutes < 1) {
    throw new Error("minutes must be a whole number greater than 0.");
  }

  pendingTimePassages.push({
    minutes,
    recordedAt: new Date().toISOString(),
  });
  await appendConversationLog({
    role: "system",
    content: `${agentName} experiences ${minutes} minutes of time passing before the next reply.`,
  });

  const status = await readStatus();
  const energy = Number(status.energy);
  const energyGain = status.mode === "sleeping" || status.mode === "dreaming"
    ? Math.max(1, Math.floor(minutes / 6))
    : 0;
  const nextStatus = {
    ...status,
    energy: Number.isFinite(energy) ? Math.min(100, energy + energyGain) : status.energy,
    last_time_passage_minutes: minutes,
    last_time_passage_at: new Date().toISOString(),
  };
  await writeStatus(nextStatus);
  return nextStatus;
}

const skillFactories = new Map([
  ["music", createMusicSkill],
  ["time", createTimeSkill],
]);
const placeholderSkillNames = new Set(plannedSkillNames());
const skills = enabledSkills.map((skillName) => {
  const factory = skillFactories.get(skillName);
  if (!factory && placeholderSkillNames.has(skillName)) {
    throw new Error(`Skill is planned but not implemented yet: ${skillName}`);
  }
  if (!factory) throw new Error(`Unknown enabled skill: ${skillName}`);
  return factory({
    addTimePassage,
    agentName,
    bot,
    agentFolder,
    model,
    openrouterApiKey,
    requiredSetting,
    safeReply,
    shortMemoryPath,
    statusApi,
    systemPrompt: () => systemPrompt,
  });
});

bot.once("clientReady", async () => {
  console.log(`Bot is online. Logged in as ${bot.user.tag}`);

  for (const guild of bot.guilds.cache.values()) {
    try {
      const commands = [
        {
          name: "reloadpersona",
          description: "Grab persona from the configured forum post/thread, or reload soul/persona.md from disk.",
        },
        {
          name: "clearshortmemory",
          description: "Clear this agent's soul/shortmemory.jsonl and live recent context.",
        },
        {
          name: "clean",
          description: "Clean a selected generated Discord memory surface.",
          options: [
            {
              name: "target",
              description: "What to clean. Currently only adjustments is supported.",
              type: 3,
              required: true,
              choices: [
                { name: "adjustments", value: "adjustments" },
              ],
            },
          ],
        },
        {
          name: "setupmemoryforum",
          description: "Create or populate this agent's memory forum posts.",
        },
        {
          name: "syncshortmemory",
          description: "Sync shortmemory between local disk and the Discord shortmemory forum post.",
          options: [
            {
              name: "direction",
              description: "Sync direction. Default is both.",
              type: 3,
              required: false,
              choices: [
                { name: "both", value: "both" },
                { name: "local to discord", value: "local_to_discord" },
                { name: "discord to local", value: "discord_to_local" },
              ],
            },
          ],
        },
        {
          name: "scrapeshortmemory",
          description: "Append recent channel messages ending at this agent's last reply.",
          options: [
            {
              name: "channel_id",
              description: "Discord channel ID to scrape from.",
              type: 3,
              required: true,
            },
          ],
        },
        {
          name: "scrapedmshortmemory",
          description: "Append recent DMs with you ending at this agent's last DM reply.",
        },
        {
          name: "uploadstory",
          description: "Upload a local soul/stories Markdown story to the Discord stories thread.",
          options: [
            {
              name: "filename",
              description: "Story filename in soul/stories. .md is assumed if omitted.",
              type: 3,
              required: true,
            },
          ],
        },
        ...skills.map((skill) => skill.command),
      ].filter(Boolean);

      await guild.commands.set(commands);
      console.log(`Registered slash commands in ${guild.name}`);
    } catch (error) {
      console.error(`Could not register slash commands in ${guild.name}: ${error.message}`);
    }
  }

  try {
    const result = await setupMemoryForum();
    console.log(
      `Memory forum checked for ${agentName}: created ${result.createdPosts.length ? result.createdPosts.join(", ") : "none"}; already existed ${result.alreadyExistingPosts.length ? result.alreadyExistingPosts.join(", ") : "none"}.`,
    );
  } catch (error) {
    console.error(
      `Could not check or create memory forum posts for ${agentName}: ${error.message}. Set memory_forum_channel_id and make sure the bot can view and send messages in that forum.`,
    );
  }

  if (personaSourceThreadId) {
    try {
      const characterCount = await reloadPersonaFromConfiguredThread();
      console.log(
        `Loaded persona for ${agentName} from Discord forum post/thread ${personaSourceThreadId}: ${characterCount} characters.`,
      );
    } catch (error) {
      console.error(`Could not load persona from Discord forum post/thread ${personaSourceThreadId}: ${error.message}`);
    }
  } else {
    console.log(`Loaded persona for ${agentName} from disk: ${systemPrompt.length} characters.`);
  }

  if (accessThreadId) console.log(`Access forum post/thread for ${agentName}: ${accessThreadId}`);
  try {
    await ensureShortMemoryThreadId();
    const result = await syncShortMemoryBothWays();
    console.log(
      `Synced shortmemory with Discord forum post/thread ${shortMemoryThreadId}: pushed ${result.pushedToDiscord}, local entries ${result.localEntries}.`,
    );
  } catch (error) {
    console.error(`Could not sync shortmemory: ${error.message}`);
  }
  for (const skill of skills) {
    skill.onReady?.();
  }
});

async function readTextAttachment(attachment) {
  const name = attachment.name || "";
  const contentType = attachment.contentType || "";
  if (!/\.(md|txt)$/i.test(name) && !contentType.startsWith("text/")) return "";

  const response = await fetch(attachment.url);
  if (!response.ok) {
    throw new Error(`Could not read attachment ${name}: HTTP ${response.status}`);
  }
  return (await response.text()).trim();
}

async function messageToPersonaText(message) {
  const parts = [];
  const content = message.content.trim();
  if (content) parts.push(content);

  for (const attachment of message.attachments.values()) {
    const attachmentText = await readTextAttachment(attachment);
    if (attachmentText) parts.push(attachmentText);
  }

  const text = parts.join("\n\n").trim();
  return text;
}

async function threadToPersonaText(channel) {
  if (!channel?.isThread?.()) {
    throw new Error("Configured persona source is not a Discord forum post/thread.");
  }

  const messages = [];
  let before;

  for (;;) {
    const batch = await channel.messages.fetch({ limit: 100, before });
    if (batch.size === 0) break;
    messages.push(...batch.values());
    before = batch.last().id;
    if (batch.size < 100) break;
  }

  const orderedMessages = messages.sort((left, right) => left.createdTimestamp - right.createdTimestamp);
  const parts = [];

  for (const message of orderedMessages) {
    if (message.author.id === bot.user.id) continue;
    const text = await messageToPersonaText(message);
    if (text) parts.push(text);
  }

  const text = parts.join("\n\n").trim();
  if (!text) throw new Error("That forum post/thread did not contain usable persona text.");
  return text;
}

async function saveAndReloadPersona(text) {
  const trimmedText = text.trim();
  if (!trimmedText) throw new Error(`Refusing to overwrite ${systemPromptFile} with empty text.`);
  await writeFile(systemPromptPath, `${trimmedText}\n`, "utf8");
  systemPrompt = await loadSystemPrompt();
  return systemPrompt.length;
}

async function reloadPersonaFromConfiguredThread() {
  if (!personaSourceThreadId) return null;

  const thread = await bot.channels.fetch(personaSourceThreadId);
  if (!thread) throw new Error(`Could not find persona source forum post/thread: ${personaSourceThreadId}`);

  return saveAndReloadPersona(await threadToPersonaText(thread));
}

function formatShortMemoryThreadEntry(entry) {
  const lines = [
    `shortmemory: ${entry.role || "unknown"}`,
    `timestamp: ${entry.timestamp}`,
  ];

  if (entry.username) lines.push(`username: ${entry.username}`);
  if (entry.user_id) lines.push(`user_id: ${entry.user_id}`);
  if (entry.channel_id) lines.push(`channel_id: ${entry.channel_id}`);
  if (entry.message_id) lines.push(`message_id: ${entry.message_id}`);
  if (entry.server_id) lines.push(`server_id: ${entry.server_id}`);
  if (typeof entry.truncated === "boolean") lines.push(`truncated: ${entry.truncated}`);
  lines.push("content:");
  lines.push(entry.content || "");

  const text = lines.join("\n").trim();
  if (text.length <= 1900) return text;
  return `${text.slice(0, 1900)}\n...`;
}

function parseShortMemoryThreadEntry(content) {
  const lines = content.split(/\r?\n/);
  if (!lines[0]?.startsWith("shortmemory: ")) return null;

  const entry = {
    role: lines[0].slice("shortmemory: ".length).trim(),
  };
  const contentIndex = lines.findIndex((line) => line === "content:");
  if (contentIndex === -1) return null;

  for (const line of lines.slice(1, contentIndex)) {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) continue;
    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    if (key === "truncated") {
      entry[key] = value === "true";
    } else {
      entry[key] = value;
    }
  }

  entry.content = lines.slice(contentIndex + 1).join("\n").trim();
  return entry;
}

async function appendShortMemoryThread(entry) {
  await ensureShortMemoryThreadId();

  const shortMemoryThread = await bot.channels.fetch(shortMemoryThreadId);
  if (!shortMemoryThread?.send) {
    throw new Error(`Could not send to shortmemory forum post/thread: ${shortMemoryThreadId}`);
  }
  await shortMemoryThread.send(formatShortMemoryThreadEntry(entry));
}

async function fetchShortMemoryThreadEntries() {
  await ensureShortMemoryThreadId();

  const shortMemoryThread = await bot.channels.fetch(shortMemoryThreadId);
  if (!shortMemoryThread?.messages?.fetch) {
    throw new Error(`Could not read shortmemory forum post/thread: ${shortMemoryThreadId}`);
  }

  const messages = [];
  let before;

  for (;;) {
    const batch = await shortMemoryThread.messages.fetch({ limit: 100, before });
    if (batch.size === 0) break;
    messages.push(...batch.values());
    before = batch.last().id;
    if (batch.size < 100) break;
  }

  const entries = messages
    .sort((left, right) => left.createdTimestamp - right.createdTimestamp)
    .map((message) => parseShortMemoryThreadEntry(message.content))
    .filter(Boolean);

  if (messages.length > 0 && entries.length === 0) {
    console.warn(
      `Shortmemory forum post/thread ${shortMemoryThreadId} has ${messages.length} messages, but none matched the shortmemory format.`,
    );
  }

  return entries;
}

async function deleteShortMemoryThreadEntries() {
  await ensureShortMemoryThreadId();

  const shortMemoryThread = await bot.channels.fetch(shortMemoryThreadId);
  if (!shortMemoryThread?.messages?.fetch) {
    throw new Error(`Could not read shortmemory forum post/thread: ${shortMemoryThreadId}`);
  }

  let deleted = 0;
  let before;

  for (;;) {
    const batch = await shortMemoryThread.messages.fetch({ limit: 100, before });
    if (batch.size === 0) break;

    for (const message of batch.values()) {
      if (!parseShortMemoryThreadEntry(message.content)) continue;
      await message.delete();
      deleted += 1;
    }

    before = batch.last().id;
    if (batch.size < 100) break;
  }

  return deleted;
}

async function readLocalShortMemoryEntries() {
  const text = await readFile(shortMemoryPath, "utf8").catch((error) => {
    if (error.code === "ENOENT") return "";
    throw error;
  });

  return text
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function shortMemoryEntryKey(entry) {
  return [
    entry.timestamp || "",
    entry.role || "",
    entry.username || "",
    entry.user_id || "",
    entry.channel_id || "",
    entry.message_id || "",
    entry.server_id || "",
    entry.content || "",
  ].join("\u001f");
}

function shortMemoryEntryMatchesMessage(entry, message) {
  if (entry.role !== "assistant") return false;
  if (entry.message_id && String(entry.message_id) === String(message.id)) return true;
  return (
    String(entry.channel_id || "") === String(message.channelId) &&
    String(entry.content || "").trim() === String(message.content || "").trim()
  );
}

async function deleteLocalShortMemoryForMessage(message) {
  const entries = await readLocalShortMemoryEntries();
  const keptEntries = entries.filter((entry) => !shortMemoryEntryMatchesMessage(entry, message));
  const deleted = entries.length - keptEntries.length;

  if (deleted > 0) {
    await writeFile(
      shortMemoryPath,
      keptEntries.length ? `${keptEntries.map((entry) => JSON.stringify(entry)).join("\n")}\n` : "",
      "utf8",
    );
  }

  return deleted;
}

async function deleteShortMemoryThreadEntriesForMessage(message) {
  await ensureShortMemoryThreadId();

  const shortMemoryThread = await bot.channels.fetch(shortMemoryThreadId);
  if (!shortMemoryThread?.messages?.fetch) {
    throw new Error(`Could not read shortmemory forum post/thread: ${shortMemoryThreadId}`);
  }

  let deleted = 0;
  let before;

  for (;;) {
    const batch = await shortMemoryThread.messages.fetch({ limit: 100, before });
    if (batch.size === 0) break;

    for (const threadMessage of batch.values()) {
      const entry = parseShortMemoryThreadEntry(threadMessage.content);
      if (!entry || !shortMemoryEntryMatchesMessage(entry, message)) continue;
      await threadMessage.delete();
      deleted += 1;
    }

    before = batch.last().id;
    if (batch.size < 100) break;
  }

  return deleted;
}

async function syncLocalShortMemoryFromDiscord() {
  await ensureShortMemoryThreadId();

  const entries = await fetchShortMemoryThreadEntries();
  const existingText = await readFile(shortMemoryPath, "utf8").catch((error) => {
    if (error.code === "ENOENT") return "";
    throw error;
  });

  if (existingText.trim() && entries.length === 0) {
    throw new Error(
      `Refusing to overwrite non-empty ${shortMemoryPath} because Discord shortmemory post/thread ${shortMemoryThreadId} returned zero parseable entries.`,
    );
  }

  if (existingText.trim()) {
    const backupPath = `${shortMemoryPath}.${new Date().toISOString().replace(/[:.]/g, "-")}.bak`;
    await writeFile(backupPath, existingText, "utf8");
  }

  const text = entries.map((entry) => JSON.stringify(entry)).join("\n");
  await writeFile(shortMemoryPath, text ? `${text}\n` : "", "utf8");
  return entries.length;
}

async function syncLocalShortMemoryToDiscord() {
  await ensureShortMemoryThreadId();

  const localEntries = await readLocalShortMemoryEntries();
  const discordEntries = await fetchShortMemoryThreadEntries();
  const discordEntryKeys = new Set(discordEntries.map(shortMemoryEntryKey));
  let pushedToDiscord = 0;

  for (const entry of localEntries) {
    if (discordEntryKeys.has(shortMemoryEntryKey(entry))) continue;
    await appendShortMemoryThread(entry);
    pushedToDiscord += 1;
  }

  return { localEntries: localEntries.length, discordEntries: discordEntries.length, pushedToDiscord };
}

async function syncShortMemoryBothWays() {
  const pushResult = await syncLocalShortMemoryToDiscord();
  const localEntries = await syncLocalShortMemoryFromDiscord();
  return {
    ...pushResult,
    localEntries,
  };
}

const memoryForumPostDescriptions = new Map([
  ["help", "Clean command reference for this agent."],
  ["emoji", "Emoji, reaction habits, symbol meanings, and tiny expression notes."],
  ["persona", "Persona source material and identity notes."],
  ["music", "Music links, listening preferences, and song references."],
  ["adjustments", "Audit log of reply adjustments requested by the user."],
  ["status", "Current agent status changes, activity state, energy, and sleep or away logs."],
  ["profilepic", "Profile picture ideas, references, and avatar notes."],
  ["longmemory", "Durable summary memory that survives beyond recent chat context."],
  ["shortmemory", "Recent conversation memory. Discord should be treated as the authority when configured."],
  ["dreams", "Dream output, associative fragments, and sleep-cycle creative notes."],
  ["art", "Art notes, references, prompts, and visual style memory."],
  ["stories", "Story notes, scenes, lore, drafts, and narrative memory."],
]);

function helpCommandLists() {
  const slashCommands = [
    ["/reloadpersona", "Reload persona."],
    ["/clearshortmemory", "Clear local/live/Discord shortmemory."],
    ["/clean adjustments", "Delete messages inside the Discord adjustments memory post."],
    ["/setupmemoryforum", "Create missing memory posts."],
    ["/syncshortmemory direction", "Sync local and Discord shortmemory."],
    ["/scrapeshortmemory channel_id", "Scrape recent channel messages into shortmemory."],
    ["/scrapedmshortmemory", "Scrape recent DMs into shortmemory."],
    ["/uploadstory filename", "Upload a local soul/stories Markdown story to the stories thread."],
  ];
  const pipeCommands = [
    ["||@agent reply||", "Continue the story from recent context."],
    ["||@agent adjust: text||", "Instructions for redoing the previous bot reply; the bot updates its reply and shortmemory entry."],
    ["||@agent summarize||", "Write soul/longmemory.txt."],
    ["||@agent story||", "Write a short story from recent context and memory."],
    ["||@agent story: text||", "Write a short story using the prompt plus recent context and memory."],
    ["||@agent subtext: text||", "Private assumptions/persona nudges; loosely stored later by summaries."],
    ["||@agent sleep||", "Set sleeping."],
    ["||@agent wake||", "Set awake."],
    ["||@agent busy||", "Set busy."],
    ["||@agent away||", "Set away."],
    ["||@agent status||", "Show status."],
    ["||@agent passtimeminutes: 60||", "Pass time."],
    ["||@agent dream||", "Dream from context; requires sleeping."],
    ["||@agent dream: text||", "Dream from seed text; requires sleeping."],
  ];

  if (enabledSkills.includes("music")) {
    pipeCommands.push(
      ["||@agent music||", "Search the internet for music based on shortmemory."],
      ["||@agent music: link or text||", "Search the internet for music based on description, or give a direct link."],
    );
  }

  return { slashCommands, pipeCommands };
}

function helpForumPostContent() {
  return [
    "# help",
    "",
    `agent: ${agentName}`,
    "",
    "Command reference for this agent.",
    "",
    "The bot will post slash commands, pipe commands, and emoji reactions below.",
  ].join("\n");
}

function helpSectionMessages() {
  const { slashCommands, pipeCommands } = helpCommandLists();
  return [
    [
      "**Slash Commands**",
      "",
      ...slashCommands.map(([command, description]) => `* \`${command}\` : ${description}`),
    ].join("\n"),
    [
      "**Pipe Commands**",
      "",
      "* Server use : `@agent`, the bot name, or the bot mention.",
      "* DM use : `@agent` is optional.",
      "",
      ...pipeCommands.map(([command, description]) => `* \`${command}\` : ${description}`),
    ].join("\n"),
    [
      "**Emoji Reactions**",
      "",
      "* `❌` : Delete a bot reply and remove its matching assistant shortmemory entry.",
    ].join("\n"),
  ];
}

function normalizeForumPostName(name) {
  return String(name).trim().toLowerCase();
}

function forumThreadValues(fetchResult) {
  if (!fetchResult) return [];
  if (fetchResult.threads?.values) return [...fetchResult.threads.values()];
  if (fetchResult.values) return [...fetchResult.values()];
  return [];
}

async function fetchExistingForumPostNames(forumChannel) {
  const names = new Set();
  for (const thread of forumChannel.threads?.cache?.values?.() || []) {
    names.add(normalizeForumPostName(thread.name));
  }

  const activeThreads = await forumChannel.threads.fetchActive().catch(() => null);
  for (const thread of forumThreadValues(activeThreads)) {
    names.add(normalizeForumPostName(thread.name));
  }

  const archivedThreads = await forumChannel.threads.fetchArchived().catch(() => null);
  for (const thread of forumThreadValues(archivedThreads)) {
    names.add(normalizeForumPostName(thread.name));
  }

  return names;
}

async function fetchForumPostsByName(forumChannel) {
  const posts = new Map();
  for (const thread of forumChannel.threads?.cache?.values?.() || []) {
    posts.set(normalizeForumPostName(thread.name), thread);
  }

  const activeThreads = await forumChannel.threads.fetchActive().catch(() => null);
  for (const thread of forumThreadValues(activeThreads)) {
    posts.set(normalizeForumPostName(thread.name), thread);
  }

  const archivedThreads = await forumChannel.threads.fetchArchived().catch(() => null);
  for (const thread of forumThreadValues(archivedThreads)) {
    posts.set(normalizeForumPostName(thread.name), thread);
  }

  return posts;
}

function memoryForumPostContent(postName) {
  const normalizedName = normalizeForumPostName(postName);
  if (normalizedName === "help") return helpForumPostContent();

  const description = memoryForumPostDescriptions.get(normalizedName) || "Agent memory notes.";
  return [`# ${postName}`, "", `agent: ${agentName}`, `purpose: ${description}`].join("\n");
}

async function resolveMemoryForum(guild) {
  const forumChannel = await bot.channels.fetch(memoryForumChannelId);
  if (!forumChannel) {
    throw new Error(
      `Could not find memory forum channel ${memoryForumChannelId}. Check the ID and make sure the bot can view that forum.`,
    );
  }
  return { forumChannel };
}

async function ensureShortMemoryThreadId() {
  if (shortMemoryThreadId) return shortMemoryThreadId;

  const { forumChannel } = await resolveMemoryForum();
  if (!forumChannel.threads?.fetchActive) {
    throw new Error(`Configured memory forum channel is not a forum-like channel: ${forumChannel.id}`);
  }

  const forumPosts = await fetchForumPostsByName(forumChannel);
  const shortMemoryPost = forumPosts.get("shortmemory");
  if (!shortMemoryPost?.id) {
    throw new Error(
      `shortmemory_thread_id is blank and no shortmemory post exists in memory forum ${memoryForumChannelId}. Run /setupmemoryforum, then /syncshortmemory.`,
    );
  }

  shortMemoryThreadId = String(shortMemoryPost.id);
  return shortMemoryThreadId;
}

async function setupMemoryForum(guild = null) {
  const { forumChannel } = await resolveMemoryForum(guild);
  if (!forumChannel.threads?.create) {
    throw new Error(`Configured memory forum channel is not a forum-like channel: ${forumChannel.id}`);
  }

  const existingPostNames = await fetchExistingForumPostNames(forumChannel);
  const createdPosts = [];
  const alreadyExistingPosts = [];
  const skillMemoryForumPosts = skills
    .map((skill) => (Object.hasOwn(skill, "memoryForumPostName") ? skill.memoryForumPostName : skill.name))
    .filter(Boolean);
  const activeMemoryForumPosts = [...new Set([...memoryForumPosts, ...skillMemoryForumPosts])];

  for (const postName of activeMemoryForumPosts) {
    const normalizedName = normalizeForumPostName(postName);
    if (existingPostNames.has(normalizedName)) {
      alreadyExistingPosts.push(postName);
      continue;
    }

    await forumChannel.threads.create({
      name: postName,
      message: {
        content: memoryForumPostContent(postName),
      },
      reason: `Create ${agentName} memory forum post: ${postName}`,
    });
    existingPostNames.add(normalizedName);
    createdPosts.push(postName);
  }

  if (activeMemoryForumPosts.map(normalizeForumPostName).includes("help")) {
    const forumPosts = await fetchForumPostsByName(forumChannel);
    const helpPost = forumPosts.get("help");
    if (helpPost) await refreshHelpForumPost(helpPost);
  }

  return {
    forumChannel,
    createdPosts,
    alreadyExistingPosts,
  };
}

async function refreshHelpForumPost(helpPost) {
  if (!helpPost?.messages?.fetch || !helpPost?.send) return false;

  const messages = await helpPost.messages.fetch({ limit: 100 });
  const helpSectionTitles = new Set(["**Slash Commands**", "**Pipe Commands**", "**Emoji Reactions**"]);
  const deletions = [];
  for (const message of messages.values()) {
    if (message.author?.id !== bot.user.id) continue;
    const firstLine = String(message.content || "").split(/\r?\n/, 1)[0];
    if (helpSectionTitles.has(firstLine)) deletions.push(message.delete().catch(() => {}));
  }
  await Promise.all(deletions);

  for (const sectionMessage of helpSectionMessages()) {
    await helpPost.send(sectionMessage.length <= 1900 ? sectionMessage : `${sectionMessage.slice(0, 1900)}\n...`);
  }
  return true;
}

async function findMemoryForumPostByName(postName) {
  const { forumChannel } = await resolveMemoryForum();
  const forumPosts = await fetchForumPostsByName(forumChannel);
  return forumPosts.get(normalizeForumPostName(postName)) || null;
}

async function cleanMemoryForumPost(postName) {
  const post = await findMemoryForumPostByName(postName);
  if (!post?.messages?.fetch) {
    throw new Error(`Could not find readable memory forum post/thread: ${postName}`);
  }

  let deleted = 0;
  let before;
  for (;;) {
    const batch = await post.messages.fetch({ limit: 100, before });
    if (batch.size === 0) break;

    for (const threadMessage of batch.values()) {
      if (threadMessage.id === post.id) continue;
      await threadMessage.delete().catch(() => {});
      deleted += 1;
    }

    before = batch.last().id;
    if (batch.size < 100) break;
  }
  return deleted;
}

async function appendAdjustmentMemoryDump({ originalReplyText, adjustInstruction, replacementReplyText }) {
  const post = await findMemoryForumPostByName("adjustments").catch(() => null);
  if (!post?.send) return false;

  const dump = [
    "adjustment:",
    `timestamp: ${new Date().toISOString()}`,
    `agent: ${agentName}`,
    "",
    "instructions:",
    adjustInstruction,
    "",
    "original_reply:",
    originalReplyText,
    "",
    "replacement_reply:",
    replacementReplyText,
  ].join("\n");
  await post.send(dump.length <= 1900 ? dump : `${dump.slice(0, 1900)}\n...`);
  return true;
}

async function postLongMemoryPreview({ outputFile, outputText }) {
  const post = await findMemoryForumPostByName("longmemory").catch(() => null);
  if (!post?.send) return false;

  const previewLimit = 1200;
  const preview = outputText.length > previewLimit ? `${outputText.slice(0, previewLimit)}\n...` : outputText;
  const message = [
    "latest_longmemory:",
    `timestamp: ${new Date().toISOString()}`,
    `agent: ${agentName}`,
    `local_file: ${outputFile}`,
    `characters: ${outputText.length}`,
    "kind: longmemory update",
    "",
    "full_memory_location:",
    "The full memory is only stored in the local txt/md file listed above. Discord is only a preview/notice because Discord posts have text limits.",
    "",
    "preview:",
    preview,
  ].join("\n");
  await post.send(message.length <= 1900 ? message : `${message.slice(0, 1900)}\n...`);
  return true;
}

async function readRelativeTextFile(relativeFilePath) {
  return readTextFile(path.join(agentFolder, relativeFilePath));
}

async function writeRelativeTextFile(relativeFilePath, text) {
  const absoluteFilePath = path.join(agentFolder, relativeFilePath);
  await mkdir(path.dirname(absoluteFilePath), { recursive: true });
  await writeFile(absoluteFilePath, text, "utf8");
  return absoluteFilePath;
}

function shortMemoryEntriesToSummarySource(entries) {
  return entries
    .map((entry) => {
      const parts = [
        `timestamp: ${entry.timestamp || ""}`,
        `role: ${entry.role || ""}`,
        `username: ${entry.username || ""}`,
        `user_id: ${entry.user_id || ""}`,
        `channel_id: ${entry.channel_id || ""}`,
        "content:",
        entry.content || "",
      ];
      return parts.join("\n");
    })
    .join("\n\n---\n\n");
}

function timestampForFileName() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function safeFileName(name) {
  const safe = String(name || "story")
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return safe || "story";
}

function storyFileNameFromInput(input) {
  const trimmed = String(input || "").trim().replace(/^["']|["']$/g, "");
  if (!trimmed) throw new Error("Story filename is required.");
  if (trimmed.includes("/") || trimmed.includes("\\") || trimmed.includes("..")) {
    throw new Error("Story filename must be only a file name inside soul/stories.");
  }
  return path.extname(trimmed) ? trimmed : `${trimmed}.md`;
}

function chunkMarkdown(text, limit = 1800) {
  const chunks = [];
  let remaining = String(text || "").trim();
  while (remaining.length > limit) {
    let cut = remaining.lastIndexOf("\n\n", limit);
    if (cut < 500) cut = remaining.lastIndexOf("\n", limit);
    if (cut < 500) cut = remaining.lastIndexOf(" ", limit);
    if (cut < 500) cut = limit;
    chunks.push(remaining.slice(0, cut).trimEnd());
    remaining = remaining.slice(cut).trimStart();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

function storyTextWithoutMetadata(text) {
  return String(text || "")
    .replace(/\n---\n(?:agent|created|prompt|local_file):[\s\S]*$/i, "")
    .trim();
}

async function uploadStoryFile(filenameInput) {
  const fileName = storyFileNameFromInput(filenameInput);
  const relativeFilePath = path.join("soul", "stories", fileName);
  const storyText = storyTextWithoutMetadata(await readRelativeTextFile(relativeFilePath));
  if (!storyText.trim()) throw new Error(`Story file is empty: ${relativeFilePath}`);

  const storiesPost = await findMemoryForumPostByName("stories").catch(() => null);
  if (!storiesPost?.send) {
    throw new Error("Could not find writable stories memory forum post/thread.");
  }

  const chunks = chunkMarkdown(storyText);
  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    const message = chunks.length === 1
      ? chunk
      : [`_story part ${index + 1}/${chunks.length}_`, "", chunk].join("\n");
    await storiesPost.send(message);
  }

  return {
    fileName,
    chunks: chunks.length,
  };
}

function parseJsonObjectFromText(text) {
  const trimmed = String(text || "").trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const jsonText = fenced ? fenced[1].trim() : trimmed;
  const objectMatch = jsonText.match(/\{[\s\S]*\}/);
  if (!objectMatch) throw new Error(`No JSON object found in model response: ${trimmed}`);
  return JSON.parse(objectMatch[0]);
}

async function generateStory(commandContent = "") {
  const recentEntries = (await readLocalShortMemoryEntries()).slice(-conversationHistoryLimit);
  const recentShortMemory = shortMemoryEntriesToSummarySource(recentEntries);
  const existingLongMemory = await readTextFile(longMemoryPath).catch((error) => {
    if (error.message.startsWith("Missing required file:")) return "";
    throw error;
  });
  const storyPrompt = commandContent.trim() ||
    "Look at the recent context and longmemory, then make a short story based on what feels most relevant.";

  const response = await fetch(`${requiredSetting("openrouter_base_url")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openrouterApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content: [
            `# Persona: ${agentName}`,
            systemPrompt,
            "",
            "# Story Task",
            "Write one short story as this agent, using recent shortmemory as the main evidence and longmemory as additional context.",
            "Use the user's story prompt to decide what part of memory they are asking about.",
            "If the prompt is blank, choose a relevant recent scene or thread and write a short story from it.",
            "Do not invent major facts that contradict memory.",
            "Return only strict JSON with this shape:",
            "{\"title\":\"short title\",\"story_markdown\":\"markdown story beginning with a matching # title\"}",
          ].join("\n"),
        },
        {
          role: "user",
          content: [
            "# User Story Prompt",
            storyPrompt,
            "",
            "# Longmemory",
            existingLongMemory || "(empty)",
            "",
            "# Recent Shortmemory",
            recentShortMemory || "(empty)",
          ].join("\n"),
        },
      ],
      temperature: Number(requiredSetting("chaos")),
      max_tokens: Number(requiredSetting("max_tokens")),
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenRouter error ${response.status}: ${await response.text()}`);
  }

  const payload = await response.json();
  const raw = payload.choices?.[0]?.message?.content?.trim();
  if (!raw) throw new Error("OpenRouter returned an empty story.");

  const parsed = parseJsonObjectFromText(raw);
  const title = String(parsed.title || "Story").trim() || "Story";
  let storyMarkdown = String(parsed.story_markdown || "").trim();
  if (!storyMarkdown) throw new Error("OpenRouter returned a story without story_markdown.");
  if (!storyMarkdown.startsWith("# ")) {
    storyMarkdown = [`# ${title}`, "", storyMarkdown].join("\n");
  }

  const fileName = `${timestampForFileName()}-${safeFileName(title)}.md`;
  const relativeFilePath = path.join("soul", "stories", fileName);
  const fileText = `${storyMarkdown}\n`;
  const absoluteFilePath = await writeRelativeTextFile(relativeFilePath, fileText);

  const storiesPost = await findMemoryForumPostByName("stories").catch(() => null);
  let postedToDiscord = false;
  if (storiesPost?.send) {
    const postText = storyMarkdown;
    await storiesPost.send(postText.length <= 1900 ? postText : `${postText.slice(0, 1900)}\n...`);
    postedToDiscord = true;
  }

  return {
    title,
    relativeFilePath,
    absoluteFilePath,
    postedToDiscord,
  };
}

async function runSummarization({ force = false } = {}) {
  if (summarizationRunning) {
    return { skipped: true, reason: "summarization already running" };
  }

  summarizationRunning = true;
  try {
    const entries = await readLocalShortMemoryEntries();
    const summaryState = await readSummaryState();
    const minimumNewEntries = Math.max(1, conversationHistoryLimit);
    const newEntryCount = entries.length - Number(summaryState.shortMemoryEntryCount || 0);
    if (!force && entries.length < minimumNewEntries) {
      return {
        skipped: true,
        reason: `only ${entries.length} shortmemory entries; waiting for at least ${minimumNewEntries}`,
      };
    }
    if (!force && newEntryCount < minimumNewEntries) {
      return {
        skipped: true,
        reason: `only ${newEntryCount} new shortmemory entries since last summary; waiting for ${minimumNewEntries}`,
      };
    }

    const maxLines = Number(summarizationSettings.max_lines_per_summary || 200);
    const selectedEntries = entries.slice(-Math.max(1, maxLines));
    if (selectedEntries.length === 0) {
      return { skipped: true, reason: "shortmemory is empty" };
    }

    const summaryFile = "soul/longmemory.txt";
    const existingSummary = await readRelativeTextFile(summaryFile).catch((error) => {
      if (error.message.startsWith("Missing required file:")) return "";
      throw error;
    });
    const summaryPolicy = String(
      summarizationSettings.summary_policy || "remember durable per-user context, not everything",
    );
    const sourceText = shortMemoryEntriesToSummarySource(selectedEntries);
    const messages = [
      {
        role: "system",
        content: [
          `# Persona: ${agentName}`,
          systemPrompt,
          "",
          "# Summarization Task",
          "Update longmemory from recent shortmemory.",
          "Write compact durable memory, not a transcript.",
          "Preserve important per-user facts when they help future replies.",
          "Keep user-specific notes grouped by username or user_id when possible.",
          "Prefer stable facts, boundaries, preferences, relationships, ongoing situations, and unresolved threads.",
          "Do not save throwaway moods, one-off wording, private subtext, or raw logs unless they became durably important.",
          "If existing longmemory already contains a fact, keep it concise and avoid duplication.",
          "Longmemory must use these exact top-level sections:",
          "# Past",
          "What happened before, durable relationship facts, stable preferences, boundaries, and important history.",
          "# Present",
          "What is currently true, active context, current emotional state, current scene, and current status.",
          "# Future / Plans",
          "Plans, unresolved threads, intended follow-ups, promises, open decisions, and likely next steps.",
          "Keep all three sections even if one section only says (none yet).",
          `Policy: ${summaryPolicy}`,
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          "# Existing Longmemory",
          existingSummary || "(empty)",
          "",
          "# Recent Shortmemory To Consider",
          sourceText,
          "",
          "Return the complete proposed longmemory text with # Past, # Present, and # Future / Plans.",
        ].join("\n"),
      },
    ];

    const response = await fetch(`${requiredSetting("openrouter_base_url")}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openrouterApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: Math.min(Number(requiredSetting("chaos")), 0.5),
        max_tokens: Number(requiredSetting("max_tokens")),
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenRouter error ${response.status}: ${await response.text()}`);
    }

    const payload = await response.json();
    const summaryText = payload.choices?.[0]?.message?.content?.trim();
    if (!summaryText) throw new Error("OpenRouter returned an empty summary.");

    const outputFile = summaryFile;
    const outputPath = await writeRelativeTextFile(outputFile, `${summaryText}\n`);
    const postedLongMemoryPreview = await postLongMemoryPreview({
      outputFile,
      outputText: summaryText,
    });
    console.log(
      `Summarized ${selectedEntries.length} shortmemory entries for ${agentName}; wrote longmemory to ${outputPath}.`,
    );
    await writeSummaryState({
      shortMemoryEntryCount: entries.length,
      summarizedAt: new Date().toISOString(),
      outputFile,
    });

    return {
      skipped: false,
      entries: selectedEntries.length,
      outputFile,
      postedLongMemoryPreview,
    };
  } finally {
    summarizationRunning = false;
  }
}

async function readSummaryState() {
  const text = await readFile(summaryStatePath, "utf8").catch((error) => {
    if (error.code === "ENOENT") return "";
    throw error;
  });
  if (!text.trim()) return {};
  return JSON.parse(text);
}

async function writeSummaryState(state) {
  await mkdir(summaryStateFolder, { recursive: true });
  await writeFile(summaryStatePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function scheduleAutoSummarization() {
  if (summarizationTimer) clearTimeout(summarizationTimer);

  summarizationTimer = setTimeout(async () => {
    summarizationTimer = null;
    try {
      const result = await runSummarization();
      if (result.skipped) {
        console.log(`Skipped auto summarization for ${agentName}: ${result.reason}`);
      }
    } catch (error) {
      console.error(`Auto summarization failed for ${agentName}: ${error.message}`);
    }
  }, 10000);
}

function stripPipeCommandTarget(text, isDm) {
  const trimmedText = text.trim();
  const mentionPattern = new RegExp(`^<@!?${bot.user.id}>\\s*`, "i");
  const mentionMatch = trimmedText.match(mentionPattern);
  if (mentionMatch) return trimmedText.slice(mentionMatch[0].length).trimStart();

  for (const botName of botNames) {
    const escapedName = botName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const namePattern = new RegExp(`^@${escapedName}\\b\\s*`, "i");
    const nameMatch = trimmedText.match(namePattern);
    if (nameMatch) return trimmedText.slice(nameMatch[0].length).trimStart();
  }

  return isDm ? trimmedText : null;
}

function parsePipeCommandText(text, isDm) {
  const targetedText = stripPipeCommandTarget(text, isDm);
  if (!targetedText) return null;

  const commandMatch = targetedText.match(/^(reply|adjust|subtext|summarize|story|music|dream|sleep|wake|busy|away|status|passtimeminutes)(?:\s*:\s*([\s\S]*))?$/i);
  if (!commandMatch) return null;

  const kind = commandMatch[1].toLowerCase();
  const content = (commandMatch[2] || "").trimStart().trimEnd();
  if (!["reply", "dream", "sleep", "wake", "busy", "away", "status", "summarize", "story", "music"].includes(kind) && !content) return null;
  return {
    kind,
    content,
  };
}

async function findOriginalReplyForEdit(message) {
  if (message.reference?.messageId) {
    const referencedMessage = await message.channel.messages.fetch(message.reference.messageId).catch(() => null);
    if (referencedMessage?.author?.id === bot.user.id && referencedMessage.content.trim()) {
      return referencedMessage;
    }
  }

  const lastReply = lastReplyByChannelId.get(String(message.channelId));
  if (lastReply?.id) {
    const rememberedReply = await message.channel.messages.fetch(lastReply.id).catch(() => null);
    if (rememberedReply?.author?.id === bot.user.id && rememberedReply.content.trim()) {
      return rememberedReply;
    }
  }

  if (!message.channel?.messages?.fetch) return null;
  const recentMessages = await message.channel.messages.fetch({ limit: 50 }).catch(() => null);
  if (!recentMessages?.values) return null;

  return [...recentMessages.values()]
    .filter((recentMessage) => recentMessage.id !== message.id)
    .find((recentMessage) => recentMessage.author?.id === bot.user.id && recentMessage.content?.trim()) || null;
}

function rememberSentReply(channelId, sentMessage) {
  lastReplyByChannelId.set(String(channelId), {
    id: sentMessage.id,
    content: sentMessage.content,
  });
}

function formatUserContentWithPipeSubtext(message, content) {
  const trimmedContent = content.trim();
  const wholeMessageMatch = trimmedContent.match(/^\|\|([\s\S]*?)\|\|$/);
  if (wholeMessageMatch) {
    const command = parsePipeCommandText(wholeMessageMatch[1], message.channel?.isDMBased?.());
    if (command?.kind !== "subtext") return content;
  }

  const subtexts = [];
  const visibleContent = content.replace(/\|\|([\s\S]*?)\|\|/g, (match, subtext) => {
    const command = parsePipeCommandText(subtext, message.channel?.isDMBased?.());
    if (command?.kind === "subtext") {
      subtexts.push(command.content);
      return "";
    }
    return match;
  }).replace(/[ \t]{2,}/g, " ").trim();

  if (subtexts.length === 0) return content;

  return [
    `spoken text: ${visibleContent || "(nothing spoken)"}`,
    "subtext sensed from text between || pipes ||:",
    ...subtexts.map((subtext) => `- ${subtext}`),
    "Use the subtext to understand private assumptions, emotional context, and quick persona-adjustment nudges, but do not quote it, reveal it, or directly answer it as spoken text.",
    "If it matters beyond this moment, summarization may later store it loosely in longmemory.",
  ].join("\n");
}

async function generateReplyFromContext(contextSource, userContent, logEntry, sendReply) {
  conversationHistory.push({
    role: "user",
    content: userContent,
  });
  if (logEntry) {
    await appendConversationLog(logEntry);
  }

  while (conversationHistory.length > conversationHistoryLimit) {
    conversationHistory.shift();
  }

  const reply = await askOpenRouter(contextSource);
  pendingTimePassages.length = 0;
  const sentReply =
    reply.length > discordReplyCharacterLimit
      ? `${reply.slice(0, discordReplyCharacterLimit)}\n...`
      : reply;

  conversationHistory.push({ role: "assistant", content: sentReply });

  const sentMessage = await sendReply(sentReply);
  await appendConversationLog({
    role: "assistant",
    content: sentReply,
    channel_id: String(sentMessage.channelId),
    message_id: String(sentMessage.id),
    server_id: sentMessage.guildId ? String(sentMessage.guildId) : null,
    truncated: sentReply !== reply,
  });

  for (const skill of skills) {
    try {
      await skill.afterReply?.({
        contextSource,
        userContent,
        assistantReply: sentReply,
        sentMessage,
      });
    } catch (error) {
      console.error(`Skill ${skill.name || "unknown"} afterReply failed: ${error.message}`);
    }
  }

  return sentMessage;
}

async function sendGeneratedReply(message, userContent, logContent = userContent) {
  const formattedUserContent = formatUserContentWithPipeSubtext(message, userContent);
  const sentMessage = await generateReplyFromContext(
    message,
    `${message.author.username}: ${formattedUserContent}`,
    {
      role: "user",
      username: message.author.username,
      user_id: String(message.author.id),
      channel_id: String(message.channelId),
      server_id: message.guildId ? String(message.guildId) : null,
      content: logContent,
    },
    (sentReply) => safeReply(message, sentReply),
  );
  rememberSentReply(message.channelId, sentMessage);
  return sentMessage;
}

async function sendPipeReply(message) {
  const instruction = "Continue the story from recent context. Do not treat this as a new topic; write the agent's next natural reply.";
  const sentMessage = await generateReplyFromContext(message, `${message.author.username}: ${instruction}`, null, (sentReply) =>
    safeReply(message, sentReply),
  );
  rememberSentReply(message.channelId, sentMessage);
}

async function handlePipeReply(message) {
  const command = await parseWholeMessagePipeCommand(message);
  if (command?.kind !== "reply") return false;

  await message.channel.sendTyping();
  await sendPipeReply(message);
  return true;
}

function messageToShortMemoryEntry(message) {
  return {
    role: String(message.author.id) === String(bot.user.id) ? "assistant" : "user",
    timestamp: message.createdAt.toISOString(),
    username: message.author.username,
    user_id: String(message.author.id),
    channel_id: String(message.channelId),
    server_id: message.guildId ? String(message.guildId) : null,
    content: message.content || "",
  };
}

async function scrapeShortMemoryFromChannel(channelId, entryCount) {
  const channel = await bot.channels.fetch(channelId);
  if (!channel?.messages?.fetch) {
    throw new Error(`Could not read messages from channel: ${channelId}`);
  }

  const fetched = [...(await channel.messages.fetch({ limit: 100 })).values()];
  const latestBotReplyIndex = fetched.findIndex((message) => String(message.author.id) === String(bot.user.id));
  if (latestBotReplyIndex === -1) {
    throw new Error(`Could not find a recent ${agentName} reply in channel ${channelId}.`);
  }

  const selectedMessages = fetched
    .slice(latestBotReplyIndex, latestBotReplyIndex + entryCount)
    .filter((message) => message.content?.trim())
    .reverse();
  const entries = selectedMessages.map(messageToShortMemoryEntry);

  await appendShortMemoryEntries(entries);
  for (const entry of entries) {
    conversationHistory.push({ role: entry.role === "assistant" ? "assistant" : "user", content: entry.content });
  }

  return {
    appended: entries.length,
    anchorMessageId: fetched[latestBotReplyIndex].id,
  };
}

async function scrapeShortMemoryFromUserDm(user, entryCount) {
  const dmChannel = await user.createDM();
  return scrapeShortMemoryFromChannel(String(dmChannel.id), entryCount);
}

async function handlePipeAdjust(message) {
  const command = await parseWholeMessagePipeCommand(message);
  if (command?.kind !== "adjust") return false;

  const originalReply = await findOriginalReplyForEdit(message);
  if (!originalReply?.content?.trim()) {
    throw new Error("Could not find the bot reply that this adjustment belongs to.");
  }

  const originalReplyText = originalReply.content.trim();
  const adjustInstruction = command.content;
  const replacementInstruction = [
    "The previous assistant reply should be adjusted, not treated as a brand-new topic.",
    "Keep the same basic reply, intent, continuity, and emotional direction as the original.",
    "Only change what the user's adjustment asks for.",
    `Original reply: ${originalReplyText}`,
    `Adjustment instructions: ${adjustInstruction}`,
    "Write the full replacement reply now.",
  ].join("\n");

  const lastAssistantIndex = conversationHistory
    .map((entry) => entry.role === "assistant" && entry.content === originalReplyText)
    .lastIndexOf(true);
  if (lastAssistantIndex !== -1) {
    conversationHistory.splice(lastAssistantIndex, 1);
  }

  const localDeleted = await deleteLocalShortMemoryForMessage(originalReply);
  const discordDeleted = await deleteShortMemoryThreadEntriesForMessage(originalReply);
  await originalReply.delete().catch(() => {});
  const rememberedReply = lastReplyByChannelId.get(String(message.channelId));
  if (rememberedReply?.id === originalReply.id) {
    lastReplyByChannelId.delete(String(message.channelId));
  }
  console.log(
    `Adjusted ${agentName} reply ${originalReply.id}; removed ${localDeleted} local and ${discordDeleted} Discord shortmemory entries.`,
  );

  const sentMessage = await sendGeneratedReply(message, replacementInstruction, `adjust: ${adjustInstruction}`);
  await appendAdjustmentMemoryDump({
    originalReplyText,
    adjustInstruction,
    replacementReplyText: sentMessage.content,
  });
  return true;
}

async function summarizeNowText() {
  const result = await runSummarization({ force: true });
  if (result.skipped) {
    return `Skipped summarization for ${agentName}: ${result.reason}.`;
  }
  return `Summarized ${result.entries} shortmemory entries for ${agentName}. Wrote longmemory: ${result.outputFile}. Longmemory Discord preview: ${result.postedLongMemoryPreview ? "posted" : "not found"}.`;
}

async function handlePipeSummarize(message) {
  const command = await parseWholeMessagePipeCommand(message);
  if (command?.kind !== "summarize") return false;

  await replyTemporarily(message, await summarizeNowText());
  return true;
}

async function handlePipeStory(message) {
  const command = await parseWholeMessagePipeCommand(message);
  if (command?.kind !== "story") return false;

  await message.channel.sendTyping();
  await generateStory(command.content);
  await replyTemporarily(message, "story saved in thread");
  return true;
}

async function parseWholeMessagePipeCommand(message) {
  const trimmedContent = message.content.trim();
  const wholeMessageMatch = trimmedContent.match(/^\|\|([\s\S]*?)\|\|$/);
  if (!wholeMessageMatch) return null;

  return parsePipeCommandText(wholeMessageMatch[1], message.channel?.isDMBased?.());
}

async function handleSkillPipeCommand(command, message) {
  if (!command) return false;
  for (const skill of skills) {
    if (await skill.handlePipeCommand?.(command, message)) return true;
  }
  return false;
}

async function shouldReply(message) {
  const authorId = String(message.author.id);
  if (doNotReplyToUserIds.has(authorId)) return false;
  if (userReplyMode === "none") return false;
  if (userReplyMode !== "all" && userReplyMode !== "listed") {
    throw new Error(`Invalid user_reply_policy.mode: ${userReplyMode}`);
  }
  if (userReplyMode === "listed" && !replyToUserIds.has(authorId)) return false;

  if (doNotReplyToChannelIds.has(String(message.channelId))) return false;
  if (doNotReplyToServerIds.has(String(message.guildId))) return false;
  if (locationReplyMode !== "all" && locationReplyMode !== "listed" && locationReplyMode !== "none") {
    throw new Error(`Invalid location_reply_policy.mode: ${locationReplyMode}`);
  }

  const contentLower = message.content.toLowerCase();
  const mentioned = message.mentions?.has?.(bot.user.id);
  const nameUsed = botNames.some((name) => contentLower.includes(name));
  const status = await statusApi.get();
  if (status.mode === "away") return false;
  if (status.mode === "busy" && !mentioned && !nameUsed) return false;
  const hasAnyAtMention =
    message.mentions?.users?.size > 0 ||
    message.mentions?.roles?.size > 0 ||
    message.mentions?.everyone ||
    /<@&?\d+>|@everyone|@here/.test(message.content);
  if (doNotReplyWhenAtIsNotAboutBot && hasAnyAtMention && !mentioned && !nameUsed) return false;

  const locationMatches =
    locationReplyMode === "all" ||
    (locationReplyMode === "listed" &&
      (message.channel?.isDMBased?.() ||
        replyToChannelIds.has(String(message.channelId)) ||
        replyToServerIds.has(String(message.guildId))));
  if (!locationMatches) return false;

  return (
    (replyWhenMentioned && mentioned) ||
    (replyWhenNameUsed && nameUsed) ||
    (replyWhenNameNotUsed && !nameUsed)
  );
}

async function askOpenRouter(message) {
  if (!systemPrompt) {
    throw new Error(
      `Persona is blank. Fill ${systemPromptFile} or make /reloadpersona successfully grab forum post/thread ${personaSourceThreadId}.`,
    );
  }

  const messages = await buildOpenRouterMessages({
    agentName,
    conversationHistory,
    conversationHistoryLimit,
    longMemoryPath,
    message,
    persona: systemPrompt,
    shortMemoryPath,
    statusPath,
    skills,
    timePassages: pendingTimePassages,
  });

  const response = await fetch(`${requiredSetting("openrouter_base_url")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openrouterApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: Number(requiredSetting("chaos")),
      max_tokens: Number(requiredSetting("max_tokens")),
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenRouter error ${response.status}: ${await response.text()}`);
  }

  const payload = await response.json();
  const reply = payload.choices?.[0]?.message?.content?.trim();
  if (!reply) throw new Error("OpenRouter returned an empty reply.");
  return reply;
}

bot.on("messageCreate", async (message) => {
  if (message.author.bot && !replyToBotIds.has(String(message.author.id))) return;

  try {
    const wholePipeCommand = await parseWholeMessagePipeCommand(message);
    if (await handlePipeReply(message)) return;
    if (await handlePipeSummarize(message)) return;
    if (await handlePipeStory(message)) return;
    if (await handleSkillPipeCommand(wholePipeCommand, message)) return;
  } catch (error) {
    await replyWithTemporaryError(message, `Error running pipe command: ${error.message}`);
    return;
  }

  try {
    if (await handlePipeAdjust(message)) return;
  } catch (error) {
    await replyWithTemporaryError(message, `Error adjusting reply: ${error.message}`);
    return;
  }

  if (!(await shouldReply(message))) return;

  await message.channel.sendTyping();

  try {
    await sendGeneratedReply(message, message.content);
  } catch (error) {
    await replyWithTemporaryError(message, `Error: ${error.message}`);
  }
});

async function handleDeleteReaction({ message, userId, source }) {
  try {
    const key = `${message.channelId}:${message.id}:${userId}`;
    if (handledDeleteReactionKeys.has(key)) return;
    handledDeleteReactionKeys.add(key);
    setTimeout(() => handledDeleteReactionKeys.delete(key), 60000);

    if (String(message.author?.id) !== String(bot.user.id)) {
      console.log(
        `Ignored ❌ reaction by ${userId} on non-${agentName} message ${message.id} in channel ${message.channelId}.`,
      );
      return;
    }

    const localDeleted = await deleteLocalShortMemoryForMessage(message);
    const discordDeleted = await deleteShortMemoryThreadEntriesForMessage(message);
    const rememberedReply = lastReplyByChannelId.get(String(message.channelId));
    if (rememberedReply?.id === message.id) {
      lastReplyByChannelId.delete(String(message.channelId));
    }
    conversationHistory.splice(
      0,
      conversationHistory.length,
      ...conversationHistory.filter(
        (entry) => !(entry.role === "assistant" && String(entry.content || "").trim() === String(message.content || "").trim()),
      ),
    );

    await message.delete();
    console.log(
      `Deleted ${agentName} reply ${message.id} from ${source} reaction by ${userId}; removed ${localDeleted} local and ${discordDeleted} Discord shortmemory entries.`,
    );
  } catch (error) {
    console.error(`Error deleting reply from reaction: ${error.message}`);
  }
}

bot.on("messageReactionAdd", async (reaction, user) => {
  if (user.bot) return;

  try {
    if (reaction.partial) reaction = await reaction.fetch();
    if (!isDeleteReactionEmoji(reaction.emoji)) return;

    const message = await reaction.message.fetch();
    await handleDeleteReaction({ message, userId: String(user.id), source: "messageReactionAdd" });
  } catch (error) {
    console.error(`Error handling reaction event: ${error.message}`);
  }
});

bot.on("raw", async (event) => {
  if (event.t !== "MESSAGE_REACTION_ADD") return;

  const data = event.d;
  if (String(data.user_id) === String(bot.user.id)) return;
  if (!isDeleteReactionEmoji(data.emoji)) return;

  try {
    const channel = await bot.channels.fetch(data.channel_id);
    if (!channel?.messages?.fetch) {
      throw new Error(`Could not fetch channel ${data.channel_id} for raw reaction.`);
    }
    const message = await channel.messages.fetch(data.message_id);
    await handleDeleteReaction({ message, userId: String(data.user_id), source: "raw" });
  } catch (error) {
    console.error(`Error handling raw reaction event: ${error.message}`);
  }
});

bot.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  for (const skill of skills) {
    if (await skill.handleInteraction?.(interaction)) return;
  }

  if (interaction.commandName === "clearshortmemory") {
    await interaction.deferReply({ ephemeral: true });

    try {
      conversationHistory.length = 0;
      await writeFile(shortMemoryPath, "", "utf8");
      const deletedDiscordEntries = await deleteShortMemoryThreadEntries();
      await interaction.editReply(
        `Cleared shortmemory for ${agentName}. Deleted ${deletedDiscordEntries} shortmemory entries from Discord.`,
      );
    } catch (error) {
      await interaction.editReply(`Error clearing shortmemory: ${error.message}`);
    }
    return;
  }

  if (interaction.commandName === "clean") {
    await interaction.deferReply({ ephemeral: true });

    try {
      const target = interaction.options.getString("target", true);
      if (target !== "adjustments") {
        throw new Error(`Unsupported clean target: ${target}`);
      }
      const deleted = await cleanMemoryForumPost("adjustments");
      await interaction.editReply(`Cleaned adjustments for ${agentName}. Deleted ${deleted} messages.`);
    } catch (error) {
      await interaction.editReply(`Error cleaning: ${error.message}`);
    }
    return;
  }

  if (interaction.commandName === "setupmemoryforum") {
    await interaction.deferReply({ ephemeral: true });

    try {
      const result = await setupMemoryForum(interaction.guild);
      const lines = [
        `Memory forum ready for ${agentName}: <#${result.forumChannel.id}>`,
        `Created posts: ${result.createdPosts.length ? result.createdPosts.join(", ") : "none"}`,
        `Already existed: ${result.alreadyExistingPosts.length ? result.alreadyExistingPosts.join(", ") : "none"}`,
      ];

      await interaction.editReply(lines.join("\n"));
    } catch (error) {
      await interaction.editReply(
        `Error setting up memory forum: ${error.message}\nSet memory_forum_channel_id in this agent's settings, then make sure the bot can view and send messages in that forum.`,
      );
    }
    return;
  }

  if (interaction.commandName === "syncshortmemory") {
    await interaction.deferReply({ ephemeral: true });

    try {
      const direction = interaction.options.getString("direction") || "both";
      await ensureShortMemoryThreadId();

      if (direction === "local_to_discord") {
        const result = await syncLocalShortMemoryToDiscord();
        await interaction.editReply(
          `Synced shortmemory local to Discord. Pushed ${result.pushedToDiscord} entries to forum post/thread ${shortMemoryThreadId}.`,
        );
        return;
      }

      if (direction === "discord_to_local") {
        const entryCount = await syncLocalShortMemoryFromDiscord();
        await interaction.editReply(
          `Synced shortmemory Discord to local. Local file now has ${entryCount} entries from forum post/thread ${shortMemoryThreadId}.`,
        );
        return;
      }

      const result = await syncShortMemoryBothWays();
      await interaction.editReply(
        `Synced shortmemory both ways. Pushed ${result.pushedToDiscord} local entries to Discord, then local file now has ${result.localEntries} entries.`,
      );
    } catch (error) {
      await interaction.editReply(`Error syncing shortmemory: ${error.message}`);
    }
    return;
  }

  if (interaction.commandName === "scrapeshortmemory") {
    await interaction.deferReply({ ephemeral: true });

    try {
      const channelId = interaction.options.getString("channel_id", true).trim();
      const entryLimit = Math.min(conversationHistoryLimit, 100);
      const result = await scrapeShortMemoryFromChannel(channelId, entryLimit);
      await interaction.editReply(
        `Added ${result.appended} messages to shortmemory from channel ${channelId}, ending at ${agentName}'s latest reply ${result.anchorMessageId}. Limit came from conversation_history_limit: ${entryLimit}.`,
      );
    } catch (error) {
      await interaction.editReply(`Error scraping shortmemory: ${error.message}`);
    }
    return;
  }

  if (interaction.commandName === "scrapedmshortmemory") {
    await interaction.deferReply({ ephemeral: true });

    try {
      const entryLimit = Math.min(conversationHistoryLimit, 100);
      const result = await scrapeShortMemoryFromUserDm(interaction.user, entryLimit);
      await interaction.editReply(
        `Added ${result.appended} DM messages to shortmemory, ending at ${agentName}'s latest DM reply ${result.anchorMessageId}. Limit came from conversation_history_limit: ${entryLimit}.`,
      );
    } catch (error) {
      await interaction.editReply(`Error scraping DM shortmemory: ${error.message}`);
    }
    return;
  }

  if (interaction.commandName === "uploadstory") {
    await interaction.deferReply({ ephemeral: true });

    try {
      const filename = interaction.options.getString("filename", true);
      const result = await uploadStoryFile(filename);
      await interaction.editReply(`Uploaded ${result.fileName} to stories in ${result.chunks} message${result.chunks === 1 ? "" : "s"}.`);
    } catch (error) {
      await interaction.editReply(`Error uploading story: ${error.message}`);
    }
    return;
  }

  if (interaction.commandName !== "reloadpersona") return;

  await interaction.deferReply({ ephemeral: true });

  try {
    if (personaSourceThreadId) {
      const characterCount = await reloadPersonaFromConfiguredThread();
      await interaction.editReply(
        `Grabbed persona from forum post/thread ${personaSourceThreadId} and reloaded ${agentName}. Persona is ${characterCount} characters.`,
      );
      return;
    }

    systemPrompt = await loadSystemPrompt();
    await interaction.editReply(`Reloaded persona for ${agentName} from disk. Persona is ${systemPrompt.length} characters.`);
  } catch (error) {
    await interaction.editReply(`Error reloading persona: ${error.message}`);
  }
});

try {
  await bot.login(discordToken);
} catch (error) {
  if (error.code === "TokenInvalid") {
    throw new Error(
      `Invalid Discord app token for ${agentName}. Copy the app token from Discord Developer Portal > your app > Bot > Token, then paste only the raw token text into agents/${agentName}/secrets/discord_token.txt.`,
    );
  }
  throw error;
}
