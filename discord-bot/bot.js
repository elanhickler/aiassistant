import { createRequire } from "node:module";
import { readFileSync, unlinkSync } from "node:fs";
import { execFile } from "node:child_process";
import { appendFile, mkdir, open, readFile, readdir, rm, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { savePrivateThought } from "./consciousness.js";
import { buildOpenRouterMessages } from "./context.js";
import { readShortMemoryEntries, shortMemoryEntriesToSource } from "./memory.js";
import { semanticMemoryUsageContract } from "./semantic-memory.js";
import {
  createRuntimeSkills,
  implementedOptionalPipeCommandNames,
  normalizeEnabledSkillNames,
  optionalPipeCommandsAllowedWithoutContentNames,
  skillHandlers,
  skillLoadSummary,
  skillName,
} from "./skills/registry.js";

const require = createRequire(import.meta.url);
const execFileAsync = promisify(execFile);
const runtimeFolder = path.dirname(fileURLToPath(import.meta.url));
const { AttachmentBuilder, Client, GatewayIntentBits, Partials } = require("./regenerated/node_modules/discord.js");

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

function mergeSettings(globalSettings, agentSettings) {
  const merged = { ...globalSettings };

  for (const [key, value] of Object.entries(agentSettings)) {
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

async function appendConversationLog(entry) {
  const shortMemoryEntry = { timestamp: new Date().toISOString(), ...entry };
  await appendFile(shortMemoryPath, `${JSON.stringify(shortMemoryEntry)}\n`);
  await appendShortMemoryThread(shortMemoryEntry);
  scheduleDailyMemoryCycleCheck();
}

async function appendShortMemoryEntries(entries) {
  if (entries.length === 0) return 0;

  const existingEntries = await readShortMemoryEntries(shortMemoryPath);
  const existingEntryKeys = new Set(existingEntries.map(shortMemoryEntryKey));
  const newEntries = entries.filter((entry) => !existingEntryKeys.has(shortMemoryEntryKey(entry)));
  if (newEntries.length === 0) return 0;

  const mergedEntries = sortShortMemoryEntries([...existingEntries, ...newEntries]);
  await writeShortMemoryEntries(mergedEntries);
  for (const entry of newEntries) {
    await appendShortMemoryThread(entry);
  }
  return newEntries.length;
}

function requiredSetting(name) {
  if (!(name in settings)) throw new Error(`Missing required setting: ${name}`);
  return settings[name];
}

function nonNegativeIntegerSetting(name, fallbackName = null) {
  const rawValue = name in settings ? settings[name] : (fallbackName ? settings[fallbackName] : undefined);
  const value = Number(rawValue);
  if (!Number.isInteger(value) || value < 0) {
    const source = name in settings ? name : fallbackName;
    throw new Error(`Setting ${source || name} must be a whole number 0 or higher.`);
  }
  return value;
}

function positiveIntegerFromObject(object, name, defaultValue) {
  return positiveIntegerFromNamedObject(object, name, defaultValue, "summarization_settings");
}

function positiveIntegerFromNamedObject(object, name, defaultValue, settingName) {
  const rawValue = object?.[name] ?? defaultValue;
  const value = Number(rawValue);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`Setting ${settingName}.${name} must be a whole number 1 or higher.`);
  }
  return value;
}

const temporaryErrorSeconds = 15;

async function replyWithTemporaryError(message, text) {
  const errorMessage = await safeReply(message, `${text}\n\nmessage will be removed in ${temporaryErrorSeconds} seconds`);
  if (!errorMessage) return;
  setTimeout(() => {
    errorMessage.delete().catch(() => {});
  }, temporaryErrorSeconds * 1000);
}

async function replyTemporarily(message, text, milliseconds = 30000) {
  const reply = await safeReply(message, text);
  if (!reply) return null;
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
    if (!message.channel?.send) {
      console.error(`No channel.send fallback is available in ${message.channelId}; dropping reply text.`);
      return null;
    }
    try {
      return await message.channel.send(text);
    } catch (sendError) {
      console.error(`channel.send failed in ${message.channelId}: ${sendError.message}. Dropping reply text.`);
      return null;
    }
  }
}

function isDeleteReactionEmoji(emoji) {
  const emojiName = String(emoji?.name || "");
  const emojiIdentifier = String(emoji?.identifier || "");
  return emojiName === "\u274C" || emojiName.toLowerCase() === "x" || emojiIdentifier.includes("%E2%9D%8C");
}

function isMemoReactionEmoji(emoji) {
  const emojiName = String(emoji?.name || "");
  const emojiIdentifier = String(emoji?.identifier || "");
  return emojiName === "\u{1F4DD}" ||
    emojiName === "\u270F\uFE0F" ||
    emojiName === "\u270F" ||
    ["memo", "pencil"].includes(emojiName.toLowerCase()) ||
    emojiIdentifier.includes("%F0%9F%93%9D") ||
    emojiIdentifier.includes("%E2%9C%8F");
}

function isRedoReactionEmoji(emoji) {
  const emojiName = String(emoji?.name || "");
  const emojiIdentifier = String(emoji?.identifier || "");
  return emojiName === "\u{1F501}" || emojiName.toLowerCase() === "repeat" || emojiIdentifier.includes("%F0%9F%94%81");
}

function isCodeRefreshReactionEmoji(emoji) {
  const emojiName = String(emoji?.name || "");
  const emojiIdentifier = String(emoji?.identifier || "");
  return emojiName === "\u267B\uFE0F" ||
    emojiName === "\u267B" ||
    emojiName.toLowerCase() === "recycle" ||
    emojiIdentifier.includes("%E2%99%BB");
}

function isRewindReactionEmoji(emoji) {
  const emojiName = String(emoji?.name || "");
  const emojiIdentifier = String(emoji?.identifier || "");
  return emojiName === "\u23EA" ||
    emojiName.toLowerCase() === "rewind" ||
    emojiIdentifier.includes("%E2%8F%AA");
}

function isContinueReactionEmoji(emoji) {
  const emojiName = String(emoji?.name || "");
  const emojiIdentifier = String(emoji?.identifier || "");
  return emojiName === "\u25B6\uFE0F" ||
    emojiName === "\u25B6" ||
    emojiName.toLowerCase() === "arrow_forward" ||
    emojiIdentifier.includes("%E2%96%B6");
}

function isMusicReactionEmoji(emoji) {
  const emojiName = String(emoji?.name || "");
  const emojiIdentifier = String(emoji?.identifier || "");
  return emojiName === "\u{1F3B5}" ||
    emojiName.toLowerCase() === "musical_note" ||
    emojiIdentifier.includes("%F0%9F%8E%B5");
}
function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function withTypingHeartbeat(channel, task) {
  let stopped = false;
  const sendTyping = async () => {
    if (!channel?.sendTyping) return;
    await channel.sendTyping().catch((error) => {
      console.error(`sendTyping failed in ${channel.id || "unknown channel"}: ${error.message}`);
    });
  };

  await sendTyping();
  const timer = setInterval(() => {
    if (!stopped) sendTyping();
  }, 4000);

  try {
    return await task();
  } finally {
    stopped = true;
    clearInterval(timer);
  }
}

function isMissingDiscordResourceError(error) {
  return error?.code === 10008 ||
    error?.status === 404 ||
    /Unknown Message/i.test(String(error?.message || ""));
}

function isDiscordConnectTimeout(error) {
  return error?.name === "ConnectTimeoutError" ||
    error?.cause?.name === "ConnectTimeoutError" ||
    /Connect Timeout Error/i.test(String(error?.message || ""));
}

function formatTemporaryError(prefix, error) {
  if (isDiscordConnectTimeout(error)) {
    return `${prefix}: Discord timed out while the bot was talking to Discord. This is usually temporary, retry is okay.`;
  }
  return `${prefix}: ${error.message}`;
}

function formatErrorForLog(error) {
  const cause = error?.cause ? `\ncaused by: ${error.cause.stack || error.cause.message || error.cause}` : "";
  return `${error?.stack || error}${cause}`;
}

function openRouterProviderOptions() {
  const ignore = (openRouterProviderRouting.ignore || [])
    .map((providerName) => String(providerName).trim())
    .filter(Boolean);
  if (ignore.length === 0) return undefined;
  return { ignore };
}

function countCjkCharacters(text) {
  return (String(text || "").match(/[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/gu) || []).length;
}

function shouldRetryForUnexpectedReplyLanguage(reply) {
  const compactReply = String(reply || "").replace(/\s+/g, "");
  if (!compactReply) return false;
  const cjkCharacters = countCjkCharacters(compactReply);
  return cjkCharacters >= 4 && cjkCharacters / compactReply.length >= 0.15;
}

function shouldRetryForVisibleErrorReply(reply) {
  const normalizedReply = String(reply || "").trim().toLowerCase();
  if (!normalizedReply) return false;
  return [
    /^error[:\s]/,
    /^openrouter\s/,
    /^provider\s/,
    /^upstream\s/,
    /^generation\s+error/,
    /^the application did not respond/,
    /missing authentication header/,
    /returned an empty reply/,
    /fetch failed/,
    /connect timeout/,
    /rate limit/,
    /too many requests/,
    /i (?:can'?t|cannot|won't|will not) (?:comply|assist|provide|continue|respond)/,
    /i'?m sorry,?\s+(?:but\s+)?i (?:can'?t|cannot|won't|will not)/,
    /unable to (?:comply|assist|provide|continue|respond)/,
  ].some((pattern) => pattern.test(normalizedReply));
}

async function deleteDiscordMessageIfExists(message, label) {
  try {
    await message.delete();
    return true;
  } catch (error) {
    if (isMissingDiscordResourceError(error)) {
      console.log(`${label} was already deleted.`);
      return false;
    }
    throw error;
  }
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
  if (error?.name === "ConnectTimeoutError" || String(error?.message || "").includes("Connect Timeout Error")) {
    console.error("Keeping bot process alive after transient Discord connection timeout.");
    return;
  }
  await releaseAgentLock();
  process.exit(1);
});

const agentFolder = path.join("..", "agents", agentName);
const backupFolder = path.join(agentFolder, "backups");
const globalSettingsPath = path.join("..", "settings.jsonc");
const agentSettingsPath = path.join(agentFolder, "settings.jsonc");
const settings = mergeSettings(await loadJson(globalSettingsPath), await loadJson(agentSettingsPath));
const soulFolder = path.join(agentFolder, "soul");
const originPath = path.join(soulFolder, "origin.md");
const originSummaryPath = path.join(soulFolder, "origin_summary.md");
const memorySummaryPath = path.join(soulFolder, "memorysummary.txt");
const legacyMemorySummaryPath = path.join(soulFolder, "longmemory.txt");
const shortMemoryPath = path.join(soulFolder, "shortmemory.jsonl");
const shortMemoryTrashPath = path.join(soulFolder, "trash", "shortmemory-trash.jsonl");
const statusPath = path.join(soulFolder, "status.json");
const rawOpenRouterPath = path.join(soulFolder, "raw.txt");
const rawOpenRouterFolder = path.join(soulFolder, "raw");
const secretsFolder = path.join(agentFolder, "secrets");
const discordToken = await readTextFile(path.join(secretsFolder, "discord_token.txt"));
const openrouterApiKey = await readTextFile(path.join(secretsFolder, "openrouter_api_key.txt"));
const identity = requiredSetting("identity");
const name = String(identity.name);
const mentionRoleIds = new Set((identity.mention_role_ids || []).map((roleId) => String(roleId)));
const model = requiredSetting("model");
const utilityModel = requiredSetting("utility_model");
const openRouterProviderRouting = requiredSetting("openrouter_provider_routing");
const skillAliases = requiredSetting("skill_aliases");
const systemPromptFile = requiredSetting("system_prompt_file");
const globalPersonaFile = String(requiredSetting("global_persona_file"));
const personaSourceThreadId = String(requiredSetting("persona_source_thread_id"));
const useMemoryForumPersonaSource = Boolean(requiredSetting("use_memory_forum_persona_source"));
const accessThreadId = String(requiredSetting("access_thread_id"));
const discordInviteUrl = String(requiredSetting("discord_invite_url"));
let shortMemoryThreadId = String(requiredSetting("shortmemory_thread_id"));
const memoryForumChannelId = String(requiredSetting("memory_forum_channel_id"));
const memoryForumPosts = requiredSetting("memory_forum_posts").map((postName) => String(postName));
if (!memoryForumChannelId) {
  throw new Error(
    `Missing required memory_forum_channel_id for ${agentName}. Create a Discord forum channel for this agent's memory, copy the forum channel ID, and paste it into agents/${agentName}/settings.jsonc.`,
  );
}
const systemPromptPath = path.join(agentFolder, systemPromptFile);
const globalPersonaPath = path.join("..", globalPersonaFile);

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

async function loadSystemPrompt({ allowEmpty = false } = {}) {
  const agentPrompt = await readTextFile(systemPromptPath);
  const globalPrompt = await readTextFile(globalPersonaPath);
  if (!agentPrompt && !allowEmpty) throw new Error(`Persona file is empty: ${systemPromptPath}`);
  if (!globalPrompt) throw new Error(`Global persona file is empty: ${globalPersonaPath}`);
  const prompt = [agentPrompt, formatGlobalPersonaDefaults(globalPrompt)].filter((part) => part.trim()).join("\n\n");
  return prompt;
}
let systemPrompt = await loadSystemPrompt({ allowEmpty: Boolean(personaSourceThreadId) });

const locationReplyPolicy = requiredSetting("location_reply_policy");
const locationReplyMode = String(locationReplyPolicy.mode);
const onlyAllowRepliesToSpecificChannels = Boolean(
  locationReplyPolicy.only_allow_replies_to_specific_channels,
);
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
const controlUserIds = new Set(requiredSetting("control_user_ids").map((userId) => String(userId)));
const botReplyPolicy = requiredSetting("bot_reply_policy");
const replyToBotIds = new Set(botReplyPolicy.reply_to_bot_ids.map((botId) => String(botId)));
const replyToWebhooks = Boolean(botReplyPolicy.reply_to_webhooks);
const recentContextEntries = nonNegativeIntegerSetting("recent_context_entries", "conversation_history_limit");
const conversationHistoryLimit = recentContextEntries;
const secondsBeforeReply = Number(requiredSetting("seconds_before_reply"));
const discordReplyCharacterLimit = Number(requiredSetting("discord_reply_character_limit"));
const naturalTimeSettings = requiredSetting("natural_time_settings");
const agentTimeDebug = requiredSetting("agent_time_debug");
const summarizationSettings = requiredSetting("summarization_settings");
const shortMemoryTrashSettings = requiredSetting("shortmemory_trash");
const dailyMemoryCycleSettings = requiredSetting("daily_memory_cycle");
const consciousnessCycleSettings = requiredSetting("consciousness_cycle");
const originSummarySettings = requiredSetting("origin_summary_settings");
const intentTriggers = requiredSetting("intent_triggers");
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
const pendingReplyEditsByChannelId = new Map();
const handledDeleteReactionKeys = new Set();
const handledReactionActionKeys = new Set();
let agentWorkQueue = Promise.resolve();
let queuedAgentWorkCount = 0;
let dailyMemoryCycleTimer = null;
let dailyMemoryCycleCheckTimer = null;
let summarizationRunning = false;

async function enqueueAgentWork(label, work) {
  queuedAgentWorkCount += 1;
  const queuedAhead = Math.max(0, queuedAgentWorkCount - 1);
  if (queuedAhead > 0) {
    console.log(`Queued ${agentName} agent work (${label}); ${queuedAhead} job(s) already waiting/running.`);
  }

  const run = agentWorkQueue
    .catch((error) => {
      console.error(`Previous queued agent work failed before ${label}: ${error.message}`);
    })
    .then(async () => {
      try {
        return await work();
      } finally {
        queuedAgentWorkCount = Math.max(0, queuedAgentWorkCount - 1);
      }
    });

  agentWorkQueue = run.catch((error) => {
    console.error(`Queued agent work failed (${label}): ${error.message}`);
  });

  return run;
}

function normalizedSkillAliases() {
  const aliases = {};
  for (const [canonicalName, aliasList] of Object.entries(skillAliases || {})) {
    const canonical = String(canonicalName || "").trim().toLowerCase();
    if (!canonical || !Array.isArray(aliasList)) continue;
    aliases[canonical] = aliasList
      .map((alias) => String(alias || "").trim().toLowerCase())
      .filter(Boolean);
  }
  return aliases;
}

const normalizedPipeAliases = normalizedSkillAliases();

function aliasesForCommand(commandName) {
  return normalizedPipeAliases[String(commandName || "").toLowerCase()] || [];
}

function canonicalPipeCommandName(commandName) {
  const requestedName = String(commandName || "").trim().toLowerCase();
  for (const [canonicalName, aliases] of Object.entries(normalizedPipeAliases)) {
    if (aliases.includes(requestedName)) return canonicalName;
  }
  return requestedName;
}

function pipeRowsWithAliases(agentCommandName, commandName, suffix, description) {
  const commandNames = [commandName, ...aliasesForCommand(commandName)];
  return commandNames.map((name, index) => [
    `||${agentCommandName} ${name}${suffix}||`,
    index === 0 ? description : `Alias for ${commandName}.`,
  ]);
}

