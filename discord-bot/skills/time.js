import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { semanticMemoryUsageContract } from "../semantic-memory.js";

async function readDreamSourceFile(agentFolder, sourceFile) {
  const filePath = path.join(agentFolder, sourceFile);
  const text = await readFile(filePath, "utf8").catch((error) => {
    if (error.code === "ENOENT" && sourceFile === "soul/memorysummary.txt") {
      return readFile(path.join(agentFolder, "soul/longmemory.txt"), "utf8").catch((legacyError) => {
        if (legacyError.code === "ENOENT") return "";
        throw legacyError;
      });
    }
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

function dreamLinkReply(discordUrl, linkEmojis = {}) {
  const frontEmoji = linkEmojis.frontEmoji || "\u{1F319}";
  const endEmoji = linkEmojis.endEmoji || "\u{1F320}";
  const title = `${frontEmoji}${linkEmojis.agentName || "Agent"}'s Dream${endEmoji}`;
  return discordUrl
    ? `**[\`${title}\`](<${discordUrl}>)**`
    : `**\`${title}\` saved in thread**`;
}

export function createTimeSkill(context) {
  const {
    addTimePassage,
    agentFolder,
    agentName,
    findMemoryForumPostByName,
    getSkills,
    model,
    openrouterApiKey,
    requiredSetting,
    runDailySummarization,
    safeReply,
    statusApi,
    systemPrompt,
    utilityModel,
    writeRawOpenRouterText,
    readableStatusText,
  } = context;

  const dreamSettings = requiredSetting("dream_settings");
  const summarizationSettings = requiredSetting("summarization_settings");
  const autoStatusSettings = {
    enabled: true,
    minimumConfidence: 0.72,
  };

  function optionalSetting(name, fallback = {}) {
    try {
      return requiredSetting(name);
    } catch (error) {
      if (String(error.message || "").includes("Missing required setting")) return fallback;
      throw error;
    }
  }

  function clampThoughtInfluence(value, fallback) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return fallback;
    return Math.min(1, Math.max(0, numericValue));
  }

  function formatThoughtInfluenceScale() {
    const scale = optionalSetting("thought_influence_scale", {});
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
    const processSettings = optionalSetting(processName, {});
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

  async function summarizeForSleep(reason) {
    if (!Boolean(summarizationSettings.summarize_on_sleep)) return null;
    if (typeof runDailySummarization !== "function") return null;

    try {
      const status = await statusApi.get();
      const sleepStartedAt = String(status.sleep_started_at || "");
      if (sleepStartedAt && status.last_sleep_summary_sleep_started_at === sleepStartedAt) {
        console.log(`Skipped sleep summarization for ${agentName}: sleep cycle already summarized.`);
        return { skipped: true, reason: "sleep cycle already summarized" };
      }

      const result = await runDailySummarization();
      await statusApi.update({
        last_sleep_summary_at: new Date().toISOString(),
        last_sleep_summary_reason: reason,
        last_sleep_summary_result: result?.skipped ? `skipped: ${result.reason}` : `summarized ${result?.entries || 0} entries`,
        last_sleep_summary_sleep_started_at: sleepStartedAt || null,
      });
      if (result?.skipped) {
        console.log(`Skipped sleep summarization for ${agentName}: ${result.reason}`);
      } else {
        console.log(`Sleep summarization for ${agentName} complete after ${reason}: ${result.entries} entries.`);
      }
      return result;
    } catch (error) {
      console.error(`Sleep summarization failed for ${agentName}: ${error.message}`);
      return null;
    }
  }

  async function postDreamToDiscord(dreamText, dreamFileName) {
    const dreamsPost = await findMemoryForumPostByName("dreams").catch(() => null);
    if (!dreamsPost?.send) return null;

    const message = [`dream_file: ${dreamFileName}`, "", dreamText].join("\n");
    const sentMessage = await dreamsPost.send(message.length <= 1900 ? message : `${message.slice(0, 1900)}\n...`);
    return sentMessage.url || null;
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

  async function readRecentMemoryFiles(folderSetting, filePattern, limit, maxCharactersPerFile) {
    const folderPath = path.join(agentFolder, String(folderSetting));
    const files = await readdir(folderPath, { withFileTypes: true }).catch((error) => {
      if (error.code === "ENOENT") return [];
      throw error;
    });
    const matchingFiles = files
      .filter((entry) => entry.isFile() && filePattern.test(entry.name))
      .map((entry) => path.join(folderPath, entry.name))
      .sort()
      .slice(-limit);
    const sourceFiles = [];
    for (const filePath of matchingFiles) {
      sourceFiles.push({
        relativeFilePath: path.relative(agentFolder, filePath),
        text: limitText((await readFile(filePath, "utf8")).trim(), maxCharactersPerFile),
      });
    }
    return sourceFiles;
  }

  async function readRecentThoughts() {
    return readRecentMemoryFiles(
      dreamSettings.thoughts_folder || "soul/consciousness/thoughts",
      /\.(md|txt)$/i,
      8,
      5000,
    );
  }

  async function readRecentJournals() {
    return readRecentMemoryFiles(
      dreamSettings.journals_folder || "soul/consciousness/journals",
      /\.(md|txt)$/i,
      5,
      7000,
    );
  }

  async function readNeuralMemoryIfAvailable() {
    const memoryLayersSettings = optionalSetting("memory_layers", {});
    const folderSetting = String(memoryLayersSettings.folder || "soul/memory-layers");
    const files = await readRecentMemoryFiles(folderSetting, /^layer-\d+\.jsonl$/i, 5, 8000)
      .catch((error) => [{
        relativeFilePath: folderSetting,
        text: `(neural memory unavailable: ${error.message})`,
        unavailable: true,
      }]);
    const nodeCount = files
      .filter((file) => !file.unavailable)
      .reduce((count, file) => count + file.text.split(/\r?\n/).filter(Boolean).length, 0);
    return {
      files,
      nodeCount,
    };
  }

  async function readDreamSummary() {
    const summaryFile = path.join(agentFolder, String(dreamSettings.dream_summary_file || "soul/dream_summary.md"));
    const maxCharacters = Number(dreamSettings.dream_summary_max_characters || 6000);
    return readFile(summaryFile, "utf8").then((text) => limitText(text.trim(), maxCharacters)).catch((error) => {
      if (error.code === "ENOENT") return "";
      throw error;
    });
  }

  async function updateDreamSummary({ outputFolder, latestDreamText }) {
    const summaryFile = path.join(agentFolder, String(dreamSettings.dream_summary_file || "soul/dream_summary.md"));
    const existingSummary = await readDreamSummary();
    const recentDreams = await readRecentDreams(outputFolder);
    const messages = [
      {
        role: "system",
        content: [
          `Summarize ${agentName}'s dream history for future dream generation.`,
          "This is not memorysummary and not factual waking memory.",
          "Keep recurring symbols, emotional patterns, fears, wishes, transformations, settings, characters, and unresolved dream motifs.",
          "Keep it compact but rich enough to influence future dreams.",
          "Write Markdown only. Use first person only when describing the agent's inner dream patterns.",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          "# Existing Dream Summary",
          existingSummary || "(empty)",
          "",
          "# Recent Dreams",
          recentDreams.map((dream) => [`## ${dream.relativeFilePath}`, dream.text].join("\n")).join("\n\n") || "(empty)",
          "",
          "# Latest Dream",
          latestDreamText,
        ].join("\n"),
      },
    ];
    await writeRawOpenRouterText?.(messages, "dream summary");
    const response = await fetch(`${requiredSetting("openrouter_base_url")}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openrouterApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.35,
        max_tokens: 700,
      }),
    });
    if (!response.ok) {
      throw new Error(`OpenRouter error ${response.status}: ${await response.text()}`);
    }
    const payload = await response.json();
    const summary = payload.choices?.[0]?.message?.content?.trim();
    if (!summary) throw new Error("OpenRouter returned an empty dream summary.");
    await writeFile(summaryFile, `${summary}\n`, "utf8");
    return summaryFile;
  }

  function dreamStyleInstruction(status) {
    const mood = [
      status.discord_status_mood,
      status.current_activity,
      status.last_time_passed_reason,
    ].filter(Boolean).join("; ") || "unknown";
    return [
      `Current mood/status clues: ${mood}.`,
      "Use the user's dream seed or natural-language instructions for any requested intensity, symbolism, chaos, creativity, or style.",
      "Without explicit style instructions, balance recent life, thoughts, previous dreams, dream summary, and mood into a coherent first-person dream.",
      "Good moods can become warmer, wish-shaped, beautiful, or emotionally heightened.",
      "Bad moods can become uneasy, anxious, fear-shaped, guilty, or unresolved.",
    ].join("\n");
  }

  async function maybeAutoDreamJournal(savedDream) {
    const dreamJournalSettings = optionalSetting("dream_journal", {});
    if (dreamJournalSettings.auto_enabled === false) return null;
    const dreamJournalSkill = (typeof getSkills === "function" ? getSkills() : [])
      .find((skill) => typeof skill.runDreamJournalForDream === "function");
    if (!dreamJournalSkill) {
      console.error(`Auto dream journal skipped for ${agentName}: dreamjournal core module is unavailable.`);
      return null;
    }
    try {
      const result = await dreamJournalSkill.runDreamJournalForDream(
        savedDream,
        "Figure out what the meaning of the dream is.",
      );
      console.log(`Auto dream journal saved for ${agentName}: ${result.fileName}`);
      return result;
    } catch (error) {
      console.error(`Auto dream journal failed for ${agentName}: ${error.message}`);
      return { error: error.message };
    }
  }

  async function generateDream(promptText = "", options = {}) {
    const requireSleeping = options.requireSleeping !== false;
    if (requireSleeping) {
      await statusApi.requireMode(["sleeping"], "dream");
    }

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
      const dreamThoughtControl = thoughtInfluenceControl("dream", 0.75);
      const recentDreams = await readRecentDreams(outputFolder);
      const recentThoughts = dreamThoughtControl.useThoughts ? await readRecentThoughts() : [];
      const recentJournals = await readRecentJournals();
      const neuralMemory = await readNeuralMemoryIfAvailable();
      const dreamSummary = await readDreamSummary();
      const consciousnessDescriptors = optionalSetting("consciousness_descriptors", {});
      const dreamDescriptor = String(consciousnessDescriptors.dream || "").trim();
      const maxWords = Number(dreamSettings.max_words || 500);
      const sourceText = [...sourceFiles, ...recentDreams]
        .map((sourceFile) => [`# ${sourceFile.relativeFilePath}`, sourceFile.text].join("\n"))
        .join("\n\n");
      const thoughtText = recentThoughts
        .map((thought) => [`# ${thought.relativeFilePath}`, thought.text].join("\n"))
        .join("\n\n");
      const journalText = recentJournals
        .map((journal) => [`# ${journal.relativeFilePath}`, journal.text].join("\n"))
        .join("\n\n");
      const neuralMemoryText = neuralMemory.files
        .map((memoryFile) => [`# ${memoryFile.relativeFilePath}`, memoryFile.text].join("\n"))
        .join("\n\n");
      const dreamModeInstruction = promptText
        ? "The agent is sleeping. Write one literal dream that uses the user's dream seed as a major ingredient."
        : "The agent is sleeping. Write one literal dream from context and previous dreams.";
      const dreamInstruction = promptText
        ? [dreamDescriptor, "User dream instruction:", promptText].filter(Boolean).join("\n\n")
        : (dreamDescriptor || "Write my first-person dream from memory and emotional material.");
      const promptBlock = promptText ? ["# User Dream Seed", promptText, ""].join("\n") : "";
      const messages = [
        {
          role: "system",
          content: [
            `# Persona: ${agentName}`,
            systemPrompt(),
            "",
            "# Dream Task",
            dreamInstruction,
            "",
            dreamModeInstruction,
            dreamStyleInstruction(previousStatus),
            "Use memory and soul material as dream ingredients, but transform them associatively instead of summarizing them.",
            "Infer mood naturally from recent memory, thoughts when dream.use_thoughts is enabled, journals, dreams, durable memory, and status clues.",
            formatThoughtInfluenceInstruction("Dream", dreamThoughtControl),
            semanticMemoryUsageContract(),
            "Treat any user mention of chaos, creativity, realism, symbolism, or numeric style values as temporary natural-language guidance only.",
            "Dreams may be symbolic, emotional, strange, sweet, uneasy, or beautiful.",
            "Do not claim the dream is factual memory. Do not update memorysummary. Do not explain the mechanism.",
            `Keep the dream under ${maxWords} words.`,
          ].join("\n"),
        },
        {
          role: "user",
          content: [
            promptBlock,
            `Dream source material for ${agentName}:`,
            "",
            sourceText,
            "",
            "# Recent Thoughts",
            dreamThoughtControl.useThoughts
              ? thoughtText || "(empty)"
              : "(disabled by dream.use_thoughts)",
            "",
            "# Recent Journals",
            journalText || "(empty)",
            "",
            "# Neural Memory If Available",
            neuralMemoryText || "(empty)",
            "",
            "# Dream Summary",
            dreamSummary || "(empty)",
          ].join("\n"),
        },
      ];
      await writeRawOpenRouterText?.(messages, "dream");

      const response = await fetch(`${requiredSetting("openrouter_base_url")}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openrouterApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: Math.max(0.1, Math.min(1.2, Number(requiredSetting("chaos")) || 0.85)),
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
        `instruction: ${dreamInstruction.replace(/\r?\n/g, " ")}`,
        `source_files: ${sourceFiles.map((sourceFile) => sourceFile.relativeFilePath).join(", ")}`,
        `thoughts_included_count: ${recentThoughts.length}`,
        `journals_included_count: ${recentJournals.length}`,
        `neural_memory_nodes_included_count: ${neuralMemory.nodeCount}`,
        "",
        dreamText,
        "",
      ].join("\n");
      await writeFile(filePath, fileText, "utf8");
      const result = {
        fileName,
        filePath,
        discordUrl: null,
        linkEmojis: await chooseDreamLinkEmojis({ dreamText, promptText }),
        postedToDiscord: false,
        wordCount: dreamText.split(/\s+/).filter(Boolean).length,
      };
      await maybeAutoDreamJournal(result);
      const discordUrl = await postDreamToDiscord(dreamText, fileName);
      result.discordUrl = discordUrl;
      result.postedToDiscord = Boolean(discordUrl);
      updateDreamSummary({ outputFolder, latestDreamText: dreamText }).catch((error) => {
        console.error(`Dream summary update failed for ${agentName}: ${error.message}`);
      });

      return result;
    } finally {
      await statusApi.setMode(previousStatus.mode, previousStatus.current_activity || "");
    }
  }

  async function handleStatusCommand(command, message) {
    if (!["sleep", "wake", "away", "state", "passtimeminutes", "passtimehours"].includes(command?.kind)) return false;

    if (command.kind === "state") {
      const status = await statusApi.get();
      await safeReply(message,
        `${agentName} status: ${readableStatusText?.(status) || status.current_activity || "status unknown"}${status.energy != null ? `; energy ${status.energy}` : ""}${status.current_datetime ? `; time ${status.current_datetime}` : ""}`,
      );
      return true;
    }

    if (command.kind === "sleep") {
      const status = await statusApi.setMode("falling_asleep", command.content || "falling asleep");
      await startSleepTimer({
        userContent: command.content || "Manual sleep command.",
        assistantReply: `${agentName} is falling asleep.`,
        statusReason: command.content || "manual sleep command",
      });
      await summarizeForSleep("manual sleep command");
      await safeReply(message, `${agentName} is now ${status.mode}${status.current_activity ? `: ${status.current_activity}` : ""}`);
      await maybeGenerateImmediateDream({
        userContent: command.content || "Manual sleep command.",
        assistantReply: `${agentName} is falling asleep.`,
        statusReason: command.content || "manual sleep command",
        notifyMessage: message,
      });
      return true;
    }

    if (command.kind === "wake") {
      const status = await statusApi.setMode("awake", command.content);
      await safeReply(message, `${agentName} is now ${status.mode}${status.current_activity ? `: ${status.current_activity}` : ""}`);
      return true;
    }

    if (command.kind === "away") {
      const status = await statusApi.setMode("away", command.content);
      await safeReply(message, `${agentName} is now ${status.mode}${status.current_activity ? `: ${status.current_activity}` : ""}`);
      return true;
    }

    const timeMatch = command.content.match(/^(\d+)(?:\s+([\s\S]+))?$/);
    const amount = timeMatch ? Number.parseInt(timeMatch[1], 10) : NaN;
    if (!Number.isInteger(amount) || amount < 1) {
      throw new Error(`${command.kind} needs a whole number greater than 0, like ||@agent ${command.kind}: 8||.`);
    }
    const passageContext = (timeMatch?.[2] || "").trim();
    const minutes = command.kind === "passtimehours" ? amount * 60 : amount;
    const beforeStatus = await statusApi.get();
    const sleepTimerAdjustment = await estimateSleepTimerAdjustment({ minutes, passageContext, status: beforeStatus });
    const status = await addTimePassage(minutes, sleepTimerAdjustment);
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

  async function askUtilityJson(messages, source, maxTokens = 180) {
    await writeRawOpenRouterText?.(messages, source);

    const response = await fetch(`${requiredSetting("openrouter_base_url")}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openrouterApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: utilityModel,
        messages,
        temperature: 0,
        max_tokens: maxTokens,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenRouter error ${response.status}: ${await response.text()}`);
    }

    const payload = await response.json();
    return parseJsonObject(payload.choices?.[0]?.message?.content);
  }

  function firstEmojiOrFallback(value, fallback) {
    const text = String(value || "").trim();
    const match = text.match(/\p{Extended_Pictographic}/u);
    return match?.[0] || fallback;
  }

  async function chooseDreamLinkEmojis({ dreamText, promptText }) {
    const messages = [
      {
        role: "system",
        content: [
          `Choose two emojis for a Discord link to ${agentName}'s saved dream.`,
          "front_emoji should be related to sleep, night, dreaming, moonlight, stars, or bedtime.",
          "end_emoji should be related to the dream content, emotional tone, symbols, setting, or main image.",
          "Use common Unicode emojis only. One emoji per field. Do not use words.",
          "Return only strict JSON: {\"front_emoji\":\"🌙\",\"end_emoji\":\"🌠\",\"reason\":\"\"}",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          "# User Dream Prompt",
          promptText || "(none)",
          "",
          "# Dream Text",
          limitText(dreamText || "", 5000),
        ].join("\n"),
      },
    ];

    try {
      const decision = await askUtilityJson(messages, "dream link emoji choice", 120);
      return {
        agentName,
        frontEmoji: firstEmojiOrFallback(decision.front_emoji, "🌙"),
        endEmoji: firstEmojiOrFallback(decision.end_emoji, "🌠"),
      };
    } catch (error) {
      console.error(`Dream link emoji choice failed for ${agentName}: ${error.message}`);
      return {
        agentName,
        frontEmoji: "🌙",
        endEmoji: "🌠",
      };
    }
  }

  async function estimateSleepDurationMinutes({ userContent, assistantReply, statusReason }) {
    const messages = [
      {
        role: "system",
        content: [
          `Estimate how long ${agentName} will sleep from the roleplay context.`,
          "This is a utility estimate for a status timer, not a creative writing task.",
          "Use context clues such as nap, dozing off, bedtime, exhausted, sleeping through the night, being put to bed, or only briefly resting.",
          "Return a practical duration in minutes.",
          "Use 20-90 minutes for a nap, 240-600 minutes for normal sleep, and up to 720 minutes for very long exhausted sleep.",
          "If unclear, choose 480 minutes.",
          "Return only strict JSON: {\"sleep_minutes\":480,\"confidence\":0.0,\"reason\":\"\"}",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          "# Sleep Transition Reason",
          statusReason || "",
          "",
          "# Latest User/Input Context",
          userContent || "",
          "",
          "# Latest Assistant Reply",
          assistantReply || "",
        ].join("\n"),
      },
    ];

    const decision = await askUtilityJson(messages, "sleep duration estimate", 160);
    const rawMinutes = Number(decision.sleep_minutes);
    const sleepMinutes = Number.isFinite(rawMinutes)
      ? Math.min(720, Math.max(15, Math.round(rawMinutes)))
      : 480;
    return {
      minutes: sleepMinutes,
      confidence: Number(decision.confidence || 0),
      reason: String(decision.reason || "").slice(0, 500),
    };
  }

  async function startSleepTimer({ userContent, assistantReply, statusReason }) {
    const estimate = await estimateSleepDurationMinutes({ userContent, assistantReply, statusReason });
    const sleepStartedAt = new Date().toISOString();
    await statusApi.update({
      sleep_started_at: sleepStartedAt,
      sleep_planned_minutes: estimate.minutes,
      sleep_needed_minutes: estimate.minutes,
      sleep_remaining_minutes: estimate.minutes,
      sleep_interrupted_minutes: 0,
      awareness: 0,
      woke_minutes_ago: null,
      sleep_timer_reason: estimate.reason || statusReason || "",
      last_sleep_summary_sleep_started_at: null,
    });
    console.log(
      `Sleep timer for ${agentName}: ${estimate.minutes} minutes (${estimate.confidence}). ${estimate.reason}`,
    );
    return estimate;
  }

  async function startDefaultSleepTimer(statusReason) {
    const minutes = 480;
    const sleepStartedAt = new Date().toISOString();
    await statusApi.update({
      sleep_started_at: sleepStartedAt,
      sleep_planned_minutes: minutes,
      sleep_needed_minutes: minutes,
      sleep_remaining_minutes: minutes,
      sleep_interrupted_minutes: 0,
      awareness: 0,
      woke_minutes_ago: null,
      sleep_timer_reason: statusReason || "default sleep timer",
      last_sleep_summary_sleep_started_at: null,
    });
    console.log(`Default sleep timer for ${agentName}: ${minutes} minutes. ${statusReason || ""}`);
    return { minutes, confidence: 0, reason: statusReason || "default sleep timer" };
  }

  async function estimateSleepTimerAdjustment({ minutes, passageContext, status }) {
    if (!passageContext.trim() || !["falling_asleep", "sleeping"].includes(status.mode)) return null;

    const messages = [
      {
        role: "system",
        content: [
          `Estimate how events during passed time affect ${agentName}'s sleep timer.`,
          "This adjusts sleep_remaining_minutes in addition to ordinary clock time.",
          "Use positive adjustment_minutes when sleep is interrupted and the agent should wake sooner.",
          "Use negative adjustment_minutes when sleep is especially deep, protected, restful, or the agent should sleep longer.",
          "Examples: loud noise may be +30 to +180; being touched or moved may be +15 to +120; being shaken awake may be +999; quiet restful cuddling may be -10 to -60.",
          "Use 0 when nothing clearly affects sleep.",
          "Return only strict JSON: {\"adjustment_minutes\":0,\"confidence\":0.0,\"reason\":\"\"}",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          "# Current Status",
          JSON.stringify(status),
          "",
          "# Clock Time Passed",
          `${minutes} minutes`,
          "",
          "# What Happened During That Time",
          passageContext,
        ].join("\n"),
      },
    ];

    const decision = await askUtilityJson(messages, "sleep timer adjustment", 160);
    const confidence = Number(decision.confidence || 0);
    if (confidence < 0.55) return null;
    const rawAdjustment = Number(decision.adjustment_minutes || 0);
    const adjustmentMinutes = Number.isFinite(rawAdjustment)
      ? Math.max(-240, Math.min(999, Math.round(rawAdjustment)))
      : 0;
    if (adjustmentMinutes === 0) return null;
    return {
      minutes: adjustmentMinutes,
      reason: String(decision.reason || passageContext).slice(0, 500),
      confidence,
    };
  }

  async function applySleepAdjustment(status, adjustmentMinutes, reason, options = {}) {
    const remainingSleepMinutes = Number(status.sleep_remaining_minutes);
    if (!Number.isFinite(remainingSleepMinutes)) return status;

    const nextRemainingSleepMinutes = remainingSleepMinutes - adjustmentMinutes;
    const wakeStyle = String(options.wakeStyle || "natural").toLowerCase();
    const gentleWake = wakeStyle === "soft" || wakeStyle === "sleepy" || wakeStyle === "gentle";
    const startledWake = wakeStyle === "startled" || wakeStyle === "urgent" || wakeStyle === "forceful";
    const previousAwareness = Number(status.awareness);
    const awarenessDelta = Number(options.awarenessDelta);
    const nextAwareness = Number.isFinite(awarenessDelta)
      ? Math.min(1, Math.max(0, (Number.isFinite(previousAwareness) ? previousAwareness : 0) + awarenessDelta))
      : Math.min(1, Math.max(0, (Number.isFinite(previousAwareness) ? previousAwareness : 0) + Math.max(0, adjustmentMinutes) / Math.max(120, remainingSleepMinutes)));
    const currentInterruptedMinutes = Math.max(0, Number(status.sleep_interrupted_minutes) || 0);
    const interruptedDelta = Math.max(0, Math.min(Math.max(0, adjustmentMinutes), Math.max(0, remainingSleepMinutes)));
    const nextStatus = {
      sleep_remaining_minutes: nextRemainingSleepMinutes,
      sleep_interrupted_minutes: currentInterruptedMinutes + interruptedDelta,
      awareness: nextAwareness,
      last_sleep_timer_adjustment_minutes: adjustmentMinutes,
      last_sleep_timer_adjustment_reason: reason,
      last_wake_style: wakeStyle,
    };

    if (nextRemainingSleepMinutes <= 0) {
      const wokeMinutesAgo = Math.abs(nextRemainingSleepMinutes);
      return statusApi.update({
        ...nextStatus,
        mode: gentleWake ? "sleepy" : "awake",
        status: {
          awake: !gentleWake,
          sleepy: gentleWake,
          sleeping: false,
          dreaming: false,
          away: false,
        },
        woke_minutes_ago: wokeMinutesAgo,
        awareness: gentleWake ? Math.max(0.55, nextAwareness) : 1,
        current_activity: gentleWake
          ? (wokeMinutesAgo > 0 ? `sleepily woke up ${wokeMinutesAgo} minutes ago` : "sleepily waking up")
          : startledWake
            ? (wokeMinutesAgo > 0 ? `startled awake ${wokeMinutesAgo} minutes ago` : "startled awake")
            : (wokeMinutesAgo > 0 ? `woke up ${wokeMinutesAgo} minutes ago after sleeping` : "just woke up after sleeping"),
        last_status_change: new Date().toISOString(),
      });
    }

    return statusApi.update(nextStatus);
  }

  async function handleSleepingMessage(message) {
    const status = await statusApi.get();
    if (!["falling_asleep", "sleeping"].includes(status.mode)) return { handled: false, continueNormalReply: false };

    const messages = [
      {
        role: "system",
        content: [
          `Decide how an incoming message affects ${agentName} while falling asleep or sleeping.`,
          "This is a utility classifier, not roleplay prose.",
          "Actions: ignore, adjust_sleep, wake.",
          "Use ignore for quiet chatter, distant activity, unclear context, or messages that should not disturb sleep.",
          "Use adjust_sleep when the message changes sleep quality or disturbance but does not instantly wake the agent.",
          "Soft attention, whispering, gentle touching, cuddling, nuzzling, or speaking close to the agent should usually use adjust_sleep with a moderate positive adjustment so the agent can be nudged awake gradually.",
          "Use wake for direct wake requests, shaking, urgent events, loud nearby disruptions, or contact that clearly wakes the agent immediately.",
          "Positive adjustment_minutes means sleep ends sooner. Negative adjustment_minutes means sleep is extended.",
          "If action is wake, use enough positive adjustment_minutes to reduce remaining sleep to zero unless remaining sleep is already near zero.",
          "wake_style values: soft, natural, startled.",
          "awareness_delta is a number from -1 to 1 for how much more conscious/responsive the agent becomes. Soft attention may be +0.05 to +0.25. Stronger nudges may be +0.25 to +0.6. Sudden wakeups may be +1.",
          "Use wake_style soft when the agent is gently nudged awake and should wake sleepy but conscious.",
          "Use wake_style startled when the agent is woken suddenly, loudly, urgently, or roughly.",
          "The main model will use awareness, energy, sleep_remaining_minutes, and sleep_interrupted_minutes to decide how sleepy the visible response should be.",
          "should_reply should be true when the agent wakes enough to answer naturally, including when a soft adjustment reduces sleep_remaining_minutes to zero.",
          "Return only strict JSON: {\"action\":\"ignore\",\"adjustment_minutes\":0,\"awareness_delta\":0.0,\"should_reply\":false,\"wake_style\":\"natural\",\"wake_activity\":\"\",\"reason\":\"\"}",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          "# Current Status",
          JSON.stringify(status),
          "",
          "# Incoming Message",
          `author: ${message.author?.username || ""}`,
          `channel_id: ${message.channelId || ""}`,
          "",
          message.content || "",
        ].join("\n"),
      },
    ];

    const decision = await askUtilityJson(messages, "sleeping message decision", 180);
    const action = String(decision.action || "ignore").toLowerCase();
    const reason = String(decision.reason || decision.wake_activity || "").slice(0, 500);
    const remainingSleepMinutes = Number(status.sleep_remaining_minutes);
    const rawAdjustment = Number(decision.adjustment_minutes || 0);
    const rawAwarenessDelta = Number(decision.awareness_delta || 0);
    const awarenessDelta = Number.isFinite(rawAwarenessDelta) ? Math.max(-1, Math.min(1, rawAwarenessDelta)) : 0;
    const wakeStyle = String(decision.wake_style || (action === "wake" ? "startled" : "soft")).toLowerCase();
    const adjustmentMinutes = action === "wake" && Number.isFinite(remainingSleepMinutes)
      ? Math.max(Math.ceil(remainingSleepMinutes), Number.isFinite(rawAdjustment) ? Math.round(rawAdjustment) : 0)
      : (Number.isFinite(rawAdjustment) ? Math.max(-240, Math.min(999, Math.round(rawAdjustment))) : 0);

    if (action === "ignore" || adjustmentMinutes === 0) {
      return { handled: true, continueNormalReply: false };
    }

    const nextStatus = await applySleepAdjustment(status, adjustmentMinutes, reason, { wakeStyle, awarenessDelta });
    if ((nextStatus.mode === "awake" || nextStatus.mode === "sleepy") && Boolean(decision.should_reply)) {
      return { handled: false, continueNormalReply: true };
    }

    return { handled: true, continueNormalReply: false };
  }

  async function decideImmediateDreamAfterSleep({ userContent, assistantReply, statusReason }) {
    if (!Boolean(dreamSettings.enabled)) return null;

    const messages = [
      {
        role: "system",
        content: [
          `Decide whether ${agentName} should create a dream immediately after falling asleep.`,
          "This is a utility classifier, not a creative writing task.",
          "Return should_dream true when the latest exchange clearly creates a meaningful sleep moment, a dream invitation, a bedtime transition, or strong emotional material that should become an immediate dream.",
          "Return false for administrative sleep commands, weak hints, ordinary cuddling, or unclear context.",
          "If true, provide one short dream_seed describing what the dream should draw from.",
          "Return only strict JSON: {\"should_dream\":false,\"confidence\":0.0,\"dream_seed\":\"\",\"reason\":\"\"}",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          "# Sleep Transition Reason",
          statusReason || "",
          "",
          "# Latest User/Input Context",
          userContent || "",
          "",
          "# Latest Assistant Reply",
          assistantReply || "",
        ].join("\n"),
      },
    ];

    const decision = await askUtilityJson(messages, "dream decision", 180);
    const confidence = Number(decision.confidence || 0);
    if (!decision.should_dream || confidence < 0.7) return null;
    return {
      seed: String(decision.dream_seed || decision.reason || "").slice(0, 1000),
      reason: String(decision.reason || "").slice(0, 500),
      confidence,
    };
  }

  async function maybeGenerateImmediateDream({ userContent, assistantReply, statusReason, notifyMessage }) {
    const dreamDecision = await decideImmediateDreamAfterSleep({ userContent, assistantReply, statusReason });
    if (!dreamDecision) return null;

    const currentStatus = await statusApi.get();
    if (currentStatus.mode === "falling_asleep") {
      await statusApi.setMode("sleeping", "asleep", "immediate dream transition");
    }

    const result = await generateDream(dreamDecision.seed);
    console.log(
      `Generated immediate dream for ${agentName} after sleep transition (${dreamDecision.confidence}). ${dreamDecision.reason}`,
    );
    if (notifyMessage) {
      await safeReply(notifyMessage, dreamLinkReply(result.discordUrl, result.linkEmojis));
    }
    return result;
  }

  async function inferStatusAfterReply({ userContent, assistantReply }) {
    if (!autoStatusSettings.enabled) return;

    const currentStatus = await statusApi.get();
    const messages = [
      {
        role: "system",
        content: [
          `You update ${agentName}'s roleplay time/sleep status from context clues.`,
          "Return only one JSON object. No markdown.",
          "Only change status when the latest exchange clearly implies a transition.",
          "Use keep when unclear, joking, metaphorical, hypothetical, or only weakly implied.",
          "Valid next_mode values: keep, awake, sleepy, falling_asleep, sleeping, dreaming, away.",
          "Falling_asleep means the character is in the transition into sleep: drowsy, drifting, dozing, or almost asleep.",
          "Sleeping means the character has gone to sleep or is being put to bed.",
          "Dreaming means the character is asleep and actively dreaming.",
          "Awake means the character clearly wakes up or resumes waking activity.",
          "Away means the character should not reply right now unless a later clear context changes status.",
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
    ];
    const decision = await askUtilityJson(messages, "status inference", 160);
    const nextMode = String(decision.next_mode || "keep").toLowerCase();
    const confidence = Number(decision.confidence || 0);
    const allowedModes = new Set(["awake", "sleepy", "falling_asleep", "sleeping", "dreaming", "away"]);
    if (nextMode === "keep" || !allowedModes.has(nextMode) || confidence < autoStatusSettings.minimumConfidence) return;
    if (nextMode === currentStatus.mode) return;

    const statusReason = String(decision.current_activity || decision.reason || "").slice(0, 240);
    await statusApi.setMode(nextMode, statusReason, "ai status inference");
    console.log(
      `Auto status update for ${agentName}: ${currentStatus.mode} -> ${nextMode} (${confidence}). ${decision.reason || ""}`,
    );
    if (nextMode === "falling_asleep" || nextMode === "sleeping") {
      await startSleepTimer({ userContent, assistantReply, statusReason });
      await summarizeForSleep("automatic sleep transition");
      await maybeGenerateImmediateDream({ userContent, assistantReply, statusReason });
    }
  }

  return {
    name: "time",
    memoryForumPostName: null,
    requiresStatus: true,
    requiredStatusModes: ["sleeping"],
    async onReady() {
      const status = await statusApi.get();
      if (
        status.mode === "sleeping" &&
        String(status.current_activity || "").toLowerCase().includes("falling asleep")
      ) {
        await statusApi.update({
          current_activity: "asleep",
        });
      }
      if (
        (status.mode === "falling_asleep" || status.mode === "sleeping") &&
        !Number.isFinite(Number(status.sleep_remaining_minutes))
      ) {
        await startDefaultSleepTimer(status.current_activity || "startup sleeping status repair");
      }
    },
    async afterReply(context) {
      await inferStatusAfterReply(context);
    },
    handleSleepingMessage,
    async runConsciousnessCycleDream(instruction = "") {
      return generateDream(instruction, { requireSleeping: false });
    },
    async handlePipeCommand(command, message) {
      if (await handleStatusCommand(command, message)) return true;
      if (command.kind !== "dream") return false;

      await message.channel.sendTyping();
      const result = await generateDream(command.content);
      await safeReply(message, dreamLinkReply(result.discordUrl, result.linkEmojis));
      return true;
    },
  };
}
