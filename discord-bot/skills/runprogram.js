import { createExternalCommandSkill } from "./external-command.js";

export function createRunProgramSkill(context) {
  return createExternalCommandSkill({
    context,
    name: "runprogram",
    settingName: "runprogram_skill",
    commandDescription: "Send program-launch or program-control instructions to the configured external runprogram command.",
    emptyInputError: "runprogram needs instructions.",
    missingCommandError: "runprogram_skill.command is blank. Configure it to point at your program runner command.",
    timeoutDefault: 30000,
    completedText: "runprogram command completed",
    runMethodName: "runProgramRequest",
    extraPayload(settings) {
      return {
        apps: settings.apps && typeof settings.apps === "object" ? settings.apps : {},
      };
    },
  });
}
