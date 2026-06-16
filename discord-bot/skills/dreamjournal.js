import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { readShortMemoryEntries, shortMemoryEntriesToSource } from "../memory.js";
import { semanticMemoryUsageContract } from "../semantic-memory.js";

function timestampForFileName() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function safeFileName(name) {
  const safe = String(name || "dream-journal")
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return safe || "dream-journal";
}

function limitText(text, maxCharacters) {
  const cleanText = String(text || "").trim();
  if (cleanText.length <= maxCharacters) return cleanText;
  return `${cleanText.slice(0, maxCharacters)}\n...`;
}

function positiveInteger(value, fallback) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return fallback;
  return Math.max(0, Math.floor(numericValue));
}

function parseJsonObjectFromText(text) {
  const trimmed = String(text || "").trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("Model did not return a JSON object.");
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

function markdownSection(title, text) {
  return [`## ${title}`, "", String(text || "(none)").trim() || "(none)"].join("\n");
}

async function readRecentTextFiles(folderPath, filePattern, limit, maxCharactersPerFile, emptyOk = true) {
  if (limit <= 0) return [];
  const entries = await readdir(folderPath, { withFileTypes: true }).catch((error) => {
    if (error.code === "ENOENT" && emptyOk) return [];
    throw error;
  });
  const files = entries
    .filter((entry) => entry.isFile() && filePattern.test(entry.name))
    .map((entry) => path.join(folderPath, entry.name))
    .sort()
    .slice(-limit);

  const sourceFiles = [];
  for (const filePath of files) {
    sourceFiles.push({
      fileName: path.basename(filePath),
      relativeFilePath: filePath,
      text: limitText(await readFile(filePath, "utf8"), maxCharactersPerFile),
    });
  }
  return sourceFiles;
}

async function readRecentJsonlNodes(folderPath, filePattern, nodeLimit, maxCharactersPerNode, emptyOk = true) {
  if (nodeLimit <= 0) return [];
  const files = await readRecentTextFiles(folderPath, filePattern, 20, 120000, emptyOk);
  const nodes = [];
  for (const sourceFile of files) {
    for (const line of sourceFile.text.split(/\r?\n/).filter(Boolean)) {
      nodes.push({
        fileName: sourceFile.fileName,
        relativeFilePath: sourceFile.relativeFilePath,
        text: limitText(line, maxCharactersPerNode),
      });
    }
  }
  return nodes.slice(-nodeLimit);
}

function formatSourceFiles(sourceFiles, emptyText = "(empty)") {
  if (!sourceFiles.length) return emptyText;
  return sourceFiles
    .map((sourceFile) => [`# ${sourceFile.fileName}`, sourceFile.text].join("\n"))
    .join("\n\n");
}

function formatOriginSummary(originSummary) {
  return originSummary.trim()
    ? ["# origin_summary.md", originSummary.trim()].join("\n")
    : "(empty)";
}

async function readDurableMemoryEntries(agentFolder, limit) {
  const memoryEntries = await readRecentTextFiles(
    path.join(agentFolder, "soul/memory"),
    /\.(md|txt)$/i,
    limit,
    5000,
  );
  if (memoryEntries.length >= limit) return memoryEntries.slice(-limit);
  const legacySummaryEntries = await readRecentTextFiles(
    path.join(agentFolder, "soul/summaries"),
    /\.(md|txt)$/i,
    limit - memoryEntries.length,
    5000,
  );
  return [...legacySummaryEntries, ...memoryEntries].slice(-limit);
}

export function createDreamJournalSkill(context) {
  const {
    agentFolder,
    agentName,
    conversationHistoryLimit,
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

  async function readOptionalTextFile(filePath) {
    return readFile(filePath, "utf8").catch((error) => {
      if (error.code === "ENOENT") return "";
      throw error;
    });
  }

  async function dreamFileFromSavedDream(savedDream) {
    if (!savedDream?.filePath) return null;
    const text = await readFile(savedDream.filePath, "utf8");
    return {
      fileName: savedDream.fileName || path.basename(savedDream.filePath),
      relativeFilePath: path.relative(agentFolder, savedDream.filePath).replace(/\\/g, "/"),
      text: limitText(text, 12000),
    };
  }

  async function latestDreamFile() {
    const dreamSettings = optionalSetting("dream_settings", {});
    const dreamJournalSettings = optionalSetting("dream_journal", {});
    const readLimits = dreamJournalSettings.read_limits || {};
    const dreamsFolder = path.join(agentFolder, String(dreamSettings.output_folder || "soul/dreams"));
    const dreams = await readRecentTextFiles(
      dreamsFolder,
      /\.(md|txt)$/i,
      Math.max(1, positiveInteger(readLimits.latest_dreams, 1)),
      12000,
      true,
    );
    if (!dreams.length) {
      throw new Error("No dream files found. Create a dream first, then run dreamjournal.");
    }
    return dreams[dreams.length - 1];
  }

  async function readRelevantContext() {
    const dreamSettings = optionalSetting("dream_settings", {});
    const dreamJournalSettings = optionalSetting("dream_journal", {});
    const readLimits = dreamJournalSettings.read_limits || {};
    const memoryLayersSettings = optionalSetting("memory_layers", {});
    const shortMemoryLimit = positiveInteger(readLimits.shortmemory_entries, 100);
    const shortMemoryEntries = (await readShortMemoryEntries(shortMemoryPath)).slice(-shortMemoryLimit);
    const memorySummary = await readOptionalTextFile(longMemoryPath);
    const originSummary = positiveInteger(readLimits.origin_summary_entries, 1) > 0
      ? await readOptionalTextFile(path.join(agentFolder, "soul/origin_summary.md"))
      : "";
    const thoughts = await readRecentTextFiles(
      path.join(agentFolder, String(dreamSettings.thoughts_folder || "soul/consciousness/thoughts")),
      /\.(md|txt)$/i,
      positiveInteger(readLimits.thought_entries, 50),
      3000,
    );
    const journals = await readRecentTextFiles(
      path.join(agentFolder, String(dreamSettings.journals_folder || "soul/consciousness/journals")),
      /\.(md|txt)$/i,
      positiveInteger(readLimits.journal_entries, 7),
      5000,
    );
    const stories = await readRecentTextFiles(
      path.join(agentFolder, "soul/stories"),
      /\.(md|txt)$/i,
      positiveInteger(readLimits.story_entries, 5),
      5000,
    );
    const dreamJournals = await readRecentTextFiles(
      path.join(agentFolder, "soul/consciousness/dream-journals"),
      /\.(md|txt)$/i,
      positiveInteger(readLimits.dream_journal_entries, 3),
      5000,
    );
    const memoryEntries = await readDurableMemoryEntries(
      agentFolder,
      positiveInteger(readLimits.memory_entries, 14),
    );
    const neuralMemory = await readRecentJsonlNodes(
      path.join(agentFolder, String(memoryLayersSettings.folder || "soul/memory-layers")),
      /^layer-\d+\.jsonl$/i,
      positiveInteger(readLimits.neural_memory_nodes, 50),
      5000,
    );
    return {
      dreamJournals,
      journals,
      memoryEntries,
      memorySummary,
      neuralMemory,
      originSummary,
      readLimits,
      shortMemoryEntries,
      stories,
      thoughts,
    };
  }

  async function saveDreamJournal({ instruction, interpretedDream, parsed, contextInfo }) {
    const title = String(parsed.title || "Dream Journal").trim() || "Dream Journal";
    const markdown = [
      `# Dream Journal: ${title.replace(/^Dream Journal:\s*/i, "")}`,
      "",
      markdownSection("Dream Interpreted", parsed.dream_interpreted || interpretedDream.fileName),
      "",
      markdownSection("Meaning", parsed.meaning),
      "",
      markdownSection("Supported By Memory", parsed.supported_by_memory),
      "",
      markdownSection("Speculative Meaning", parsed.speculative_meaning),
      "",
      markdownSection("What This May Affect", parsed.what_this_may_affect),
      "",
      "---",
      `agent: ${agentName}`,
      `created: ${new Date().toISOString()}`,
      `instruction: ${String(instruction || "").replace(/\r?\n/g, " ")}`,
      `dream_file: ${interpretedDream.fileName}`,
      `shortmemory_entries_included_count: ${contextInfo.shortMemoryEntries.length}`,
      `thoughts_included_count: ${contextInfo.thoughts.length}`,
      `journals_included_count: ${contextInfo.journals.length}`,
      `stories_included_count: ${contextInfo.stories.length}`,
      `dream_journals_included_count: ${contextInfo.dreamJournals.length}`,
      `memory_entries_included_count: ${contextInfo.memoryEntries.length}`,
      `neural_memory_files_included_count: ${contextInfo.neuralMemory.length}`,
      "",
    ].join("\n");

    const folder = path.join(agentFolder, "soul/consciousness/dream-journals");
    await mkdir(folder, { recursive: true });
    const fileName = `${timestampForFileName()}-${safeFileName(title)}.md`;
    const filePath = path.join(folder, fileName);
    await writeFile(filePath, markdown, "utf8");
    return { fileName, filePath };
  }

  async function generateDreamJournal(commandContent = "", options = {}) {
    const interpretedDream = await dreamFileFromSavedDream(options.savedDream) || await latestDreamFile();
    const contextInfo = await readRelevantContext();
    const consciousnessDescriptors = optionalSetting("consciousness_descriptors", {});
    const dreamJournalDescriptor = String(consciousnessDescriptors.dreamjournal || "").trim()
      || "Figure out what the meaning of the dream is.";
    const userInstruction = String(commandContent || "").trim();
    const combinedInstruction = userInstruction
      ? `${dreamJournalDescriptor}\n\nAdditional user focus:\n${userInstruction}`
      : dreamJournalDescriptor;

    const messages = [
      {
        role: "system",
        content: [
          `# Persona: ${agentName}`,
          systemPrompt(),
          "",
          "# Dream Journal Task",
          combinedInstruction,
          "",
          "Analyze an existing dream. Do not create a new dream.",
          "Do not treat dream events as literal real events unless supported by other memory.",
          "Separate strongly supported interpretation from speculation.",
          "Prefer first-person reflection if writing as the agent.",
          "Do not invent missing real-world events.",
          "Mention which dream was interpreted if known.",
          "Use bounded memory from all relevant memory lanes.",
          semanticMemoryUsageContract(),
          "Return only strict JSON with this shape:",
          "{\"title\":\"short title\",\"dream_interpreted\":\"brief reference\",\"meaning\":\"main interpretation\",\"supported_by_memory\":\"supporting evidence\",\"speculative_meaning\":\"less certain meaning\",\"what_this_may_affect\":\"future feelings, memory, or continuity\"}",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          "# Dream Journal Instructions",
          combinedInstruction,
          "",
          "# Dream To Interpret",
          `file: ${interpretedDream.fileName}`,
          interpretedDream.text,
          "",
          "# Memorysummary",
          contextInfo.memorySummary || "(empty)",
          "",
          "# Recent Durable Memory Entries",
          formatSourceFiles(contextInfo.memoryEntries),
          "",
          "# Origin Summary",
          formatOriginSummary(contextInfo.originSummary),
          "",
          "# Recent Shortmemory",
          shortMemoryEntriesToSource(contextInfo.shortMemoryEntries) || "(empty)",
          "",
          "# Recent Thoughts",
          formatSourceFiles(contextInfo.thoughts),
          "",
          "# Recent Journals",
          formatSourceFiles(contextInfo.journals),
          "",
          "# Recent Stories",
          formatSourceFiles(contextInfo.stories),
          "",
          "# Previous Dream Journals",
          formatSourceFiles(contextInfo.dreamJournals),
          "",
          "# Neural Memory If Available",
          formatSourceFiles(contextInfo.neuralMemory),
        ].join("\n"),
      },
    ];
    await writeRawOpenRouterText(messages, "dreamjournal");

    const response = await fetch(`${requiredSetting("openrouter_base_url")}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openrouterApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: Math.min(Number(requiredSetting("chaos")), 0.85),
        max_tokens: Number(requiredSetting("max_tokens")),
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenRouter error ${response.status}: ${await response.text()}`);
    }

    const payload = await response.json();
    const raw = payload.choices?.[0]?.message?.content?.trim();
    if (!raw) throw new Error("OpenRouter returned an empty dream journal.");
    const parsed = parseJsonObjectFromText(raw);
    return saveDreamJournal({
      contextInfo,
      instruction: combinedInstruction,
      interpretedDream,
      parsed,
    });
  }

  return {
    name: "dreamjournal",
    getPipeHelp({ agentCommandName }) {
      return [
        [`||${agentCommandName} dreamjournal||`, "Interpret the latest saved dream and save a private dream journal."],
        [`||${agentCommandName} dreamjournal: text||`, "Interpret the latest saved dream with extra focus instructions."],
      ];
    },
    async handlePipeCommand(command, message) {
      if (command?.kind !== "dreamjournal") return false;
      await message.channel.sendTyping();
      await generateDreamJournal(command.content);
      await replyTemporarily(message, "dream journal saved");
      return true;
    },
    async runDreamJournal(instruction = "") {
      return generateDreamJournal(instruction);
    },
    async runDreamJournalForDream(savedDream, instruction = "") {
      return generateDreamJournal(instruction, { savedDream });
    },
  };
}
