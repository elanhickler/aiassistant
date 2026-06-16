import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

function stripJsonc(text) {
  let output = "";
  let inString = false;
  let escaped = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (inLineComment) {
      if (char === "\n") {
        inLineComment = false;
        output += char;
      }
      continue;
    }
    if (inBlockComment) {
      if (char === "*" && next === "/") {
        index += 1;
        inBlockComment = false;
      } else {
        output += char === "\n" ? "\n" : " ";
      }
      continue;
    }
    if (inString) {
      output += char;
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === "\"") inString = false;
      continue;
    }
    if (char === "\"") {
      inString = true;
      output += char;
      continue;
    }
    if (char === "/" && next === "/") {
      index += 1;
      inLineComment = true;
      continue;
    }
    if (char === "/" && next === "*") {
      index += 1;
      inBlockComment = true;
      continue;
    }
    output += char;
  }
  return output;
}

async function loadJsonc(filePath) {
  return JSON.parse(stripJsonc(await readFile(filePath, "utf8")));
}

function mergeSettings(globalSettings, agentSettings) {
  const merged = { ...globalSettings };
  for (const [key, value] of Object.entries(agentSettings || {})) {
    const existingValue = merged[key];
    if (
      value &&
      existingValue &&
      typeof value === "object" &&
      typeof existingValue === "object" &&
      !Array.isArray(value) &&
      !Array.isArray(existingValue)
    ) {
      merged[key] = mergeSettings(existingValue, value);
    } else {
      merged[key] = value;
    }
  }
  return merged;
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
}

function safeAgentName(agentName) {
  const name = String(agentName || "Stardust").trim();
  if (!/^[A-Za-z0-9_-]+$/.test(name)) {
    throw new Error(`Invalid agent name: ${agentName}`);
  }
  return name;
}

function safeRelativePath(agentFolder, relativePath, settingName) {
  const root = path.resolve(agentFolder);
  const resolved = path.resolve(agentFolder, String(relativePath || "").replace(/^[/\\]+/, ""));
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`${settingName} must stay inside the agent folder.`);
  }
  return resolved;
}

function parseJsonl(text, label) {
  const entries = [];
  for (const [index, line] of String(text || "").split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line));
    } catch (error) {
      throw new Error(`${label} line ${index + 1} is not valid JSONL: ${error.message}`);
    }
  }
  return entries;
}

