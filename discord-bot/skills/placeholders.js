const placeholderSkillDescriptions = {
  characterproxy: "Future webhook-based character proxy for roleplaying as saved character profiles.",
  emoji: "Future emoji preference and emoji context provider.",
  gamemaster: "Future game master workflow for scenes, rules, pacing, and world state.",
  profilepic: "Future avatar/profile image workflow.",
  summarization: "Future shortmemory to longmemory maintenance workflow.",
  art: "Future art prompt, reference, and visual memory workflow.",
  musiccomposition: "Future music composition workflow.",
  settings: "Future Discord-editable settings workflow.",
  tts: "Future normal expressive voice output for adult-permitted AI character chat.",
  videogeneration: "Future video generation workflow.",
};

export function plannedSkillNames() {
  return Object.keys(placeholderSkillDescriptions);
}

export function plannedSkillDescription(name) {
  return placeholderSkillDescriptions[name] || "Future placeholder skill.";
}
