import { createCodeSkill } from "./code.js";
import { createDiscordStatusUpdateSkill } from "./discordstatusupdate.js";
import { createFileSkill } from "./file.js";
import { createMusicSkill } from "./music.js";
import { plannedSkillNames } from "./placeholders.js";
import { createSpeakSkill } from "./speak.js";
import { createStorySkill } from "./story.js";
import { createTimeSkill } from "./time.js";
import { createVisionSkill } from "./vision.js";
import { createVisualExpressionSkill } from "./visualexpression.js";

export const coreSkillNames = new Set(["story", "time"]);

const coreSkillFactories = [
  createStorySkill,
  createTimeSkill,
];

const optionalSkillFactories = new Map([
  ["code", createCodeSkill],
  ["discordstatusupdate", createDiscordStatusUpdateSkill],
  ["file", createFileSkill],
  ["music", createMusicSkill],
  ["speak", createSpeakSkill],
  ["vision", createVisionSkill],
  ["visualexpression", createVisualExpressionSkill],
]);

const optionalPipeCommandNames = [
  "code",
  "file",
  "music",
  "speak",
  "vision",
  "image",
  "visual",
];

const optionalPipeCommandsAllowedWithoutContent = [
  "music",
  "speak",
  "vision",
];

const placeholderSkillNames = new Set(plannedSkillNames());

export function implementedOptionalSkillNames() {
  return [...optionalSkillFactories.keys()];
}

export function skillImplementationStatus(skillName) {
  const name = String(skillName || "").trim().toLowerCase();
  if (!name) return "blank";
  if (coreSkillNames.has(name)) return "core";
  if (optionalSkillFactories.has(name)) return "implemented";
  if (placeholderSkillNames.has(name)) return "planned";
  return "unknown";
}

export function normalizeEnabledSkillNames(skillNames) {
  const normalized = [];
  const seen = new Set();
  for (const skillName of skillNames || []) {
    const name = String(skillName || "").trim().toLowerCase();
    if (!name || coreSkillNames.has(name) || seen.has(name)) continue;
    seen.add(name);
    normalized.push(name);
  }
  return normalized;
}

export function implementedOptionalPipeCommandNames() {
  return [...optionalPipeCommandNames];
}

export function optionalPipeCommandsAllowedWithoutContentNames() {
  return [...optionalPipeCommandsAllowedWithoutContent];
}

export function createRuntimeSkills(enabledSkills, context) {
  return [
    ...coreSkillFactories.map((factory) => factory(context)),
    ...normalizeEnabledSkillNames(enabledSkills).map((skillName) => {
      const factory = optionalSkillFactories.get(skillName);
      if (skillImplementationStatus(skillName) === "planned") {
        throw new Error(`Skill is planned but not implemented yet: ${skillName}`);
      }
      if (!factory) throw new Error(`Unknown enabled skill: ${skillName}`);
      return factory(context);
    }),
  ];
}

export function skillLoadSummary(skills) {
  return (skills || [])
    .map((skill) => String(skill?.name || "unknown"))
    .filter(Boolean)
    .join(", ");
}

export function skillName(skill) {
  return String(skill?.name || "unknown");
}

export function skillHandlers(skills, hookName) {
  return (skills || [])
    .map((skill) => ({
      skill,
      hook: skill?.[hookName],
    }))
    .filter(({ hook }) => typeof hook === "function");
}
