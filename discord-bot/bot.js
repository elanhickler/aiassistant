import { createRequire } from "node:module";
import { readFileSync, unlinkSync } from "node:fs";
import { appendFile, mkdir, open, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildOpenRouterMessages } from "./context.js";
import { readShortMemoryEntries, shortMemoryEntriesToSource } from "./memory.js";
import { createMusicSkill } from "./skills/music.js";
import { plannedSkillNames } from "./skills/placeholders.js";
import { createDiscordStatusUpdateSkill } from "./skills/discordstatusupdate.js";
import { createStorySkill } from "./skills/story.js";
import { createTimeSkill } from "./skills/time.js";
import { createVisualExpressionSkill } from "./skills/visualexpression.js";

const require = createRequire(import.meta.url);
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
  scheduleAutoSummarization();
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

const temporaryErrorSeconds = 15;

async function replyWithTemporaryError(message, text) {
  const errorMessage = await safeReply(message, `${text}\n\nmessage will be removed in ${temporaryErrorSeconds} seconds`);
  setTimeout(() => {
    errorMessage.delete().catch(() => {});
  }, temporaryErrorSeconds * 1000);
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

function isMemoReactionEmoji(emoji) {
  const emojiName = String(emoji?.name || "");
  const emojiIdentifier = String(emoji?.identifier || "");
  return emojiName === "📝" ||
    emojiName === "✏️" ||
    emojiName === "✏" ||
    ["memo", "pencil"].includes(emojiName.toLowerCase()) ||
    emojiIdentifier.includes("%F0%9F%93%9D") ||
    emojiIdentifier.includes("%E2%9C%8F");
}

function isRedoReactionEmoji(emoji) {
  const emojiName = String(emoji?.name || "");
  const emojiIdentifier = String(emoji?.identifier || "");
  return emojiName === "🔁" || emojiName.toLowerCase() === "repeat" || emojiIdentifier.includes("%F0%9F%94%81");
}

function isRewindReactionEmoji(emoji) {
  const emojiName = String(emoji?.name || "");
  const emojiIdentifier = String(emoji?.identifier || "");
  return emojiName === "⏪" ||
    emojiName.toLowerCase() === "rewind" ||
    emojiIdentifier.includes("%E2%8F%AA");
}

function isReplaceReactionEmoji(emoji) {
  const emojiName = String(emoji?.name || "");
  const emojiIdentifier = String(emoji?.identifier || "");
  return emojiName === "▶️" ||
    emojiName === "▶" ||
    emojiName.toLowerCase() === "arrow_forward" ||
    emojiIdentifier.includes("%E2%96%B6");
}

function isMusicReactionEmoji(emoji) {
  const emojiName = String(emoji?.name || "");
  const emojiIdentifier = String(emoji?.identifier || "");
  return emojiName === "🎵" ||
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
const longMemoryPath = path.join(soulFolder, "longmemory.txt");
const shortMemoryPath = path.join(soulFolder, "shortmemory.jsonl");
const statusPath = path.join(soulFolder, "status.json");
const rawOpenRouterPath = path.join(soulFolder, "raw.txt");
const secretsFolder = path.join(agentFolder, "secrets");
const discordToken = await readTextFile(path.join(secretsFolder, "discord_token.txt"));
const openrouterApiKey = await readTextFile(path.join(secretsFolder, "openrouter_api_key.txt"));
const identity = requiredSetting("identity");
const name = String(identity.name);
const mentionRoleIds = new Set((identity.mention_role_ids || []).map((roleId) => String(roleId)));
const model = requiredSetting("model");
const utilityModel = requiredSetting("utility_model");
const openRouterProviderRouting = requiredSetting("openrouter_provider_routing");
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
async function loadSystemPrompt({ allowEmpty = false } = {}) {
  const agentPrompt = await readTextFile(systemPromptPath);
  const globalPrompt = await readTextFile(globalPersonaPath);
  if (!agentPrompt && !allowEmpty) throw new Error(`Persona file is empty: ${systemPromptPath}`);
  if (!globalPrompt) throw new Error(`Global persona file is empty: ${globalPersonaPath}`);
  const prompt = [agentPrompt, globalPrompt].filter((part) => part.trim()).join("\n\n");
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
const conversationHistoryLimit = Number(requiredSetting("conversation_history_limit"));
const secondsBeforeReply = Number(requiredSetting("seconds_before_reply"));
const discordReplyCharacterLimit = Number(requiredSetting("discord_reply_character_limit"));
const summarizationSettings = requiredSetting("summarization_settings");
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
let summarizationTimer = null;
let summarizationRunning = false;

async function writeRawOpenRouterText(messages, source = "unknown") {
  const text = [
    `source: ${source}`,
    `written_at: ${new Date().toISOString()}`,
    "",
    ...messages.map((message, index) => [
      `# message ${index + 1}: ${message.role || "unknown"}`,
      String(message.content || ""),
    ].join("\n")),
    "",
  ].join("\n\n");
  await writeFile(rawOpenRouterPath, text, "utf8");
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

const coreSkillNames = new Set(["story", "time"]);
const enabledSkills = requiredSetting("enabled_skills")
  .map((skillName) => String(skillName))
  .filter((skillName) => !coreSkillNames.has(skillName));
const allowedStatusModes = new Set(["awake", "sleepy", "sleeping", "dreaming", "away"]);

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

function statusFlagsForMode(mode) {
  return {
    awake: mode === "awake",
    sleepy: mode === "sleepy",
    sleeping: mode === "sleeping",
    dreaming: mode === "dreaming",
    away: mode === "away",
  };
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
    `energy: ${nextStatus.energy ?? ""}`,
    `current_activity: ${nextStatus.current_activity || ""}`,
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

async function addTimePassage(minutes, sleepTimerAdjustment = null) {
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

  const previousStatus = await readStatus();
  const energy = Number(previousStatus.energy);
  const energyGain = previousStatus.mode === "sleeping" || previousStatus.mode === "dreaming"
    ? Math.max(1, Math.floor(minutes / 6))
    : 0;
  const remainingSleepMinutes = Number(previousStatus.sleep_remaining_minutes);
  const nextStatus = {
    ...previousStatus,
    energy: Number.isFinite(energy) ? Math.min(100, energy + energyGain) : previousStatus.energy,
    last_time_passage_minutes: minutes,
    last_time_passage_at: new Date().toISOString(),
  };

  if (
    (previousStatus.mode === "sleeping" || previousStatus.mode === "dreaming") &&
    Number.isFinite(remainingSleepMinutes)
  ) {
    const adjustmentMinutes = Number(sleepTimerAdjustment?.minutes || 0);
    const nextRemainingSleepMinutes = remainingSleepMinutes - minutes - adjustmentMinutes;
    nextStatus.sleep_remaining_minutes = nextRemainingSleepMinutes;
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
  await appendStatusMemoryDump(previousStatus, nextStatus, "time passage");
  return nextStatus;
}

const coreSkillFactories = [
  createStorySkill,
  createTimeSkill,
];
const skillFactories = new Map([
  ["discordstatusupdate", createDiscordStatusUpdateSkill],
  ["music", createMusicSkill],
  ["visualexpression", createVisualExpressionSkill],
]);
const placeholderSkillNames = new Set(plannedSkillNames());
let skills = [];
const skillContext = {
  addTimePassage,
  agentName,
  bot,
  agentFolder,
  conversationHistoryLimit,
  findMemoryForumPostByName,
  getSkills: () => skills,
  longMemoryPath,
  model,
  openrouterApiKey,
  replyTemporarily,
  requiredSetting,
  safeReply,
  shortMemoryPath,
  statusApi,
  systemPrompt: () => systemPrompt,
  utilityModel,
  writeRawOpenRouterText,
};
skills = [
  ...coreSkillFactories.map((factory) => factory(skillContext)),
  ...enabledSkills.map((skillName) => {
    const factory = skillFactories.get(skillName);
    if (!factory && placeholderSkillNames.has(skillName)) {
      throw new Error(`Skill is planned but not implemented yet: ${skillName}`);
    }
    if (!factory) throw new Error(`Unknown enabled skill: ${skillName}`);
    return factory(skillContext);
  }),
];

async function runSkillHook(hookName, hookContext) {
  for (const skill of skills) {
    const hook = skill?.[hookName];
    if (typeof hook !== "function") continue;
    try {
      await hook(hookContext);
    } catch (error) {
      console.error(`Skill hook ${hookName} failed for ${skill.name || "unknown"}: ${error.message}`);
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
  for (const skill of skills) {
    try {
      if (await skill.handleInteraction?.(interaction)) return true;
    } catch (error) {
      const text = `Error running ${skill.name || "unknown"} command: ${error.message}`;
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
        "Rewrite the origin/backstory source material into a rich but still compressed durable lore summary.",
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
  ["longmemory", "Durable summary memory that survives beyond recent chat context."],
  ["shortmemory", "Recent conversation memory. Discord should be treated as the authority when configured."],
  ["dreams", "Dream output, associative fragments, and sleep-cycle creative notes."],
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
    [`||${agentCommandName} summarize||`, "Write soul/longmemory.txt."],
    [`||${agentCommandName} story||`, "Write a short story from recent context and memory."],
    [`||${agentCommandName} story: text||`, "Write a short story using the prompt plus recent context and memory."],
    [`||${agentCommandName} subtext: text||`, "Private assumptions/persona nudges; loosely stored later by summaries."],
    [`||${agentCommandName} sleep||`, "Set sleeping."],
    [`||${agentCommandName} wake||`, "Set awake."],
    [`||${agentCommandName} away||`, "Set away."],
    [`||${agentCommandName} state||`, "Show raw state mode, energy, and current activity."],
    [`||${agentCommandName} status||`, "Generate a natural-language status update from memory and current state."],
    [`||${agentCommandName} status: text||`, "Generate a natural-language status update using text as the basis or suggested status."],
    [`||${agentCommandName} passtimeminutes: 60||`, "Pass time in minutes."],
    [`||${agentCommandName} passtimehours: 8||`, "Pass time in hours."],
    [`||${agentCommandName} dream||`, "Dream from context; requires sleeping."],
    [`||${agentCommandName} dream: text||`, "Dream from seed text; requires sleeping."],
  ];

  if (enabledSkills.includes("music")) {
    pipeCommands.push(
      [`||${agentCommandName} music||`, "Search the internet for music based on shortmemory."],
      [`||${agentCommandName} music: link or text||`, "Search the internet for music based on description, or give a direct link."],
    );
  }

  if (enabledSkills.includes("visualexpression")) {
    pipeCommands.push(
      [`||${agentCommandName} visual||`, "Queue a local visual request from current context."],
      [`||${agentCommandName} visual: text||`, "Queue a local visual request from text."],
      [`||${agentCommandName} visual dream: text||`, "Queue a local dream visual request from text."],
      [`||${agentCommandName} visual emoji: text||`, "Queue a local emoji visual request from text."],
      [`||${agentCommandName} visual requests||`, "Show recent local visual requests and statuses."],
      [`||${agentCommandName} visual cancel||`, "Cancel the latest queued local visual request without deleting files."],
      [`||${agentCommandName} visual cancel: request-id||`, "Cancel a specific queued local visual request without deleting files."],
      [`||${agentCommandName} visual retry||`, "Clone the latest retryable failed/cancelled visual request into a new queued request."],
      [`||${agentCommandName} visual retry: request-id||`, "Clone a specific failed/cancelled visual request into a new queued request."],
      [`||${agentCommandName} visual process||`, "Dry-run queued local visual requests to the current provider-unimplemented state."],
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
      "* `❌` / `:x:` : Delete a bot reply and remove its matching assistant shortmemory entry.",
      "* `🔁` / `:repeat:` : Delete the bot reply from memory, then redo a fresh reply to the previous user message.",
      "* `⏪` / `:rewind:` : Delete a bot reply, remove that reply from shortmemory, and remove the previous user message from shortmemory only.",
      "* `📝` / `:pencil:` : Temporarily reply `your next reply replaces the content of my last reply`, then use your next message as a technical edit of that bot reply and update shortmemory.",
      "* `▶️` / `:arrow_forward:` : Temporarily reply `next reply replaces my text` for the replacement pipeline.",
      "* `🎵` / `:musical_note:` : Run the music skill from recent shortmemory and post a formatted music link.",
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
  await backupFileBeforeOverwrite(absoluteFilePath, `overwrite-${path.basename(relativeFilePath)}`);
  await writeFile(absoluteFilePath, text, "utf8");
  return absoluteFilePath;
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
    const sourceText = shortMemoryEntriesToSource(selectedEntries);
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
    const postedLongMemoryPreview = await postLongMemoryPreview({
      outputFile,
      outputText: summaryText,
    });
    const deletedAdjustmentMessages = await deleteMemoryForumPostReplies("adjustments").catch((error) => {
      console.error(`Could not clean adjustments after summarization: ${error.message}`);
      return 0;
    });
    console.log(
      `Summarized ${selectedEntries.length} shortmemory entries for ${agentName}; wrote longmemory to ${outputPath}; cleaned ${deletedAdjustmentMessages} adjustment messages.`,
    );
    await runSkillHook("afterSummary", {
      entries: selectedEntries,
      outputFile,
      outputPath,
      selectedEntryCount: selectedEntries.length,
      sourceText,
      summarizedAt: new Date().toISOString(),
      summaryText,
    });
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
      deletedAdjustmentMessages,
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

function parsePipeCommandText(text, isDm) {
  const targetedText = stripPipeCommandTarget(text, isDm);
  if (!targetedText) return null;

  const visualMatch = targetedText.match(/^visual(?:\s+(requests|cancel|retry|process|emoji|self|scene|background|thought|dream))?(?:\s*:\s*([\s\S]*))?$/i);
  if (visualMatch) {
    const visualKeyword = (visualMatch[1] || "").toLowerCase();
    return {
      kind: "visual",
      action: ["cancel", "process", "requests", "retry"].includes(visualKeyword) ? visualKeyword : "",
      outputType: ["cancel", "process", "requests", "retry"].includes(visualKeyword) ? "" : visualKeyword,
      content: (visualMatch[2] || "").trimStart().trimEnd(),
    };
  }

  const commandMatch = targetedText.match(/^(reply|continue|adjust|subtext|summarize|story|music|dream|sleep|wake|away|state|status|passtimeminutes|passtimehours)(?:\s*:\s*([\s\S]*))?$/i);
  if (!commandMatch) return null;

  const kind = commandMatch[1].toLowerCase();
  const content = (commandMatch[2] || "").trimStart().trimEnd();
  if (!["reply", "continue", "dream", "sleep", "wake", "away", "state", "status", "summarize", "story", "music"].includes(kind) && !content) return null;
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

  const reply = await withTypingHeartbeat(contextSource.channel, () => askOpenRouter(contextSource));
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

async function sendRegeneratedReply(message, userContent) {
  const formattedUserContent = formatUserContentWithPipeSubtext(message, userContent);
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
  const formattedUserContent = formatUserContentWithPipeSubtext(originalUserMessage, originalUserMessage.content);
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

  const formattedUserContent = formatUserContentWithPipeSubtext(targetMessage, targetMessage.content || "");
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
  await sendPipeReply(message, command.kind === "continue" ? command.content : "");
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

  await forgetBotReply(originalReply, "Adjusted");
  await originalReply.delete().catch(() => {});

  const sentMessage = await sendAdjustedReply(originalUserMessage, originalReplyText, adjustInstruction);
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
  return `Summarized ${result.entries} shortmemory entries for ${agentName}. Wrote longmemory: ${result.outputFile}. Longmemory Discord preview: ${result.postedLongMemoryPreview ? "posted" : "not found"}. Cleaned adjustments: ${result.deletedAdjustmentMessages || 0}.`;
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

  return parsePipeCommandText(wholeMessageMatch[1], message.channel?.isDMBased?.());
}

async function handleSkillPipeCommand(command, message) {
  if (!command) return false;
  for (const skill of skills) {
    if (await skill.handlePipeCommand?.(command, message)) return true;
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
  const ambientLocationMatches =
    locationReplyMode === "all" ||
    (locationReplyMode === "listed" &&
      (message.channel?.isDMBased?.() ||
        replyToChannelIds.has(String(message.channelId)) ||
        replyToServerIds.has(String(message.guildId))));
  const locationRequired = onlyAllowRepliesToSpecificChannels || !directTargetMatches;
  if (locationReplyMode === "none" && locationRequired) return false;
  if (locationRequired && !ambientLocationMatches) {
    console.log(
      `Skipped ${agentName} reply: channel ${message.channelId} / server ${message.guildId || "dm"} is not in reply_to lists. only_allow_replies_to_specific_channels=${onlyAllowRepliesToSpecificChannels}; mentioned=${mentioned}; nameUsed=${nameUsed}.`,
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
    originSummaryPath,
    persona: systemPrompt,
    shortMemoryPath,
    statusPath,
    skills,
    timePassages: pendingTimePassages,
  });
  await writeRawOpenRouterText(messages, "normal reply");

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
    if (choice?.error?.message) {
      throw new Error(`OpenRouter generation error ${choice.error.code || "unknown"}: ${choice.error.message}`);
    }
    const messageKeys = choice?.message ? Object.keys(choice.message).join(", ") : "none";
    const refusal = choice?.message?.refusal ? ` refusal=${JSON.stringify(choice.message.refusal).slice(0, 500)}` : "";
    const finishReason = choice?.finish_reason || choice?.native_finish_reason || "unknown";
    console.error(`OpenRouter empty reply payload: ${JSON.stringify(payload).slice(0, 2000)}`);
    throw new Error(`OpenRouter returned an empty reply. finish_reason=${finishReason}; message_keys=${messageKeys}.${refusal}`);
  }
  return reply;
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
    if (await handleSkillPipeCommand(wholePipeCommand, message)) return;
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
    if (await handleSleepingMessage(message)) return;
  } catch (error) {
    await replyWithTemporaryError(message, formatTemporaryError("Error handling sleep status", error));
    return;
  }

  try {
    if (await handleNaturalLanguageMusicIntent(message)) return;
  } catch (error) {
    await replyWithTemporaryError(message, formatTemporaryError("Error finding music", error));
    return;
  }

  try {
    await sendGeneratedReply(message, message.content);
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

    await deleteDiscordMessageIfExists(message, `${agentName} reply ${message.id}`);
    console.log(
      `Deleted ${agentName} reply ${message.id} from ${source} reaction by ${userId}; removed ${localDeleted} local and ${discordDeleted} Discord shortmemory entries.`,
    );
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
        `Ignored 🔁 reaction by ${userId} on non-${agentName} message ${message.id} in channel ${message.channelId}.`,
      );
      return;
    }

    const userMessage = await findUserMessageBeforeBotReply(message);
    if (!userMessage) {
      console.error(`Could not redo ${agentName} reply ${message.id}: no earlier user message found.`);
      return;
    }

    await forgetBotReply(message, "Redid");
    await deleteDiscordMessageIfExists(message, `${agentName} reply ${message.id}`);
    await userMessage.channel.sendTyping();
    await sendRegeneratedReply(userMessage, userMessage.content);
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
        `Ignored ⏪ reaction by ${userId} on non-${agentName} message ${message.id} in channel ${message.channelId}.`,
      );
      return;
    }

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
    await reaction.users.remove(userId).catch((error) => {
      console.error(`Could not remove reaction ${reaction.emoji?.name || "unknown"} from ${userId}: ${error.message}`);
    });
  }
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
  return true;
}

async function handleMemoReaction({ message, userId, source }) {
  try {
    if (!rememberReactionAction(message, userId, "replace")) return;

    if (String(message.author?.id) !== String(bot.user.id)) {
      console.log(
        `Ignored replace reaction by ${userId} on non-${agentName} message ${message.id} in channel ${message.channelId}.`,
      );
      return;
    }

    setPendingReplyEdit(message, userId);
    await removeMatchingUserReaction(message, userId, isMemoReactionEmoji);
    const acknowledgement = await replyTemporarily(message, "your next reply replaces the content of my last reply");
    setPendingReplyEditAcknowledgement(message.channelId, userId, acknowledgement);
    console.log(
      `Acknowledged replace reaction on ${agentName} reply ${message.id} from ${source} reaction by ${userId}.`,
    );
  } catch (error) {
    console.error(`Error handling replace reaction: ${error.message}`);
  }
}

async function handleMusicReaction({ message, userId, source }) {
  try {
    if (!rememberReactionAction(message, userId, "music")) return;

    if (String(message.author?.id) !== String(bot.user.id)) {
      console.log(
        `Ignored 🎵 reaction by ${userId} on non-${agentName} message ${message.id} in channel ${message.channelId}.`,
      );
      return;
    }

    const musicSkill = skills.find((skill) => skill.name === "music" && typeof skill.runMusicRequest === "function");
    if (!musicSkill) {
      await replyWithTemporaryError(message, "Music skill is not enabled for this agent.");
      return;
    }

    await message.channel.sendTyping();
    const musicLink = await musicSkill.runMusicRequest("");
    await safeReply(message, musicLink);
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
      !isRewindReactionEmoji(reaction.emoji) &&
      !isReplaceReactionEmoji(reaction.emoji) &&
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
    if (isRewindReactionEmoji(reaction.emoji)) {
      await handleRewindReaction({ message, userId: String(user.id), source: "messageReactionAdd" });
      return;
    }
    if (isMusicReactionEmoji(reaction.emoji)) {
      await handleMusicReaction({ message, userId: String(user.id), source: "messageReactionAdd" });
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
    !isRewindReactionEmoji(data.emoji) &&
    !isReplaceReactionEmoji(data.emoji) &&
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
    if (isRewindReactionEmoji(data.emoji)) {
      await handleRewindReaction({ message, userId: String(data.user_id), source: "raw" });
      return;
    }
    if (isMusicReactionEmoji(data.emoji)) {
      await handleMusicReaction({ message, userId: String(data.user_id), source: "raw" });
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
      conversationHistory.length = 0;
      await backupFileBeforeOverwrite(shortMemoryPath, "clearshortmemory");
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
      const result = await scrapeShortMemoryFromChannel(channelId);
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
      const result = await scrapeShortMemoryFromUserDm(interaction.user);
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
    const characterCount = await reloadPersonaFromDiscordSource();
    if (characterCount) {
      await interaction.editReply(
        `Grabbed persona from Discord persona source and reloaded ${agentName}. Persona is ${characterCount} characters.`,
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
