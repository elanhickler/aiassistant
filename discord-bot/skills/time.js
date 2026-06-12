import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

async function readDreamSourceFile(agentFolder, sourceFile) {
  const filePath = path.join(agentFolder, sourceFile);
  const text = await readFile(filePath, "utf8").catch((error) => {
    if (error.code === "ENOENT") throw new Error(`Missing dream source file: ${sourceFile}`);
    throw error;
  });
  return {
    relativeFilePath: sourceFile,
    text: text.trim(),
  };
}

function limitText(text, maxCharacters) {
  if (text.length <= maxCharacters) return text;
  return `${text.slice(0, maxCharacters)}\n...`;
}

function timestampForFilename() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

export function createTimeSkill(context) {
  const {
    addTimePassage,
    agentFolder,
    agentName,
    bot,
    model,
    openrouterApiKey,
    requiredSetting,
    safeReply,
    statusApi,
    systemPrompt,
  } = context;

  const dreamSettings = requiredSetting("dream_settings");
  const autoStatusSettings = {
    enabled: true,
    minimumConfidence: 0.72,
  };

  async function findMemoryForumPostByName(postName) {
    const forumChannelId = String(requiredSetting("memory_forum_channel_id"));
    const forum = await bot.channels.fetch(forumChannelId);
    if (!forum?.threads?.fetchActive) return null;

    const active = await forum.threads.fetchActive();
    const archived = await forum.threads.fetchArchived({ limit: 100 }).catch(() => ({ threads: new Map() }));
    const threads = [...active.threads.values(), ...archived.threads.values()];
    return threads.find((thread) => thread.name.toLowerCase() === postName.toLowerCase()) || null;
  }

  async function postDreamToDiscord(dreamText, dreamFileName) {
    const dreamsPost = await findMemoryForumPostByName("dreams");
    if (!dreamsPost?.send) return false;

    const message = [`dream_file: ${dreamFileName}`, "", dreamText].join("\n");
    await dreamsPost.send(message.length <= 1900 ? message : `${message.slice(0, 1900)}\n...`);
    return true;
  }

  async function readRecentDreams(outputFolder) {
    const files = await readdir(outputFolder, { withFileTypes: true }).catch((error) => {
      if (error.code === "ENOENT") return [];
      throw error;
    });
    const dreamFiles = files
      .filter((entry) => entry.isFile() && /^dream-.*\.md$/i.test(entry.name))
      .map((entry) => path.join(outputFolder, entry.name))
      .sort()
      .slice(-3);
    const dreams = [];
    for (const dreamFile of dreamFiles) {
      dreams.push({
        relativeFilePath: path.relative(agentFolder, dreamFile),
        text: limitText((await readFile(dreamFile, "utf8")).trim(), 8000),
      });
    }
    return dreams;
  }

  async function generateDream(promptText = "") {
    await statusApi.requireMode(["sleeping"], "dream");

    if (!Boolean(dreamSettings.enabled)) {
      throw new Error("dream_settings.enabled is false. Set it to true before generating dreams.");
    }

    const previousStatus = await statusApi.get();
    await statusApi.setMode("dreaming", "Generating a dream.");

    try {
      const outputFolder = path.join(agentFolder, String(dreamSettings.output_folder));
      await mkdir(outputFolder, { recursive: true });

      const sourceFiles = await Promise.all(
        dreamSettings.source_files.map((sourceFile) => readDreamSourceFile(agentFolder, String(sourceFile))),
      );
      const recentDreams = await readRecentDreams(outputFolder);
      const maxWords = Number(dreamSettings.max_words || 500);
      const sourceText = [...sourceFiles, ...recentDreams]
        .map((sourceFile) => [`# ${sourceFile.relativeFilePath}`, sourceFile.text].join("\n"))
        .join("\n\n");
      const dreamModeInstruction = promptText
        ? "The agent is sleeping. Write one literal dream that uses the user's dream seed as a major ingredient."
        : "The agent is sleeping. Write one literal dream from context and previous dreams.";
      const promptBlock = promptText ? ["# User Dream Seed", promptText, ""].join("\n") : "";
      const messages = [
        {
          role: "system",
          content: [
            `# Persona: ${agentName}`,
            systemPrompt(),
            "",
            "# Dream Task",
            dreamModeInstruction,
            "Use memory and soul material as dream ingredients, but transform them associatively instead of summarizing them.",
            "Dreams may be symbolic, emotional, strange, sweet, uneasy, or beautiful.",
            "Do not claim the dream is factual memory. Do not update longmemory. Do not explain the mechanism.",
            `Keep the dream under ${maxWords} words.`,
          ].join("\n"),
        },
        {
          role: "user",
          content: [promptBlock, `Dream source material for ${agentName}:`, "", sourceText].join("\n"),
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
          temperature: Number(requiredSetting("chaos")),
          max_tokens: Math.max(200, Math.ceil(maxWords * 1.7)),
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenRouter error ${response.status}: ${await response.text()}`);
      }

      const payload = await response.json();
      const dreamText = payload.choices?.[0]?.message?.content?.trim();
      if (!dreamText) throw new Error("OpenRouter returned an empty dream.");

      const fileName = `dream-${timestampForFilename()}.md`;
      const filePath = path.join(outputFolder, fileName);
      const fileText = [
        `# Dream ${new Date().toISOString()}`,
        "",
        `agent: ${agentName}`,
        `source_files: ${sourceFiles.map((sourceFile) => sourceFile.relativeFilePath).join(", ")}`,
        "",
        dreamText,
        "",
      ].join("\n");
      await writeFile(filePath, fileText, "utf8");
      const postedToDiscord = await postDreamToDiscord(dreamText, fileName);

      return {
        fileName,
        filePath,
        postedToDiscord,
        wordCount: dreamText.split(/\s+/).filter(Boolean).length,
      };
    } finally {
      await statusApi.setMode(previousStatus.mode, previousStatus.current_activity || "");
    }
  }

  async function handleStatusCommand(command, message) {
    if (!["sleep", "wake", "busy", "away", "status", "passtimeminutes"].includes(command?.kind)) return false;

    if (command.kind === "status") {
      const status = await statusApi.get();
      await safeReply(message,
        `${agentName} status: ${status.mode}${status.energy != null ? `, energy ${status.energy}` : ""}${status.current_activity ? `, ${status.current_activity}` : ""}`,
      );
      return true;
    }

    if (command.kind === "sleep") {
      const status = await statusApi.setMode("sleeping", command.content);
      await safeReply(message, `${agentName} is now ${status.mode}${status.current_activity ? `: ${status.current_activity}` : ""}`);
      return true;
    }

    if (command.kind === "wake") {
      const status = await statusApi.setMode("awake", command.content);
      await safeReply(message, `${agentName} is now ${status.mode}${status.current_activity ? `: ${status.current_activity}` : ""}`);
      return true;
    }

    if (command.kind === "busy") {
      const status = await statusApi.setMode("busy", command.content);
      await safeReply(message, `${agentName} is now ${status.mode}${status.current_activity ? `: ${status.current_activity}` : ""}`);
      return true;
    }

    if (command.kind === "away") {
      const status = await statusApi.setMode("away", command.content);
      await safeReply(message, `${agentName} is now ${status.mode}${status.current_activity ? `: ${status.current_activity}` : ""}`);
      return true;
    }

    const minutes = Number.parseInt(command.content, 10);
    if (!Number.isInteger(minutes) || minutes < 1) {
      throw new Error("passtimeminutes needs a whole number greater than 0, like ||@agent passtimeminutes: 60||.");
    }
    const status = await addTimePassage(minutes);
    await safeReply(message,
      `${agentName} experiences ${minutes} minutes of time passing${status.energy != null ? `; energy is now ${status.energy}` : ""}`,
    );
    return true;
  }

  function parseJsonObject(text) {
    const trimmed = String(text || "").trim();
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const jsonText = fenced ? fenced[1].trim() : trimmed;
    const objectMatch = jsonText.match(/\{[\s\S]*\}/);
    if (!objectMatch) throw new Error(`No JSON object found in status inference response: ${trimmed}`);
    return JSON.parse(objectMatch[0]);
  }

  async function inferStatusAfterReply({ userContent, assistantReply }) {
    if (!autoStatusSettings.enabled) return;

    const currentStatus = await statusApi.get();
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
              `You update ${agentName}'s roleplay time/sleep status from context clues.`,
              "Return only one JSON object. No markdown.",
              "Only change status when the latest exchange clearly implies a transition.",
              "Use keep when unclear, joking, metaphorical, hypothetical, or only weakly implied.",
              "Valid next_mode values: keep, awake, sleepy, sleeping, dreaming, busy, away.",
              "Sleeping means the character has gone to sleep or is being put to bed.",
              "Dreaming means the character is asleep and actively dreaming.",
              "Awake means the character clearly wakes up or resumes waking activity.",
              "Busy means the character is occupied but still available if directly mentioned or named.",
              "Away means the character should not reply right now unless a later clear context changes status.",
              "Infer busy when the character is clearly occupied, working, focusing, in the middle of a task, or asks not to be interrupted except for direct attention.",
              "Infer away when the character clearly leaves, goes offline, becomes unavailable, or should not reply for now.",
              "Do not infer sleep only because someone says tired, dream, bed, night, milk, horny, comfy, or cuddle.",
              "JSON shape: {\"next_mode\":\"keep\",\"confidence\":0.0,\"current_activity\":\"\",\"reason\":\"\"}",
            ].join("\n"),
          },
          {
            role: "user",
            content: [
              "# Current Status",
              JSON.stringify(currentStatus),
              "",
              "# Latest User/Input Context",
              userContent,
              "",
              "# Latest Assistant Reply",
              assistantReply,
            ].join("\n"),
          },
        ],
        temperature: 0,
        max_tokens: 160,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenRouter error ${response.status}: ${await response.text()}`);
    }

    const payload = await response.json();
    const decision = parseJsonObject(payload.choices?.[0]?.message?.content);
    const nextMode = String(decision.next_mode || "keep").toLowerCase();
    const confidence = Number(decision.confidence || 0);
    const allowedModes = new Set(["awake", "sleepy", "sleeping", "dreaming", "busy", "away"]);
    if (nextMode === "keep" || !allowedModes.has(nextMode) || confidence < autoStatusSettings.minimumConfidence) return;
    if (nextMode === currentStatus.mode) return;

    await statusApi.setMode(nextMode, String(decision.current_activity || decision.reason || "").slice(0, 240), "ai status inference");
    console.log(
      `Auto status update for ${agentName}: ${currentStatus.mode} -> ${nextMode} (${confidence}). ${decision.reason || ""}`,
    );
  }

  return {
    name: "time",
    memoryForumPostName: null,
    requiresStatus: true,
    requiredStatusModes: ["sleeping"],
    async afterReply(context) {
      await inferStatusAfterReply(context);
    },
    async handlePipeCommand(command, message) {
      if (await handleStatusCommand(command, message)) return true;
      if (command.kind !== "dream") return false;

      await message.channel.sendTyping();
      const result = await generateDream(command.content);
      await safeReply(message,
        `Generated dream for ${agentName}: ${result.fileName} (${result.wordCount} words). Discord dreams post: ${result.postedToDiscord ? "updated" : "not found"}.`,
      );
      return true;
    },
  };
}
