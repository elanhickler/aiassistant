import {
  coreSkillNames,
  implementedOptionalSkillNames,
  plannedSkillNamesForRegistry,
} from "./registry.js";

console.log("core:", [...coreSkillNames].join(", "));
console.log("implemented optional:", implementedOptionalSkillNames().join(", "));
console.log("planned:", plannedSkillNamesForRegistry().join(", "));
