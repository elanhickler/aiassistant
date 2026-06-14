import { spawn } from "node:child_process";

function truncateText(text, maxLength) {
  const value = String(text || "").trim();
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}

function splitCommand(command) {
  if (Array.isArray(command)) return command.map((part) => String(part)).filter(Boolean);
  const text = String(command || "").trim();
  if (!text) return [];
  return [text];
}

function commandDisplay(command, args) {
  return [command, ...args].filter(Boolean).join(" ");
}

function runExternalFileManager({ command, args, payload, timeoutMilliseconds, maxOutputCharacters }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(new Error(`File skill command timed out after ${timeoutMilliseconds} ms.`));
    }, timeoutMilliseconds);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
      if (stdout.length > maxOutputCharacters * 2) {
        stdout = stdout.slice(-maxOutputCharacters * 2);
      }
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
      if (stderr.length > maxOutputCharacters * 2) {
        stderr = stderr.slice(-maxOutputCharacters * 2);
      }
    });

    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`File skill command exited ${code}: ${truncateText(stderr || stdout, maxOutputCharacters)}`));
        return;
      }
      resolve({
        stdout: truncateText(stdout, maxOutputCharacters),
        stderr: truncateText(stderr, maxOutputCharacters),
      });
    });

    child.stdin.end(`${JSON.stringify(payload)}\n`);
  });
}

function normalizeFileManagerResult(result, maxOutputCharacters) {
  const stdout = String(result.stdout || "").trim();
  if (!stdout) return "file command completed";

  try {
    const parsed = JSON.parse(stdout);
    if (typeof parsed.reply === "string") return truncateText(parsed.reply, maxOutputCharacters);
    if (typeof parsed.message === "string") return truncateText(parsed.message, maxOutputCharacters);
    if (typeof parsed.text === "string") return truncateText(parsed.text, maxOutputCharacters);
    return truncateText(JSON.stringify(parsed, null, 2), maxOutputCharacters);
  } catch {
    return truncateText(stdout, maxOutputCharacters);
  }
}

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

    const result = await runExternalFileManager({
      command,
      args,
      timeoutMilliseconds,
      maxOutputCharacters,
      payload: {
        request,
        source,
        agent: agentName,
        agent_folder: agentFolder,
        metadata,
      },
    });

    return normalizeFileManagerResult(result, maxOutputCharacters);
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
