import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import path from "node:path";

const supportedAudioTypes = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/ogg",
  "audio/opus",
  "audio/wav",
  "audio/wave",
  "audio/x-wav",
  "audio/webm",
]);

function timestampForFilename() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function safeName(text, fallback = "speak") {
  return String(text || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || fallback;
}

function limitText(text, maxCharacters) {
  const normalized = String(text || "").trim();
  if (normalized.length <= maxCharacters) return normalized;
  return `${normalized.slice(0, maxCharacters)}...`;
}

function parseTrainInput(content) {
  const text = String(content || "").trim();
  const trainMatch = text.match(/^(?:train|clone|upload)(?:\s+voice)?(?:\s*:\s*|\s+)([\s\S]*)$/i);
  if (!trainMatch) return null;

  const parts = trainMatch[1].split("|").map((part) => part.trim());
  return {
    title: parts[0] || "Agent voice",
    transcript: parts[1] || "",
    description: parts[2] || "",
  };
}

function audioAttachmentFromMessage(message) {
  if (!message?.attachments?.values) return null;
  for (const attachment of message.attachments.values()) {
    const contentType = String(attachment.contentType || "").toLowerCase();
    const name = String(attachment.name || "").toLowerCase();
    const looksLikeAudio =
      supportedAudioTypes.has(contentType) ||
      /\.(wav|mp3|m4a|opus|ogg|webm)$/i.test(name);
    if (looksLikeAudio && attachment.url) return attachment;
  }
  return null;
}

async function findAudioAttachment(message) {
  const directAttachment = audioAttachmentFromMessage(message);
  if (directAttachment) return directAttachment;

  if (!message.reference?.messageId || !message.channel?.messages?.fetch) return null;
  const referencedMessage = await message.channel.messages.fetch(message.reference.messageId).catch(() => null);
  return audioAttachmentFromMessage(referencedMessage);
}

function audioMimeType(attachment) {
  const contentType = String(attachment.contentType || "").toLowerCase();
  if (supportedAudioTypes.has(contentType)) return contentType;

  const name = String(attachment.name || "").toLowerCase();
  if (name.endsWith(".wav")) return "audio/wav";
  if (name.endsWith(".m4a")) return "audio/mp4";
  if (name.endsWith(".opus")) return "audio/opus";
  if (name.endsWith(".ogg")) return "audio/ogg";
  if (name.endsWith(".webm")) return "audio/webm";
  return "audio/mpeg";
}

async function attachmentToBlob(attachment, maxBytes) {
  const response = await fetch(attachment.url);
  if (!response.ok) throw new Error(`Could not fetch audio attachment: HTTP ${response.status}`);

  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new Error(`Audio attachment is too large: ${contentLength} bytes, max ${maxBytes}.`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > maxBytes) {
    throw new Error(`Audio attachment is too large: ${buffer.length} bytes, max ${maxBytes}.`);
  }

  return {
    blob: new Blob([buffer], { type: audioMimeType(attachment) }),
    byteLength: buffer.length,
  };
}

function fishErrorText(payload) {
  if (!payload) return "";
  if (typeof payload === "string") return payload;
  return payload.message || JSON.stringify(payload);
}

export function createSpeakSkill(context) {
  const {
    agentFolder,
    safeReply,
    requiredSetting,
  } = context;

  const settings = requiredSetting("speak_skill");
  const provider = String(settings.provider || "fishaudio");
  if (provider !== "fishaudio") throw new Error(`Unsupported speak_skill.provider: ${provider}`);

  const outputFolder = path.join(agentFolder, String(settings.output_folder || "regenerated/speak"));
  const generatedFolder = path.join(outputFolder, "generated");
  const voiceModelLogPath = path.join(outputFolder, String(settings.voice_model_log_file || "voice-models.jsonl"));
  const apiKeyPath = path.join(agentFolder, String(settings.api_key_file || "secrets/fish_audio_api_key.txt"));
  const maxTrainingAudioBytes = Number(settings.max_training_audio_bytes || 25000000);

  async function fishApiKey() {
    const key = (await readFile(apiKeyPath, "utf8")).trim();
    if (!key) throw new Error(`Fish Audio API key file is empty: ${apiKeyPath}`);
    return key;
  }

  async function generateSpeech({ text, referenceId = "" } = {}) {
    const spokenText = String(text || "").trim();
    if (!spokenText) throw new Error("speak needs text.");

    const format = String(settings.format || "mp3");
    const payload = {
      text: spokenText,
      reference_id: referenceId || String(settings.reference_id || "") || undefined,
      prosody: {
        speed: Number(settings.speed || 1),
        volume: Number(settings.volume || 0),
        normalize_loudness: true,
      },
      normalize: true,
      format,
      latency: String(settings.latency || "normal"),
    };

    const response = await fetch("https://api.fish.audio/v1/tts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${await fishApiKey()}`,
        "Content-Type": "application/json",
        model: String(settings.model || "s2-pro"),
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorPayload = await response.text().catch(() => "");
      throw new Error(`Fish Audio TTS failed ${response.status}: ${errorPayload}`);
    }

    await mkdir(generatedFolder, { recursive: true });
    const audio = Buffer.from(await response.arrayBuffer());
    const fileName = `${timestampForFilename()}-${safeName(spokenText)}.${format}`;
    const filePath = path.join(generatedFolder, fileName);
    await writeFile(filePath, audio);

    return {
      fileName,
      filePath,
      byteLength: audio.length,
      text: spokenText,
    };
  }

  async function trainVoiceModel({ title, transcript = "", description = "", attachment } = {}) {
    if (!attachment) throw new Error("speak voice training needs an audio attachment or a reply to an audio attachment.");

    const { blob, byteLength } = await attachmentToBlob(attachment, maxTrainingAudioBytes);
    const form = new FormData();
    form.append("type", "tts");
    form.append("title", title || "Agent voice");
    form.append("train_mode", "fast");
    form.append("visibility", String(settings.training_visibility || "private"));
    form.append("enhance_audio_quality", String(settings.enhance_audio_quality !== false));
    form.append("generate_sample", "false");
    if (description) form.append("description", description);
    if (transcript) form.append("texts", transcript);
    form.append("voices", blob, attachment.name || "voice-sample.wav");

    const response = await fetch("https://api.fish.audio/model", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${await fishApiKey()}`,
      },
      body: form,
    });

    const contentType = response.headers.get("content-type") || "";
    const payload = contentType.includes("application/json")
      ? await response.json().catch(() => null)
      : await response.text().catch(() => "");

    if (!response.ok) {
      throw new Error(`Fish Audio voice training failed ${response.status}: ${fishErrorText(payload)}`);
    }

    const modelId = payload?.id || payload?._id || payload?.model_id || "";
    const record = {
      provider,
      model_id: modelId,
      state: payload?.state || "",
      title: title || "Agent voice",
      transcript_provided: Boolean(transcript),
      description,
      source_attachment_name: attachment.name || "",
      source_attachment_bytes: byteLength,
      created_at: new Date().toISOString(),
      response: payload,
    };

    await mkdir(outputFolder, { recursive: true });
    await appendFile(voiceModelLogPath, `${JSON.stringify(record)}\n`);
    return record;
  }

  async function handlePipeCommand(command, message) {
    if (command?.kind !== "speak") return false;

    const trainInput = parseTrainInput(command.content);
    if (trainInput) {
      const attachment = await findAudioAttachment(message);
      const voice = await trainVoiceModel({ ...trainInput, attachment });
      await safeReply(message, [
        "voice training upload complete",
        `provider: ${provider}`,
        `voice_id: ${voice.model_id || "(not returned)"}`,
        `state: ${voice.state || "(unknown)"}`,
      ].join("\n"));
      return true;
    }

    const speech = await generateSpeech({ text: command.content });
    await message.reply({
      content: `speech generated: ${limitText(speech.text, 120)}`,
      files: [speech.filePath],
    });
    return true;
  }

  return {
    name: "speak",
    requiredSettings() {
      return ["speak_skill"];
    },
    getPipeHelp({ agentCommandName, pipeRowsWithAliases }) {
      return pipeRowsWithAliases(
        agentCommandName,
        "speak",
        ": text",
        "Generate spoken audio from text, or train a voice with speak: train voice title | transcript plus an audio attachment.",
      );
    },
    generateSpeech,
    handlePipeCommand,
    trainVoiceModel,
  };
}
