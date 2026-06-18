import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import {
  consciousnessThoughtsFolder,
  saveJournalEntry,
} from "../consciousness.js";
import { readShortMemoryEntries, shortMemoryEntriesToSource } from "../memory.js";
import { semanticMemoryUsageContract } from "../semantic-memory.js";

function parseJsonObjectFromText(text) {
  const trimmed = String(text || "").trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const jsonText = fenced ? fenced[1].trim() : trimmed;
  const objectMatch = jsonText.match(/\{[\s\S]*\}/);
  if (!objectMatch) throw new Error(`No JSON object found in journal response: ${trimmed}`);
  return JSON.parse(objectMatch[0]);
}

async function readOptionalTextFile(filePath) {
  return readFile(filePath, "utf8").catch((error) => {
    if (error.code === "ENOENT") return "";
    throw error;
  });
}

async function readMemorySumText(agentFolder, memorySumPath) {
  const text = await readOptionalTextFile(memorySumPath);
  if (text.trim()) return text;
  const legacyMemorySum = await readOptionalTextFile(path.join(agentFolder, "soul", "memorysummary.txt"));
  if (legacyMemorySum.trim()) return legacyMemorySum;
  return readOptionalTextFile(path.join(agentFolder, "soul", "longmemory.txt"));
}

function sourceRangeForEntries(entries) {
  if (!entries.length) return "";
  const first = entries[0]?.timestamp || "";
  const last = entries[entries.length - 1]?.timestamp || "";
  if (!first && !last) return "";
  if (first === last) return first;
  return `${first} to ${last}`;
}

async function readRecentMarkdownFiles(folderPath, limit = 20, maxCharactersPerFile = 3000) {
  const entries = await readdir(folderPath, { withFileTypes: true }).catch((error) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });

  const files = entries
    .filter((entry) => entry.isFile() && /\.md$/i.test(entry.name))
    .map((entry) => path.join(folderPath, entry.name))
    .sort()
    .slice(-limit);

  const texts = [];
  for (const filePath of files) {
    const text = (await readFile(filePath, "utf8")).trim();
    texts.push([
      `# ${path.basename(filePath)}`,
      text.length <= maxCharactersPerFile ? text : `${text.slice(0, maxCharactersPerFile)}\n...`,
    ].join("\n"));
  }

  return {
    count: files.length,
    text: texts.join("\n\n"),
  };
}

