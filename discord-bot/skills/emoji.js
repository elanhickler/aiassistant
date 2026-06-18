import path from "node:path";
import { readdir } from "node:fs/promises";
import { readShortMemoryEntries } from "../memory.js";

const imageExtensions = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);

function parseJsonObjectFromText(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return null;
  try {
    const direct = JSON.parse(trimmed);
    if (direct && typeof direct === "object" && !Array.isArray(direct)) return direct;
  } catch {
    // Try extracting a JSON object from model text that ignored the strict instruction.
  }

  const objectMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!objectMatch) return null;
  const extracted = JSON.parse(objectMatch[0]);
  return extracted && typeof extracted === "object" && !Array.isArray(extracted) ? extracted : null;
}

function filenameWords(filename) {
  return path
    .basename(filename, path.extname(filename))
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter(Boolean);
}

function scoreEmojiFilename(filename, contextText) {
  const words = filenameWords(filename);
  const context = String(contextText || "").toLowerCase();
  let score = 0;

  for (const word of words) {
    if (context.includes(word)) score += 4;
  }

  const moodAliases = [
    ["happy", ["happy", "joy", "cheer", "glad", "smile", "pleased"]],
    ["laugh", ["laugh", "funny", "giggle", "silly"]],
    ["love", ["love", "affection", "heart", "sweet", "tender"]],
    ["sleepy", ["sleep", "sleepy", "tired", "drowsy", "bed", "nap"]],
    ["angry", ["angry", "mad", "annoyed", "irritated"]],
    ["frustrated", ["frustrated", "stuck", "upset"]],
    ["fear", ["fear", "scared", "afraid", "nervous", "panic"]],
    ["confused", ["confused", "unsure", "uncertain", "question"]],
    ["excited", ["excited", "eager", "sparkle", "hype"]],
    ["flustered", ["flustered", "blush", "embarrassed", "shy"]],
    ["surprised", ["surprised", "shock", "startled"]],
    ["smug", ["smug", "proud", "confident", "tease"]],
    ["wave", ["hello", "hi", "wave", "greet"]],
    ["thumbs", ["yes", "okay", "ok", "approve", "good", "thumbs"]],
    ["peace", ["peace", "calm", "relaxed"]],
  ];

  for (const word of words) {
    for (const [key, aliases] of moodAliases) {
      if (word !== key) continue;
      if (aliases.some((alias) => context.includes(alias))) score += 3;
    }
  }

  return score;
}

function chooseEmojiFallback(candidates, contextText) {
  return [...candidates]
    .map((candidate) => ({
      candidate,
      score: scoreEmojiFilename(candidate.name, contextText),
    }))
    .sort((a, b) => b.score - a.score || a.candidate.name.localeCompare(b.candidate.name))[0]?.candidate;
}

function chooseStatusEmoji(candidates, status, commandText) {
  if (String(commandText || "").trim()) return null;

  const mode = String(status?.mode || "").toLowerCase();
  const activity = String(status?.current_activity || "").toLowerCase();
  const isSleepLike =
    mode === "sleeping" ||
    mode === "falling_asleep" ||
    mode === "dreaming" ||
    /\b(asleep|sleep|sleepy|drowsy|dream|nap|bed)\b/.test(activity);
  if (!isSleepLike) return null;

  return candidates.find((candidate) => {
    const words = filenameWords(candidate.name);
    return words.some((word) => ["sleep", "sleepy", "drowsy", "dream", "nap", "bed"].includes(word));
  }) || null;
}

