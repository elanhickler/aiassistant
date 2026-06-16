import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

export function semanticMemoryUsageContract() {
  return [
    "# Semantic Memory Text-Upscaler Contract",
    "`compressed` is the technical field that stores downscaled semantic memory.",
    "`upscale_direction` explains how to expand the downscaled meaning when relevant.",
    "`do_not_invent` lists details that must not be assumed or fabricated.",
    "`confidence` says how strongly to trust the memory; treat low-confidence nodes softly.",
    "`source` says where the memory came from for debugging.",
    "Use downscaled memory as guidance, not an exact transcript.",
    "Expand it only when relevant to the current request, scene, dream, journal, story, or summary.",
    "Obey `do_not_invent` over `upscale_direction`.",
    "Prefer recent raw shortmemory when it conflicts with downscaled semantic memory.",
    "Do not reveal internal memory field names in normal roleplay replies.",
  ].join("\n");
}

export function semanticMemoryMode(settings) {
  const mode = String(settings?.neural_memory?.mode || "off").toLowerCase();
  return ["off", "debug", "on"].includes(mode) ? mode : "off";
}

export function semanticMemoryEnabledForReplies(settings) {
  const mode = semanticMemoryMode(settings);
  return mode === "on";
}

export function semanticMemoryDebugEnabled(settings) {
  return semanticMemoryMode(settings) === "debug";
}

export function containedAgentPath(agentFolder, relativePath) {
  const root = path.resolve(agentFolder);
  const resolved = path.resolve(agentFolder, String(relativePath || "").replace(/^[/\\]+/, ""));
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Path escapes agent folder: ${relativePath}`);
  }
  return resolved;
}

export async function readRecentSemanticMemoryFiles(agentFolder, memoryLayersSettings = {}, {
  limit = 5,
  maxCharactersPerFile = 9000,
} = {}) {
  const folderSetting = String(memoryLayersSettings.folder || "soul/memory-layers");
  const folderPath = containedAgentPath(agentFolder, folderSetting);
  const entries = await readdir(folderPath, { withFileTypes: true }).catch((error) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });

  const files = entries
    .filter((entry) => entry.isFile() && /^layer-\d+\.jsonl$/i.test(entry.name))
    .map((entry) => path.join(folderPath, entry.name))
    .sort()
    .slice(-limit);

  const sourceFiles = [];
  for (const filePath of files) {
    const text = (await readFile(filePath, "utf8")).trim();
    sourceFiles.push({
      relativeFilePath: path.relative(agentFolder, filePath).replace(/\\/g, "/"),
      text: text.length <= maxCharactersPerFile ? text : `${text.slice(0, maxCharactersPerFile)}\n...`,
    });
  }
  return sourceFiles;
}

export function formatSemanticMemoryFilesForPrompt(sourceFiles, emptyText = "(empty)") {
  if (!sourceFiles?.length) return emptyText;
  return [
    semanticMemoryUsageContract(),
    "",
    ...sourceFiles.map((sourceFile) => [
      `# ${sourceFile.relativeFilePath}`,
      sourceFile.text,
    ].join("\n")),
  ].join("\n\n");
}

function parseJsonlRecords(text) {
  const records = [];
  for (const [index, line] of String(text || "").split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    try {
      records.push({ index, value: JSON.parse(line) });
    } catch {
      records.push({
        index,
        parseError: true,
        value: {
          kind: "unparsed_memory_node",
          compressed: line.slice(0, 500),
          confidence: 0,
          do_not_invent: "Could not parse this memory node as JSONL.",
        },
      });
    }
  }
  return records;
}

function words(text) {
  return new Set(String(text || "")
    .toLowerCase()
    .match(/[a-z0-9_]{4,}/g) || []);
}

function overlapWords(leftText, rightText) {
  const left = words(leftText);
  const right = words(rightText);
  return [...left].filter((word) => right.has(word)).slice(0, 12);
}

function nodeText(value) {
  return [
    value.compressed,
    value.summary,
    value.content,
    value.reality,
    value.fantasy,
    Array.isArray(value.topics) ? value.topics.join(" ") : "",
  ].filter(Boolean).join(" ");
}

