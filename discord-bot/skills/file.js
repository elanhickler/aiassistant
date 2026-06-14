import { createExternalCommandSkill } from "./external-command.js";

export function createFileSkill(context) {
  return createExternalCommandSkill({
    context,
    name: "file",
    settingName: "file_skill",
    commandDescription: "Send file-management instructions to the configured external file skill command.",
    emptyInputError: "file needs instructions.",
    missingCommandError: "file_skill.command is blank. Configure it to point at your file management command.",
    timeoutDefault: 30000,
    completedText: "file command completed",
    runMethodName: "runFileRequest",
  });
}
