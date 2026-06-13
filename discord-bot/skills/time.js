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

function dreamLinkReply(discordUrl) {
  return discordUrl ? `||${discordUrl}||` : "||dream saved in thread||";
}

export function createTimeSkill(context) {
  const {
    addTimePassage,
    agentFolder,
    agentName,
    findMemoryForumPostByName,
    model,
    openrouterApiKey,
    requiredSetting,
    safeReply,
    statusApi,
    systemPrompt,
    utilityModel,
    writeRawOpenRouterText,
  } = context;

  const dreamSettings = requiredSetting("dream_settings");
  const autoStatusSettings = {
    enabled: true,
    minimumConfidence: 0.72,
  };

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
      const discordUrl = await postDreamToDiscord(dreamText, fileName);

      return {
        fileName,
        filePath,
        discordUrl,
        postedToDiscord: Boolean(discordUrl),
        wordCount: dreamText.split(/\s+/).filter(Boolean).length,
      };
    } finally {
      await statusApi.setMode(previousStatus.mode, previousStatus.current_activity || "");
    }
  }

  async function handleStatusCommand(command, message) {
    if (!["sleep", "wake", "away", "state", "passtimeminutes", "passtimehours"].includes(command?.kind)) return false;

    if (command.kind === "state") {
      const status = await statusApi.get();
      await safeReply(message,
        `${agentName} state: ${status.mode}${status.energy != null ? `, energy ${status.energy}` : ""}${status.current_activity ? `, ${status.current_activity}` : ""}`,
      );
      return true;
    }

    if (command.kind === "sleep") {
      const status = await statusApi.setMode("sleeping", command.content);
      await startSleepTimer({
        userContent: command.content || "Manual sleep command.",
        assistantReply: `${agentName} is now sleeping.`,
        statusReason: command.content || "manual sleep command",
      });
      await safeReply(message, `${agentName} is now ${status.mode}${status.current_activity ? `: ${status.current_activity}` : ""}`);
      await maybeGenerateImmediateDream({
        userContent: command.content || "Manual sleep command.",
        assistantReply: `${agentName} is now sleeping.`,
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
    await statusApi.update({
      sleep_started_at: new Date().toISOString(),
      sleep_planned_minutes: estimate.minutes,
      sleep_remaining_minutes: estimate.minutes,
      woke_minutes_ago: null,
      sleep_timer_reason: estimate.reason || statusReason || "",
    });
    console.log(
      `Sleep timer for ${agentName}: ${estimate.minutes} minutes (${estimate.confidence}). ${estimate.reason}`,
    );
    return estimate;
  }

  async function startDefaultSleepTimer(statusReason) {
    const minutes = 480;
    await statusApi.update({
      sleep_started_at: new Date().toISOString(),
      sleep_planned_minutes: minutes,
      sleep_remaining_minutes: minutes,
      woke_minutes_ago: null,
      sleep_timer_reason: statusReason || "default sleep timer",
    });
    console.log(`Default sleep timer for ${agentName}: ${minutes} minutes. ${statusReason || ""}`);
    return { minutes, confidence: 0, reason: statusReason || "default sleep timer" };
  }

  async function estimateSleepTimerAdjustment({ minutes, passageContext, status }) {
    if (!passageContext.trim() || status.mode !== "sleeping") return null;

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

  async function applySleepAdjustment(status, adjustmentMinutes, reason) {
    const remainingSleepMinutes = Number(status.sleep_remaining_minutes);
    if (!Number.isFinite(remainingSleepMinutes)) return status;

    const nextRemainingSleepMinutes = remainingSleepMinutes - adjustmentMinutes;
    const nextStatus = {
      sleep_remaining_minutes: nextRemainingSleepMinutes,
      last_sleep_timer_adjustment_minutes: adjustmentMinutes,
      last_sleep_timer_adjustment_reason: reason,
    };

    if (nextRemainingSleepMinutes <= 0) {
      const wokeMinutesAgo = Math.abs(nextRemainingSleepMinutes);
      return statusApi.update({
        ...nextStatus,
        mode: "awake",
        status: {
          awake: true,
          sleepy: false,
          sleeping: false,
          dreaming: false,
          away: false,
        },
        woke_minutes_ago: wokeMinutesAgo,
        current_activity: wokeMinutesAgo > 0
          ? `woke up ${wokeMinutesAgo} minutes ago after sleeping`
          : "just woke up after sleeping",
        last_status_change: new Date().toISOString(),
      });
    }

    return statusApi.update(nextStatus);
  }

  async function handleSleepingMessage(message) {
    const status = await statusApi.get();
    if (status.mode !== "sleeping") return { handled: false, continueNormalReply: false };

    const messages = [
      {
        role: "system",
        content: [
          `Decide how an incoming message affects ${agentName} while sleeping.`,
          "This is a utility classifier, not roleplay prose.",
          "Actions: ignore, adjust_sleep, wake.",
          "Use ignore for quiet chatter, distant activity, unclear context, or messages that should not disturb sleep.",
          "Use adjust_sleep when the message changes sleep quality or disturbance but does not clearly wake the agent.",
          "Use wake for direct wake requests, shaking, urgent events, loud nearby disruptions, or contact that clearly wakes the agent.",
          "Positive adjustment_minutes means sleep ends sooner. Negative adjustment_minutes means sleep is extended.",
          "If action is wake, use enough positive adjustment_minutes to reduce remaining sleep to zero unless remaining sleep is already near zero.",
          "should_reply should be true only when the agent wakes and should answer naturally.",
          "Return only strict JSON: {\"action\":\"ignore\",\"adjustment_minutes\":0,\"should_reply\":false,\"wake_activity\":\"\",\"reason\":\"\"}",
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
    const adjustmentMinutes = action === "wake" && Number.isFinite(remainingSleepMinutes)
      ? Math.max(Math.ceil(remainingSleepMinutes), Number.isFinite(rawAdjustment) ? Math.round(rawAdjustment) : 0)
      : (Number.isFinite(rawAdjustment) ? Math.max(-240, Math.min(999, Math.round(rawAdjustment))) : 0);

    if (action === "ignore" || adjustmentMinutes === 0) {
      return { handled: true, continueNormalReply: false };
    }

    const nextStatus = await applySleepAdjustment(status, adjustmentMinutes, reason);
    if (nextStatus.mode === "awake" && Boolean(decision.should_reply)) {
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

    const result = await generateDream(dreamDecision.seed);
    console.log(
      `Generated immediate dream for ${agentName} after sleep transition (${dreamDecision.confidence}). ${dreamDecision.reason}`,
    );
    if (notifyMessage) {
      await safeReply(notifyMessage, dreamLinkReply(result.discordUrl));
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
          "Valid next_mode values: keep, awake, sleepy, sleeping, dreaming, away.",
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
    const allowedModes = new Set(["awake", "sleepy", "sleeping", "dreaming", "away"]);
    if (nextMode === "keep" || !allowedModes.has(nextMode) || confidence < autoStatusSettings.minimumConfidence) return;
    if (nextMode === currentStatus.mode) return;

    const statusReason = String(decision.current_activity || decision.reason || "").slice(0, 240);
    await statusApi.setMode(nextMode, statusReason, "ai status inference");
    console.log(
      `Auto status update for ${agentName}: ${currentStatus.mode} -> ${nextMode} (${confidence}). ${decision.reason || ""}`,
    );
    if (nextMode === "sleeping") {
      await startSleepTimer({ userContent, assistantReply, statusReason });
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
        !Number.isFinite(Number(status.sleep_remaining_minutes))
      ) {
        await startDefaultSleepTimer(status.current_activity || "startup sleeping status repair");
      }
    },
    async afterReply(context) {
      await inferStatusAfterReply(context);
    },
    handleSleepingMessage,
    async handlePipeCommand(command, message) {
      if (await handleStatusCommand(command, message)) return true;
      if (command.kind !== "dream") return false;

      await message.channel.sendTyping();
      const result = await generateDream(command.content);
      await safeReply(message, dreamLinkReply(result.discordUrl));
      return true;
    },
  };
}
