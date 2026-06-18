import { readFile } from "node:fs/promises";
import { parseShortMemoryEntries } from "./memory.js";
import {
  formatSemanticMemoryFilesForPrompt,
  readRecentSemanticMemoryFiles,
  semanticMemoryDebugEnabled,
  semanticMemoryEnabledForReplies,
  writeSemanticMemoryDebugReport,
} from "./semantic-memory.js";

async function readRequiredTextFile(filePath) {
  try {
    return (await readFile(filePath, "utf8")).trim();
  } catch (error) {
    if (error.code === "ENOENT") throw new Error(`Missing required context file: ${filePath}`);
    throw error;
  }
}

async function readRequiredTextFileWithFallback(filePath, fallbackPath = "") {
  const fallbackPaths = Array.isArray(fallbackPath) ? fallbackPath : [fallbackPath].filter(Boolean);
  try {
    return {
      text: await readRequiredTextFile(filePath),
      sourcePath: filePath,
    };
  } catch (error) {
    if (!fallbackPaths.length || !error.message.startsWith("Missing required context file:")) throw error;
    let lastError = error;
    for (const nextFallbackPath of fallbackPaths) {
      try {
        return {
          text: await readRequiredTextFile(nextFallbackPath),
          sourcePath: nextFallbackPath,
        };
      } catch (fallbackError) {
        lastError = fallbackError;
      }
    }
    throw lastError;
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

function replyLanguageGuard() {
  return [
    "# Reply Language",
    "Write the visible assistant reply in English.",
    "Do not switch to Chinese or any other language unless the latest user message explicitly asks for that language.",
    "Private context, memories, summaries, provider defaults, or model drift must not change the visible reply language.",
  ].join("\n");
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
  agentFolder,
  conversationHistory,
  conversationHistoryLimit,
  legacyMemorySumPath = "",
  legacyLongMemoryPath = "",
  memorySumPath,
  message,
  originSummaryPath,
  persona,
  privateFeeling = null,
  privateThought = null,
  shortMemoryPath,
  statusPath,
  settings,
  skills,
  timePassages = [],
}) {
  const memorySumResult = await readRequiredTextFileWithFallback(
    memorySumPath,
    [legacyMemorySumPath, legacyLongMemoryPath].filter(Boolean),
  );
  const originSummary = originSummaryPath ? await readOptionalTextFile(originSummaryPath) : "";
  const shortMemoryText = await readRequiredTextFile(shortMemoryPath);
  const statusText = await readRequiredTextFile(statusPath);
  const shortMemory = parseRecentShortMemory(shortMemoryText, conversationHistoryLimit);
  const shouldReadSemanticMemory = agentFolder && (
    semanticMemoryEnabledForReplies(settings) ||
    semanticMemoryDebugEnabled(settings)
  );
  const semanticMemoryFiles = shouldReadSemanticMemory
    ? await readRecentSemanticMemoryFiles(agentFolder, settings.memory_layers || {}, {
      limit: 5,
      maxCharactersPerFile: 9000,
    }).catch((error) => [{
      relativeFilePath: settings?.memory_layers?.folder || "soul/memory-layers",
      text: `(semantic memory unavailable: ${error.message})`,
      unavailable: true,
    }])
    : [];
  if (agentFolder && semanticMemoryDebugEnabled(settings)) {
    await writeSemanticMemoryDebugReport({
      agentFolder,
      agentName,
      currentUserContent: message?.content || "",
      recentShortMemory: shortMemory,
      semanticMemoryFiles,
    });
  }
  const blocks = [
    normalizeContextBlock({
      title: "Status",
      source: statusPath,
      priority: 90,
      content: statusText,
    }),
    normalizeContextBlock({
      title: "Memorysum",
      source: memorySumResult.sourcePath,
      priority: 80,
      content: memorySumResult.text,
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
      title: "Semantic Memory",
      source: settings?.memory_layers?.folder || "soul/memory-layers",
      priority: 45,
      enabled: semanticMemoryEnabledForReplies(settings),
      content: formatSemanticMemoryFilesForPrompt(semanticMemoryFiles, ""),
    }),
    normalizeContextBlock({
      title: "Time Passage",
      source: "core time system",
      priority: 70,
      content: formatTimePassages(timePassages),
    }),
    normalizeContextBlock({
      title: "Private Thought",
      source: privateThought?.source || "soul/consciousness/thoughts",
      priority: 65,
      content: formatPrivateThought(privateThought),
    }),
    normalizeContextBlock({
      title: "Private Feeling",
      source: privateFeeling?.source || "soul/consciousness/feelings",
      priority: 64,
      content: formatPrivateFeeling(privateFeeling),
    }),
    ...(await skillContextBlocks(skills, message)),
  ]
    .filter(Boolean)
    .sort((left, right) => right.priority - left.priority);

  const systemContent = [
    `# Persona: ${agentName}`,
    persona.trim(),
    replyLanguageGuard(),
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

function formatPrivateThought(privateThought) {
  const thought = String(privateThought?.content || "").trim();
  if (!thought) return "";

  return [
    "This private first-person thought was generated before the visible reply.",
    "Use it as hidden self-understanding for continuity and emotional coherence.",
    "Do not quote, reveal, summarize, or explicitly mention the private thought unless it naturally belongs in the visible reply.",
    "",
    thought,
  ].join("\n");
}

function formatPrivateFeeling(privateFeeling) {
  const feeling = String(privateFeeling?.content || "").trim();
  if (!feeling) return "";

  return [
    "This private first-person feeling was generated before the visible reply.",
    "Use it as hidden emotional, bodily, and atmospheric self-understanding.",
    "Do not quote, reveal, summarize, or explicitly mention the private feeling artifact unless it naturally belongs in the visible reply.",
    "",
    feeling,
  ].join("\n");
}

function formatTimePassages(timePassages) {
  if (!timePassages.length) return "";

  return [
    "The agent's experienced roleplay time advanced before this reply.",
    "Before writing the next reply, infer what the agent experienced, did, noticed, or thought during this passage of time as appropriate.",
    "Use this naturally in the reply. Do not overexplain the mechanism unless the user asks.",
    "",
    ...timePassages.map((entry) => (
      [
        `minutes: ${entry.minutes}`,
        `recorded_at: ${entry.recordedAt}`,
        entry.source ? `source: ${entry.source}` : "",
        entry.reason ? `reason: ${entry.reason}` : "",
      ].filter(Boolean).join("\n")
    )),
  ].join("\n");
}