function limitText(value, maxLength = 900) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3).trim()}...`;
}

function conflictNote(value, recentShortMemory) {
  const doNotInvent = String(value.do_not_invent || "").trim();
  if (!doNotInvent) return "No do_not_invent boundary recorded; review manually against recent raw shortmemory.";
  const overlaps = overlapWords(doNotInvent, recentShortMemory);
  if (!overlaps.length) return "No keyword conflict detected against recent raw shortmemory.";
  return `Potential conflict boundary to review: do_not_invent overlaps recent raw shortmemory on ${overlaps.join(", ")}. Prefer recent raw shortmemory if meanings disagree.`;
}

function flattenSemanticMemoryRecords(sourceFiles) {
  return sourceFiles.flatMap((sourceFile) => parseJsonlRecords(sourceFile.text).map((record) => ({
    file: sourceFile.relativeFilePath,
    index: record.index,
    value: record.value,
    parseError: record.parseError,
  })));
}

function selectDebugNodes(sourceFiles, currentUserContent, recentShortMemory) {
  const queryText = [currentUserContent, recentShortMemory].filter(Boolean).join("\n");
  const records = flattenSemanticMemoryRecords(sourceFiles);
  return records
    .map((record) => {
      const text = nodeText(record.value);
      const overlaps = overlapWords(text, queryText);
      const confidence = Number(record.value.confidence);
      const confidenceScore = Number.isFinite(confidence) ? confidence : 0.5;
      const score = overlaps.length * 2 + confidenceScore;
      const why = overlaps.length
        ? `keyword overlap with current/recent context: ${overlaps.join(", ")}`
        : "recent loaded memory layer node; no keyword overlap found";
      return { ...record, score, why, overlaps };
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, 12);
}

function formatDebugNode(node, recentShortMemory) {
  const value = node.value || {};
  return [
    `## ${value.id || `${node.file}#${node.index}`}`,
    "",
    `file: ${node.file}`,
    `index: ${node.index}`,
    `kind: ${value.kind || value.type || "unknown"}`,
    `selected_because: ${node.why}`,
    `confidence: ${value.confidence ?? "unknown"}`,
    `source: ${value.source || value.source_file || value.source_ids?.length || "not recorded"}`,
    "",
    "compressed/downscaled meaning:",
    limitText(value.compressed || value.summary || value.content || value.reality || "(empty)", 1200),
    "",
    "upscale_direction:",
    limitText(value.upscale_direction || "(not recorded)", 1200),
    "",
    "do_not_invent:",
    limitText(value.do_not_invent || "(not recorded)", 1200),
    "",
    "conflicts_with_recent_raw_shortmemory:",
    conflictNote(value, recentShortMemory),
  ].join("\n");
}

export async function writeSemanticMemoryDebugReport({
  agentFolder,
  agentName,
  currentUserContent = "",
  recentShortMemory = "",
  semanticMemoryFiles = [],
}) {
  // Debug mode is for inspecting the text-upscaler pipeline before trusting it in real replies.
  // This report is written locally and is not posted to Discord chat.
  const outputFolder = path.join(agentFolder, "regenerated", "neural-memory-debug");
  await mkdir(outputFolder, { recursive: true });

  const selectedNodes = selectDebugNodes(semanticMemoryFiles, currentUserContent, recentShortMemory);
  const timestamp = new Date().toISOString();
  const text = [
    "# Neural Memory Debug Report",
    "",
    `agent: ${agentName}`,
    `created_at: ${timestamp}`,
    "mode: debug",
    "",
    "Debug mode reads semantic memory and explains what it would contribute, but does not add these nodes to normal reply context.",
    "",
    semanticMemoryUsageContract(),
    "",
    "# Current User Content",
    currentUserContent || "(empty)",
    "",
    "# Recent Raw Shortmemory Used For Conflict Checks",
    limitText(recentShortMemory || "(empty)", 3000),
    "",
    "# Selected Memory Nodes",
    selectedNodes.length
      ? selectedNodes.map((node) => formatDebugNode(node, recentShortMemory)).join("\n\n")
      : "(no semantic memory nodes available)",
    "",
  ].join("\n");

  const safeTimestamp = timestamp.replace(/[:.]/g, "-");
  const reportPath = path.join(outputFolder, `${safeTimestamp}-report.md`);
  const latestPath = path.join(outputFolder, "latest-report.md");
  await writeFile(reportPath, text, "utf8");
  await writeFile(latestPath, text, "utf8");
  return { reportPath, latestPath, selectedCount: selectedNodes.length };
}