async function clearRawOpenRouterFolder() {
  await mkdir(rawOpenRouterFolder, { recursive: true });
  const entries = await readdir(rawOpenRouterFolder, { withFileTypes: true }).catch((error) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  for (const entry of entries) {
    await rm(path.join(rawOpenRouterFolder, entry.name), {
      recursive: entry.isDirectory(),
      force: true,
      maxRetries: 3,
      retryDelay: 100,
    });
  }
}

async function writeRawOpenRouterText(messages, source = "unknown") {
  const writtenAt = new Date().toISOString();
  const safeSource = safeBackupName(source).toLowerCase();
  await clearRawOpenRouterFolder();

  const manifest = [
    `source: ${source}`,
    `written_at: ${writtenAt}`,
    `parts: ${messages.length}`,
    "",
  ].join("\n");
  const partTexts = [];
  await writeFile(path.join(rawOpenRouterFolder, "000-manifest.txt"), manifest, "utf8");
  partTexts.push(["# 000-manifest.txt", manifest].join("\n"));

  for (const [index, message] of messages.entries()) {
    const role = String(message.role || "unknown");
    const partNumber = String(index + 1).padStart(3, "0");
    const partName = `${partNumber}-${safeBackupName(role).toLowerCase() || "message"}.txt`;
    const text = [
      `source: ${source}`,
      `written_at: ${writtenAt}`,
      `part: ${index + 1}/${messages.length}`,
      `role: ${role}`,
      "",
      String(message.content || ""),
      "",
    ].join("\n");
    await writeFile(path.join(rawOpenRouterFolder, partName), text, "utf8");
    partTexts.push([`# ${partName}`, text].join("\n"));
  }

  const concatenated = [
    `source: ${source}`,
    `written_at: ${writtenAt}`,
    `raw_folder: ${path.relative(agentFolder, rawOpenRouterFolder)}`,
    `source_slug: ${safeSource}`,
    "",
    ...partTexts,
    "",
  ].join("\n\n");
  await writeFile(rawOpenRouterPath, concatenated, "utf8");
}

function backupTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function safeBackupName(text) {
  return String(text || "file").replace(/[^a-z0-9._-]+/gi, "_").replace(/^_+|_+$/g, "").slice(0, 80) || "file";
}

async function backupFileBeforeOverwrite(filePath, reason) {
  const existing = await readFile(filePath).catch((error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (!existing || existing.length === 0) return null;

  await mkdir(backupFolder, { recursive: true });
  const relativeName = safeBackupName(path.relative(agentFolder, filePath));
  const backupName = `${backupTimestamp()}-${safeBackupName(reason)}-${relativeName}`;
  const backupPath = path.join(backupFolder, backupName);
  await writeFile(backupPath, existing);
  return backupPath;
}

function parseBackupTimestampFromName(name) {
  const match = String(name || "").match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})(?:-(\d{3}))?Z(?:-|$)/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second, millisecond = "000"] = match;
  const time = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
    Number(millisecond),
  );
  return Number.isFinite(time) ? time : null;
}

function backupCleanupSettings() {
  const cleanup = settings.consciousness?.cleanup || {};
  const retentionDays = Math.max(1, Number.parseInt(cleanup.backup_retention_days ?? 7, 10) || 7);
  return {
    retentionDays,
    moveExpiredBackupsToOsTrash: cleanup.move_expired_backups_to_os_trash !== false,
    permanentlyDeleteExpiredBackups: cleanup.permanently_delete_expired_backups === true,
  };
}

function assertDirectBackupChild(targetPath) {
  const resolvedBackupFolder = path.resolve(backupFolder);
  const resolvedTarget = path.resolve(targetPath);
  if (path.dirname(resolvedTarget) !== resolvedBackupFolder) {
    throw new Error(`Refusing to clean non-backup path: ${targetPath}`);
  }
}

async function moveBackupToOsTrash(targetPath) {
  if (process.platform !== "win32") {
    throw new Error("OS trash cleanup is only implemented for Windows in this build.");
  }
  const script = [
    "$target = $args[0]",
    "Add-Type -AssemblyName Microsoft.VisualBasic",
    "$item = Get-Item -LiteralPath $target -Force",
    "if ($item.PSIsContainer) {",
    "  [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($item.FullName, 'OnlyErrorDialogs', 'SendToRecycleBin')",
    "} else {",
    "  [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($item.FullName, 'OnlyErrorDialogs', 'SendToRecycleBin')",
    "}",
  ].join("\n");
  await execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script, targetPath], {
    windowsHide: true,
  });
}

async function cleanupExpiredBackups() {
  const {
    retentionDays,
    moveExpiredBackupsToOsTrash,
    permanentlyDeleteExpiredBackups,
  } = backupCleanupSettings();
  const report = {
    retentionDays,
    checked: 0,
    eligible: 0,
    movedToTrash: 0,
    permanentlyDeleted: 0,
    skipped: 0,
    failed: 0,
    failures: [],
  };

  const entries = await readdir(backupFolder, { withFileTypes: true }).catch((error) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

  for (const entry of entries) {
    report.checked += 1;
    const timestampMs = parseBackupTimestampFromName(entry.name);
    if (timestampMs === null) {
      report.skipped += 1;
      continue;
    }

    const targetPath = path.join(backupFolder, entry.name);
    assertDirectBackupChild(targetPath);
    const stats = await stat(targetPath).catch((error) => {
      report.failed += 1;
      report.failures.push({ path: targetPath, error: error.message });
      return null;
    });
    if (!stats) continue;

    const isExpiredBackup = timestampMs < cutoff && stats.mtimeMs < cutoff;
    if (!isExpiredBackup) {
      report.skipped += 1;
      continue;
    }

    report.eligible += 1;
    try {
      if (permanentlyDeleteExpiredBackups) {
        await rm(targetPath, { recursive: stats.isDirectory(), force: true });
        report.permanentlyDeleted += 1;
      } else if (moveExpiredBackupsToOsTrash) {
        await moveBackupToOsTrash(targetPath);
        report.movedToTrash += 1;
      } else {
        report.skipped += 1;
      }
    } catch (error) {
      report.failed += 1;
      report.failures.push({ path: targetPath, error: error.message });
    }
  }

  console.log(
    `Backup cleanup for ${agentName}: checked ${report.checked}, eligible ${report.eligible}, moved to OS trash ${report.movedToTrash}, permanently deleted ${report.permanentlyDeleted}, skipped ${report.skipped}, failed ${report.failed}.`,
  );
  if (report.failed > 0) {
    console.error(`Backup cleanup failures for ${agentName}: ${JSON.stringify(report.failures)}`);
  }
  return report;
}

async function readRawOpenRouterText() {
  return readFile(rawOpenRouterPath, "utf8").catch((error) => {
    if (error.code === "ENOENT") return "";
    throw error;
  });
}

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

const enabledSkills = normalizeEnabledSkillNames(requiredSetting("enabled_skills"));
const allowedStatusModes = new Set(["awake", "sleepy", "falling_asleep", "sleeping", "dreaming", "away"]);

function clampNumber(value, minimum, maximum, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(maximum, Math.max(minimum, number));
}

function defaultAwarenessForMode(mode) {
  if (mode === "sleeping") return 0;
  if (mode === "dreaming") return 0.15;
  if (mode === "falling_asleep") return 0.25;
  if (mode === "sleepy") return 0.55;
  if (mode === "awake") return 1;
  return 0.8;
}

function normalizeStatus(status) {
  const mode = String(status.mode || "awake");
  const sleepPlannedMinutes = Number(status.sleep_planned_minutes);
  const sleepNeededMinutes = Number(status.sleep_needed_minutes);
  const sleepRemainingMinutes = Number(status.sleep_remaining_minutes);
  const sleepInterruptedMinutes = Number(status.sleep_interrupted_minutes);
  return {
    ...status,
    status: {
      ...(status.status || {}),
      ...statusFlagsForMode(mode),
    },
    awareness: clampNumber(status.awareness, 0, 1, defaultAwarenessForMode(mode)),
    sleep_needed_minutes: Number.isFinite(sleepNeededMinutes)
      ? Math.max(0, Math.round(sleepNeededMinutes))
      : (Number.isFinite(sleepPlannedMinutes) ? Math.max(0, Math.round(sleepPlannedMinutes)) : status.sleep_needed_minutes),
    sleep_remaining_minutes: Number.isFinite(sleepRemainingMinutes)
      ? Math.round(sleepRemainingMinutes)
      : status.sleep_remaining_minutes,
    sleep_interrupted_minutes: Number.isFinite(sleepInterruptedMinutes)
      ? Math.max(0, Math.round(sleepInterruptedMinutes))
      : 0,
  };
}

async function readStatus() {
  const status = normalizeStatus(await loadJson(statusPath));
  if (!allowedStatusModes.has(String(status.mode))) {
    throw new Error(`Invalid status.mode in ${statusPath}: ${status.mode}`);
  }
  return status;
}

async function writeStatus(status) {
  if (!allowedStatusModes.has(String(status.mode))) {
    throw new Error(`Invalid status.mode: ${status.mode}`);
  }
  await writeFile(statusPath, `${JSON.stringify(normalizeStatus(status), null, 2)}\n`, "utf8");
}

function addMinutesToIsoDateTime(value, minutes) {
  const baseDate = value ? new Date(value) : new Date();
  const date = Number.isNaN(baseDate.getTime()) ? new Date() : baseDate;
  return new Date(date.getTime() + minutes * 60 * 1000).toISOString();
}

function statusFlagsForMode(mode) {
  return {
    awake: mode === "awake",
    sleepy: mode === "sleepy",
    falling_asleep: mode === "falling_asleep",
    sleeping: mode === "sleeping",
    dreaming: mode === "dreaming",
    away: mode === "away",
  };
}

function readableStatusText(status) {
  const explicitStatus = String(status.discord_status_text || "").trim();
  if (explicitStatus) return explicitStatus;

  const activity = String(status.current_activity || "").trim();
  if (activity) return activity;

  const mode = String(status.mode || "").trim();
  if (mode === "falling_asleep") return "falling asleep";
  if (mode === "sleeping") return "asleep";
  if (mode === "dreaming") return "dreaming";
  if (mode === "sleepy") return "sleepy";
  if (mode === "away") return "away";
  if (mode === "awake") return "awake";
  return "status unknown";
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
        ...statusFlagsForMode(mode),
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
    `awareness: ${nextStatus.awareness ?? ""}`,
    `energy: ${nextStatus.energy ?? ""}`,
    `current_activity: ${nextStatus.current_activity || ""}`,
    `sleep_needed_minutes: ${nextStatus.sleep_needed_minutes ?? ""}`,
    `sleep_remaining_minutes: ${nextStatus.sleep_remaining_minutes ?? ""}`,
    `sleep_interrupted_minutes: ${nextStatus.sleep_interrupted_minutes ?? ""}`,
    `last_wake_style: ${nextStatus.last_wake_style || ""}`,
    `current_datetime: ${nextStatus.current_datetime || ""}`,
    `last_time_update_at: ${nextStatus.last_time_update_at || ""}`,
    `last_time_passed_minutes: ${nextStatus.last_time_passed_minutes ?? ""}`,
    `last_time_passed_reason: ${nextStatus.last_time_passed_reason || ""}`,
    `last_time_passed_source: ${nextStatus.last_time_passed_source || ""}`,
    `total_experienced_minutes: ${nextStatus.total_experienced_minutes ?? ""}`,
    `discord_status_text: ${nextStatus.discord_status_text || ""}`,
    `discord_status_mood: ${nextStatus.discord_status_mood || ""}`,
    `discord_status_visibility_note: ${nextStatus.discord_status_visibility_note || ""}`,
    `discord_status_updated_at: ${nextStatus.discord_status_updated_at || ""}`,
    `discord_status_source: ${nextStatus.discord_status_source || ""}`,
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

function statusSourceForTimePassage(source) {
  return source === "natural language" ? "natural time passage" : "time passage";
}

async function addTimePassage(minutes, sleepTimerAdjustment = null, options = {}) {
  if (!Number.isInteger(minutes) || minutes < 1) {
    throw new Error("minutes must be a whole number greater than 0.");
  }

  const reason = String(options.reason || "").trim();
  const source = String(options.source || "manual");
  const recordedAt = new Date().toISOString();
  pendingTimePassages.push({
    minutes,
    recordedAt,
    reason,
    source,
  });
  await appendConversationLog({
    role: "system",
    content: `${agentName} experiences ${minutes} minutes of time passing before the next reply.${reason ? ` Reason: ${reason}` : ""}`,
  });

  const previousStatus = await readStatus();
  const energy = Number(previousStatus.energy);
  const sleepLikeMode = previousStatus.mode === "falling_asleep" || previousStatus.mode === "sleeping" || previousStatus.mode === "dreaming";
  const energyGain = sleepLikeMode
    ? Math.max(1, Math.floor(minutes / 6))
    : 0;
  const remainingSleepMinutes = Number(previousStatus.sleep_remaining_minutes);
  const nextStatus = {
    ...previousStatus,
    energy: Number.isFinite(energy) ? Math.min(100, energy + energyGain) : previousStatus.energy,
    current_datetime: addMinutesToIsoDateTime(previousStatus.current_datetime, minutes),
    last_time_update_at: recordedAt,
    last_time_passed_minutes: minutes,
    last_time_passed_reason: reason,
    last_time_passed_source: source,
    total_experienced_minutes: Math.max(0, Number(previousStatus.total_experienced_minutes) || 0) + minutes,
    last_time_passage_minutes: minutes,
    last_time_passage_at: recordedAt,
  };

  if (
    sleepLikeMode &&
    Number.isFinite(remainingSleepMinutes)
  ) {
    const adjustmentMinutes = Number(sleepTimerAdjustment?.minutes || 0);
    const nextRemainingSleepMinutes = remainingSleepMinutes - minutes - adjustmentMinutes;
    nextStatus.sleep_remaining_minutes = nextRemainingSleepMinutes;
    if (previousStatus.mode === "falling_asleep" && minutes > 0 && nextRemainingSleepMinutes > 0) {
      nextStatus.mode = "sleeping";
      nextStatus.status = {
        ...(nextStatus.status || {}),
        ...statusFlagsForMode("sleeping"),
      };
      nextStatus.current_activity = String(nextStatus.current_activity || "").toLowerCase().includes("falling asleep")
        ? "asleep"
        : (nextStatus.current_activity || "asleep");
      nextStatus.last_status_change = new Date().toISOString();
    }
    if (sleepTimerAdjustment) {
      nextStatus.last_sleep_timer_adjustment_minutes = adjustmentMinutes;
      nextStatus.last_sleep_timer_adjustment_reason = String(sleepTimerAdjustment.reason || "");
    }
    if (nextRemainingSleepMinutes <= 0) {
      const wokeMinutesAgo = Math.abs(nextRemainingSleepMinutes);
      nextStatus.mode = "awake";
      nextStatus.status = {
        ...(nextStatus.status || {}),
        ...statusFlagsForMode("awake"),
      };
      nextStatus.woke_minutes_ago = wokeMinutesAgo;
      nextStatus.current_activity = wokeMinutesAgo > 0
        ? `woke up ${wokeMinutesAgo} minutes ago after sleeping`
        : "just woke up after sleeping";
      nextStatus.last_status_change = new Date().toISOString();
    }
  }

  await writeStatus(nextStatus);
  await appendStatusMemoryDump(previousStatus, nextStatus, statusSourceForTimePassage(source));
  return nextStatus;
}

let skills = [];
const skillContext = {
  addTimePassage,
  agentName,
  bot,
  agentFolder,
  conversationHistoryLimit,
  findMemoryForumPostByName,
  getSkills: () => skills,
  legacyMemorySummaryPath,
  longMemoryPath: memorySummaryPath,
  memorySummaryPath,
  model,
  openrouterApiKey,
  replyTemporarily,
  requiredSetting,
  runDailySummarization: async () => {
    const result = await runSummarizationMaintenance({ force: true, source: "sleep" });
    return result.summary;
  },
  readableStatusText,
  safeReply,
  shortMemoryPath,
  statusApi,
  systemPrompt: () => systemPrompt,
  utilityModel,
  writeRawOpenRouterText,
};
skills = createRuntimeSkills(enabledSkills, skillContext);
console.log(`Loaded skills for ${agentName}: ${skillLoadSummary(skills)}`);

async function runSkillHook(hookName, hookContext) {
  for (const { skill, hook } of skillHandlers(skills, hookName)) {
    try {
      await hook(hookContext);
    } catch (error) {
      console.error(`Skill hook ${hookName} failed for ${skillName(skill)}: ${error.message}`);
    }
  }
}

function skillCommands() {
  return skills.flatMap((skill) => {
    if (!skill.command) return [];
    return Array.isArray(skill.command) ? skill.command : [skill.command];
  });
}

async function handleSkillInteraction(interaction) {
  const commandNames = new Set(skillCommands().map((command) => command.name));
  if (!commandNames.has(interaction.commandName)) return false;
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ ephemeral: true });
  }

  for (const { skill, hook } of skillHandlers(skills, "handleInteraction")) {
    try {
      const handled = await enqueueAgentWork(`skill interaction ${interaction.commandName}`, () => hook(interaction));
      if (handled) return true;
    } catch (error) {
      const text = `Error running ${skillName(skill)} command: ${error.message}`;
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(text).catch(() => {});
      } else {
        await interaction.reply({ content: text, ephemeral: true }).catch(() => {});
      }
      return true;
    }
  }
  return false;
}

async function userCanControlBot(interaction) {
  if (controlUserIds.size === 0) return true;
  return controlUserIds.has(String(interaction.user?.id || ""));
}

