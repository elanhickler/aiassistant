const supportedImageTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

function limitText(text, maxCharacters) {
  const normalized = String(text || "").trim();
  if (normalized.length <= maxCharacters) return normalized;
  return `${normalized.slice(0, maxCharacters)}...`;
}

function imageAttachmentFromMessage(message) {
  if (!message?.attachments?.values) return null;
  for (const attachment of message.attachments.values()) {
    const contentType = String(attachment.contentType || "").toLowerCase();
    const name = String(attachment.name || "").toLowerCase();
    const looksLikeImage =
      supportedImageTypes.has(contentType) ||
      /\.(png|jpe?g|webp|gif)$/i.test(name);
    if (looksLikeImage && attachment.url) return attachment;
  }
  return null;
}

async function findImageAttachment(message) {
  const directAttachment = imageAttachmentFromMessage(message);
  if (directAttachment) return directAttachment;

  if (!message.reference?.messageId || !message.channel?.messages?.fetch) return null;
  const referencedMessage = await message.channel.messages.fetch(message.reference.messageId).catch(() => null);
  return imageAttachmentFromMessage(referencedMessage);
}

function mimeTypeForAttachment(attachment) {
  const contentType = String(attachment.contentType || "").toLowerCase();
  if (supportedImageTypes.has(contentType)) return contentType;

  const name = String(attachment.name || "").toLowerCase();
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".gif")) return "image/gif";
  return "image/jpeg";
}

async function attachmentToDataUrl(attachment, maxBytes) {
  const response = await fetch(attachment.url);
  if (!response.ok) throw new Error(`Could not fetch image attachment: HTTP ${response.status}`);

  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new Error(`Image attachment is too large for vision: ${contentLength} bytes, max ${maxBytes}.`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > maxBytes) {
    throw new Error(`Image attachment is too large for vision: ${buffer.length} bytes, max ${maxBytes}.`);
  }

  return `data:${mimeTypeForAttachment(attachment)};base64,${buffer.toString("base64")}`;
}

export function createVisionSkill(context) {
  const {
    openrouterApiKey,
    requiredSetting,
    safeReply,
    systemPrompt,
    writeRawOpenRouterText,
  } = context;

  const settings = requiredSetting("vision_skill");
  const model = String(settings.model || "").trim();
  if (!model) throw new Error("Missing required vision_skill.model because the vision skill is enabled.");
  const maxImageBytes = Number(settings.max_image_bytes || 6000000);
  const maxOutputCharacters = Number(settings.max_output_characters || 1800);

  async function describeImage(command, message) {
    const attachment = await findImageAttachment(message);
    if (!attachment) {
      throw new Error("vision needs an image attachment, or a reply to a message that has an image attachment.");
    }

    const userInstruction = String(command.content || "").trim() || "Describe this image.";
    const imageDataUrl = await attachmentToDataUrl(attachment, maxImageBytes);
    const messages = [
      {
        role: "system",
        content: [
          "# Agent-Wide Generation Defaults",
          typeof systemPrompt === "function" ? systemPrompt() : "",
          "",
          "# Vision Task",
          "You are a cautious image description assistant.",
          "Describe visible content, composition, style, and possible quality issues.",
          "Use uncertainty language when unsure. Do not invent identity, lore, intent, or hidden context.",
          "Do not turn observations into durable memory or image-generation critique by yourself.",
          "Human critique is more authoritative than this description.",
          "Keep the reply concise and useful.",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          { type: "text", text: userInstruction },
          { type: "image_url", image_url: { url: imageDataUrl } },
        ],
      },
    ];
    await writeRawOpenRouterText?.([
      messages[0],
      {
        role: "user",
        content: `${userInstruction}\n\n[image attachment: ${attachment.name || attachment.url}]`,
      },
    ], "vision");

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
        max_tokens: 700,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenRouter error ${response.status}: ${await response.text()}`);
    }

    const payload = await response.json();
    const description = payload.choices?.[0]?.message?.content?.trim();
    if (!description) throw new Error("OpenRouter returned an empty vision description.");
    return limitText(description, maxOutputCharacters);
  }

  return {
    name: "vision",
    requiredSettings() {
      return ["vision_skill"];
    },
    getPipeHelp({ agentCommandName, pipeRowsWithAliases }) {
      return pipeRowsWithAliases(
        agentCommandName,
        "vision",
        ": text",
        "Describe an attached image or the image in the replied-to message.",
      );
    },
    async handlePipeCommand(command, message) {
      if (command?.kind !== "vision") return false;
      const description = await describeImage(command, message);
      await safeReply(message, description);
      return true;
    },
  };
}
