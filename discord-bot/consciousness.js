import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

export function consciousnessThoughtsFolder(agentFolder) {
  return path.join(agentFolder, "soul", "consciousness", "thoughts");
}

export function consciousnessFeelingsFolder(agentFolder) {
  return path.join(agentFolder, "soul", "consciousness", "feelings");
}

export function consciousnessJournalsFolder(agentFolder) {
  return path.join(agentFolder, "soul", "consciousness", "journals");
}

export function timestampForConsciousnessFileName(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

export function safeConsciousnessFileName(name) {
  const safe = String(name || "thought")
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return safe || "thought";
}

function frontMatterLine(key, value) {
  const text = value === undefined || value === null ? "" : String(value);
  if (!text.includes("\n")) return `${key}: ${text}`;
  return [
    `${key}: |-`,
    ...text.split(/\r?\n/).map((line) => `  ${line}`),
  ].join("\n");
}

function normalizeThoughtMarkdown(title, thoughtMarkdown) {
  const text = String(thoughtMarkdown || "").trim();
  if (!text) throw new Error("Cannot save an empty thought.");
  if (text.startsWith("# ")) return text;
  return [`# ${String(title || "Thought").trim() || "Thought"}`, "", text].join("\n");
}

function normalizeFeelingMarkdown(title, feelingMarkdown) {
  const text = String(feelingMarkdown || "").trim();
  if (!text) throw new Error("Cannot save an empty feeling.");
  if (text.startsWith("# ")) return text;
  return [`# ${String(title || "Feeling").trim() || "Feeling"}`, "", text].join("\n");
}

function normalizeJournalMarkdown(title, journalMarkdown) {
  const text = String(journalMarkdown || "").trim();
  if (!text) throw new Error("Cannot save an empty journal.");
  if (text.startsWith("# ")) return text;
  return [`# ${String(title || "Journal").trim() || "Journal"}`, "", text].join("\n");
}

function safeBackupName(text) {
  return String(text || "file")
    .replace(/[^a-z0-9._-]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || "file";
}

function containedPath(root, target) {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  if (resolvedTarget !== resolvedRoot && !resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`Path escapes agent folder: ${target}`);
  }
  return resolvedTarget;
}

async function backupExistingConsciousnessFile(agentFolder, filePath, reason) {
  const existing = await readFile(filePath).catch((error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (!existing || existing.length === 0) return null;

  const backupFolder = path.join(agentFolder, "backups");
  await mkdir(backupFolder, { recursive: true });
  const relativeName = safeBackupName(path.relative(agentFolder, filePath));
  const backupName = `${timestampForConsciousnessFileName()}-${safeBackupName(reason)}-${relativeName}`;
  const backupPath = path.join(backupFolder, backupName);
  await writeFile(backupPath, existing);
  return backupPath;
}

export async function savePrivateThought({
  agentFolder,
  agentName,
  sourceMessage,
  instruction,
  thoughtWindowEntries,
  title,
  thoughtMarkdown,
}) {
  const createdAt = new Date().toISOString();
  const folderPath = consciousnessThoughtsFolder(agentFolder);
  await mkdir(folderPath, { recursive: true });

  const safeTitle = String(title || "Thought").trim() || "Thought";
  const fileName = `${timestampForConsciousnessFileName()}-${safeConsciousnessFileName(safeTitle)}.md`;
  const filePath = path.join(folderPath, fileName);
  const markdown = normalizeThoughtMarkdown(safeTitle, thoughtMarkdown);
  const fileText = [
    "---",
    frontMatterLine("created_at", createdAt),
    frontMatterLine("agent", agentName),
    frontMatterLine("source_message_id", sourceMessage?.id || ""),
    frontMatterLine("source_channel_id", sourceMessage?.channelId || sourceMessage?.channel?.id || ""),
    frontMatterLine("instruction", instruction),
    frontMatterLine("thought_window_entries", thoughtWindowEntries),
    "---",
    "",
    markdown,
    "",
  ].join("\n");

  await writeFile(filePath, fileText, "utf8");
  return { createdAt, fileName, filePath };
}

export async function savePrivateFeeling({
  agentFolder,
  agentName,
  sourceMessage,
  instruction,
  recentMemoryWindowEntries,
  title,
  feelingMarkdown,
}) {
  const createdAt = new Date().toISOString();
  const folderPath = consciousnessFeelingsFolder(agentFolder);
  await mkdir(folderPath, { recursive: true });

  const safeTitle = String(title || "Feeling").trim() || "Feeling";
  const fileName = `${timestampForConsciousnessFileName()}-${safeConsciousnessFileName(safeTitle)}.md`;
  const filePath = path.join(folderPath, fileName);
  const markdown = normalizeFeelingMarkdown(safeTitle, feelingMarkdown);
  const fileText = [
    "---",
    frontMatterLine("created_at", createdAt),
    frontMatterLine("agent", agentName),
    frontMatterLine("source_message_id", sourceMessage?.id || ""),
    frontMatterLine("source_channel_id", sourceMessage?.channelId || sourceMessage?.channel?.id || ""),
    frontMatterLine("instruction", instruction),
    frontMatterLine("recent_memory_window_entries", recentMemoryWindowEntries),
    "---",
    "",
    markdown,
    "",
  ].join("\n");

  await writeFile(filePath, fileText, "utf8");
  return { createdAt, fileName, filePath };
}

export async function saveJournalEntry({
  agentFolder,
  agentName,
  instruction,
  sourceRange = "",
  cycleRange = "",
  thoughtsIncludedCount = "",
  shortMemoryEntriesIncludedCount = "",
  neuralMemoryNodesIncludedCount = "",
  title,
  journalMarkdown,
  replaceFilePath = "",
}) {
  const createdAt = new Date().toISOString();
  const folderPath = consciousnessJournalsFolder(agentFolder);
  await mkdir(folderPath, { recursive: true });

  const safeTitle = String(title || "Journal").trim() || "Journal";
  const replacementTarget = replaceFilePath && path.isAbsolute(replaceFilePath)
    ? replaceFilePath
    : path.join(folderPath, String(replaceFilePath || ""));
  const filePath = replaceFilePath
    ? containedPath(folderPath, replacementTarget)
    : path.join(folderPath, `${timestampForConsciousnessFileName()}-${safeConsciousnessFileName(safeTitle)}.md`);
  const backupPath = replaceFilePath
    ? await backupExistingConsciousnessFile(agentFolder, filePath, "journal-overwrite")
    : null;
  const markdown = normalizeJournalMarkdown(safeTitle, journalMarkdown);
  const fileText = [
    "---",
    frontMatterLine("created_at", createdAt),
    frontMatterLine("agent", agentName),
    frontMatterLine("source_range", sourceRange),
    frontMatterLine("cycle_range", cycleRange),
    frontMatterLine("instruction", instruction),
    frontMatterLine("thoughts_included_count", thoughtsIncludedCount),
    frontMatterLine("shortmemory_entries_included_count", shortMemoryEntriesIncludedCount),
    frontMatterLine("neural_memory_nodes_included_count", neuralMemoryNodesIncludedCount),
    "---",
    "",
    markdown,
    "",
  ].join("\n");

  await writeFile(filePath, fileText, "utf8");
  return {
    backupPath,
    createdAt,
    fileName: path.basename(filePath),
    filePath,
  };
}

export async function readRecentPrivateThoughts(agentFolder, limit = 5, maxCharactersPerThought = 4000) {
  const folderPath = consciousnessThoughtsFolder(agentFolder);
  const entries = await readdir(folderPath, { withFileTypes: true }).catch((error) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });

  const files = entries
    .filter((entry) => entry.isFile() && /\.md$/i.test(entry.name))
    .map((entry) => path.join(folderPath, entry.name))
    .sort()
    .slice(-limit);

  const thoughts = [];
  for (const filePath of files) {
    const text = (await readFile(filePath, "utf8")).trim();
    thoughts.push([
      `# ${path.basename(filePath)}`,
      text.length <= maxCharactersPerThought ? text : `${text.slice(0, maxCharactersPerThought)}\n...`,
    ].join("\n"));
  }
  return thoughts.join("\n\n");
}

export async function readRecentPrivateFeelings(agentFolder, limit = 5, maxCharactersPerFeeling = 4000) {
  const folderPath = consciousnessFeelingsFolder(agentFolder);
  const entries = await readdir(folderPath, { withFileTypes: true }).catch((error) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });

  const files = entries
    .filter((entry) => entry.isFile() && /\.md$/i.test(entry.name))
    .map((entry) => path.join(folderPath, entry.name))
    .sort()
    .slice(-limit);

  const feelings = [];
  for (const filePath of files) {
    const text = (await readFile(filePath, "utf8")).trim();
    feelings.push([
      `# ${path.basename(filePath)}`,
      text.length <= maxCharactersPerFeeling ? text : `${text.slice(0, maxCharactersPerFeeling)}\n...`,
    ].join("\n"));
  }
  return feelings.join("\n\n");
}

export async function readRecentJournals(agentFolder, limit = 5, maxCharactersPerJournal = 6000) {
  const folderPath = consciousnessJournalsFolder(agentFolder);
  const entries = await readdir(folderPath, { withFileTypes: true }).catch((error) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });

  const files = entries
    .filter((entry) => entry.isFile() && /\.md$/i.test(entry.name))
    .map((entry) => path.join(folderPath, entry.name))
    .sort()
    .slice(-limit);

  const journals = [];
  for (const filePath of files) {
    const text = (await readFile(filePath, "utf8")).trim();
    journals.push([
      `# ${path.basename(filePath)}`,
      text.length <= maxCharactersPerJournal ? text : `${text.slice(0, maxCharactersPerJournal)}\n...`,
    ].join("\n"));
  }
  return journals.join("\n\n");
}
