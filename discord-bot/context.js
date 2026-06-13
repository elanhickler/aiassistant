import { readFile } from "node:fs/promises";
import { parseShortMemoryEntries } from "./memory.js";

async function readRequiredTextFile(filePath) {
  try {
    return (await readFile(filePath, "utf8")).trim();
  } catch (error) {
    if (error.code === "ENOENT") throw new Error(`Missing required context file: ${filePath}`);
    throw error;
  }
}

async function readOptionalTextFile(filePath) {
  try {
    return (await readFile(filePath, "utf8")).trim();
  } catch (error) {
    if (error.code === "ENOENT") return "";
    throw error;
  }
}

function parseRecentShortMemory(text, limit) {
  if (limit <= 0) return "";
  return parseShortMemoryEntries(text)
    .slice(-limit)
    .map((entry) => `${entry.role || "unknown"}: ${entry.content || ""}`.trim())
    .filter(Boolean)
    .join("\n");
}

function normalizeContextBlock(block) {
  if (!block || block.enabled === false) return null;
  const content = String(block.content || "").trim();
  if (!content) return null;
  return {
    title: String(block.title || "Context").trim(),
    content,
    source: String(block.source || "unknown").trim(),
    priority: Number(block.priority || 0),
  };
}

function formatContextBlock(block) {
  return [`# ${block.title}`, `source: ${block.source}`, "", block.content].join("\n");
}

async function skillContextBlocks(skills, message) {
  const blocks = [];
  for (const skill of skills) {
    const skillBlocks = await skill.getContextBlocks?.(message);
    if (!skillBlocks) continue;
    const normalizedBlocks = (Array.isArray(skillBlocks) ? skillBlocks : [skillBlocks])
      .map(normalizeContextBlock)
      .filter(Boolean);
    blocks.push(...normalizedBlocks);
  }
  return blocks;
}

export async function buildOpenRouterMessages({
  agentName,
  conversationHistory,
  conversationHistoryLimit,
  longMemoryPath,
  message,
  originSummaryPath,
  persona,
  shortMemoryPath,
  statusPath,
  skills,
  timePassages = [],
}) {
  const longMemory = await readRequiredTextFile(longMemoryPath);
  const originSummary = originSummaryPath ? await readOptionalTextFile(originSummaryPath) : "";
  const shortMemoryText = await readRequiredTextFile(shortMemoryPath);
  const statusText = await readRequiredTextFile(statusPath);
  const shortMemory = parseRecentShortMemory(shortMemoryText, conversationHistoryLimit);
  const blocks = [
    normalizeContextBlock({
      title: "Status",
      source: statusPath,
      priority: 90,
      content: statusText,
    }),
    normalizeContextBlock({
      title: "Long Memory",
      source: longMemoryPath,
      priority: 80,
      content: longMemory,
    }),
    normalizeContextBlock({
      title: "Origin Summary",
      source: originSummaryPath,
      priority: 75,
      content: originSummary,
    }),
    normalizeContextBlock({
      title: "Recent Shortmemory",
      source: shortMemoryPath,
      priority: 40,
      content: shortMemory,
    }),
    normalizeContextBlock({
      title: "Time Passage",
      source: "pipe command passtimeminutes",
      priority: 70,
      content: formatTimePassages(timePassages),
    }),
    ...(await skillContextBlocks(skills, message)),
  ]
    .filter(Boolean)
    .sort((left, right) => right.priority - left.priority);

  const systemContent = [
    `# Persona: ${agentName}`,
    persona.trim(),
    ...blocks.map(formatContextBlock),
  ].join("\n\n");
  const recentConversation = conversationHistoryLimit <= 0
    ? []
    : conversationHistory.slice(-conversationHistoryLimit);

  return [
    { role: "system", content: systemContent },
    ...recentConversation,
  ];
}

function formatTimePassages(timePassages) {
  if (!timePassages.length) return "";

  return [
    "The user explicitly advanced the agent's experienced time before this reply.",
    "Before writing the next reply, infer what the agent experienced, did, noticed, or thought during this passage of time as appropriate.",
    "Use this naturally in the reply. Do not overexplain the mechanism unless the user asks.",
    "",
    ...timePassages.map((entry) => (
      `minutes: ${entry.minutes}\nrecorded_at: ${entry.recordedAt}`
    )),
  ].join("\n");
}