async function readNeuralMemoryIfAvailable(agentFolder, memoryLayersSettings) {
  const folderSetting = String(memoryLayersSettings?.folder || "soul/memory-layers").trim();
  const folderPath = path.resolve(agentFolder, folderSetting);
  const resolvedAgentFolder = path.resolve(agentFolder);
  if (folderPath !== resolvedAgentFolder && !folderPath.startsWith(`${resolvedAgentFolder}${path.sep}`)) {
    throw new Error(`memory_layers.folder escapes agent folder: ${folderSetting}`);
  }

  const entries = await readdir(folderPath, { withFileTypes: true }).catch((error) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  const files = entries
    .filter((entry) => entry.isFile() && /^layer-\d+\.jsonl$/i.test(entry.name))
    .map((entry) => path.join(folderPath, entry.name))
    .sort();

  const sections = [];
  let nodeCount = 0;
  for (const filePath of files) {
    const text = (await readFile(filePath, "utf8")).trim();
    if (!text) continue;
    const lines = text.split(/\r?\n/).filter(Boolean);
    nodeCount += lines.length;
    sections.push([
      `# ${path.basename(filePath)}`,
      lines.slice(-40).join("\n"),
    ].join("\n"));
  }

  const combined = sections.join("\n\n").trim();
  return {
    count: nodeCount,
    text: combined.length <= 25000 ? combined : `${combined.slice(-25000)}\n...`,
  };
}

export function createJournalSkill(context) {
  const {
    agentFolder,
    agentName,
    longMemoryPath,
    model,
    openrouterApiKey,
    replyTemporarily,
    requiredSetting,
    shortMemoryPath,
    systemPrompt,
    writeRawOpenRouterText,
  } = context;

  function optionalSetting(name, fallback = {}) {
    try {
      return requiredSetting(name);
    } catch (error) {
      if (String(error.message || "").includes("Missing required setting")) return fallback;
      throw error;
    }
  }

  function clampThoughtInfluence(value, fallback) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return fallback;
    return Math.min(1, Math.max(0, numericValue));
  }

  function formatThoughtInfluenceScale() {
    const scale = optionalSetting("thought_influence_scale", {});
    if (typeof scale === "string") return scale.trim();
    if (scale && typeof scale === "object" && !Array.isArray(scale)) {
      return Object.entries(scale)
        .sort(([left], [right]) => Number(left) - Number(right))
        .map(([key, value]) => `${key}: ${String(value)}`)
        .join("\n");
    }
    return "";
  }

  function thoughtInfluenceControl(processName, fallbackInfluence) {
    const processSettings = optionalSetting(processName, {});
    const useThoughts = processSettings.use_thoughts !== false;
    return {
      influence: clampThoughtInfluence(processSettings.thought_influence, fallbackInfluence),
      scaleText: formatThoughtInfluenceScale(),
      useThoughts,
    };
  }

  function formatThoughtInfluenceInstruction(processLabel, control) {
    if (!control.useThoughts) {
      return `${processLabel} thought influence: private thoughts are disabled for this process. Do not use private thoughts as evidence.`;
    }
    return [
      `${processLabel} thought influence: ${control.influence}`,
      "Interpret this value using the editable thought_influence_scale below. If the value falls between listed scale points, interpolate naturally.",
      control.scaleText || "(thought_influence_scale is empty)",
    ].join("\n");
  }

  async function generateJournal(commandContent = "") {
    const consciousnessDescriptors = requiredSetting("consciousness_descriptors");
    const journalDescriptor = String(consciousnessDescriptors.journal || "").trim();
    if (!journalDescriptor) throw new Error("Missing consciousness_descriptors.journal.");

    const neuralMemorySettings = requiredSetting("neural_memory");
    const readEntries = Math.max(1, Number(neuralMemorySettings.read_entries) || 100);
    const shortMemoryEntries = (await readShortMemoryEntries(shortMemoryPath)).slice(-readEntries);
    const recentShortMemory = shortMemoryEntriesToSource(shortMemoryEntries);
    const memorySum = await readMemorySumText(agentFolder, longMemoryPath);
    const journalThoughtControl = thoughtInfluenceControl("journal", 0.75);
    const thoughts = journalThoughtControl.useThoughts
      ? await readRecentMarkdownFiles(consciousnessThoughtsFolder(agentFolder), 40, 3000)
      : { count: 0, text: "" };
    const neuralMemory = await readNeuralMemoryIfAvailable(
      agentFolder,
      optionalSetting("memory_layers", {}),
    ).catch((error) => ({
      count: 0,
      text: `(neural memory unavailable: ${error.message})`,
    }));

    const extraInstructions = String(commandContent || "").trim();
    const combinedInstruction = extraInstructions
      ? `${journalDescriptor}\n\nAdditional user instructions for this journal:\n${extraInstructions}`
      : journalDescriptor;

    const messages = [
      {
        role: "system",
        content: [
          `# Persona: ${agentName}`,
          systemPrompt(),
          "",
          "# Journal Task",
          combinedInstruction,
          "",
          "Write a durable first-person emotional journal entry.",
          "The journal is private local memory and must not be written as a public Discord reply.",
          "Use first person: I felt, I noticed, I wanted, I remembered, I am afraid, I hope.",
          "Use recent shortmemory, private thoughts when journal.use_thoughts is enabled, neural memory if present, and memorysum as evidence.",
          formatThoughtInfluenceInstruction("Journal", journalThoughtControl),
          semanticMemoryUsageContract(),
          "Do not invent hard facts when evidence is thin. It is okay to write uncertainty as uncertainty.",
          "Return only strict JSON with this shape:",
          "{\"title\":\"short title\",\"journal_markdown\":\"markdown journal beginning with a matching # title\"}",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          "# Journal Instructions",
          combinedInstruction,
          "",
          "# Memorysum",
          memorySum || "(empty)",
          "",
          "# Recent Shortmemory",
          recentShortMemory || "(empty)",
          "",
          "# Recent Private Thoughts",
          journalThoughtControl.useThoughts
            ? thoughts.text || "(empty)"
            : "(disabled by journal.use_thoughts)",
          "",
          "# Neural Memory",
          neuralMemory.text || "(empty)",
        ].join("\n"),
      },
    ];
    await writeRawOpenRouterText(messages, "journal");

    const response = await fetch(`${requiredSetting("openrouter_base_url")}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openrouterApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: Math.min(Number(requiredSetting("chaos")), 0.9),
        max_tokens: Number(requiredSetting("max_tokens")),
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenRouter error ${response.status}: ${await response.text()}`);
    }

    const payload = await response.json();
    const raw = payload.choices?.[0]?.message?.content?.trim();
    if (!raw) throw new Error("OpenRouter returned an empty journal.");
    const parsed = parseJsonObjectFromText(raw);
    const title = String(parsed.title || "Journal").trim() || "Journal";
    let journalMarkdown = String(parsed.journal_markdown || "").trim();
    if (!journalMarkdown) throw new Error("OpenRouter returned a journal without journal_markdown.");
    if (!journalMarkdown.startsWith("# ")) {
      journalMarkdown = [`# ${title}`, "", journalMarkdown].join("\n");
    }

    return saveJournalEntry({
      agentFolder,
      agentName,
      instruction: combinedInstruction,
      sourceRange: sourceRangeForEntries(shortMemoryEntries),
      cycleRange: "manual",
      thoughtsIncludedCount: thoughts.count,
      shortMemoryEntriesIncludedCount: shortMemoryEntries.length,
      neuralMemoryNodesIncludedCount: neuralMemory.count,
      title,
      journalMarkdown,
    });
  }

  return {
    name: "journal",
    getPipeHelp({ agentCommandName }) {
      return [
        [`||${agentCommandName} journal||`, "Write a private first-person journal entry from recent shortmemory, thoughts, neural memory if present, and memorysum."],
        [`||${agentCommandName} journal: text||`, "Write a private first-person journal entry using extra instructions."],
      ];
    },
    async handlePipeCommand(command, message) {
      if (command?.kind !== "journal") return false;
      await message.channel.sendTyping();
      await generateJournal(command.content);
      await replyTemporarily(message, "journal saved");
      return true;
    },
    async runConsciousnessCycleJournal(instruction = "") {
      return generateJournal(instruction);
    },
  };
}