function stableHash(value) {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function entryToSource(entry, index) {
  return [
    `index: ${index}`,
    `timestamp: ${entry.timestamp || ""}`,
    `role: ${entry.role || ""}`,
    `username: ${entry.username || ""}`,
    `user_id: ${entry.user_id || ""}`,
    `channel_id: ${entry.channel_id || ""}`,
    "content:",
    entry.content || "",
  ].join("\n");
}

function chunkEntries(entries, size) {
  const chunks = [];
  for (let index = 0; index < entries.length; index += size) {
    chunks.push({
      start: index,
      end: Math.min(entries.length - 1, index + size - 1),
      entries: entries.slice(index, index + size),
    });
  }
  return chunks;
}

function jsonl(records) {
  return records.length ? `${records.map((record) => JSON.stringify(record)).join("\n")}\n` : "";
}

const layerNames = [
  "Raw Memory",
  "Scene Impressions",
  "Story Summaries",
  "Emotional Arcs",
  "Durable Truths",
];

function layerName(layer) {
  return layerNames[layer] || `Layer ${layer}`;
}

function limitText(value, maxLength = 900) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3).trim()}...`;
}

function primaryMemoryText(record) {
  return record.compressed || record.summary || record.content || record.reality || record.fantasy || record.entry?.content || "";
}

function averageConfidence(records) {
  const values = records
    .map((record) => Number(record.confidence))
    .filter((value) => Number.isFinite(value));
  if (!values.length) return 0.5;
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2));
}

function clampConfidence(value, fallback = 0.5) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(1, Number(number.toFixed(2))));
}

async function readOptionalJsonl(filePath) {
  return parseJsonl(await readFile(filePath, "utf8").catch((error) => {
    if (error.code === "ENOENT") return "";
    throw error;
  }), filePath);
}

async function inspectMemoryLayers({ agentName, sourcePath, outputFolder, entries, compressionRatio, maxLayers }) {
  console.log(`Memory Layers inspection for ${agentName}`);
  console.log(`Source: ${sourcePath}`);
  console.log(`Output folder: ${outputFolder}`);
  console.log(`Downscale ratio: ${compressionRatio}`);
  console.log(`Max layers: ${maxLayers}`);
  console.log(`Source layer-0 entries: ${entries.length}`);
  console.log(`A manual run would create ${chunkEntries(entries, compressionRatio).length} layer-1 scene interpretations.`);

  for (let layer = 0; layer < maxLayers; layer += 1) {
    const layerPath = path.join(outputFolder, `layer-${layer}.jsonl`);
    const layerEntries = await readOptionalJsonl(layerPath);
    const completeGroups = Math.floor(layerEntries.length / compressionRatio);
    const remainder = layerEntries.length % compressionRatio;
    console.log([
      `Existing layer-${layer}: ${layerEntries.length} entries`,
      `complete next-layer groups: ${completeGroups}`,
      `remainder: ${remainder}`,
    ].join("; "));
    for (const [index, record] of layerEntries.slice(0, 2).entries()) {
      console.log(`  sample ${index + 1} kind: ${record.kind || record.type || "unknown"}`);
      console.log(`  sample ${index + 1} compact node: ${limitText(primaryMemoryText(record), 180) || "(empty)"}`);
      console.log(`  sample ${index + 1} upscale_direction: ${limitText(record.upscale_direction, 180) || "(not recorded)"}`);
      console.log(`  sample ${index + 1} do_not_invent: ${limitText(record.do_not_invent, 180) || "(not recorded)"}`);
    }
  }

  console.log("Inspection only. No files were written and no OpenRouter request was made.");
}

async function summarizeChunk({ settings, openrouterApiKey, agentName, chunk }) {
  const source = chunk.entries
    .map((entry, offset) => entryToSource(entry, chunk.start + offset))
    .join("\n\n---\n\n");
  const messages = [
    {
      role: "system",
      content: [
        `Interpret a cluster of ${agentName} shortmemory entries for experimental Memory Layers.`,
        "This is not a reply and not memorysummary.",
        "Keep durable meaning, emotional movement, user-specific facts, relationship context, unresolved threads, and notable plans.",
        "Do not invent new facts.",
        "Write a semantic downscale memory node that a future text upscaler could safely expand when relevant.",
        "`compressed` is the compact meaning worth preserving.",
        "`upscale_direction` tells a future model how to expand this memory into rich text without overusing it.",
        "`do_not_invent` states what the future model must not assume, fabricate, or treat as confirmed.",
        "`confidence` is 0 to 1 and should be lower when the source is ambiguous.",
        "`source` should identify the shortmemory range or artifact type used.",
        "Return only strict JSON with this shape:",
        "{\"kind\":\"scene_impression\",\"compressed\":\"compact meaning worth preserving\",\"upscale_direction\":\"how to expand this later\",\"do_not_invent\":\"what not to assume\",\"confidence\":0.0,\"source\":\"shortmemory entries x-y\",\"summary\":\"compatibility mirror of the downscaled text\",\"importance\":0,\"topics\":[\"topic\"],\"warnings\":[\"warning\"]}",
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `# Source shortmemory entries ${chunk.start} to ${chunk.end}`,
        source,
      ].join("\n\n"),
    },
  ];

  const response = await fetch(`${settings.openrouter_base_url}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openrouterApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: settings.utility_model || settings.model,
      messages,
      temperature: 0.2,
      max_tokens: 500,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenRouter error ${response.status}: ${await response.text()}`);
  }

  const payload = await response.json();
  const text = payload.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("OpenRouter returned an empty Memory Layers summary.");
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`No JSON object found in Memory Layers summary: ${text}`);
  return JSON.parse(match[0]);
}

function buildCompressedLayers({ previousRecords, startLayer, maxLayers, compressionRatio, createdAt }) {
  const layers = new Map();
  let currentRecords = previousRecords;

  for (let layer = startLayer; layer < maxLayers; layer += 1) {
    const chunks = chunkEntries(currentRecords, compressionRatio);
    const records = chunks.map((chunk, chunkIndex) => {
      const sourceIds = chunk.entries.map((record) => record.id).filter(Boolean);
      const summaryParts = chunk.entries
        .map(primaryMemoryText)
        .filter(Boolean);
      const doNotInventParts = chunk.entries.map((record) => record.do_not_invent || "").filter(Boolean);
      const topics = [...new Set(chunk.entries.flatMap((record) => Array.isArray(record.topics) ? record.topics : []))].slice(0, 12);
      const importanceValues = chunk.entries
        .map((record) => Number(record.importance))
        .filter((value) => Number.isFinite(value));
      const importance = importanceValues.length
        ? Number((importanceValues.reduce((sum, value) => sum + value, 0) / importanceValues.length).toFixed(2))
        : 0;

      return {
        id: `layer-${layer}-${String(chunkIndex).padStart(6, "0")}-${stableHash(sourceIds.join("|") || `${layer}:${chunkIndex}`)}`,
        kind: "semantic_downscale",
        layer,
        layer_name: layerName(layer),
        created_at: createdAt,
        source_layer: layer - 1,
        source_ids: sourceIds,
        source_count: sourceIds.length,
        source: `layer-${layer - 1} memory nodes ${chunk.start}-${chunk.end}`,
        compressed: limitText(summaryParts.join(" ")),
        upscale_direction: limitText(`Use this ${layerName(layer).toLowerCase()} only when it helps continuity, emotional interpretation, or user-requested recall. Expand it as context, not as exact dialogue.`),
        do_not_invent: limitText(doNotInventParts.join(" ") || "Do not invent exact dialogue, events, consent, emotions, or facts beyond the source memory nodes."),
        confidence: averageConfidence(chunk.entries),
        summary: limitText(summaryParts.join(" ")),
        importance,
        topics,
      };
    });

    layers.set(layer, records);
    currentRecords = records;
  }

  return layers;
}