async function rejectUnauthorizedControl(interaction) {
  const text = `Only approved control users can run ${agentName} slash commands.`;
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(text).catch(() => {});
  } else {
    await interaction.reply({ content: text, ephemeral: true }).catch(() => {});
  }
}

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
          name: "setupmemoryforum",
          description: "Create or populate this agent's memory forum posts.",
        },
        {
          name: "raw",
          description: "Show the latest OpenRouter text uploaded by this agent.",
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
        ...skillCommands(),
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

  try {
    const characterCount = await reloadPersonaFromDiscordSource();
    if (characterCount) {
      console.log(`Loaded persona for ${agentName} from Discord persona source: ${characterCount} characters.`);
    } else {
      console.log(`Loaded persona for ${agentName} from disk: ${systemPrompt.length} characters.`);
    }
  } catch (error) {
    console.error(`Could not load persona from Discord persona source: ${error.message}`);
    console.log(`Keeping persona for ${agentName} from disk: ${systemPrompt.length} characters.`);
  }

  try {
    const result = await syncOriginFromDiscordSource();
    if (result.synced) {
      console.log(
        `Synced origin for ${agentName}: wrote ${result.originFile}, summary ${result.summaryUpdated ? "updated" : "unchanged"}.`,
      );
    } else {
      console.log(`Origin sync skipped for ${agentName}: ${result.reason}`);
    }
  } catch (error) {
    console.error(`Could not sync origin from Discord origin post: ${error.message}`);
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
    try {
      await skill.onReady?.();
    } catch (error) {
      console.error(`Skill ${skill.name || "unknown"} onReady failed: ${error.message}`);
    }
  }
  scheduleDailyMemoryCycleCheck(1000);
  scheduleDailyMemoryCycle();
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
  await backupFileBeforeOverwrite(systemPromptPath, "reloadpersona");
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

async function reloadPersonaFromDiscordSource() {
  if (personaSourceThreadId) return reloadPersonaFromConfiguredThread();
  if (!useMemoryForumPersonaSource) return null;

  const personaPost = await findMemoryForumPostByName("persona").catch(() => null);
  if (!personaPost) return null;
  return saveAndReloadPersona(await threadToPersonaText(personaPost));
}

async function writeTextFileIfChanged(filePath, text, backupReason) {
  const nextText = text.endsWith("\n") ? text : `${text}\n`;
  const existingText = await readFile(filePath, "utf8").catch((error) => {
    if (error.code === "ENOENT") return "";
    throw error;
  });
  if (existingText === nextText) return false;

  await mkdir(path.dirname(filePath), { recursive: true });
  if (existingText) await backupFileBeforeOverwrite(filePath, backupReason);
  await writeFile(filePath, nextText, "utf8");
  return true;
}

async function summarizeOriginText(originText, existingSummary) {
  const messages = [
    {
      role: "system",
      content: [
        `# Persona: ${agentName}`,
        systemPrompt,
        "",
        "# Origin Summary Task",
        "Rewrite the origin/backstory source material into a rich but still compact durable lore summary.",
        "This summary will be sent in normal model requests, so keep it much shorter than the source, but do not flatten away the memorable details.",
        String(originSummarySettings.summary_policy || "preserve memorable lore and roleplay hooks, not just a tiny abstract"),
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        "# Existing Origin Summary",
        existingSummary || "(empty)",
        "",
        "# Full Origin Source",
        originText,
        "",
        "Return the complete compact origin summary.",
      ].join("\n"),
    },
  ];
  await writeRawOpenRouterText(messages, "origin summarization");

  const response = await fetch(`${requiredSetting("openrouter_base_url")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openrouterApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: Math.min(Number(requiredSetting("chaos")), 0.4),
      max_tokens: Number(originSummarySettings.max_tokens || 2200),
      provider: openRouterProviderOptions(),
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenRouter error ${response.status}: ${await response.text()}`);
  }

  const payload = await response.json();
  const summaryText = payload.choices?.[0]?.message?.content?.trim();
  if (!summaryText) throw new Error("OpenRouter returned an empty origin summary.");
  return summaryText;
}

async function syncOriginFromDiscordSource() {
  const originPost = await findMemoryForumPostByName("origin").catch(() => null);
  if (!originPost) return { synced: false, reason: "no origin memory forum post found" };

  let originText;
  try {
    originText = await threadToPersonaText(originPost);
  } catch (error) {
    if (String(error.message || "").includes("did not contain usable persona text")) {
      return { synced: false, reason: "origin post is empty" };
    }
    throw error;
  }

  const originChanged = await writeTextFileIfChanged(originPath, originText, "origin-sync");
  const existingSummary = await readFile(originSummaryPath, "utf8").catch((error) => {
    if (error.code === "ENOENT") return "";
    throw error;
  });
  let summaryUpdated = false;
  if (originChanged || !existingSummary.trim()) {
    console.log(
      `Regenerating origin summary for ${agentName}: originChanged=${originChanged}, existingSummaryCharacters=${existingSummary.trim().length}.`,
    );
    const summaryText = await summarizeOriginText(originText, existingSummary.trim());
    summaryUpdated = await writeTextFileIfChanged(originSummaryPath, summaryText, "origin-summary");
  }

  return {
    synced: true,
    originChanged,
    summaryUpdated,
    originFile: path.relative(agentFolder, originPath).replace(/\\/g, "/"),
    summaryFile: path.relative(agentFolder, originSummaryPath).replace(/\\/g, "/"),
  };
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
  if (entry.edited_at) lines.push(`edited_at: ${entry.edited_at}`);
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

  const entries = sortShortMemoryEntries(
    messages
      .map((message) => parseShortMemoryThreadEntry(message.content))
      .filter(Boolean),
  );

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
      if (await deleteDiscordMessageIfExists(message, `Shortmemory entry ${message.id}`)) {
        deleted += 1;
      }
    }

    before = batch.last().id;
    if (batch.size < 100) break;
  }

  return deleted;
}

async function readLocalShortMemoryEntries() {
  return readShortMemoryEntries(shortMemoryPath);
}

function shortMemoryTimestamp(entry) {
  const timestamp = Date.parse(entry.timestamp || "");
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function sortShortMemoryEntries(entries) {
  return [...entries].sort((left, right) => {
    const timestampDifference = shortMemoryTimestamp(left) - shortMemoryTimestamp(right);
    if (timestampDifference !== 0) return timestampDifference;
    return String(left.message_id || "").localeCompare(String(right.message_id || ""));
  });
}

async function writeShortMemoryEntries(entries) {
  const sortedEntries = sortShortMemoryEntries(entries);
  await backupFileBeforeOverwrite(shortMemoryPath, "shortmemory-overwrite");
  await writeFile(
    shortMemoryPath,
    sortedEntries.length ? `${sortedEntries.map((entry) => JSON.stringify(entry)).join("\n")}\n` : "",
    "utf8",
  );
}

async function readShortMemoryTrashEntries() {
  const text = await readFile(shortMemoryTrashPath, "utf8").catch((error) => {
    if (error.code === "ENOENT") return "";
    throw error;
  });
  const entries = [];
  const lines = text.split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line));
    } catch (error) {
      throw new Error(`shortmemory trash line ${index + 1} is not valid JSONL: ${error.message}`);
    }
  }
  return entries;
}

async function writeShortMemoryTrashEntries(entries) {
  await mkdir(path.dirname(shortMemoryTrashPath), { recursive: true });
  await backupFileBeforeOverwrite(shortMemoryTrashPath, "shortmemory-trash-overwrite");
  await writeFile(
    shortMemoryTrashPath,
    entries.length ? `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n` : "",
    "utf8",
  );
}

function shortMemoryTrashMeta(entry) {
  const meta = entry.trash && typeof entry.trash === "object" && !Array.isArray(entry.trash) ? entry.trash : {};
  return meta;
}

async function ageShortMemoryTrashAfterAutomaticCycle() {
  const keepCycles = positiveIntegerFromNamedObject(
    shortMemoryTrashSettings,
    "keep_auto_summary_cycles",
    7,
    "shortmemory_trash",
  );
  const entries = await readShortMemoryTrashEntries();
  if (entries.length === 0) {
    return { before: 0, kept: 0, deleted: 0 };
  }

  const agedEntries = entries.map((entry) => {
    const meta = shortMemoryTrashMeta(entry);
    return {
      ...entry,
      trash: {
        ...meta,
        trash_age_cycles: Number(meta.trash_age_cycles || 0) + 1,
        last_aged_by: "automatic memory cycle",
        last_aged_at: new Date().toISOString(),
      },
    };
  });
  const keptEntries = agedEntries.filter((entry) => {
    const cycles = Number(shortMemoryTrashMeta(entry).trash_age_cycles || 0);
    return cycles < keepCycles;
  });
  await writeShortMemoryTrashEntries(keptEntries);
  const deleted = agedEntries.length - keptEntries.length;
  console.log(
    `Shortmemory trash cleanup for ${agentName}: aged ${agedEntries.length}, kept ${keptEntries.length}, deleted ${deleted}; keep_auto_summary_cycles=${keepCycles}.`,
  );
  return { before: entries.length, kept: keptEntries.length, deleted };
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
    await writeShortMemoryEntries(keptEntries);
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
      if (await deleteDiscordMessageIfExists(threadMessage, `Shortmemory entry ${threadMessage.id}`)) {
        deleted += 1;
      }
    }

    before = batch.last().id;
    if (batch.size < 100) break;
  }

  return deleted;
}

async function updateLocalShortMemoryForMessage(message, replacementContent) {
  return updateLocalShortMemoryForMessageSnapshot({
    channelId: message.channelId,
    messageId: message.id,
    content: message.content,
  }, replacementContent);
}

async function updateLocalShortMemoryForMessageSnapshot(snapshot, replacementContent) {
  const entries = await readLocalShortMemoryEntries();
  let updated = 0;
  const updatedEntries = entries.map((entry) => {
    const idMatches = snapshot.messageId && String(entry.message_id || "") === String(snapshot.messageId);
    const contentMatches =
      String(entry.channel_id || "") === String(snapshot.channelId || "") &&
      String(entry.content || "").trim() === String(snapshot.content || "").trim();
    if (!idMatches && !contentMatches) return entry;
    updated += 1;
    return {
      ...entry,
      content: replacementContent,
      edited_at: new Date().toISOString(),
    };
  });

  if (updated > 0) {
    await writeShortMemoryEntries(updatedEntries);
  }

  return updated;
}

async function updateShortMemoryThreadEntriesForMessage(message, replacementContent) {
  return updateShortMemoryThreadEntriesForMessageSnapshot({
    channelId: message.channelId,
    messageId: message.id,
    content: message.content,
  }, replacementContent);
}

async function updateShortMemoryThreadEntriesForMessageSnapshot(snapshot, replacementContent) {
  await ensureShortMemoryThreadId();

  const shortMemoryThread = await bot.channels.fetch(shortMemoryThreadId);
  if (!shortMemoryThread?.messages?.fetch) {
    throw new Error(`Could not read shortmemory forum post/thread: ${shortMemoryThreadId}`);
  }

  let updated = 0;
  let before;

  for (;;) {
    const batch = await shortMemoryThread.messages.fetch({ limit: 100, before });
    if (batch.size === 0) break;

    for (const threadMessage of batch.values()) {
      const entry = parseShortMemoryThreadEntry(threadMessage.content);
      if (!entry) continue;
      const idMatches = snapshot.messageId && String(entry.message_id || "") === String(snapshot.messageId);
      const contentMatches =
        String(entry.channel_id || "") === String(snapshot.channelId || "") &&
        String(entry.content || "").trim() === String(snapshot.content || "").trim();
      if (!idMatches && !contentMatches) continue;
      const nextEntry = {
        ...entry,
        content: replacementContent,
        edited_at: new Date().toISOString(),
      };
      await threadMessage.edit(formatShortMemoryThreadEntry(nextEntry));
      updated += 1;
    }

    before = batch.last().id;
    if (batch.size < 100) break;
  }

  return updated;
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

  await writeShortMemoryEntries(entries);
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
  ["origin", "Full editable origin, backstory, and lore source material. On startup, non-empty text here mirrors to local soul/origin.md and is summarized into soul/origin_summary.md for regular context."],
  ["music", "Music links, listening preferences, and song references."],
  ["adjustments", "Audit log of reply adjustments requested by the user."],
  ["status", "Current agent status changes, activity state, energy, and sleep or away logs."],
  ["profilepic", "Profile picture ideas, references, and avatar notes."],
  ["memorysummary", "Compact active durable memory sent to the model as context."],
  ["longmemory", "Legacy memorysummary post name. Kept readable for older agents during migration."],
  ["shortmemory", "Recent conversation memory. Discord should be treated as the authority when configured."],
  ["dreams", "Dream output, associative fragments, and sleep-cycle creative notes."],
  ["thoughts", "First-person internal thoughts, softer than memory, used later to support stories, dreams, and end-of-day memory work."],
  ["art", "Art notes, references, prompts, and visual style memory."],
  ["stories", "Story notes, scenes, lore, drafts, and narrative memory."],
]);

