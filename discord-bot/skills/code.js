import {
  commandDisplay,
  normalizeExternalCommandResult,
  runExternalCommand,
  splitCommand,
} from "./external-command.js";

export function createCodeSkill(context) {
  const {
    agentFolder,
    agentName,
    requiredSetting,
    safeReply,
  } = context;

  const settings = requiredSetting("code_skill");
  const commandParts = splitCommand(settings.command);
  const command = commandParts[0] || "";
  const args = [
    ...commandParts.slice(1),
    ...(Array.isArray(settings.args) ? settings.args.map((arg) => String(arg)) : []),
  ];
  const timeoutMilliseconds = Number(settings.timeout_milliseconds || 60000);
  const maxOutputCharacters = Number(settings.max_output_characters || 1600);

  async function runCodeRequest({ input = "", source = "unknown", metadata = {} } = {}) {
    const request = String(input || "").trim();
    if (!request) throw new Error("code needs instructions.");
    if (!command) {
      throw new Error("code_skill.command is blank. Configure it to point at your code tool command.");
    }

    const result = await runExternalCommand({
      command,
      args,
      timeoutMilliseconds,
      maxOutputCharacters,
      label: "Code skill",
      payload: {
        request,
        source,
        agent: agentName,
        agent_folder: agentFolder,
        metadata,
      },
    });

    return normalizeExternalCommandResult(result, maxOutputCharacters, "code command completed");
  }

  async function handlePipeCommand(commandInput, message) {
    if (commandInput?.kind !== "code") return false;
    const reply = await runCodeRequest({
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
    name: "code",
    requiredSettings() {
      return ["code_skill"];
    },
    getPipeHelp({ agentCommandName, pipeRowsWithAliases }) {
      return pipeRowsWithAliases(
        agentCommandName,
        "code",
        ": instructions",
        "Send coding instructions to the configured external code skill command.",
      );
    },
    runCodeRequest,
    handlePipeCommand,
    onReady() {
      if (command) console.log(`Code skill command: ${commandDisplay(command, args)}`);
    },
  };
}
