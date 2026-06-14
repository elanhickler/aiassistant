import { skillRegistrySnapshot } from "./registry.js";

const snapshot = skillRegistrySnapshot();

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(snapshot, null, 2));
} else {
  console.log("core:", snapshot.core.join(", "));
  console.log("implemented optional:", snapshot.implemented_optional.join(", "));
  console.log("planned:", snapshot.planned.join(", "));
  console.log("optional pipe commands:", snapshot.optional_pipe_commands.join(", "));
}
