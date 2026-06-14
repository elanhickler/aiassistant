const knownOutputTypes = ["emoji", "self", "scene", "background", "thought", "dream"];

function asList(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
}

function requireStringSetting(settings, key) {
  const value = String(settings?.[key] || "").trim();
  if (!value) throw new Error(`Missing planned_skill_settings.visualexpression.${key}`);
  return value;
}

function requireNumberSetting(settings, key, minimum) {
  const value = Number(settings?.[key]);
  if (!Number.isFinite(value) || value < minimum) {
    throw new Error(`planned_skill_settings.visualexpression.${key} must be ${minimum} or higher.`);
  }
  return value;
}

function validateSettings(settings) {
  requireStringSetting(settings, "provider");
  requireStringSetting(settings, "output_folder");
  requireStringSetting(settings, "output_manifest_file");
  requireStringSetting(settings, "request_log_file");
  requireStringSetting(settings, "visual_review_file");
  requireStringSetting(settings, "visual_memory_file");
  requireStringSetting(settings, "style_presets_file");
  requireNumberSetting(settings, "provider_timeout_seconds", 1);
  requireNumberSetting(settings, "provider_max_retries", 0);
  requireNumberSetting(settings, "max_visuals_per_reply", 0);
  requireNumberSetting(settings, "max_variants_per_request", 1);
  requireNumberSetting(settings, "prompt_context_character_limit", 0);
  requireNumberSetting(settings, "max_reference_ids_per_prompt", 0);
  requireNumberSetting(settings, "max_reference_notes_to_scan", 0);
  requireNumberSetting(settings, "max_visual_memories_per_context", 0);

  const outputTypes = asList(settings.output_types);
  const unknownTypes = outputTypes.filter((outputType) => !knownOutputTypes.includes(outputType));
  if (outputTypes.length === 0) {
    throw new Error("planned_skill_settings.visualexpression.output_types must include at least one output type.");
  }
  if (unknownTypes.length > 0) {
    throw new Error(`Unknown visual expression output types: ${unknownTypes.join(", ")}`);
  }
}

function stylePresetSummary(settings) {
  return [
    `emoji: ${settings.default_emoji_style_preset || "emoji-clean"}`,
    `self: ${settings.default_self_style_preset || "self-portrait"}`,
    `scene: ${settings.default_scene_style_preset || "scene-readable"}`,
    `background: ${settings.default_background_style_preset || "background-mood"}`,
    `thought: ${settings.default_thought_style_preset || "thought-symbol"}`,
    `dream: ${settings.default_dream_style_preset || "dream-surreal"}`,
  ].join("\n");
}

export function createVisualExpressionSkill(context) {
  const { requiredSetting } = context;
  const plannedSkillSettings = requiredSetting("planned_skill_settings");
  const settings = plannedSkillSettings.visualexpression;
  if (!settings) throw new Error("Missing planned_skill_settings.visualexpression because visualexpression is enabled.");
  validateSettings(settings);

  return {
    name: "visualexpression",
    requiredSettings() {
      return ["planned_skill_settings.visualexpression"];
    },
    getContextBlocks() {
      return {
        title: "Visual Expression Skill",
        source: "discord-bot/skills/visualexpression.js",
        priority: 8,
        enabled: true,
        content: [
          "Visual expression planning is enabled, but image generation is not wired into chat replies yet.",
          "Do not claim that an image was generated unless a future provider result exists.",
          "Potential future visual output types:",
          asList(settings.output_types).join(", "),
          "",
          "Default style presets:",
          stylePresetSummary(settings),
          "",
          `Provider: ${settings.provider}`,
          `Output folder: ${settings.output_folder}`,
          `Max visuals per reply: ${settings.max_visuals_per_reply}`,
          `Max variants per request: ${settings.max_variants_per_request}`,
        ].join("\n"),
      };
    },
    getStatusHints() {
      return [
        `visual expression provider is planned as ${settings.provider}`,
        `visual outputs available later: ${asList(settings.output_types).join(", ")}`,
      ];
    },
    onReady() {
      console.log(`Visual expression skill loaded with provider ${settings.provider}. Generation remains planning-only.`);
    },
  };
}