async function ensureMemoryLayersReadme(outputFolder) {
  const readmePath = path.join(outputFolder, "README.md");
  const text = [
    "# Memory Layers",
    "",
    "Experimental generated Memory Layers for this agent.",
    "",
    "Memory Layers are autogenerated. They do not affect replies while `memory_layers.use_in_context` is false.",
    "",
    "Current memory nodes prefer semantic downscale / text upscale fields:",
    "",
    "* `compressed` : the technical field that stores downscaled semantic memory.",
    "* `upscale_direction` : guidance for future text upscale.",
    "* `do_not_invent` : boundaries that protect against false continuity.",
    "* `confidence` : how strongly to trust the memory.",
    "* `source` : debugging reference for where the memory came from.",
    "",
    "`summary` is kept as a compatibility mirror for older readers.",
    "",
    "* `layer-0.jsonl` : raw/highest-detail memory derived from shortmemory.",
    "* `layer-1.jsonl` : scene-level interpretation. Can read thoughts later.",
    "* `layer-2.jsonl` : story/session summaries. Can read stories later.",
    "* `layer-3.jsonl` : emotional arcs. Can read journals and dreams later.",
    "* `layer-4.jsonl` : durable truths. Can read memorysummary later.",
    "* `build-log.jsonl` : downscale run records.",
    "",
    "Consciousness folders:",
    "",
    "* `soul/consciousness/thoughts/` : temporary private thoughts; thoughts feed stories.",
    "* `soul/consciousness/journals/` : durable emotional reflections; journals feed dreams.",
    "",
    "Current builds do not delete thoughts or journals.",
    "",
    "These files do not affect replies unless future settings explicitly enable context use.",
    "",
  ].join("\n");
  await writeFile(readmePath, text, "utf8");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const agentName = safeAgentName(args.agent || process.env.AGENT_NAME || "Stardust");
  const repoRoot = path.resolve("..");
  const agentFolder = path.join(repoRoot, "agents", agentName);
  const globalSettings = await loadJsonc(path.join(repoRoot, "settings.jsonc"));
  const agentSettings = await loadJsonc(path.join(agentFolder, "settings.jsonc")).catch((error) => {
    if (error.code === "ENOENT") return {};
    throw error;
  });
  const settings = mergeSettings(globalSettings, agentSettings);
  const layerSettings = settings.memory_layers || {};
  const compressionRatio = Number(layerSettings.compression_ratio || 8);
  if (!Number.isInteger(compressionRatio) || compressionRatio < 2) {
    throw new Error("memory_layers.compression_ratio must be a whole number 2 or higher.");
  }
  const maxLayers = Number(layerSettings.max_layers || 5);
  if (!Number.isInteger(maxLayers) || maxLayers < 1) {
    throw new Error("memory_layers.max_layers must be a whole number 1 or higher.");
  }

  const sourcePath = safeRelativePath(
    agentFolder,
    layerSettings.layer_0_source,
    "memory_layers.layer_0_source",
  );
  const outputFolder = safeRelativePath(
    agentFolder,
    layerSettings.folder,
    "memory_layers.folder",
  );

  const entries = parseJsonl(await readFile(sourcePath, "utf8").catch((error) => {
    if (error.code === "ENOENT") return "";
    throw error;
  }), path.relative(agentFolder, sourcePath));

  if (args.inspect || args["dry-run"]) {
    await inspectMemoryLayers({ agentName, sourcePath, outputFolder, entries, compressionRatio, maxLayers });
    return;
  }

  if (!layerSettings.enabled && !args.force) {
    console.log("Memory Layers are disabled: memory_layers.enabled is false.");
    console.log("No files were written and no OpenRouter request was made.");
    console.log("Use npm.cmd run layerinspect for inspection, or run this script with -- --force for a manual experimental build.");
    return;
  }

  const openrouterApiKey = (await readFile(path.join(agentFolder, "secrets", "openrouter_api_key.txt"), "utf8")).trim();
  if (!openrouterApiKey) throw new Error(`OpenRouter API key is blank for ${agentName}.`);

  await mkdir(outputFolder, { recursive: true });
  await ensureMemoryLayersReadme(outputFolder);

  const createdAt = new Date().toISOString();
  const layer0Records = entries.map((entry, index) => ({
    id: `layer-0-${String(index).padStart(6, "0")}-${stableHash(JSON.stringify(entry))}`,
    kind: "raw_shortmemory",
    layer: 0,
    layer_name: layerName(0),
    created_at: createdAt,
    source_file: path.relative(agentFolder, sourcePath).replace(/\\/g, "/"),
    source_index: index,
    source_count: 1,
    source: `${path.relative(agentFolder, sourcePath).replace(/\\/g, "/")}#${index}`,
    compressed: limitText(entry.content || ""),
    upscale_direction: "Use as exact recent conversational context when relevant. Preserve speaker, timing, and wording carefully.",
    do_not_invent: "Do not infer unstated facts beyond this raw shortmemory entry.",
    confidence: 1,
    summary: limitText(entry.content || ""),
    importance: 0,
    entry,
  }));
  await writeFile(path.join(outputFolder, "layer-0.jsonl"), jsonl(layer0Records), "utf8");

  const chunks = chunkEntries(entries, compressionRatio);
  const layer1Records = [];
  for (const [chunkIndex, chunk] of chunks.entries()) {
    console.log(`Summarizing ${agentName} Memory Layers chunk ${chunkIndex + 1}/${chunks.length}: entries ${chunk.start}-${chunk.end}`);
    const summary = await summarizeChunk({ settings, openrouterApiKey, agentName, chunk });
    const compressed = String(summary.compressed || summary.summary || "").trim();
    const source = String(summary.source || `shortmemory entries ${chunk.start}-${chunk.end}`).trim();
    const doNotInvent = String(summary.do_not_invent || "Do not invent exact dialogue, events, consent, emotions, or facts beyond the source shortmemory entries.").trim();
    layer1Records.push({
      id: `layer-1-${String(chunkIndex).padStart(6, "0")}-${stableHash(`${chunk.start}:${chunk.end}:${JSON.stringify(chunk.entries)}`)}`,
      kind: String(summary.kind || "scene_impression").trim(),
      layer: 1,
      layer_name: layerName(1),
      created_at: new Date().toISOString(),
      source_layer: 0,
      source_start: chunk.start,
      source_end: chunk.end,
      source_ids: layer0Records.slice(chunk.start, chunk.end + 1).map((record) => record.id),
      source_count: chunk.entries.length,
      source,
      compressed,
      upscale_direction: String(summary.upscale_direction || "Use this scene impression when it helps continuity, emotional interpretation, or user-requested recall. Expand it cautiously from the source.").trim(),
      do_not_invent: doNotInvent,
      confidence: clampConfidence(summary.confidence, 0.65),
      summary: compressed,
      importance: Number(summary.importance || 0),
      topics: Array.isArray(summary.topics) ? summary.topics.map(String) : [],
      warnings: Array.isArray(summary.warnings) ? summary.warnings.map(String) : [],
    });
  }
  await writeFile(path.join(outputFolder, "layer-1.jsonl"), jsonl(layer1Records), "utf8");

  const higherLayers = buildCompressedLayers({
    previousRecords: layer1Records,
    startLayer: 2,
    maxLayers,
    compressionRatio,
    createdAt,
  });
  for (let layer = 2; layer < maxLayers; layer += 1) {
    await writeFile(path.join(outputFolder, `layer-${layer}.jsonl`), jsonl(higherLayers.get(layer) || []), "utf8");
  }

  const buildLogRecord = {
    timestamp: new Date().toISOString(),
    agent: agentName,
    source_file: path.relative(agentFolder, sourcePath).replace(/\\/g, "/"),
    folder: path.relative(agentFolder, outputFolder).replace(/\\/g, "/"),
    compression_ratio: compressionRatio,
    max_layers: maxLayers,
    layer_0_entries: layer0Records.length,
    layer_1_entries: layer1Records.length,
    higher_layer_entries: Object.fromEntries([...higherLayers.entries()].map(([layer, records]) => [`layer_${layer}`, records.length])),
    use_in_context: Boolean(layerSettings.use_in_context),
  };
  await appendFile(path.join(outputFolder, "build-log.jsonl"), jsonl([buildLogRecord]), "utf8");

  console.log(`Memory Layers wrote ${layer0Records.length} layer-0 entries and ${layer1Records.length} layer-1 summaries for ${agentName}.`);
  console.log(`Output folder: ${outputFolder}`);
  if (!layerSettings.use_in_context) {
    console.log("Note: memory_layers.use_in_context is false. Reply context remains unchanged.");
  }
}

main().catch((error) => {
  console.error(`Memory Layers failed: ${error.message}`);
  process.exitCode = 1;
});
