const placeholderSkillDescriptions = {
  emoji: "Future emoji preference and emoji context provider.",
  profilepic: "Future avatar/profile image workflow.",
  summarization: "Future shortmemory to longmemory maintenance workflow.",
  art: "Future art prompt, reference, and visual memory workflow.",
  stories: "Future story, lore, and narrative retrieval workflow.",
  settings: "Future Discord-editable settings workflow.",
};

export function plannedSkillNames() {
  return Object.keys(placeholderSkillDescriptions);
}

export function plannedSkillDescription(name) {
  return placeholderSkillDescriptions[name] || "Future placeholder skill.";
}
