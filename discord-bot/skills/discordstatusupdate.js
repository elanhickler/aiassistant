import { readFile } from "node:fs/promises";

function limitText(text, maxCharacters) {
  const normalized = String(text || "").trim();
  if (normalized.length <= maxCharacters) return normalized;
  return `${normalized.slice(0, maxCharacters)}...`;
}

function parseJsonObject(text, label) {
  const trimmed = String(text || "").trim();
  const objectMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!objectMatch) throw new Error(`No JSON object found in ${label} response: ${trimmed}`);
  return JSON.parse(objectMatch[0]);
}

function normalizeSourceSkills(settings) {
  const sourceSkills = settings?.source_skills;
  if (!Array.isArray(sourceSkills)) return [];
  return sourceSkills.map((skillName) => String(skillName).trim()).filter(Boolean);
}

export function createDiscordStatusUpdateSkill(context) {
  const {
    agentName,
    getSkills,
    longMemoryPath,
    openrouterApiKey,
    requiredSetting,
    safeReply,
    statusApi,
    utilityModel,
    writeRawOpenRouterText,
  } = context;

  const settings = requiredSetting("discord_status_update");
  const sourceSkillNames = normalizeSourceSkills(settings);

  async function askUtilityJson(messages) {
    await writeRawOpenRouterText(messages, "discord status update");

    const response = await fetch(`${requiredSetting("openrouter_base_url")}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openrouterApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: utilityModel,
        messages,
        temperature: 0.2,
        max_tokens: 220,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenRouter error ${response.status}: ${await response.text()}`);
    }

    const payload = await response.json();
    const content = payload.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error("OpenRouter returned an empty status update.");
    return parseJsonObject(content, "discord status update");
  }

  async function collectStatusHints(summaryContext) {
    if (sourceSkillNames.length === 0) return [];

    const allowedSkillNames = new Set(sourceSkillNames);
    const hints = [];
    for (const skill of getSkills()) {
      if (!allowedSkillNames.has(String(skill.name))) continue;
      if (typeof skill.getStatusHints !== "function") continue;

      const skillHints = await skill.getStatusHints(summaryContext);
      const hintList = Array.isArray(skillHints) ? skillHints : [skillHints];
      for (const hint of hintList) {
        const text = String(hint || "").trim();
        if (text) hints.push(`${skill.name}: ${text}`);
      }
    }
    return hints;
  }

  async function buildStatusUpdate({ basisText = "", source = "manual", summaryContext = {} } = {}) {
    const currentStatus = await statusApi.get();
    const statusHints = await collectStatusHints(summaryContext);
    const summaryText = limitText(summaryContext.summaryText, 6000);
    const sourceText = limitText(summaryContext.sourceText, 6000);
    const longMemoryText = summaryText || limitText(await readFile(longMemoryPath, "utf8").catch(() => ""), 6000);

    const messages = [
      {
        role: "system",
        content: [
          `You write ${agentName}'s concise natural-language status.`,
          "This is not Discord presence. It is an auditable memory/status note for humans and future context.",
          "Use current status as truth. Do not change mode, wake state, or sleep state.",
          "If sleeping, describe sleep naturally and mention the remaining sleep estimate when available.",
          "If the user gives a suggested status or basis text, use it as guidance but keep it consistent with current status.",
          "Return strict JSON only with these keys: status_text, current_activity, mood, visibility_note, confidence.",
          "status_text should be one or two natural sentences, max 280 characters.",
          "current_activity should be a short plain-language activity, max 240 characters.",
          "mood should be a short label.",
          "visibility_note should be a short optional note about what a human would understand from the status.",
          "confidence is 0 to 1.",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          "# Current Status JSON",
          JSON.stringify(currentStatus, null, 2),
          "",
          "# Status Update Source",
          source,
          "",
          "# User Basis Or Suggested Status",
          basisText || "(none)",
          "",
          "# Longmemory",
          longMemoryText || "(empty)",
          "",
          "# Recent Shortmemory Source Used By Summary",
          sourceText || "(empty)",
          "",
          "# Skill Status Hints",
          statusHints.length > 0 ? statusHints.join("\n") : "(none)",
        ].join("\n"),
      },
    ];

    const decision = await askUtilityJson(messages);
    const statusText = limitText(decision.status_text, 280);
    if (!statusText) return null;

    const changes = {
      discord_status_text: statusText,
      discord_status_mood: limitText(decision.mood, 80),
      discord_status_visibility_note: limitText(decision.visibility_note, 240),
      discord_status_updated_at: new Date().toISOString(),
      discord_status_source: source,
    };

    const nextActivity = limitText(decision.current_activity, 240);
    if (nextActivity) changes.current_activity = nextActivity;

    const status = await statusApi.update(changes);
    console.log(`Updated Discord status text for ${agentName}: ${statusText}`);
    return { status, statusText };
  }

  async function afterSummary(summaryContext) {
    await buildStatusUpdate({ source: "summary", summaryContext });
  }

  async function handlePipeCommand(command, message) {
    if (command?.kind !== "status") return false;

    const result = await buildStatusUpdate({
      basisText: command.content,
      source: "pipe command",
      summaryContext: {
        sourceText: command.content,
      },
    });
    await safeReply(message, result?.statusText || `${agentName} status updated.`);
    return true;
  }

  return {
    name: "discordstatusupdate",
    afterSummary,
    handlePipeCommand,
  };
}
