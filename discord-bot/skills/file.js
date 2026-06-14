import {
  commandDisplay,
  normalizeExternalCommandResult,
  runExternalCommand,
  splitCommand,
} from "./external-command.js";

export function createFileSkill(context) {
  const {
    agentFolder,
    agentName,
    requiredSetting,
    safeReply,
  } = context;

  const settings = requiredSetting("file_skill");
  const commandParts = splitCommand(settings.command);
  const command = commandParts[0] || "";
  const args = [
    ...commandParts.slice(1),
    ...(Array.isArray(settings.args) ? settings.args.map((arg) => String(arg)) : []),
  ];
  const timeoutMilliseconds = Number(settings.timeout_milliseconds || 30000);
  const maxOutputCharacters = Number(settings.max_output_characters || 1600);

  async function runFileRequest({ input = "", source = "unknown", metadata = {} } = {}) {
    const request = String(input || "").trim();
    if (!request) throw new Error("file needs instructions.");
    if (!command) {
      throw new Error("file_skill.command is blank. Configure it to point at your file management command.");
    }

    const result = await runExternalCommand({
      command,
      args,
      timeoutMilliseconds,
      maxOutputCharacters,
      label: "File skill",
      payload: {
        request,
        source,
        agent: agentName,
        agent_folder: agentFolder,
        metadata,
      },
    });

    return normalizeExternalCommandResult(result, maxOutputCharacters, "file command completed");
  }

  async function handlePipeCommand(commandInput, message) {
    if (commandInput?.kind !== "file") return false;
    const reply = await runFileRequest({
      input: commandInput.content,
      source: "discord_pipe",
      metadata: {
        channel_id: message.channelId,
        message_id: message.id,
        author_id: message.author?.id || "",
      },
    });
    await safeReply(message, reply);
    return true;
  }

  return {
    name: "file",
    requiredSettings() {
      return ["file_skill"];
    },
    runFileRequest,
    handlePipeCommand,
    onReady() {
      if (command) console.log(`File skill command: ${commandDisplay(command, args)}`);
    },
  };
}