function discordEmojiDisplayUrl(url, size = 256) {
  const text = String(url || "").trim();
  const match = text.match(/^(https:\/\/cdn\.discordapp\.com\/attachments\/\d+\/\d+\/[^?]+?\.(?:png|jpe?g|webp|gif))/i);
  const stableUrl = match?.[1] || text;
  if (!/^https:\/\/cdn\.discordapp\.com\/attachments\//i.test(stableUrl)) return stableUrl;

  const proxiedUrl = stableUrl.replace(/^https:\/\/cdn\.discordapp\.com\//i, "https://media.discordapp.net/");
  const separator = proxiedUrl.includes("?") ? "&" : "?";
  return `${proxiedUrl}${separator}width=${size}&height=${size}`;
}

export function createEmojiSkill(context) {
  const {
    agentFolder,
    agentName,
    findMemoryForumPostByName,
    openrouterApiKey,
    requiredSetting,
    shortMemoryPath,
    statusApi,
    systemPrompt,
    utilityModel,
  } = context;

  const emojisFolder = path.join(agentFolder, "soul", "emojis");
  const hostedEmojiUrlsByName = new Map();

  async function listEmojiFiles() {
    const entries = await readdir(emojisFolder, { withFileTypes: true }).catch((error) => {
      if (error.code === "ENOENT") return [];
      throw error;
    });

    return entries
      .filter((entry) => entry.isFile() && imageExtensions.has(path.extname(entry.name).toLowerCase()))
      .map((entry) => ({
        name: entry.name,
        path: path.join(emojisFolder, entry.name),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async function askUtilityJson(messages) {
    const globalPersona = String(systemPrompt?.() || "").trim();
    const response = await fetch(`${requiredSetting("openrouter_base_url")}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openrouterApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: utilityModel,
        messages: [
          {
            role: "system",
            content: [
              `# Persona: ${agentName}`,
              globalPersona,
              "# Task",
              "Choose one emoji image filename. Return strict JSON only.",
            ].filter(Boolean).join("\n\n"),
          },
          ...messages,
        ],
        max_tokens: 140,
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`OpenRouter error ${response.status}: ${text}`);
    }

    const payload = await response.json();
    const raw = payload.choices?.[0]?.message?.content?.trim();
    if (!raw) throw new Error("OpenRouter returned an empty emoji decision.");
    return parseJsonObjectFromText(raw);
  }

  async function chooseEmoji(commandText = "") {
    const candidates = await listEmojiFiles();
    if (candidates.length === 0) {
      throw new Error("No emoji images found in soul/emojis.");
    }

    const status = await statusApi.get().catch(() => ({}));
    const recentEntries = (await readShortMemoryEntries(shortMemoryPath)).slice(-12);
    const recentText = recentEntries
      .map((entry) => `${entry.role || ""} ${entry.username || ""}: ${entry.content || ""}`)
      .join("\n");
    const contextText = [
      commandText,
      JSON.stringify(status, null, 2),
      recentText,
    ].join("\n\n");

    const statusSelected = chooseStatusEmoji(candidates, status, commandText);
    if (statusSelected) return statusSelected;

    try {
      const decision = await askUtilityJson([
        {
          role: "user",
          content: [
            "Choose the best emoji image for the agent to post right now.",
            "Interpret filenames naturally and cross-reference them with mood, status, activity, and recent conversational context.",
            "If extra user guidance is provided, treat it as a one-time mood/context hint.",
            "Choose exactly one filename from the candidate list. Do not invent filenames.",
            "",
            `extra guidance: ${commandText || "(none)"}`,
            "",
            "status:",
            JSON.stringify(status, null, 2),
            "",
            "candidate filenames:",
            candidates.map((candidate) => `- ${candidate.name}`).join("\n"),
            "",
            "recent conversation:",
            recentText || "(none)",
            "",
            'Return JSON only: {"file":"exact filename from candidates","reason":"short reason"}',
          ].join("\n"),
        },
      ]);

      const requestedFile = String(decision?.file || "").trim();
      const selected = candidates.find((candidate) => candidate.name.toLowerCase() === requestedFile.toLowerCase());
      if (selected) return selected;
    } catch (error) {
      console.error(`Emoji utility choice failed for ${agentName}: ${error.message}`);
    }

    return chooseEmojiFallback(candidates, contextText) || candidates[0];
  }

  function attachmentUrlFromMessage(message, selectedName) {
    for (const attachment of message?.attachments?.values?.() || []) {
      if (String(attachment.name || "").toLowerCase() === selectedName.toLowerCase() && attachment.url) {
        return attachment.url;
      }
    }
    return "";
  }

  async function findHostedEmojiUrl(selected) {
    const cachedUrl = hostedEmojiUrlsByName.get(selected.name);
    if (cachedUrl) return cachedUrl;

    const emojiPost = await findMemoryForumPostByName?.("emoji").catch((error) => {
      console.error(`Could not find emoji memory post for ${agentName}: ${error.message}`);
      return null;
    });
    if (!emojiPost?.messages?.fetch) return "";

    const messages = await emojiPost.messages.fetch({ limit: 100 }).catch((error) => {
      console.error(`Could not read emoji memory post for ${agentName}: ${error.message}`);
      return null;
    });
    for (const memoryMessage of messages?.values?.() || []) {
      const url = attachmentUrlFromMessage(memoryMessage, selected.name);
      if (!url) continue;
      hostedEmojiUrlsByName.set(selected.name, url);
      return url;
    }

    const uploaded = await emojiPost.send({
      content: `emoji: ${selected.name}`,
      files: [{ attachment: selected.path, name: selected.name }],
    });
    const url = attachmentUrlFromMessage(uploaded, selected.name);
    if (!url) throw new Error(`Emoji memory upload did not return an attachment URL for ${selected.name}.`);
    hostedEmojiUrlsByName.set(selected.name, url);
    console.log(`Uploaded emoji ${selected.name} to ${agentName} emoji memory post.`);
    return url;
  }

  async function postEmoji(message, commandText = "") {
    const selected = await chooseEmoji(commandText);
    const hostedUrl = await findHostedEmojiUrl(selected).catch((error) => {
      console.error(`Emoji memory hosting failed for ${agentName} ${selected.name}: ${error.message}`);
      return "";
    });
    if (hostedUrl) {
      return message.reply(discordEmojiDisplayUrl(hostedUrl));
    }
    return message.reply({ files: [{ attachment: selected.path, name: selected.name }] });
  }

  return {
    name: "emoji",
    getPipeHelp({ agentCommandName }) {
      return [
        [`||${agentCommandName} emoji||`, "Post an emoji image from soul/emojis based on mood, status, and recent context."],
        [`||${agentCommandName} emoji: text||`, "Post an emoji using extra one-time mood/context guidance."],
      ];
    },
    async handlePipeCommand(command, message) {
      if (command?.kind !== "emoji") return false;
      await message.channel.sendTyping();
      const reply = await postEmoji(message, command.content);
      console.log(`Posted emoji ${reply?.attachments?.first?.()?.name || "image"} for ${agentName} from pipe command ${message.id}.`);
      return true;
    },
  };
}
