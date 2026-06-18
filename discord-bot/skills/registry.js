import { access } from "node:fs/promises";
import { createCodeSkill } from "./code.js";
import { createDiscordStatusUpdateSkill } from "./discordstatusupdate.js";
import { createDreamJournalSkill } from "./dreamjournal.js";
import { createEmojiSkill } from "./emoji.js";
import { createFileSkill } from "./file.js";
import { createMusicSkill } from "./music.js";
import { plannedSkillNames } from "./placeholders.js";
import { createRunProgramSkill } from "./runprogram.js";
import { createSpeakSkill } from "./speak.js";
import { createStorySkill } from "./story.js";
import { createJournalSkill } from "./journal.js";
import { createTextgenSkill } from "./textgen.js";
import { createThoughtSkill } from "./thought.js";
import { createTimeSkill } from "./time.js";
import { createVisionSkill } from "./vision.js";
import { createVisualExpressionSkill } from "./visualexpression.js";

export const coreSkillNames = new Set(["dreamjournal", "emoji", "journal", "story", "thought", "time"]);

const coreSkillFactories = [
  createDreamJournalSkill,
  createEmojiSkill,
  createJournalSkill,
  createStorySkill,
  createThoughtSkill,
  createTimeSkill,
];

const optionalSkillDefinitions = [
  { name: "code", factory: createCodeSkill, pipeCommands: ["code"] },
  { name: "discordstatusupdate", factory: createDiscordStatusUpdateSkill },
  { name: "file", factory: createFileSkill, pipeCommands: ["file"] },
  { name: "music", factory: createMusicSkill, pipeCommands: ["music"], allowEmptyPipeCommands: ["music"] },
  { name: "runprogram", factory: createRunProgramSkill, pipeCommands: ["runprogram"] },
  { name: "speak", factory: createSpeakSkill, pipeCommands: ["speak"], allowEmptyPipeCommands: ["speak"] },
  { name: "textgen", factory: createTextgenSkill, pipeCommands: ["textgen"] },
  { name: "vision", factory: createVisionSkill, pipeCommands: ["vision"], allowEmptyPipeCommands: ["vision"] },
  { name: "visualexpression", factory: createVisualExpressionSkill, pipeCommands: ["image", "visual"] },
];

const optionalSkillFactories = new Map(
  optionalSkillDefinitions.map((definition) => [definition.name, definition.factory]),
);

const placeholderSkillNames = new Set(plannedSkillNames());

export function implementedOptionalSkillNames() {
  return [...optionalSkillFactories.keys()];
}

export function plannedSkillNamesForRegistry() {
  return [...placeholderSkillNames];
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
  return optionalSkillDefinitions.flatMap((definition) => definition.pipeCommands || []);
}

export function optionalPipeCommandsAllowedWithoutContentNames() {
  return optionalSkillDefinitions.flatMap((definition) => definition.allowEmptyPipeCommands || []);
}

export function skillRegistrySnapshot() {
  return {
    core: [...coreSkillNames],
    implemented_optional: implementedOptionalSkillNames(),
    planned: plannedSkillNamesForRegistry(),
    optional_pipe_commands: implementedOptionalPipeCommandNames(),
    optional_pipe_commands_allowed_without_content: optionalPipeCommandsAllowedWithoutContentNames(),
  };
}

async function localSkillFactory(skillName) {
  const name = String(skillName || "").trim().toLowerCase();
  if (!name) return null;

  const localSkillUrl = new URL(`../local-skills/${name}.js`, import.meta.url);
  try {
    await access(localSkillUrl);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }

  const module = await import(localSkillUrl.href);
  const factory = module.createSkill || module.default;
  if (typeof factory !== "function") {
    throw new Error(`Local skill ${name} must export createSkill(context) or a default factory function.`);
  }
  return factory;
}

export async function createRuntimeSkills(enabledSkills, context) {
  const optionalSkills = [];
  for (const skillName of normalizeEnabledSkillNames(enabledSkills)) {
    const factory = optionalSkillFactories.get(skillName) || await localSkillFactory(skillName);
    if (skillImplementationStatus(skillName) === "planned") {
      throw new Error(`Skill is planned but not implemented yet: ${skillName}`);
    }
    if (!factory) throw new Error(`Unknown enabled skill: ${skillName}`);
    optionalSkills.push(factory(context));
  }

  return [
    ...coreSkillFactories.map((factory) => factory(context)),
    ...optionalSkills,
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