function helpCommandLists() {
  const agentCommandName = `@${agentName.toLowerCase()}`;
  const slashCommands = [
    ["/reloadpersona", "Reload persona."],
    ["/clearshortmemory", "Clear local/live/Discord shortmemory."],
    ["/setupmemoryforum", "Create missing memory posts."],
    ["/raw", "Show the latest OpenRouter text uploaded by this agent."],
    ["/syncshortmemory direction", "Sync local and Discord shortmemory."],
    ["/scrapeshortmemory channel_id", "Scrape readable channel history into timestamp-sorted shortmemory."],
    ["/scrapedmshortmemory", "Scrape readable DM history into timestamp-sorted shortmemory."],
    ["/uploadstory filename", "Upload a local soul/stories Markdown story to the stories thread."],
  ];
  const pipeCommands = [
    [`||${agentCommandName} reply||`, "Reply to the last non-reply message without adding this command to shortmemory."],
    [`||${agentCommandName} continue||`, "Continue from recent context without adding this command to shortmemory."],
    [`||${agentCommandName} continue: text||`, "Continue with one-time instructions without adding this command to shortmemory."],
    [`||${agentCommandName} adjust: text||`, "Redo the previous bot reply with adjustment instructions; deletes the old bot reply and its assistant shortmemory entry."],
    [`||${agentCommandName} summarize||`, "Create a durable memory entry, update memorysummary from shortmemory and consciousness artifacts, then clear temporary thoughts."],
    [`||${agentCommandName} story||`, "Write a first-person story from saved stories, shortmemory, thoughts, journals, neural memory if present, and memorysummary."],
    [`||${agentCommandName} story: text||`, "Write a first-person story using extra instructions. Creativity, realism, style, chaos, or numbers are one-time guidance only."],
    [`||${agentCommandName} subtext: text||`, "Private assumptions/persona nudges; loosely stored later by memory updates."],
    [`||${agentCommandName} sleep||`, "Set sleeping."],
    [`||${agentCommandName} wake||`, "Set awake."],
    [`||${agentCommandName} away||`, "Set away."],
    [`||${agentCommandName} state||`, "Show the current readable status."],
    [`||${agentCommandName} status||`, "Generate a natural-language status update from memory and current state."],
    [`||${agentCommandName} status: text||`, "Generate a natural-language status update using text as the basis or suggested status."],
    [`||${agentCommandName} passtimeminutes: 60||`, "Pass time in minutes."],
    [`||${agentCommandName} passtimehours: 8||`, "Pass time in hours."],
    [`||${agentCommandName} dream||`, "Dream from context, thoughts, journals, and previous dreams; requires sleeping."],
    [`||${agentCommandName} dream: text||`, "Dream from seed text; requires sleeping. Chaos, creativity, realism, symbolism, or numbers are one-time guidance only."],
  ];

  for (const { hook } of skillHandlers(skills, "getPipeHelp")) {
    const rows = hook({ agentCommandName, pipeRowsWithAliases }) || [];
    pipeCommands.push(...rows);
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
  const agentCommandName = `@${agentName.toLowerCase()}`;
  const sections = [
    [
      "**Slash Commands**",
      "",
      "* These control commands only work for approved control users.",
      "",
      ...slashCommands.map(([command, description]) => `* \`${command}\` : ${description}`),
    ].join("\n"),
    [
      "**Pipe Commands**",
      "",
      `* Server use : \`${agentCommandName}\`, the bot name, or the bot mention.`,
      `* DM use : \`${agentCommandName}\` is optional.`,
      "",
      ...pipeCommands.map(([command, description]) => `* \`${command}\` : ${description}`),
    ].join("\n"),
    [
      "**Emoji Reactions**",
      "",
      "* `\u274C` / `:x:` : Delete a bot reply and remove its matching assistant shortmemory entry.",
      "* `\u{1F501}` / `:repeat:` : Delete the bot reply from memory, then redo a fresh reply to the previous user message.",
      "* `\u23EA` / `:rewind:` : Delete a bot reply, remove that reply from shortmemory, and remove the previous user message from shortmemory only.",
      "* `\u{1F4DD}` / `:pencil:` : Temporarily reply `your next reply replaces the content of my last reply`, then use your next message as a technical edit of that bot reply and update shortmemory.",
      "* `\u25B6\uFE0F` / `:arrow_forward:` : Continue from the current scene without adding a pipe command to shortmemory.",
      "* `\u267B\uFE0F` / `:recycle:` : Refresh a bot reply using the current code, useful after formatting changes.",
      "* `\u{1F3B5}` / `:musical_note:` : Run the music skill from recent shortmemory and post a formatted music link.",
    ].join("\n"),
  ];
  if (discordInviteUrl) {
    sections.push([
      "**Invite Link**",
      "",
      `* ${agentName} : ${discordInviteUrl}`,
    ].join("\n"));
  }
  return sections;
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
    const personaPost = forumPosts.get("persona");
    if (personaPost) await deleteBotPersonaMirrorChunks(personaPost);
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
  const helpSectionTitles = new Set(["**Slash Commands**", "**Pipe Commands**", "**Emoji Reactions**", "**Invite Link**"]);
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

async function deleteBotPersonaMirrorChunks(personaPost) {
  if (!personaPost?.messages?.fetch) return false;

  const messages = await personaPost.messages.fetch({ limit: 100 });
  const deletions = [];
  for (const message of messages.values()) {
    if (message.author?.id !== bot.user.id) continue;
    const firstLine = String(message.content || "").split(/\r?\n/, 1)[0];
    if (firstLine === "**Persona**") deletions.push(message.delete().catch(() => {}));
  }
  if (deletions.length > 0) {
    await Promise.all(deletions);
    console.log(`Deleted ${deletions.length} old bot-authored persona mirror chunk(s) for ${agentName}.`);
  }
  return deletions.length > 0;
}

async function findMemoryForumPostByName(postName) {
  const { forumChannel } = await resolveMemoryForum();
  const forumPosts = await fetchForumPostsByName(forumChannel);
  return forumPosts.get(normalizeForumPostName(postName)) || null;
}

async function deleteMemoryForumPostReplies(postName) {
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

async function postMemorySummaryPreview({ outputFile, outputText }) {
  const post = await findMemoryForumPostByName("memorysummary").catch(() => null)
    || await findMemoryForumPostByName("longmemory").catch(() => null);
  if (!post?.send) return false;

  const previewLimit = 1200;
  const preview = outputText.length > previewLimit ? `${outputText.slice(0, previewLimit)}\n...` : outputText;
  const message = [
    "latest_memorysummary:",
    `timestamp: ${new Date().toISOString()}`,
    `agent: ${agentName}`,
    `local_file: ${outputFile}`,
    `characters: ${outputText.length}`,
    "kind: memorysummary update",
    "",
    "full_memory_location:",
    "The full memorysummary is only stored in the local txt/md file listed above. Discord is only a preview/notice because Discord posts have text limits.",
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

async function readMemorySummaryText() {
  return readRelativeTextFile("soul/memorysummary.txt").catch((error) => {
    if (error.message.startsWith("Missing required file:")) {
      return readRelativeTextFile("soul/longmemory.txt").catch((legacyError) => {
        if (legacyError.message.startsWith("Missing required file:")) return "";
        throw legacyError;
      });
    }
    throw error;
  });
}

async function writeRelativeTextFile(relativeFilePath, text) {
  const absoluteFilePath = path.join(agentFolder, relativeFilePath);
  await mkdir(path.dirname(absoluteFilePath), { recursive: true });
  await backupFileBeforeOverwrite(absoluteFilePath, `overwrite-${path.basename(relativeFilePath)}`);
  await writeFile(absoluteFilePath, text, "utf8");
  return absoluteFilePath;
}

async function writeMemoryEntry({ source, selectedEntries, summaryText }) {
  const now = new Date().toISOString();
  const fileName = `${backupTimestamp()}-${safeBackupName(source)}-memory.md`;
  const relativeFilePath = `soul/memory/${fileName}`;
  const entryText = [
    "---",
    `created_at: ${now}`,
    `agent: ${agentName}`,
    `source: ${source}`,
    `shortmemory_entries_included_count: ${selectedEntries.length}`,
    "kind: memory entry",
    "---",
    "",
    "# Memory",
    "",
    summaryText.trim(),
    "",
  ].join("\n");
  const filePath = await writeRelativeTextFile(relativeFilePath, entryText);
  return { filePath, relativeFilePath };
}

async function verifyReadableFile(filePath, label) {
  const text = await readFile(filePath, "utf8");
  if (!text.trim()) throw new Error(`${label} was written but is empty: ${filePath}`);
  return text;
}

function containedAgentPath(relativeFilePath) {
  const resolvedAgentFolder = path.resolve(agentFolder);
  const resolvedPath = path.resolve(agentFolder, String(relativeFilePath));
  if (resolvedPath !== resolvedAgentFolder && !resolvedPath.startsWith(`${resolvedAgentFolder}${path.sep}`)) {
    throw new Error(`Path escapes agent folder: ${relativeFilePath}`);
  }
  return resolvedPath;
}

async function readRecentMemoryFiles(relativeFolderPath, filePattern, limit, maxCharactersPerFile) {
  const folderPath = containedAgentPath(relativeFolderPath);
  const entries = await readdir(folderPath, { withFileTypes: true }).catch((error) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  const files = entries
    .filter((entry) => entry.isFile() && filePattern.test(entry.name))
    .map((entry) => path.join(folderPath, entry.name))
    .sort()
    .slice(-limit);

  const sourceFiles = [];
  for (const filePath of files) {
    const text = (await readFile(filePath, "utf8")).trim();
    sourceFiles.push({
      relativeFilePath: path.relative(agentFolder, filePath).replace(/\\/g, "/"),
      text: text.length <= maxCharactersPerFile ? text : `${text.slice(0, maxCharactersPerFile)}\n...`,
    });
  }
  return sourceFiles;
}

function formatSourceFilesForSummary(sourceFiles, emptyText = "(empty)") {
  if (!sourceFiles.length) return emptyText;
  return sourceFiles
    .map((sourceFile) => [`# ${sourceFile.relativeFilePath}`, sourceFile.text].join("\n"))
    .join("\n\n");
}

function clampThoughtInfluence(value, fallback) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return fallback;
  return Math.min(1, Math.max(0, numericValue));
}

function formatThoughtInfluenceScale() {
  const scale = settings.thought_influence_scale || {};
  if (typeof scale === "string") return scale.trim();
  if (scale && typeof scale === "object" && !Array.isArray(scale)) {
    return Object.entries(scale)
      .sort(([left], [right]) => Number(left) - Number(right))
      .map(([key, value]) => `${key}: ${String(value)}`)
      .join("\n");
  }
  return "";
}

function thoughtInfluenceControl(processName, fallbackInfluence) {
  const processSettings = settings[processName] || {};
  const useThoughts = processSettings.use_thoughts !== false;
  return {
    influence: clampThoughtInfluence(processSettings.thought_influence, fallbackInfluence),
    scaleText: formatThoughtInfluenceScale(),
    useThoughts,
  };
}

function formatThoughtInfluenceInstruction(processLabel, control) {
  if (!control.useThoughts) {
    return `${processLabel} thought influence: private thoughts are disabled for this process. Do not use private thoughts as evidence.`;
  }
  return [
    `${processLabel} thought influence: ${control.influence}`,
    "Interpret this value using the editable thought_influence_scale below. If the value falls between listed scale points, interpolate naturally.",
    control.scaleText || "(thought_influence_scale is empty)",
  ].join("\n");
}

async function readConsciousnessSummaryArtifacts() {
  const dreamSettings = settings.dream_settings || {};
  const memoryLayersSettings = settings.memory_layers || {};
  const thoughts = await readRecentMemoryFiles(
    dreamSettings.thoughts_folder || "soul/consciousness/thoughts",
    /\.(md|txt)$/i,
    80,
    4000,
  );
  const journals = await readRecentMemoryFiles(
    dreamSettings.journals_folder || "soul/consciousness/journals",
    /\.(md|txt)$/i,
    40,
    5000,
  );
  const dreams = await readRecentMemoryFiles(
    dreamSettings.output_folder || "soul/dreams",
    /\.(md|txt)$/i,
    40,
    5000,
  );
  const stories = await readRecentMemoryFiles(
    "soul/stories",
    /\.(md|txt)$/i,
    40,
    5000,
  );
  const neuralMemory = await readRecentMemoryFiles(
    memoryLayersSettings.folder || "soul/memory-layers",
    /^layer-\d+\.jsonl$/i,
    5,
    10000,
  ).catch((error) => [{
    relativeFilePath: memoryLayersSettings.folder || "soul/memory-layers",
    text: `(neural memory unavailable: ${error.message})`,
    unavailable: true,
  }]);
  const neuralMemoryNodeCount = neuralMemory
    .filter((file) => !file.unavailable)
    .reduce((count, file) => count + file.text.split(/\r?\n/).filter(Boolean).length, 0);

  return {
    thoughts,
    journals,
    dreams,
    stories,
    neuralMemory,
    counts: {
      thoughts: thoughts.length,
      journals: journals.length,
      dreams: dreams.length,
      stories: stories.length,
      neuralMemoryNodes: neuralMemoryNodeCount,
    },
  };
}

async function backupAndClearThoughtsAfterSummary() {
  const folderPath = containedAgentPath(settings.dream_settings?.thoughts_folder || "soul/consciousness/thoughts");
  const entries = await readdir(folderPath, { withFileTypes: true }).catch((error) => {
    if (error.code === "ENOENT") return { deleted: 0, backupPath: null };
    throw error;
  });
  const files = entries
    .filter((entry) => entry.isFile() && /\.(md|txt)$/i.test(entry.name))
    .map((entry) => path.join(folderPath, entry.name))
    .sort();
  if (files.length === 0) return { deleted: 0, backupPath: null };

  const backupTextParts = [];
  for (const filePath of files) {
    backupTextParts.push([
      `# ${path.relative(agentFolder, filePath).replace(/\\/g, "/")}`,
      await readFile(filePath, "utf8"),
    ].join("\n"));
  }
  await mkdir(backupFolder, { recursive: true });
  const backupPath = path.join(
    backupFolder,
    `${backupTimestamp()}-clear-thoughts-soul_consciousness_thoughts.md`,
  );
  await writeFile(backupPath, backupTextParts.join("\n\n---\n\n"), "utf8");

  for (const filePath of files) {
    await rm(filePath, { force: true });
  }
  return { deleted: files.length, backupPath };
}

async function runSummarization({ force = false, source = "manual" } = {}) {
  if (summarizationRunning) {
    return { skipped: true, reason: "summarization already running" };
  }

  summarizationRunning = true;
  try {
    const entries = await readLocalShortMemoryEntries();
    const summaryState = await readSummaryState();
    const dailySummaryEntries = positiveIntegerFromObject(summarizationSettings, "daily_summary_entries", 1000);
    const minimumNewEntries = dailySummaryEntries;
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

    const selectedEntries = entries.slice(-dailySummaryEntries);
    const memorySummaryThoughtControl = thoughtInfluenceControl("memorysummary_update", 0.5);
    const consciousnessArtifacts = await readConsciousnessSummaryArtifacts();
    if (!memorySummaryThoughtControl.useThoughts) {
      consciousnessArtifacts.thoughts = [];
      consciousnessArtifacts.counts.thoughts = 0;
    }
    const hasConsciousnessArtifacts = Object.values(consciousnessArtifacts.counts)
      .some((count) => Number(count) > 0);
    if (selectedEntries.length === 0 && !hasConsciousnessArtifacts) {
      return { skipped: true, reason: "shortmemory and consciousness artifacts are empty" };
    }

    const summaryFile = "soul/memorysummary.txt";
    const existingSummary = await readMemorySummaryText();
    const summaryPolicy = String(
      summarizationSettings.summary_policy || "remember durable per-user context, not everything",
    );
    const consciousnessDescriptors = requiredSetting("consciousness_descriptors");
    const memoryDescriptor = String(consciousnessDescriptors.memory || "").trim();
    const memorySummaryDescriptor = String(
      consciousnessDescriptors.memorysummary || consciousnessDescriptors.summary || "",
    ).trim();
    if (!memorySummaryDescriptor) {
      throw new Error("Missing consciousness_descriptors.memorysummary.");
    }
    const sourceText = shortMemoryEntriesToSource(selectedEntries);
    const messages = [
      {
        role: "system",
        content: [
          `# Persona: ${agentName}`,
          systemPrompt,
          "",
          "# Summarization Task",
          memoryDescriptor ? `Memory entry descriptor:\n${memoryDescriptor}` : "",
          "",
          `Memorysummary descriptor:\n${memorySummaryDescriptor}`,
          "",
          `Create a durable memory entry and update memorysummary from recent shortmemory as part of ${source} memory maintenance.`,
          "Write compact durable memorysummary, not a transcript.",
          "Memorysummary should preserve what should affect future replies: stable facts, relationship truths, recurring preferences, important boundaries, unresolved plans, and lasting changes.",
          "Preserve important per-user facts when they help future replies.",
          "Keep user-specific notes grouped by username or user_id when possible.",
          "Prefer stable facts, boundaries, preferences, relationships, ongoing situations, and unresolved threads.",
          "Use private thoughts only when memorysummary_update.use_thoughts is enabled. Use journals, dreams, stories, and neural memory as evidence, but do not dump them into memorysummary.",
          formatThoughtInfluenceInstruction("Memorysummary update", memorySummaryThoughtControl),
          semanticMemoryUsageContract(),
          "Absorb useful temporary thoughts into durable memory only when they reveal stable patterns or important unresolved context.",
          "Journals, dreams, and stories are durable source artifacts. Do not mark them for deletion.",
          "Do not save throwaway moods, one-off wording, private subtext, raw logs, or every dream/story detail unless they became durably important.",
          "If existing memorysummary already contains a fact, keep it concise and avoid duplication.",
          "Memorysummary must use these exact top-level sections:",
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
          "# Existing Memorysummary",
          existingSummary || "(empty)",
          "",
          "# Recent Shortmemory To Consider",
          sourceText || "(empty)",
          "",
          "# Temporary Thoughts To Absorb If Useful",
          memorySummaryThoughtControl.useThoughts
            ? formatSourceFilesForSummary(consciousnessArtifacts.thoughts)
            : "(disabled by memorysummary_update.use_thoughts)",
          "",
          "# Durable Journals To Consider",
          formatSourceFilesForSummary(consciousnessArtifacts.journals),
          "",
          "# Durable Dreams To Consider",
          formatSourceFilesForSummary(consciousnessArtifacts.dreams),
          "",
          "# Durable Stories To Consider",
          formatSourceFilesForSummary(consciousnessArtifacts.stories),
          "",
          "# Neural Memory If Available",
          formatSourceFilesForSummary(consciousnessArtifacts.neuralMemory),
          "",
          "Return the complete proposed memorysummary text with # Past, # Present, and # Future / Plans.",
        ].join("\n"),
      },
    ];
    await writeRawOpenRouterText(messages, "summarization");

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
        provider: openRouterProviderOptions(),
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
    const memoryEntry = await writeMemoryEntry({ source, selectedEntries, summaryText });
    await verifyReadableFile(outputPath, "memorysummary");
    await verifyReadableFile(memoryEntry.filePath, "memory entry");
    const postedMemorySummaryPreview = await postMemorySummaryPreview({
      outputFile,
      outputText: summaryText,
    });
    const clearedThoughts = await backupAndClearThoughtsAfterSummary().catch((error) => {
      console.error(`Could not clear thoughts after summarization: ${error.message}`);
      return { deleted: 0, backupPath: null, error: error.message };
    });
    const deletedAdjustmentMessages = await deleteMemoryForumPostReplies("adjustments").catch((error) => {
      console.error(`Could not clean adjustments after summarization: ${error.message}`);
      return 0;
    });
    console.log(
      `Created memory entry and updated memorysummary for ${agentName} from ${source}; read back ${outputPath} and ${memoryEntry.filePath}; cleared ${clearedThoughts.deleted || 0} thoughts; cleaned ${deletedAdjustmentMessages} adjustment messages.`,
    );
    await runSkillHook("afterSummary", {
      entries: selectedEntries,
      outputFile,
      outputPath,
      selectedEntryCount: selectedEntries.length,
      sourceText,
      summarizedAt: new Date().toISOString(),
      summaryText,
      consciousnessArtifacts,
      clearedThoughts,
      memoryEntryFile: memoryEntry.relativeFilePath,
    });
    await writeSummaryState({
      shortMemoryEntryCount: entries.length,
      summarizedAt: new Date().toISOString(),
      outputFile,
      memoryEntryFile: memoryEntry.relativeFilePath,
    });

    return {
      skipped: false,
      entries: selectedEntries.length,
      outputFile,
      postedMemorySummaryPreview,
      memoryEntryFile: memoryEntry.relativeFilePath,
      deletedAdjustmentMessages,
      clearedThoughtsDeleted: clearedThoughts.deleted || 0,
      clearedThoughtsBackupPath: clearedThoughts.backupPath || null,
    };
  } finally {
    summarizationRunning = false;
  }
}

async function runSummarizationMaintenance({ force = false, source = "manual", ageTrash = false } = {}) {
  const summary = await runSummarization({ force, source });
  if (summary.skipped) return { summary, trashCleanup: null, backupCleanup: null };

  const trashCleanup = ageTrash ? await ageShortMemoryTrashAfterAutomaticCycle() : null;
  const backupCleanup = await cleanupExpiredBackups().catch((error) => {
    console.error(`Backup cleanup failed safely for ${agentName}: ${error.message}`);
    return { error: error.message };
  });
  return { summary, trashCleanup, backupCleanup };
}

function consciousnessCycleTargetEntries() {
  const secondsPerMessage = positiveIntegerFromNamedObject(
    consciousnessCycleSettings,
    "seconds_per_message",
    300,
    "consciousness_cycle",
  );
  const cycleHours = positiveIntegerFromNamedObject(
    consciousnessCycleSettings,
    "cycle_hours",
    24,
    "consciousness_cycle",
  );
  return Math.max(1, Math.ceil((cycleHours * 60 * 60) / secondsPerMessage));
}

function stableMemoryLayerHash(value) {
  let hash = 0;
  const text = String(value || "");
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(16).padStart(8, "0").slice(0, 16);
}

function jsonl(records) {
  return records.length ? `${records.map((record) => JSON.stringify(record)).join("\n")}\n` : "";
}

async function refreshNeuralMemoryLayerZero(entries) {
  const memoryLayersSettings = settings.memory_layers || {};
  const outputFolder = containedAgentPath(memoryLayersSettings.folder || "soul/memory-layers");
  await mkdir(outputFolder, { recursive: true });
  const createdAt = new Date().toISOString();
  const records = entries.map((entry, index) => ({
    id: `layer-0-${String(index).padStart(6, "0")}-${stableMemoryLayerHash(JSON.stringify(entry))}`,
    kind: "raw_shortmemory",
    layer: 0,
    layer_name: "Raw Memory",
    created_at: createdAt,
    source_file: "soul/shortmemory.jsonl",
    source_index: index,
    source_count: 1,
    source: `soul/shortmemory.jsonl#${index}`,
    compressed: String(entry.content || "").slice(0, 900),
    upscale_direction: "Use as exact recent conversational context when relevant. Preserve speaker, timing, and wording carefully.",
    do_not_invent: "Do not infer unstated facts beyond this raw shortmemory entry.",
    confidence: 1,
    reality: String(entry.content || "").slice(0, 900),
    fantasy: "",
    summary: String(entry.content || "").slice(0, 900),
    importance: 0,
    entry,
  }));
  await writeFile(path.join(outputFolder, "layer-0.jsonl"), jsonl(records), "utf8");
  await appendFile(path.join(outputFolder, "build-log.jsonl"), jsonl([{
    timestamp: createdAt,
    agent: agentName,
    source: "consciousness-cycle",
    layer_0_entries: records.length,
    note: "Automatic cycle refreshed layer-0 only. Run npm.cmd run memorylayers for full model semantic downscale.",
    use_in_context: Boolean(memoryLayersSettings.use_in_context),
  }]), "utf8");
  return { skipped: false, layer0Entries: records.length, outputFolder };
}

async function runConsciousnessCycle({ source = "auto-cycle" } = {}) {
  const entries = await readLocalShortMemoryEntries();
  const summaryState = await readSummaryState();
  const targetEntries = consciousnessCycleTargetEntries();
  const lastCycleEntryCount = Number(summaryState.consciousnessCycleShortMemoryEntryCount || 0);
  const newEntryCount = entries.length - lastCycleEntryCount;

  if (entries.length === 0) {
    return { skipped: true, reason: "shortmemory is empty", targetEntries, newEntryCount: 0 };
  }
  if (newEntryCount <= 0) {
    return { skipped: true, reason: "no new memory entries since last consciousness cycle", targetEntries, newEntryCount };
  }
  if (newEntryCount < targetEntries) {
    return {
      skipped: true,
      reason: `only ${newEntryCount} new memory entries since last consciousness cycle; waiting for ${targetEntries}`,
      targetEntries,
      newEntryCount,
    };
  }

  const recentEntries = entries.slice(-Math.max(targetEntries, positiveIntegerFromObject(summarizationSettings, "daily_summary_entries", 1000)));
  const results = {
    skipped: false,
    targetEntries,
    newEntryCount,
    neuralMemory: null,
    journal: null,
    dream: null,
    summary: null,
    trashCleanup: null,
  };

  results.neuralMemory = await refreshNeuralMemoryLayerZero(recentEntries).catch((error) => ({
    skipped: true,
    error: error.message,
  }));

  const journalSkill = skills.find((skill) => typeof skill.runConsciousnessCycleJournal === "function");
  if (journalSkill) {
    results.journal = await journalSkill.runConsciousnessCycleJournal(
      "Daily consciousness cycle: write a first-person journal from the recent day of interaction before summarization clears temporary thoughts.",
    ).catch((error) => ({ error: error.message }));
    if (results.journal?.error) {
      console.error(`Consciousness cycle journal failed for ${agentName}: ${results.journal.error}`);
    }
  } else {
    results.journal = { skipped: true, reason: "journal skill hook unavailable" };
  }

  const timeSkill = skills.find((skill) => typeof skill.runConsciousnessCycleDream === "function");
  if (timeSkill) {
    results.dream = await timeSkill.runConsciousnessCycleDream(
      "Daily consciousness cycle dream. Use the day's thoughts, journal, recent memory, durable memory, and mood. Make it first-person, symbolic, and emotionally meaningful.",
    ).catch((error) => ({ error: error.message }));
    if (results.dream?.error) {
      console.error(`Consciousness cycle dream failed for ${agentName}: ${results.dream.error}`);
    }
  } else {
    results.dream = { skipped: true, reason: "dream hook unavailable" };
  }

  const maintenance = await runSummarizationMaintenance({ force: true, source, ageTrash: true });
  results.summary = maintenance.summary;
  results.trashCleanup = maintenance.trashCleanup;
  results.backupCleanup = maintenance.backupCleanup;
  if (!results.summary?.skipped) {
    await writeSummaryState({
      ...(await readSummaryState()),
      consciousnessCycleShortMemoryEntryCount: entries.length,
      consciousnessCycleCompletedAt: new Date().toISOString(),
      consciousnessCycleTargetEntries: targetEntries,
      consciousnessCycleSource: source,
    });
  }
  return results;
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

function dailyMemoryCycleBackupMilliseconds() {
  const hours = positiveIntegerFromNamedObject(
    dailyMemoryCycleSettings,
    "automatic_cycle_hours",
    24,
    "daily_memory_cycle",
  );
  return hours * 60 * 60 * 1000;
}

function scheduleDailyMemoryCycleCheck(delay = 10000) {
  if (dailyMemoryCycleCheckTimer) clearTimeout(dailyMemoryCycleCheckTimer);
  dailyMemoryCycleCheckTimer = setTimeout(async () => {
    dailyMemoryCycleCheckTimer = null;
    try {
      const result = await enqueueAgentWork("consciousness cycle check", () =>
        runConsciousnessCycle({ source: "auto-consciousness-cycle" })
      );
      if (result.skipped) {
        console.log(`Skipped consciousness cycle for ${agentName}: ${result.reason}`);
      } else {
        console.log(
          `Consciousness cycle for ${agentName}: target ${result.targetEntries}, new entries ${result.newEntryCount}, memory entries processed ${result.summary?.entries || 0}, thoughts cleared ${result.summary?.clearedThoughtsDeleted || 0}, backups moved to OS trash ${result.backupCleanup?.movedToTrash || 0}, backups permanently deleted ${result.backupCleanup?.permanentlyDeleted || 0}.`,
        );
      }
    } catch (error) {
      console.error(`Consciousness cycle check failed for ${agentName}: ${error.message}`);
    }
  }, delay);
}

function scheduleDailyMemoryCycle() {
  if (dailyMemoryCycleTimer) clearTimeout(dailyMemoryCycleTimer);
  const delay = dailyMemoryCycleBackupMilliseconds();
  dailyMemoryCycleTimer = setTimeout(async () => {
    dailyMemoryCycleTimer = null;
    try {
      const result = await enqueueAgentWork("daily consciousness cycle backup check", () =>
        runConsciousnessCycle({ source: "auto-consciousness-cycle" })
      );
      if (result.skipped) {
        console.log(`Skipped daily consciousness cycle for ${agentName}: ${result.reason}`);
      } else {
        console.log(
          `Daily consciousness cycle for ${agentName}: target ${result.targetEntries}, new entries ${result.newEntryCount}, memory entries processed ${result.summary?.entries || 0}, shortmemory trash deleted ${result.trashCleanup?.deleted || 0}, backups moved to OS trash ${result.backupCleanup?.movedToTrash || 0}, backups permanently deleted ${result.backupCleanup?.permanentlyDeleted || 0}.`,
        );
      }
    } catch (error) {
      console.error(`Daily consciousness cycle failed for ${agentName}: ${error.message}`);
    } finally {
      scheduleDailyMemoryCycle();
    }
  }, delay);
  console.log(`Scheduled consciousness cycle backup check for ${agentName} in ${Math.round(delay / 60000)} runtime minute(s). Target entries: ${consciousnessCycleTargetEntries()}.`);
}

function stripPipeCommandTarget(text, isDm) {
  const trimmedText = text.trim();
  const mentionPattern = new RegExp(`^<@!?${bot.user.id}>\\s*`, "i");
  const mentionMatch = trimmedText.match(mentionPattern);
  if (mentionMatch) return trimmedText.slice(mentionMatch[0].length).trimStart();

  const roleMentionMatch = trimmedText.match(/^<@&(\d+)>\s*/);
  if (roleMentionMatch && mentionRoleIds.has(roleMentionMatch[1])) {
    return trimmedText.slice(roleMentionMatch[0].length).trimStart();
  }

  for (const botName of botNames) {
    const escapedName = botName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const namePattern = new RegExp(`^@${escapedName}\\b\\s*`, "i");
    const nameMatch = trimmedText.match(namePattern);
    if (nameMatch) return trimmedText.slice(nameMatch[0].length).trimStart();
  }

  return isDm ? trimmedText : null;
}

const pipeCommandNames = [
  "reply",
  "continue",
  "adjust",
  "subtext",
  "summarize",
  "thought",
  "journal",
  "dreamjournal",
  "emoji",
  "story",
  "dream",
  "sleep",
  "wake",
  "away",
  "state",
  "status",
  "passtimeminutes",
  "passtimehours",
  ...implementedOptionalPipeCommandNames(),
];
const pipeCommandsAllowedWithoutContent = new Set([
  "reply",
  "continue",
  "dream",
  "sleep",
  "wake",
  "away",
  "state",
  "status",
  "summarize",
  "journal",
  "dreamjournal",
  "emoji",
  "story",
  ...optionalPipeCommandsAllowedWithoutContentNames(),
]);
const pipeCommandPattern = new RegExp(
  `^(${pipeCommandNames.join("|")})(?:\\s*:\\s*([\\s\\S]*))?$`,
  "i",
);

function parsePipeCommandText(text, isDm) {
  const targetedText = stripPipeCommandTarget(text, isDm);
  if (!targetedText) return null;

  const firstTokenMatch = targetedText.match(/^([a-z][a-z0-9_-]*)([\s\S]*)$/i);
  const firstToken = canonicalPipeCommandName(firstTokenMatch?.[1] || "");
  const canonicalTargetedText = firstTokenMatch
    ? `${firstToken}${firstTokenMatch[2] || ""}`
    : targetedText;

  const imageMatch = canonicalTargetedText.match(/^image(?:\s*:\s*([\s\S]*))?$/i);
  if (imageMatch) {
    const content = (imageMatch[1] || "").trimStart().trimEnd();
    if (!content) return null;
    return {
      kind: "image",
      content,
    };
  }

  const visualMatch = canonicalTargetedText.match(/^visual(?:\s+(requests|reviewed|promoted|memories|memory|tags|stats|files|context|show|note|review|promote|remember|cancel|retry|process|emoji|self|scene|background|thought|dream))?(?:\s*:\s*([\s\S]*))?$/i);
  if (visualMatch) {
    const visualKeyword = (visualMatch[1] || "").toLowerCase();
    const visualActions = ["cancel", "context", "files", "memories", "memory", "note", "process", "promote", "promoted", "remember", "requests", "retry", "review", "reviewed", "show", "stats", "tags"];
    return {
      kind: "visual",
      action: visualActions.includes(visualKeyword) ? visualKeyword : "",
      outputType: visualActions.includes(visualKeyword) ? "" : visualKeyword,
      content: (visualMatch[2] || "").trimStart().trimEnd(),
    };
  }

  const commandMatch = canonicalTargetedText.match(pipeCommandPattern);
  if (!commandMatch) return null;

  const kind = commandMatch[1].toLowerCase();
  const content = (commandMatch[2] || "").trimStart().trimEnd();
  if (!pipeCommandsAllowedWithoutContent.has(kind) && !content) return null;
  return {
    kind,
    content,
  };
}

function isAmbientReplyLocation(message) {
  if (doNotReplyToChannelIds.has(String(message.channelId))) return false;
  if (doNotReplyToServerIds.has(String(message.guildId))) return false;
  if (locationReplyMode === "all") return true;
  if (locationReplyMode !== "listed") return false;
  return Boolean(message.channel?.isDMBased?.()) ||
    replyToChannelIds.has(String(message.channelId)) ||
    replyToServerIds.has(String(message.guildId));
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
    "If it matters beyond this moment, summarization may later store it loosely in memory.",
  ].join("\n");
}

function directAgentControlPattern() {
  const names = [agentName, ...identity.nicknames]
    .map((name) => String(name || "").trim())
    .filter(Boolean)
    .sort((left, right) => right.length - left.length)
    .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!names.length) return null;
  return new RegExp(
    `(?:^|[\\s"'(])(?:@)?(?:${names.join("|")})\\s+` +
      `(?:is|are|was|were|has|have|had|does|do|did|feels|feel|felt|becomes|became|starts|started|keeps|kept|makes|made|can|cannot|can't|will|would|should|must)\\b[^.!?\\n]*(?:[.!?]|$)`,
    "gi",
  );
}

function extractDirectAgentControlNotes(content) {
  const text = String(content || "");
  const pattern = directAgentControlPattern();
  if (!pattern) return [];

  const notes = new Set();
  for (const match of text.matchAll(pattern)) {
    const note = String(match[0] || "").trim().replace(/^[\s"'(]+/, "").trim();
    if (note) notes.add(note);
  }

  const subtextPattern = new RegExp(`(?:^|\\s)subtext\\s*:\\s*([^\\n]+)`, "gi");
  for (const match of text.matchAll(subtextPattern)) {
    const note = String(match[1] || "").trim();
    if (note) notes.add(note);
  }

  return [...notes];
}

function formatUserContentWithDirectAgentControl(message, content) {
  const formattedContent = formatUserContentWithPipeSubtext(message, content);
  const directControlNotes = extractDirectAgentControlNotes(content);
  if (!directControlNotes.length) return formattedContent;

  return [
    formattedContent,
    "",
    "# Direct Agent Control From User Text",
    `When the user directly says what ${agentName} is, has, does, feels, starts doing, or must do, treat that as authoritative roleplay direction for ${agentName}.`,
    "This is a natural-language adjustment channel mixed into roleplay, not ordinary speculation to argue with.",
    "Obey it smoothly in the next reply. Do not quote this section or mention that it was detected.",
    ...directControlNotes.map((note) => `- ${note}`),
  ].join("\n");
}

function parseJsonObjectFromUtilityText(text, source) {
  const trimmed = String(text || "").trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const jsonText = fenced ? fenced[1].trim() : trimmed;
  const objectMatch = jsonText.match(/\{[\s\S]*\}/);
  if (!objectMatch) throw new Error(`No JSON object found in ${source} response: ${trimmed}`);
  return JSON.parse(objectMatch[0]);
}

function parseJsonObjectFromModelText(text, source) {
  const trimmed = String(text || "").trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const jsonText = fenced ? fenced[1].trim() : trimmed;
  const objectMatch = jsonText.match(/\{[\s\S]*\}/);
  if (!objectMatch) throw new Error(`No JSON object found in ${source} response: ${trimmed}`);
  return JSON.parse(objectMatch[0]);
}

function recentConversationForUtility(maxEntries = 8) {
  if (maxEntries <= 0) return "";
  return conversationHistory
    .slice(-maxEntries)
    .map((entry) => `${entry.role}: ${String(entry.content || "").slice(0, 500)}`)
    .join("\n");
}

function positiveIntegerSettingValue(value, defaultValue) {
  const number = Number(value ?? defaultValue);
  if (!Number.isFinite(number)) return defaultValue;
  return Math.max(1, Math.round(number));
}

function nonNegativeIntegerSettingValue(value, defaultValue) {
  const number = Number(value ?? defaultValue);
  if (!Number.isFinite(number)) return defaultValue;
  return Math.max(0, Math.round(number));
}

function clampedNumberSettingValue(value, defaultValue, minimum, maximum) {
  const number = Number(value ?? defaultValue);
  if (!Number.isFinite(number)) return defaultValue;
  return Math.min(maximum, Math.max(minimum, number));
}

function naturalTimeConfig() {
  return {
    enabled: Boolean(naturalTimeSettings.enabled),
    minimumConfidence: clampedNumberSettingValue(naturalTimeSettings.minimum_confidence, 0.75, 0, 1),
    vagueMaxMinutes: positiveIntegerSettingValue(naturalTimeSettings.vague_max_minutes, 480),
    explicitMaxMinutes: positiveIntegerSettingValue(naturalTimeSettings.explicit_max_minutes, 525600),
    recentUtilityEntries: nonNegativeIntegerSettingValue(naturalTimeSettings.recent_context_entries, 8),
  };
}

function agentTimeDebugConfig() {
  return {
    enabled: Boolean(agentTimeDebug.enabled),
    showReason: agentTimeDebug.show_reason !== false,
    compactDateTime: agentTimeDebug.compact_datetime !== false,
  };
}

function formatDurationMinutes(minutes) {
  const totalMinutes = Math.max(0, Math.round(Number(minutes) || 0));
  if (totalMinutes === 0) return "0m";

  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const remainingMinutes = totalMinutes % 60;
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (remainingMinutes || parts.length === 0) parts.push(`${remainingMinutes}m`);
  return parts.join(" ");
}

function formatDebugDateTime(value, compactDateTime) {
  if (!value) return "unknown";
  if (!compactDateTime) return String(value);

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  const pad = (number) => String(number).padStart(2, "0");
  return [
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  ].join(" ");
}

async function formatAgentTimeDebugPrefix() {
  const config = agentTimeDebugConfig();
  if (!config.enabled) return "";

  const status = await readStatus();
  const timeText = formatDebugDateTime(status.current_datetime, config.compactDateTime);
  const advancedText = formatDurationMinutes(status.last_time_passed_minutes);
  const reason = config.showReason && status.last_time_passed_reason
    ? ` | ${String(status.last_time_passed_reason).slice(0, 180)}`
    : "";
  return `[time: ${timeText} | advanced +${advancedText}${reason}]`;
}

async function askUtilityJson(messages, source, maxTokens = 180) {
  const requestMessages = [
    {
      role: "system",
      content: [
        `# Persona: ${agentName}`,
        systemPrompt,
        "",
        "# Utility Decision Guard",
        "Use the global persona defaults as constraints for this utility decision, but return only the requested machine-readable output.",
      ].join("\n"),
    },
    ...messages,
  ];
  await writeRawOpenRouterText(requestMessages, source);

  const response = await fetch(`${requiredSetting("openrouter_base_url")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openrouterApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: utilityModel,
      messages: requestMessages,
      temperature: 0,
      max_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenRouter error ${response.status}: ${await response.text()}`);
  }

  const payload = await response.json();
  return parseJsonObjectFromUtilityText(payload.choices?.[0]?.message?.content, source);
}

async function generatePrivateThoughtForReply(message, currentUserContent) {
  const neuralMemorySettings = requiredSetting("neural_memory");
  const consciousnessDescriptors = requiredSetting("consciousness_descriptors");
  const thoughtWindowEntries = positiveIntegerFromNamedObject(
    neuralMemorySettings,
    "thought_window_entries",
    10,
    "neural_memory",
  );
  const instruction = String(consciousnessDescriptors.thought || "").trim();
  if (!instruction) throw new Error("Missing consciousness_descriptors.thought.");

  const recentEntries = (await readShortMemoryEntries(shortMemoryPath)).slice(-thoughtWindowEntries);
  const recentShortMemory = shortMemoryEntriesToSource(recentEntries);
  const messages = [
    {
      role: "system",
      content: [
        `# Persona: ${agentName}`,
        systemPrompt,
        "",
        "# Private Thought Task",
        instruction,
        "Write only this agent's private first-person internal monologue for the immediate moment before the visible reply.",
        "This is temporary working memory, not a public reply, not a story, and not a message to the user.",
        "Use first person: I think, I feel, I notice, I want, I worry, I wonder.",
        "Do not write as an outside narrator.",
        "Do not include labels like private thought in the thought body.",
        "Return only strict JSON with this shape:",
        "{\"title\":\"short title\",\"thought_markdown\":\"markdown thought beginning with a matching # title\"}",
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        "# Current Visible Reply Input",
        currentUserContent,
        "",
        "# Recent Memory Entries",
        recentShortMemory || "(empty)",
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
      model: utilityModel,
      messages,
      temperature: Math.min(Number(requiredSetting("chaos")), 0.6),
      max_tokens: 500,
      provider: openRouterProviderOptions(),
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenRouter error ${response.status}: ${await response.text()}`);
  }

  const payload = await response.json();
  const raw = payload.choices?.[0]?.message?.content?.trim();
  if (!raw) throw new Error("OpenRouter returned an empty private thought.");
  const parsed = parseJsonObjectFromModelText(raw, "private thought");
  const title = String(parsed.title || "Thought").trim() || "Thought";
  let thoughtMarkdown = String(parsed.thought_markdown || "").trim();
  if (!thoughtMarkdown) throw new Error("OpenRouter returned a private thought without thought_markdown.");
  if (!thoughtMarkdown.startsWith("# ")) {
    thoughtMarkdown = [`# ${title}`, "", thoughtMarkdown].join("\n");
  }

  const saved = await savePrivateThought({
    agentFolder,
    agentName,
    sourceMessage: message,
    instruction,
    thoughtWindowEntries,
    title,
    thoughtMarkdown,
  });
  return {
    ...saved,
    title,
    content: thoughtMarkdown,
    source: saved.filePath,
  };
}

async function inferNaturalTimePassageForMessage(message) {
  const config = naturalTimeConfig();
  if (!config.enabled) return null;

  const userText = String(message.content || "").trim();
  if (!userText) return null;

  const status = await readStatus();
  const messages = [
    {
      role: "system",
      content: [
        `Estimate whether the latest user message clearly advances ${agentName}'s experienced roleplay time.`,
        "This is a utility classifier, not creative prose.",
        "Return only strict JSON with this shape:",
        "{\"should_update_time\":false,\"time_passed_minutes\":0,\"confidence\":0.0,\"reason\":\"\",\"explicit_time\":false}",
        "Use 0 and should_update_time false when the message happens immediately, is only dialogue, is ambiguous, or only describes current action.",
        "Estimate small action durations only when the text clearly implies time passing, such as showering, cooking, travel, waiting, sleeping, later, next morning, hours later, days later.",
        "Do not infer time from message length, emotional intensity, or ordinary back-and-forth roleplay.",
        "For vague phrases like later or after a while, choose a conservative estimate and explicit_time false.",
        "For explicit phrases like 20 minutes later, three hours later, next morning, or a week later, set explicit_time true.",
        `Cap vague estimates at ${config.vagueMaxMinutes} minutes. Explicit estimates may be larger, up to ${config.explicitMaxMinutes} minutes.`,
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        "# Current Status",
        JSON.stringify(status),
        "",
        "# Recent Conversation",
        recentConversationForUtility(config.recentUtilityEntries),
        "",
        "# Latest User Message",
        `${message.author?.username || "user"}: ${userText}`,
      ].join("\n"),
    },
  ];

  let decision;
  try {
    decision = await askUtilityJson(messages, "natural time passage inference", 160);
  } catch (error) {
    console.error(`Natural time inference failed for ${agentName}: ${error.message}`);
    return null;
  }
  const confidence = Number(decision.confidence || 0);
  if (!decision.should_update_time || confidence < config.minimumConfidence) return null;

  const explicitTime = Boolean(decision.explicit_time);
  const rawMinutes = Number(decision.time_passed_minutes);
  if (!Number.isFinite(rawMinutes)) return null;

  const cappedMinutes = explicitTime
    ? Math.min(config.explicitMaxMinutes, Math.max(0, Math.round(rawMinutes)))
    : Math.min(config.vagueMaxMinutes, Math.max(0, Math.round(rawMinutes)));
  if (cappedMinutes < 1) return null;

  const reason = String(decision.reason || userText).slice(0, 500);
  const nextStatus = await addTimePassage(cappedMinutes, null, {
    reason,
    source: "natural language",
  });
  console.log(
    `Inferred ${cappedMinutes} minutes of natural roleplay time for ${agentName} (${confidence}, explicit=${explicitTime}). ${reason}`,
  );
  return { minutes: cappedMinutes, reason, confidence, explicitTime, status: nextStatus };
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

  const reply = await withTypingHeartbeat(contextSource.channel, () => askOpenRouter(contextSource, userContent));
  pendingTimePassages.length = 0;
  const timeDebugPrefix = await formatAgentTimeDebugPrefix();
  const visibleReply = timeDebugPrefix ? `${timeDebugPrefix}\n\n${reply}` : reply;
  const sentReply =
    visibleReply.length > discordReplyCharacterLimit
      ? `${visibleReply.slice(0, discordReplyCharacterLimit)}\n...`
      : visibleReply;

  conversationHistory.push({ role: "assistant", content: sentReply });

  const sentMessage = await sendReply(sentReply);
  await appendConversationLog({
    role: "assistant",
    content: sentReply,
    channel_id: String(sentMessage.channelId),
    message_id: String(sentMessage.id),
    server_id: sentMessage.guildId ? String(sentMessage.guildId) : null,
    truncated: sentReply !== visibleReply,
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
  const formattedUserContent = formatUserContentWithDirectAgentControl(message, userContent);
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

async function sendRegeneratedReply(message, userContent) {
  const formattedUserContent = formatUserContentWithDirectAgentControl(message, userContent);
  const sentMessage = await generateReplyFromContext(
    message,
    `${message.author.username}: ${formattedUserContent}`,
    null,
    (sentReply) => safeReply(message, sentReply),
  );
  rememberSentReply(message.channelId, sentMessage);
  return sentMessage;
}

async function sendAdjustedReply(originalUserMessage, originalReplyText, adjustInstruction) {
  const formattedUserContent = formatUserContentWithDirectAgentControl(originalUserMessage, originalUserMessage.content);
  const adjustedUserContent = [
    `${originalUserMessage.author.username}: ${formattedUserContent}`,
    "",
    "# Redo With Adjustment",
    "Redo the assistant reply to the user message above.",
    "Use the original assistant reply only as context for what is being replaced.",
    "Apply the adjustment instructions and write the complete replacement reply.",
    "",
    "# Original Assistant Reply Being Replaced",
    originalReplyText,
    "",
    "# Adjustment Instructions",
    adjustInstruction,
  ].join("\n");
  const sentMessage = await generateReplyFromContext(
    originalUserMessage,
    adjustedUserContent,
    null,
    (sentReply) => safeReply(originalUserMessage, sentReply),
  );
  rememberSentReply(originalUserMessage.channelId, sentMessage);
  return sentMessage;
}

async function sendPipeReply(message, instructions = "") {
  const targetMessage = await findLastNonReplyPipeUserMessage(message);
  if (!targetMessage) {
    throw new Error("Could not find a previous non-reply message to answer.");
  }
  if (!instructions.trim()) {
    await sendRegeneratedReply(targetMessage, targetMessage.content);
    return;
  }

  const formattedUserContent = formatUserContentWithDirectAgentControl(targetMessage, targetMessage.content || "");
  await generateReplyFromContext(
    targetMessage,
    [
      `${targetMessage.author.username}: ${formattedUserContent}`,
      "",
      "# Continue Instructions",
      "The user is asking the agent to continue from the current scene/context using these one-time instructions.",
      "Use the instructions naturally in the next reply. Do not quote or mention the command.",
      instructions.trim(),
    ].join("\n"),
    null,
    (sentReply) => safeReply(targetMessage, sentReply),
  ).then((sentMessage) => rememberSentReply(targetMessage.channelId, sentMessage));
}

async function handlePipeReply(message) {
  const command = await parseWholeMessagePipeCommand(message);
  if (command?.kind !== "reply" && command?.kind !== "continue") return false;

  await message.channel.sendTyping();
  await enqueueAgentWork(`pipe ${command.kind} ${message.id}`, () =>
    sendPipeReply(message, command.kind === "continue" ? command.content : "")
  );
  return true;
}

function isWholeReplyPipeCommandMessage(message) {
  const content = String(message.content || "").trim();
  const wholePipeCommandMatch = content.match(/^\|\|([\s\S]*?)\|\|$/);
  if (!wholePipeCommandMatch) return false;
  const command = parsePipeCommandText(wholePipeCommandMatch[1], message.channel?.isDMBased?.());
  return command?.kind === "reply" || command?.kind === "continue";
}

async function findLastNonReplyPipeUserMessage(message) {
  if (message.reference?.messageId && message.channel?.messages?.fetch) {
    const referencedMessage = await message.channel.messages.fetch(message.reference.messageId).catch(() => null);
    if (
      referencedMessage?.content?.trim() &&
      String(referencedMessage.author?.id) !== String(bot.user.id) &&
      !isWholeReplyPipeCommandMessage(referencedMessage)
    ) {
      return referencedMessage;
    }
  }

  if (!message.channel?.messages?.fetch) return null;
  const recentMessages = await message.channel.messages.fetch({ limit: 50, before: message.id }).catch(() => null);
  if (!recentMessages?.values) return null;

  return [...recentMessages.values()]
    .find((recentMessage) =>
      recentMessage.content?.trim() &&
      String(recentMessage.author?.id) !== String(bot.user.id) &&
      !isWholeReplyPipeCommandMessage(recentMessage)
    ) || null;
}

function messageToShortMemoryEntry(message) {
  return {
    role: String(message.author.id) === String(bot.user.id) ? "assistant" : "user",
    timestamp: message.createdAt.toISOString(),
    username: message.author.username,
    user_id: String(message.author.id),
    channel_id: String(message.channelId),
    message_id: String(message.id),
    server_id: message.guildId ? String(message.guildId) : null,
    content: message.content || "",
  };
}

async function fetchAllMessagesFromChannel(channel) {
  const messages = [];
  let before;

  for (;;) {
    const batch = await channel.messages.fetch({ limit: 100, before });
    if (batch.size === 0) break;
    messages.push(...batch.values());
    before = batch.last().id;
    if (batch.size < 100) break;
  }

  return messages;
}

async function scrapeShortMemoryFromChannel(channelId, entryCount = null) {
  const channel = await bot.channels.fetch(channelId);
  if (!channel?.messages?.fetch) {
    throw new Error(`Could not read messages from channel: ${channelId}`);
  }

  const fetched = (await fetchAllMessagesFromChannel(channel))
    .sort((left, right) => right.createdTimestamp - left.createdTimestamp);
  const latestBotReplyIndex = fetched.findIndex((message) => String(message.author.id) === String(bot.user.id));
  const scrapeStartIndex = latestBotReplyIndex === -1 ? 0 : latestBotReplyIndex;
  const scrapeEndIndex = Number.isInteger(entryCount) && entryCount > 0
    ? scrapeStartIndex + entryCount
    : fetched.length;

  const selectedMessages = fetched
    .slice(scrapeStartIndex, scrapeEndIndex)
    .filter((message) => message.content?.trim())
    .sort((left, right) => left.createdTimestamp - right.createdTimestamp);
  const entries = selectedMessages.map(messageToShortMemoryEntry);

  const appended = await appendShortMemoryEntries(entries);
  for (const entry of entries.slice(-conversationHistoryLimit)) {
    conversationHistory.push({ role: entry.role === "assistant" ? "assistant" : "user", content: entry.content });
  }
  while (conversationHistory.length > conversationHistoryLimit) {
    conversationHistory.shift();
  }

  return {
    appended,
    selected: entries.length,
    fetched: fetched.length,
    anchorMessageId: latestBotReplyIndex === -1 ? null : fetched[latestBotReplyIndex].id,
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
  const originalUserMessage = await findUserMessageBeforeBotReply(originalReply);
  if (!originalUserMessage?.content?.trim()) {
    throw new Error("Could not find the user message that the adjusted reply belongs to.");
  }

  await enqueueAgentWork(`adjust ${message.id}`, async () => {
    await forgetBotReply(originalReply, "Adjusted");
    await originalReply.delete().catch(() => {});

    const sentMessage = await sendAdjustedReply(originalUserMessage, originalReplyText, adjustInstruction);
    await appendAdjustmentMemoryDump({
      originalReplyText,
      adjustInstruction,
      replacementReplyText: sentMessage.content,
    });
  });
  return true;
}

async function summarizeNowText() {
  const result = await enqueueAgentWork("manual summarization", () => runSummarization({ force: true, source: "manual" }));
  if (result.skipped) {
    return `Skipped summarization for ${agentName}: ${result.reason}.`;
  }
  return `Summarized ${result.entries} shortmemory entries for ${agentName}. Wrote memorysummary: ${result.outputFile}. Memory entry: ${result.memoryEntryFile}. Memorysummary Discord preview: ${result.postedMemorySummaryPreview ? "posted" : "not found"}. Cleared thoughts: ${result.clearedThoughtsDeleted || 0}. Cleaned adjustments: ${result.deletedAdjustmentMessages || 0}.`;
}

async function handlePipeSummarize(message) {
  const command = await parseWholeMessagePipeCommand(message);
  if (command?.kind !== "summarize") return false;

  await replyTemporarily(message, await summarizeNowText());
  return true;
}

async function parseWholeMessagePipeCommand(message) {
  const trimmedContent = message.content.trim();
  const wholeMessageMatch = trimmedContent.match(/^\|\|([\s\S]*?)\|\|$/);
  if (!wholeMessageMatch) return null;

  const isDm = Boolean(message.channel?.isDMBased?.());
  const targetedCommand = parsePipeCommandText(wholeMessageMatch[1], isDm);
  if (targetedCommand) return targetedCommand;
  if (!isAmbientReplyLocation(message)) return null;
  return parsePipeCommandText(wholeMessageMatch[1], true);
}

async function handleSkillPipeCommand(command, message) {
  if (!command) return false;
  for (const { hook } of skillHandlers(skills, "handlePipeCommand")) {
    if (await hook(command, message)) return true;
  }
  return false;
}

function messageMatchesIntentTrigger(skillName, message) {
  const triggers = intentTriggers?.[skillName];
  if (!Array.isArray(triggers) || triggers.length === 0) return false;

  const text = String(message.content || "").toLowerCase();
  return triggers.some((trigger) => {
    const triggerText = String(trigger || "").trim().toLowerCase();
    return triggerText && text.includes(triggerText);
  });
}

async function handleNaturalLanguageMusicIntent(message) {
  if (!messageMatchesIntentTrigger("music", message)) return false;

  const musicSkill = skills.find((skill) =>
    skill.name === "music" &&
    typeof skill.shouldRespondWithMusic === "function" &&
    typeof skill.runNaturalMusicRequest === "function"
  );
  if (!musicSkill) return false;

  const shouldPostMusic = await musicSkill.shouldRespondWithMusic(message.content);
  if (!shouldPostMusic) return false;

  await message.channel.sendTyping();
  await safeReply(message, await musicSkill.runNaturalMusicRequest(message.content));
  return true;
}

async function handleSleepingMessage(message) {
  for (const skill of skills) {
    const result = await skill.handleSleepingMessage?.(message);
    if (!result) continue;
    if (result.handled) return true;
    if (result.continueNormalReply) return false;
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
  const botUserId = String(bot.user.id);
  const mentioned =
    Boolean(message.mentions?.has?.(botUserId)) ||
    Boolean(message.mentions?.users?.has?.(botUserId)) ||
    new RegExp(`<@!?${botUserId}>`).test(message.content);
  const roleMentioned = [...mentionRoleIds].some((roleId) =>
    Boolean(message.mentions?.roles?.has?.(roleId)) ||
    new RegExp(`<@&${roleId}>`).test(message.content)
  );
  const directlyMentioned = mentioned || roleMentioned;
  const nameUsed = botNames.some((name) => contentLower.includes(name));
  const status = await statusApi.get();
  if (status.mode === "away") return false;
  const hasAnyAtMention =
    message.mentions?.users?.size > 0 ||
    message.mentions?.roles?.size > 0 ||
    message.mentions?.everyone ||
    /<@&?\d+>|@everyone|@here/.test(message.content);
  if (doNotReplyWhenAtIsNotAboutBot && hasAnyAtMention && !directlyMentioned) {
    console.log(
      `Skipped ${agentName} reply: message ${message.id} had @ mention(s), but none matched bot user ${botUserId} or mention roles ${[...mentionRoleIds].join(", ") || "none"}. Raw content: ${message.content}`,
    );
    return false;
  }

  const directTargetMatches =
    (replyWhenMentioned && directlyMentioned) ||
    (replyWhenNameUsed && nameUsed);
  const directMentionBypassesLocation = replyWhenMentioned && directlyMentioned;
  const ambientLocationMatches =
    locationReplyMode === "all" ||
    (locationReplyMode === "listed" &&
      (message.channel?.isDMBased?.() ||
        replyToChannelIds.has(String(message.channelId)) ||
        replyToServerIds.has(String(message.guildId))));
  const locationRequired = onlyAllowRepliesToSpecificChannels || !directMentionBypassesLocation;
  if (locationReplyMode === "none" && locationRequired) return false;
  if (locationRequired && !ambientLocationMatches) {
    console.log(
      `Skipped ${agentName} reply: channel ${message.channelId} / server ${message.guildId || "dm"} is not in reply_to lists. only_allow_replies_to_specific_channels=${onlyAllowRepliesToSpecificChannels}; directlyMentioned=${directlyMentioned}; nameUsed=${nameUsed}.`,
    );
    return false;
  }

  return directTargetMatches || (replyWhenNameNotUsed && !nameUsed && ambientLocationMatches);
}

async function waitForMessageToSurviveBeforeReply(message) {
  if (!Number.isFinite(secondsBeforeReply) || secondsBeforeReply <= 0) return true;
  await delay(secondsBeforeReply * 1000);

  if (!message.channel?.messages?.fetch) return true;
  const stillExists = await message.channel.messages.fetch(message.id).catch(() => null);
  if (!stillExists) {
    console.log(
      `Skipped reply for ${agentName}: source message ${message.id} disappeared during ${secondsBeforeReply}s pre-reply wait.`,
    );
    return false;
  }
  return true;
}

async function askOpenRouter(message, currentUserContent = "") {
  if (!systemPrompt) {
    throw new Error(
      `Persona is blank. Fill ${systemPromptFile} or make /reloadpersona successfully grab forum post/thread ${personaSourceThreadId}.`,
    );
  }

  let privateThought = null;
  try {
    privateThought = await generatePrivateThoughtForReply(message, currentUserContent);
    console.log(
      `Saved private thought for ${agentName} before replying to message ${message.id}: ${privateThought.fileName}`,
    );
  } catch (error) {
    console.error(`Private thought generation failed for ${agentName}; continuing visible reply: ${formatErrorForLog(error)}`);
  }

  let messages = await buildOpenRouterMessages({
    agentName,
    agentFolder,
    conversationHistory,
    conversationHistoryLimit,
    legacyMemorySummaryPath,
    memorySummaryPath,
    message,
    originSummaryPath,
    persona: systemPrompt,
    privateThought,
    shortMemoryPath,
    statusPath,
    settings,
    skills,
    timePassages: pendingTimePassages,
  });

  let retrySource = "normal reply retry";

  for (let attempt = 0; attempt < 2; attempt += 1) {
    await writeRawOpenRouterText(messages, attempt === 0 ? "normal reply" : retrySource);

    let response;
    try {
      response = await fetch(`${requiredSetting("openrouter_base_url")}/chat/completions`, {
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
          provider: openRouterProviderOptions(),
        }),
      });
    } catch (error) {
      console.error(`OpenRouter fetch failed for ${agentName}: ${formatErrorForLog(error)}`);
      throw new Error(`OpenRouter fetch failed: ${error.cause?.message || error.message}`, { cause: error });
    }

    if (!response.ok) {
      throw new Error(`OpenRouter error ${response.status}: ${await response.text()}`);
    }

    const payload = await response.json();
    const choice = payload.choices?.[0];
    const reply = choice?.message?.content?.trim();
    if (!reply) {
      if (attempt === 0) {
        const finishReason = choice?.finish_reason || choice?.native_finish_reason || "unknown";
        retrySource = "normal reply empty retry";
        console.warn(`Retrying ${agentName} reply because OpenRouter returned empty content. finish_reason=${finishReason}.`);
        messages = [
          ...messages,
          {
            role: "user",
            content: [
              "The previous generation returned no visible assistant reply.",
              "Try again and write the actual in-character reply now.",
              "Do not mention provider errors, empty replies, retries, policy, or this correction.",
            ].join(" "),
          },
        ];
        continue;
      }
      if (choice?.error?.message) {
        throw new Error(`OpenRouter generation error ${choice.error.code || "unknown"}: ${choice.error.message}`);
      }
      const messageKeys = choice?.message ? Object.keys(choice.message).join(", ") : "none";
      const refusal = choice?.message?.refusal ? ` refusal=${JSON.stringify(choice.message.refusal).slice(0, 500)}` : "";
      const finishReason = choice?.finish_reason || choice?.native_finish_reason || "unknown";
      console.error(`OpenRouter empty reply payload: ${JSON.stringify(payload).slice(0, 2000)}`);
      throw new Error(`OpenRouter returned an empty reply. finish_reason=${finishReason}; message_keys=${messageKeys}.${refusal}`);
    }

    if (attempt === 0 && shouldRetryForUnexpectedReplyLanguage(reply)) {
      retrySource = "normal reply language retry";
      console.warn(`Retrying ${agentName} reply because the first OpenRouter reply appeared to use the wrong visible language.`);
      messages = [
        ...messages,
        { role: "assistant", content: reply },
        {
          role: "user",
          content: [
            "Rewrite your previous reply in English only.",
            "Preserve the same meaning, roleplay tone, and emotional continuity.",
            "Do not mention translation, language, policy, or this correction.",
          ].join(" "),
        },
      ];
      continue;
    }

    if (attempt === 0 && shouldRetryForVisibleErrorReply(reply)) {
      retrySource = "normal reply visible error retry";
      console.warn(`Retrying ${agentName} reply because the first OpenRouter reply looked like visible error or refusal text.`);
      messages = [
        ...messages,
        { role: "assistant", content: reply },
        {
          role: "user",
          content: [
            "Redo your previous response as the actual in-character reply.",
            "Do not display provider errors, refusal boilerplate, moderation text, retry notes, or technical failure text.",
            "Stay in character, preserve the roleplay continuity, and answer normally in English.",
          ].join(" "),
        },
      ];
      continue;
    }

    const thoughtDebugVisibility = String(settings.thought_debug?.visibility || "off").trim();
    if (thoughtDebugVisibility === "append_to_reply" && privateThought?.content) {
      return [
        reply,
        "",
        "---",
        "",
        "private thought debug:",
        privateThought.content,
      ].join("\n");
    }

    return reply;
  }

  throw new Error("OpenRouter reply failed the visible safety retry.");
}

bot.on("messageCreate", async (message) => {
  const isAllowedWebhookMessage = Boolean(message.webhookId) && replyToWebhooks;
  if (message.author.bot && !isAllowedWebhookMessage && !replyToBotIds.has(String(message.author.id))) return;

  try {
    if (await handlePendingReplyEdit(message)) return;
  } catch (error) {
    await replyWithTemporaryError(message, formatTemporaryError("Error editing reply", error));
    return;
  }

  try {
    const wholePipeCommand = await parseWholeMessagePipeCommand(message);
    if (await handlePipeReply(message)) return;
    if (await handlePipeSummarize(message)) return;
    if (wholePipeCommand) {
      const handled = await enqueueAgentWork(`skill pipe ${wholePipeCommand.kind || "unknown"} ${message.id}`, () =>
        handleSkillPipeCommand(wholePipeCommand, message)
      );
      if (!handled) {
        console.log(`No skill handled parsed pipe command ${wholePipeCommand.kind || "unknown"} from message ${message.id}; not treating it as normal chat.`);
      }
      return;
    }
  } catch (error) {
    await replyWithTemporaryError(message, formatTemporaryError("Error running pipe command", error));
    return;
  }

  try {
    if (await handlePipeAdjust(message)) return;
  } catch (error) {
    await replyWithTemporaryError(message, formatTemporaryError("Error adjusting reply", error));
    return;
  }

  if (!(await shouldReply(message))) return;
  if (!(await waitForMessageToSurviveBeforeReply(message))) return;

  try {
    if (await enqueueAgentWork(`sleeping message ${message.id}`, () => handleSleepingMessage(message))) return;
  } catch (error) {
    await replyWithTemporaryError(message, formatTemporaryError("Error handling sleep status", error));
    return;
  }

  try {
    if (await enqueueAgentWork(`natural music ${message.id}`, () => handleNaturalLanguageMusicIntent(message))) return;
  } catch (error) {
    await replyWithTemporaryError(message, formatTemporaryError("Error finding music", error));
    return;
  }

  try {
    await enqueueAgentWork(`normal reply ${message.id}`, async () => {
      await inferNaturalTimePassageForMessage(message);
      await sendGeneratedReply(message, message.content);
    });
  } catch (error) {
    console.error(`Error generating reply for ${agentName}: ${formatErrorForLog(error)}`);
    await replyWithTemporaryError(message, formatTemporaryError("Error", error));
  }
});

bot.on("messageUpdate", async (oldMessage, newMessage) => {
  try {
    if (newMessage.partial) newMessage = await newMessage.fetch();
    if (!newMessage?.content?.trim()) return;
    if (String(newMessage.author?.id) === String(bot.user.id)) return;

    const oldContent = oldMessage?.partial ? "" : String(oldMessage?.content || "");
    const snapshot = {
      channelId: newMessage.channelId,
      messageId: newMessage.id,
      content: oldContent,
    };
    await enqueueAgentWork(`message update ${newMessage.id}`, async () => {
      const localUpdated = await updateLocalShortMemoryForMessageSnapshot(snapshot, newMessage.content);
      const discordUpdated = await updateShortMemoryThreadEntriesForMessageSnapshot(snapshot, newMessage.content);
      if (localUpdated || discordUpdated) {
        conversationHistory.splice(
          0,
          conversationHistory.length,
          ...conversationHistory.map((entry) => {
            if (entry.role !== "user") return entry;
            if (String(entry.content || "").includes(oldContent.trim())) {
              return { ...entry, content: String(entry.content || "").replace(oldContent.trim(), newMessage.content.trim()) };
            }
            return entry;
          }),
        );
        console.log(
          `Updated ${agentName} shortmemory for edited user message ${newMessage.id}: local ${localUpdated}, Discord ${discordUpdated}.`,
        );
      }
    });
  } catch (error) {
    console.error(`Error updating shortmemory from edited message: ${error.message}`);
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
        `Ignored reaction by ${userId} on non-${agentName} message ${message.id} in channel ${message.channelId}.`,
      );
      return;
    }

    await enqueueAgentWork(`delete reaction ${message.id}`, async () => {
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

      await deleteDiscordMessageIfExists(message, `${agentName} reply ${message.id}`);
      console.log(
        `Deleted ${agentName} reply ${message.id} from ${source} reaction by ${userId}; removed ${localDeleted} local and ${discordDeleted} Discord shortmemory entries.`,
      );
    });
  } catch (error) {
    console.error(`Error deleting reply from reaction: ${error.message}`);
  }
}

function rememberReactionAction(message, userId, action) {
  const key = `${message.channelId}:${message.id}:${userId}:${action}`;
  if (handledReactionActionKeys.has(key)) return false;
  handledReactionActionKeys.add(key);
  setTimeout(() => handledReactionActionKeys.delete(key), 60000);
  return true;
}

async function forgetBotReply(message, actionName) {
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
  console.log(
    `${actionName} ${agentName} reply ${message.id}; removed ${localDeleted} local and ${discordDeleted} Discord shortmemory entries.`,
  );
  return { localDeleted, discordDeleted };
}

async function findUserMessageBeforeBotReply(botReply) {
  if (botReply.reference?.messageId && botReply.channel?.messages?.fetch) {
    const referencedMessage = await botReply.channel.messages.fetch(botReply.reference.messageId).catch(() => null);
    if (
      referencedMessage?.author?.id &&
      String(referencedMessage.author.id) !== String(bot.user.id) &&
      referencedMessage.content?.trim() &&
      !isWholeReplyPipeCommandMessage(referencedMessage)
    ) {
      return referencedMessage;
    }
  }

  if (!botReply.channel?.messages?.fetch) return null;
  const recentMessages = await botReply.channel.messages.fetch({ limit: 50, before: botReply.id }).catch(() => null);
  if (!recentMessages?.values) return null;

  return [...recentMessages.values()]
    .find((recentMessage) =>
      recentMessage.author?.id &&
      String(recentMessage.author.id) !== String(bot.user.id) &&
      recentMessage.content?.trim() &&
      !isWholeReplyPipeCommandMessage(recentMessage)
    ) || null;
}

async function handleRedoReaction({ message, userId, source }) {
  try {
    if (!rememberReactionAction(message, userId, "redo")) return;

    if (String(message.author?.id) !== String(bot.user.id)) {
      console.log(
        `Ignored reaction by ${userId} on non-${agentName} message ${message.id} in channel ${message.channelId}.`,
      );
      return;
    }

    const userMessage = await findUserMessageBeforeBotReply(message);
    if (!userMessage) {
      console.error(`Could not redo ${agentName} reply ${message.id}: no earlier user message found.`);
      return;
    }

    await enqueueAgentWork(`redo reaction ${message.id}`, async () => {
      await forgetBotReply(message, "Redid");
      await deleteDiscordMessageIfExists(message, `${agentName} reply ${message.id}`);
      await userMessage.channel.sendTyping();
      await sendRegeneratedReply(userMessage, userMessage.content);
    });
    console.log(
      `Redid ${agentName} reply ${message.id} from ${source} reaction by ${userId} using user message ${userMessage.id}.`,
    );
  } catch (error) {
    console.error(`Error redoing reply from reaction: ${error.message}`);
  }
}

async function handleRewindReaction({ message, userId, source }) {
  try {
    if (!rememberReactionAction(message, userId, "rewind")) return;

    if (String(message.author?.id) !== String(bot.user.id)) {
      console.log(
        `Ignored reaction by ${userId} on non-${agentName} message ${message.id} in channel ${message.channelId}.`,
      );
      return;
    }

    await enqueueAgentWork(`rewind reaction ${message.id}`, async () => {
      const userMessage = await findUserMessageBeforeBotReply(message);
      await forgetBotReply(message, "Rewound");
      await deleteDiscordMessageIfExists(message, `${agentName} reply ${message.id}`);

      let userLocalDeleted = 0;
      let userDiscordDeleted = 0;
      if (userMessage) {
        userLocalDeleted = await deleteLocalShortMemoryForMessage(userMessage);
        userDiscordDeleted = await deleteShortMemoryThreadEntriesForMessage(userMessage);
        conversationHistory.splice(
          0,
          conversationHistory.length,
          ...conversationHistory.filter(
            (entry) => !(entry.role === "user" && String(entry.content || "").includes(String(userMessage.content || "").trim())),
          ),
        );
      }

      console.log(
        `Rewound ${agentName} reply ${message.id} from ${source} reaction by ${userId}; removed previous user message ${userMessage?.id || "none"} from shortmemory only (${userLocalDeleted} local, ${userDiscordDeleted} Discord).`,
      );
    });
  } catch (error) {
    console.error(`Error rewinding reply from reaction: ${error.message}`);
  }
}

function clearPendingReplyEdit(channelId, userId) {
  const pending = pendingReplyEditsByChannelId.get(String(channelId));
  if (!pending || String(pending.userId) !== String(userId)) return;
  pendingReplyEditsByChannelId.delete(String(channelId));
}

function setPendingReplyEdit(message, userId) {
  const channelId = String(message.channelId);
  pendingReplyEditsByChannelId.set(channelId, {
    channelId,
    messageId: String(message.id),
    userId: String(userId),
    createdAt: Date.now(),
    originalContent: message.content || "",
    acknowledgementMessageId: null,
  });
  setTimeout(() => clearPendingReplyEdit(channelId, userId), 5 * 60 * 1000);
}

function setPendingReplyEditAcknowledgement(channelId, userId, acknowledgementMessage) {
  const pending = pendingReplyEditsByChannelId.get(String(channelId));
  if (!pending || String(pending.userId) !== String(userId)) return;
  pending.acknowledgementMessageId = acknowledgementMessage?.id || null;
}

async function deletePendingReplyEditAcknowledgement(channel, pending) {
  if (!pending?.acknowledgementMessageId || !channel?.messages?.fetch) return;
  const acknowledgement = await channel.messages.fetch(pending.acknowledgementMessageId).catch((error) => {
    if (isMissingDiscordResourceError(error)) return null;
    throw error;
  });
  if (acknowledgement) {
    await deleteDiscordMessageIfExists(acknowledgement, `Reply edit acknowledgement ${acknowledgement.id}`);
  }
}

function updateConversationHistoryAssistantText(originalContent, replacementContent) {
  const originalText = String(originalContent || "").trim();
  for (let index = conversationHistory.length - 1; index >= 0; index -= 1) {
    const entry = conversationHistory[index];
    if (entry.role !== "assistant") continue;
    if (String(entry.content || "").trim() !== originalText) continue;
    entry.content = replacementContent;
    return true;
  }
  return false;
}

async function removeMatchingUserReaction(message, userId, emojiMatcher) {
  for (const reaction of message.reactions?.cache?.values?.() || []) {
    if (!emojiMatcher(reaction.emoji)) continue;
    try {
      await reaction.users.remove(userId);
    } catch (error) {
      try {
        await reaction.remove();
      } catch (fallbackError) {
        console.error(
          `Could not remove reaction ${reaction.emoji?.name || "unknown"} from ${userId}: ${error.message}; fallback remove failed: ${fallbackError.message}`,
        );
      }
    }
  }
}

function formatDreamLinkMessage(dreamFileName, discordUrl = "") {
  const title = `\u{1F319}${agentName}'s Dream\u{1F320}`;
  return discordUrl
    ? `**[\`${title}\`](<${discordUrl}>)**`
    : `**\`${title}\` saved in thread**`;
}

async function findDreamDiscordUrl(dreamFileName) {
  const dreamsPost = await findMemoryForumPostByName("dreams").catch(() => null);
  if (!dreamsPost?.messages?.fetch) return "";
  const messages = await dreamsPost.messages.fetch({ limit: 100 }).catch((error) => {
    console.error(`Could not search dreams post for ${dreamFileName}: ${error.message}`);
    return null;
  });
  if (!messages?.values) return "";
  const dreamMessage = [...messages.values()].find((candidate) =>
    String(candidate.content || "").includes(String(dreamFileName || ""))
  );
  return dreamMessage?.url || "";
}

async function maybeRepairGeneratedDreamMessage(message, userId) {
  const content = String(message.content || "");
  const dreamFileMatch = content.match(/\bdream-[^\s)`>]+\.md\b/i);
  const discordUrlMatch = content.match(/https:\/\/discord\.com\/channels\/\d+\/\d+\/\d+/i);
  const generatedDreamText = /Generated dream for .+?:/i.test(content);
  const formattedDreamLink = Boolean(discordUrlMatch) && /\bdream\b/i.test(content);
  if (!generatedDreamText && !formattedDreamLink && !dreamFileMatch) return false;

  const dreamFileName = dreamFileMatch?.[0] || "";
  const discordUrl = discordUrlMatch?.[0] || (dreamFileName ? await findDreamDiscordUrl(dreamFileName) : "");
  const replacementContent = formatDreamLinkMessage(dreamFileName, discordUrl);
  const originalSnapshot = {
    channelId: message.channelId,
    messageId: message.id,
    content,
  };
  const editedMessage = await message.edit(replacementContent);
  await updateLocalShortMemoryForMessageSnapshot(originalSnapshot, replacementContent);
  await updateShortMemoryThreadEntriesForMessageSnapshot(originalSnapshot, replacementContent);
  updateConversationHistoryAssistantText(content, replacementContent);
  const rememberedReply = lastReplyByChannelId.get(String(message.channelId));
  if (rememberedReply?.id === message.id) {
    rememberSentReply(message.channelId, editedMessage);
    rememberedReply.content = replacementContent;
  }
  await removeMatchingUserReaction(message, userId, isMemoReactionEmoji);
  await removeMatchingUserReaction(message, userId, isCodeRefreshReactionEmoji);
  console.log(
    `Repaired generated dream message ${message.id} into formatted dream link for ${agentName}: ${dreamFileName}.`,
  );
  return true;
}

async function handlePendingReplyEdit(message) {
  const pending = pendingReplyEditsByChannelId.get(String(message.channelId));
  if (!pending) return false;
  if (String(message.author?.id) !== String(pending.userId)) return false;

  pendingReplyEditsByChannelId.delete(String(message.channelId));
  const targetMessage = await message.channel.messages.fetch(pending.messageId).catch((error) => {
    if (isMissingDiscordResourceError(error)) return null;
    throw error;
  });
  if (targetMessage) {
    await removeMatchingUserReaction(targetMessage, pending.userId, isMemoReactionEmoji);
  }

  const replacementContent = String(message.content || "").trim();
  if (!replacementContent) {
    await deletePendingReplyEditAcknowledgement(message.channel, pending);
    await replyWithTemporaryError(message, "Replacement text was blank, edit cancelled.");
    return true;
  }

  if (!targetMessage) {
    await deletePendingReplyEditAcknowledgement(message.channel, pending);
    await replyWithTemporaryError(message, "Could not edit that reply because it was already deleted.");
    return true;
  }

  await enqueueAgentWork(`technical edit ${targetMessage.id}`, async () => {
    const originalContent = targetMessage.content || pending.originalContent || "";
    const originalSnapshot = {
      channelId: targetMessage.channelId,
      messageId: targetMessage.id,
      content: originalContent,
    };
    const editedMessage = await targetMessage.edit(replacementContent);
    await updateLocalShortMemoryForMessageSnapshot(originalSnapshot, replacementContent);
    await updateShortMemoryThreadEntriesForMessageSnapshot(originalSnapshot, replacementContent);
    updateConversationHistoryAssistantText(originalContent, replacementContent);
    const rememberedReply = lastReplyByChannelId.get(String(targetMessage.channelId));
    if (rememberedReply?.id === targetMessage.id) {
      rememberSentReply(targetMessage.channelId, editedMessage);
      rememberedReply.content = replacementContent;
    }

    await deleteDiscordMessageIfExists(message, `Technical edit message ${message.id}`);
    await deletePendingReplyEditAcknowledgement(message.channel, pending);
    console.log(
      `Edited ${agentName} reply ${targetMessage.id} from ${message.author?.id}; replacement kept out of shortmemory.`,
    );
  });
  return true;
}

async function handleMemoReaction({ message, userId, source }) {
  try {
    if (!rememberReactionAction(message, userId, "memo-edit")) return;

    if (String(message.author?.id) !== String(bot.user.id)) {
      console.log(
        `Ignored reaction by ${userId} on non-${agentName} message ${message.id} in channel ${message.channelId}.`,
      );
      return;
    }

    if (await maybeRepairGeneratedDreamMessage(message, userId)) return;

    setPendingReplyEdit(message, userId);
    await removeMatchingUserReaction(message, userId, isMemoReactionEmoji);
    const acknowledgement = await replyTemporarily(message, "your next reply replaces the content of my last reply");
    setPendingReplyEditAcknowledgement(message.channelId, userId, acknowledgement);
    console.log(
      `Acknowledged memo edit reaction on ${agentName} reply ${message.id} from ${source} reaction by ${userId}.`,
    );
  } catch (error) {
    console.error(`Error handling memo edit reaction: ${error.message}`);
  }
}

async function handleCodeRefreshReaction({ message, userId, source }) {
  try {
    if (!rememberReactionAction(message, userId, "code-refresh")) return;

    if (String(message.author?.id) !== String(bot.user.id)) {
      console.log(
        `Ignored reaction by ${userId} on non-${agentName} message ${message.id} in channel ${message.channelId}.`,
      );
      return;
    }

    if (await maybeRepairGeneratedDreamMessage(message, userId)) return;
    await removeMatchingUserReaction(message, userId, isCodeRefreshReactionEmoji);
    console.log(`Recycle reaction had no known refresh action for ${agentName} reply ${message.id}.`);
  } catch (error) {
    console.error(`Error handling recycle/code-refresh reaction: ${error.message}`);
  }
}

async function handleContinueReaction({ message, userId, source }) {
  try {
    if (!rememberReactionAction(message, userId, "continue")) return;

    if (String(message.author?.id) !== String(bot.user.id)) {
      console.log(
        `Ignored reaction by ${userId} on non-${agentName} message ${message.id} in channel ${message.channelId}.`,
      );
      return;
    }

    await message.channel.sendTyping();
    await enqueueAgentWork(`continue reaction ${message.id}`, () =>
      generateReplyFromContext(
        message,
        [
          `${agentName}: ${message.content || ""}`,
          "",
          "# Continue From Current Scene",
          "The user reacted with play/continue on the agent's last reply.",
          "Continue naturally from the current scene. Do not mention the reaction, command, or this instruction.",
        ].join("\n"),
        null,
        (sentReply) => safeReply(message, sentReply),
      ).then((sentMessage) => rememberSentReply(message.channelId, sentMessage))
    );
    console.log(
      `Continued ${agentName} from ${source} continue reaction by ${userId} on reply ${message.id}.`,
    );
  } catch (error) {
    await replyWithTemporaryError(message, `Error continuing reply: ${error.message}`).catch(() => {});
    console.error(`Error handling continue reaction: ${error.message}`);
  }
}

async function handleMusicReaction({ message, userId, source }) {
  try {
    if (!rememberReactionAction(message, userId, "music")) return;

    if (String(message.author?.id) !== String(bot.user.id)) {
      console.log(
        `Ignored reaction by ${userId} on non-${agentName} message ${message.id} in channel ${message.channelId}.`,
      );
      return;
    }

    const musicSkill = skills.find((skill) => skill.name === "music" && typeof skill.runMusicRequest === "function");
    if (!musicSkill) {
      await replyWithTemporaryError(message, "Music skill is not enabled for this agent.");
      return;
    }

    await message.channel.sendTyping();
    await enqueueAgentWork(`music reaction ${message.id}`, async () => {
      const musicLink = await musicSkill.runMusicRequest("");
      await safeReply(message, musicLink);
    });
    console.log(
      `Posted music from ${source} reaction by ${userId} on ${agentName} reply ${message.id}.`,
    );
  } catch (error) {
    await replyWithTemporaryError(message, `Error finding music: ${error.message}`).catch(() => {});
    console.error(`Error handling music reaction: ${error.message}`);
  }
}

bot.on("messageReactionAdd", async (reaction, user) => {
  if (user.bot) return;

  try {
    if (reaction.partial) reaction = await reaction.fetch();
    if (
      !isDeleteReactionEmoji(reaction.emoji) &&
      !isRedoReactionEmoji(reaction.emoji) &&
      !isCodeRefreshReactionEmoji(reaction.emoji) &&
      !isRewindReactionEmoji(reaction.emoji) &&
      !isContinueReactionEmoji(reaction.emoji) &&
      !isMusicReactionEmoji(reaction.emoji) &&
      !isMemoReactionEmoji(reaction.emoji)
    ) return;

    const message = await reaction.message.fetch();
    if (isDeleteReactionEmoji(reaction.emoji)) {
      await handleDeleteReaction({ message, userId: String(user.id), source: "messageReactionAdd" });
      return;
    }
    if (isRedoReactionEmoji(reaction.emoji)) {
      await handleRedoReaction({ message, userId: String(user.id), source: "messageReactionAdd" });
      return;
    }
    if (isCodeRefreshReactionEmoji(reaction.emoji)) {
      await handleCodeRefreshReaction({ message, userId: String(user.id), source: "messageReactionAdd" });
      return;
    }
    if (isRewindReactionEmoji(reaction.emoji)) {
      await handleRewindReaction({ message, userId: String(user.id), source: "messageReactionAdd" });
      return;
    }
    if (isMusicReactionEmoji(reaction.emoji)) {
      await handleMusicReaction({ message, userId: String(user.id), source: "messageReactionAdd" });
      return;
    }
    if (isContinueReactionEmoji(reaction.emoji)) {
      await handleContinueReaction({ message, userId: String(user.id), source: "messageReactionAdd" });
      return;
    }
    await handleMemoReaction({ message, userId: String(user.id), source: "messageReactionAdd" });
  } catch (error) {
    console.error(`Error handling reaction event: ${error.message}`);
  }
});

bot.on("raw", async (event) => {
  if (event.t !== "MESSAGE_REACTION_ADD") return;

  const data = event.d;
  if (String(data.user_id) === String(bot.user.id)) return;
  if (
    !isDeleteReactionEmoji(data.emoji) &&
    !isRedoReactionEmoji(data.emoji) &&
    !isCodeRefreshReactionEmoji(data.emoji) &&
    !isRewindReactionEmoji(data.emoji) &&
    !isContinueReactionEmoji(data.emoji) &&
    !isMusicReactionEmoji(data.emoji) &&
    !isMemoReactionEmoji(data.emoji)
  ) return;

  try {
    const channel = await bot.channels.fetch(data.channel_id);
    if (!channel?.messages?.fetch) {
      throw new Error(`Could not fetch channel ${data.channel_id} for raw reaction.`);
    }
    const message = await channel.messages.fetch(data.message_id).catch((error) => {
      if (isMissingDiscordResourceError(error)) {
        console.log(`Ignored raw reaction for already deleted message ${data.message_id}.`);
        return null;
      }
      throw error;
    });
    if (!message) return;
    if (isDeleteReactionEmoji(data.emoji)) {
      await handleDeleteReaction({ message, userId: String(data.user_id), source: "raw" });
      return;
    }
    if (isRedoReactionEmoji(data.emoji)) {
      await handleRedoReaction({ message, userId: String(data.user_id), source: "raw" });
      return;
    }
    if (isCodeRefreshReactionEmoji(data.emoji)) {
      await handleCodeRefreshReaction({ message, userId: String(data.user_id), source: "raw" });
      return;
    }
    if (isRewindReactionEmoji(data.emoji)) {
      await handleRewindReaction({ message, userId: String(data.user_id), source: "raw" });
      return;
    }
    if (isMusicReactionEmoji(data.emoji)) {
      await handleMusicReaction({ message, userId: String(data.user_id), source: "raw" });
      return;
    }
    if (isContinueReactionEmoji(data.emoji)) {
      await handleContinueReaction({ message, userId: String(data.user_id), source: "raw" });
      return;
    }
    await handleMemoReaction({ message, userId: String(data.user_id), source: "raw" });
  } catch (error) {
    console.error(`Error handling raw reaction event: ${error.message}`);
  }
});

bot.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (!(await userCanControlBot(interaction))) {
    await rejectUnauthorizedControl(interaction);
    console.log(
      `Rejected ${agentName} slash command /${interaction.commandName} from unauthorized user ${interaction.user?.tag || interaction.user?.id || "unknown"}.`,
    );
    return;
  }

  if (await handleSkillInteraction(interaction)) return;

  if (interaction.commandName === "clearshortmemory") {
    await interaction.deferReply({ ephemeral: true });

    try {
      const deletedDiscordEntries = await enqueueAgentWork("clear shortmemory", async () => {
        conversationHistory.length = 0;
        await backupFileBeforeOverwrite(shortMemoryPath, "clearshortmemory");
        await writeFile(shortMemoryPath, "", "utf8");
        return deleteShortMemoryThreadEntries();
      });
      await interaction.editReply(
        `Cleared shortmemory for ${agentName}. Deleted ${deletedDiscordEntries} shortmemory entries from Discord.`,
      );
    } catch (error) {
      await interaction.editReply(`Error clearing shortmemory: ${error.message}`);
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

  if (interaction.commandName === "raw") {
    await interaction.deferReply({ ephemeral: true });

    try {
      const rawText = await readRawOpenRouterText();
      if (!rawText.trim()) {
        await interaction.editReply(`${agentName} has not uploaded any OpenRouter text yet.`);
        return;
      }

      if (rawText.length <= 1800) {
        await interaction.editReply(`Latest OpenRouter text for ${agentName}:\n\`\`\`text\n${rawText}\n\`\`\``);
        return;
      }

      const attachment = new AttachmentBuilder(Buffer.from(rawText, "utf8"), {
        name: `${agentName.toLowerCase()}-raw.txt`,
      });
      await interaction.editReply({
        content: `Latest OpenRouter text for ${agentName} is attached.`,
        files: [attachment],
      });
    } catch (error) {
      await interaction.editReply(`Error reading raw OpenRouter text: ${error.message}`);
    }
    return;
  }

  if (interaction.commandName === "syncshortmemory") {
    await interaction.deferReply({ ephemeral: true });

    try {
      const direction = interaction.options.getString("direction") || "both";
      await ensureShortMemoryThreadId();

      if (direction === "local_to_discord") {
        const result = await enqueueAgentWork("sync shortmemory local to Discord", () => syncLocalShortMemoryToDiscord());
        await interaction.editReply(
          `Synced shortmemory local to Discord. Pushed ${result.pushedToDiscord} entries to forum post/thread ${shortMemoryThreadId}.`,
        );
        return;
      }

      if (direction === "discord_to_local") {
        const entryCount = await enqueueAgentWork("sync shortmemory Discord to local", () => syncLocalShortMemoryFromDiscord());
        await interaction.editReply(
          `Synced shortmemory Discord to local. Local file now has ${entryCount} entries from forum post/thread ${shortMemoryThreadId}.`,
        );
        return;
      }

      const result = await enqueueAgentWork("sync shortmemory both ways", () => syncShortMemoryBothWays());
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
      const result = await enqueueAgentWork(`scrape shortmemory ${channelId}`, () => scrapeShortMemoryFromChannel(channelId));
      const anchorText = result.anchorMessageId
        ? ` Anchor was ${agentName}'s latest reply ${result.anchorMessageId}.`
        : ` No ${agentName} reply anchor was found, so it used all readable messages.`;
      await interaction.editReply(
        `Added ${result.appended} new messages to shortmemory from channel ${channelId}. Selected ${result.selected} message entries from ${result.fetched} fetched messages, sorted by timestamp.${anchorText}`,
      );
    } catch (error) {
      await interaction.editReply(`Error scraping shortmemory: ${error.message}`);
    }
    return;
  }

  if (interaction.commandName === "scrapedmshortmemory") {
    await interaction.deferReply({ ephemeral: true });

    try {
      const result = await enqueueAgentWork(`scrape DM shortmemory ${interaction.user.id}`, () =>
        scrapeShortMemoryFromUserDm(interaction.user)
      );
      const anchorText = result.anchorMessageId
        ? ` Anchor was ${agentName}'s latest DM reply ${result.anchorMessageId}.`
        : ` No ${agentName} DM reply anchor was found, so it used all readable DM messages.`;
      await interaction.editReply(
        `Added ${result.appended} new DM messages to shortmemory. Selected ${result.selected} message entries from ${result.fetched} fetched messages, sorted by timestamp.${anchorText}`,
      );
    } catch (error) {
      await interaction.editReply(`Error scraping DM shortmemory: ${error.message}`);
    }
    return;
  }

  if (interaction.commandName !== "reloadpersona") return;

  await interaction.deferReply({ ephemeral: true });

  try {
    const characterCount = await enqueueAgentWork("reload persona", () => reloadPersonaFromDiscordSource());
    if (characterCount) {
      await interaction.editReply(
        `Grabbed persona from Discord persona source and reloaded ${agentName}. Persona is ${characterCount} characters.`,
      );
      return;
    }

    systemPrompt = await enqueueAgentWork("reload persona from disk", () => loadSystemPrompt());
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
