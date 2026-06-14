import { createExternalCommandSkill } from "./external-command.js";

export function createCodeSkill(context) {
  return createExternalCommandSkill({
    context,
    name: "code",
    settingName: "code_skill",
    commandDescription: "Send coding instructions to the configured external code skill command.",
    emptyInputError: "code needs instructions.",
    missingCommandError: "code_skill.command is blank. Configure it to point at your code tool command.",
    timeoutDefault: 60000,
    completedText: "code command completed",
    runMethodName: "runCodeRequest",
  });
}
