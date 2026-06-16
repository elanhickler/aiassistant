import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { readShortMemoryEntries, shortMemoryEntriesToSource } from "../memory.js";
import { semanticMemoryUsageContract } from "../semantic-memory.js";

function timestampForFileName() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function safeFileName(name) {
  const safe = String(name || "story")
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return safe || "story";
}

function storyFileNameFromInput(input) {
  const trimmed = String(input || "").trim().replace(/^["']|["']$/g, "");
  if (!trimmed) throw new Error("Story filename is required.");
  if (trimmed.includes("/") || trimmed.includes("\\") || trimmed.includes("..")) {
    throw new Error("Story filename must be only a file name inside soul/stories.");
  }
  return path.extname(trimmed) ? trimmed : `${trimmed}.md`;
}

function chunkMarkdown(text, limit = 1800) {
  const chunks = [];
  let remaining = String(text || "").trim();
  while (remaining.length > limit) {
    let cut = remaining.lastIndexOf("\n\n", limit);
    if (cut < 500) cut = remaining.lastIndexOf("\n", limit);
    if (cut < 500) cut = remaining.lastIndexOf(" ", limit);
    if (cut < 500) cut = limit;
    chunks.push(remaining.slice(0, cut).trimEnd());
    remaining = remaining.slice(cut).trimStart();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

function storyTextWithoutMetadata(text) {
  return String(text || "")
    .replace(/\n---\n(?:agent|created|prompt|local_file):[\s\S]*$/i, "")
    .trim();
}

function limitText(text, maxCharacters) {
  const cleanText = String(text || "").trim();
  if (cleanText.length <= maxCharacters) return cleanText;
  return `${cleanText.slice(0, maxCharacters)}\n...`;
}

function formatStoriesForContext(stories, maxCharactersPerStory = 12000) {
  if (!stories.length) return "(none)";
  return stories.map((story) => [
    `# ${story.title}`,
    `file: ${story.fileName}`,
    "",
    limitText(story.text, maxCharactersPerStory),
  ].join("\n")).join("\n\n");
}

function storyTitleFromText(text, fileName) {
  const titleMatch = String(text || "").match(/^#\s+(.+)$/m);
  if (titleMatch) return titleMatch[1].trim();
  return path.basename(fileName, path.extname(fileName)).replace(/[-_]+/g, " ").trim() || fileName;
}

function normalizedWords(text) {
  const stopWords = new Set([
    "a", "about", "again", "an", "and", "are", "as", "at", "be", "but", "by", "can", "did", "do", "does",
    "for", "from", "had", "have", "he", "her", "him", "his", "how", "i", "in", "is", "it", "me", "my",
    "of", "on", "or", "our", "recall", "remember", "say", "she", "story", "tell", "that", "the", "them",
    "there", "they", "this", "to", "was", "we", "what", "when", "where", "with", "you", "your",
  ]);
  return String(text || "")
    .toLowerCase()
    .match(/[a-z0-9']{3,}/g)
    ?.filter((word) => !stopWords.has(word)) || [];
}

function looksLikeStoryRecallRequest(text) {
  const cleanText = String(text || "").toLowerCase();
  return /\b(story|stories|scene|recall|remember|remind me|what happened|tell me about|summarize|summary)\b/.test(cleanText);
}

function parseJsonObjectFromText(text) {
  const trimmed = String(text || "").trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const jsonText = fenced ? fenced[1].trim() : trimmed;
  const objectMatch = jsonText.match(/\{[\s\S]*\}/);
  if (!objectMatch) throw new Error(`No JSON object found in model response: ${trimmed}`);
  return JSON.parse(objectMatch[0]);
}

async function readRequiredTextFile(filePath) {
  return readFile(filePath, "utf8").then((text) => text.trim());
}

async function readRecentMemoryFiles(agentFolder, folderSetting, filePattern, limit, maxCharactersPerFile) {
  const folderPath = path.resolve(agentFolder, String(folderSetting));
  const resolvedAgentFolder = path.resolve(agentFolder);
  if (folderPath !== resolvedAgentFolder && !folderPath.startsWith(`${resolvedAgentFolder}${path.sep}`)) {
    throw new Error(`Story memory source folder escapes agent folder: ${folderSetting}`);
  }

  const files = await readdir(folderPath, { withFileTypes: true }).catch((error) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  const matchingFiles = files
    .filter((entry) => entry.isFile() && filePattern.test(entry.name))
    .map((entry) => path.join(folderPath, entry.name))
    .sort()
    .slice(-limit);

  const sourceFiles = [];
  for (const filePath of matchingFiles) {
    sourceFiles.push({
      relativeFilePath: path.relative(agentFolder, filePath),
      text: limitText((await readFile(filePath, "utf8")).trim(), maxCharactersPerFile),
    });
  }
  return sourceFiles;
}

function formatSourceFilesForContext(sourceFiles, emptyText = "(empty)") {
  if (!sourceFiles.length) return emptyText;
  return sourceFiles
    .map((sourceFile) => [`# ${sourceFile.relativeFilePath}`, sourceFile.text].join("\n"))
    .join("\n\n");
}

export function createStorySkill(context) {
  const {
    agentFolder,
    agentName,
    conversationHistoryLimit,
    findMemoryForumPostByName,
    longMemoryPath,
    model,
    openrouterApiKey,
    replyTemporarily,
    requiredSetting,
    shortMemoryPath,
    systemPrompt,
    writeRawOpenRouterText,
  } = context;

  const storiesFolder = path.join(agentFolder, "soul", "stories");

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

  async function listStoryFiles() {
    const entries = await readdir(storiesFolder, { withFileTypes: true }).catch((error) => {
      if (error.code === "ENOENT") return [];
      throw error;
    });

    const stories = [];
    for (const entry of entries) {
      if (!entry.isFile() || !/\.(md|txt)$/i.test(entry.name)) continue;
      if (entry.name === ".gitkeep") continue;
      const filePath = path.join(storiesFolder, entry.name);
      const rawText = await readFile(filePath, "utf8");
      const text = storyTextWithoutMetadata(rawText);
      if (!text.trim()) continue;
      stories.push({
        fileName: entry.name,
        title: storyTitleFromText(text, entry.name),
        text,
      });
    }
    return stories;
  }

  function keywordRankStories(stories, requestText) {
    const requestWords = new Set(normalizedWords(requestText));
    return stories
      .map((story) => {
        const titleWords = normalizedWords(story.title);
        const textWords = normalizedWords(story.text);
        let score = 0;
        for (const word of titleWords) {
          if (requestWords.has(word)) score += 4;
        }
        for (const word of textWords) {
          if (requestWords.has(word)) score += 1;
        }
        if (String(requestText).toLowerCase().includes(story.title.toLowerCase())) score += 10;
        return { ...story, score };
      })
      .sort((left, right) => right.score - left.score);
  }

  async function selectRelevantStories(requestText, stories) {
    if (stories.length === 0) return [];
    const rankedStories = keywordRankStories(stories, requestText);
    const likelyStories = rankedStories.filter((story) => story.score > 0).slice(0, 8);
    const candidateStories = likelyStories.length ? likelyStories : rankedStories.slice(0, 8);

    if (!looksLikeStoryRecallRequest(requestText) && likelyStories.length === 0) return [];

    if (candidateStories.length === 1) return candidateStories;

    const messages = [
      {
        role: "system",
        content: [
          "Decide whether the user is asking about saved stories, and choose the saved stories that are relevant.",
          "A saved story can be relevant even when the user refers indirectly, such as 'that scene', 'the one where...', or 'what happened in it'.",
          "Return only strict JSON with this shape:",
          "{\"is_story_recall\":true,\"story_files\":[\"filename.md\"],\"reason\":\"short reason\"}",
          "If the user is not asking about saved stories, return is_story_recall false and an empty story_files list.",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          "# User Message",
          requestText,
          "",
          "# Saved Story Candidates",
          ...candidateStories.map((story, index) => [
            `## ${index + 1}. ${story.title}`,
            `file: ${story.fileName}`,
            `keyword_score: ${story.score}`,
            "excerpt:",
            limitText(story.text, 900),
          ].join("\n")),
        ].join("\n\n"),
      },
    ];
    await writeRawOpenRouterText?.(messages, "story recall selection");

    const response = await fetch(`${requiredSetting("openrouter_base_url")}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openrouterApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0,
        max_tokens: 220,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenRouter error ${response.status}: ${await response.text()}`);
    }

    const payload = await response.json();
    const decision = parseJsonObjectFromText(payload.choices?.[0]?.message?.content);
    if (!decision.is_story_recall) return [];
    const selectedFiles = new Set((decision.story_files || []).map((fileName) => String(fileName).toLowerCase()));
    const selectedStories = candidateStories.filter((story) => selectedFiles.has(story.fileName.toLowerCase()));
    return selectedStories.length ? selectedStories.slice(0, 3) : candidateStories.slice(0, 1);
  }

  async function uploadStoryFile(filenameInput) {
    const fileName = storyFileNameFromInput(filenameInput);
    const storyPath = path.join(storiesFolder, fileName);
    const storyText = storyTextWithoutMetadata(await readRequiredTextFile(storyPath));
    if (!storyText.trim()) throw new Error(`Story file is empty: soul/stories/${fileName}`);

    const storiesPost = await findMemoryForumPostByName("stories").catch(() => null);
    if (!storiesPost?.send) {
      throw new Error("Could not find writable stories memory forum post/thread.");
    }

    const chunks = chunkMarkdown(storyText);
    for (let index = 0; index < chunks.length; index += 1) {
      const chunk = chunks[index];
      const message = chunks.length === 1
        ? chunk
        : [`_story part ${index + 1}/${chunks.length}_`, "", chunk].join("\n");
      await storiesPost.send(message);
    }

    return {
      fileName,
      chunks: chunks.length,
    };
  }

  async function generateStory(commandContent = "") {
    const consciousnessDescriptors = optionalSetting("consciousness_descriptors", {});
    const storyDescriptor = String(consciousnessDescriptors.story || "").trim() ||
      "Write a first-person story from what actually happened.";
    const userInstructions = String(commandContent || "").trim();
    const storyPrompt = userInstructions
      ? `${storyDescriptor}\n\nAdditional user story instructions:\n${userInstructions}`
      : storyDescriptor;
    const discordReplyCharacterLimit = Number(requiredSetting("discord_reply_character_limit")) || 1900;
    const recentEntries = (await readShortMemoryEntries(shortMemoryPath)).slice(-conversationHistoryLimit);
    const recentShortMemory = shortMemoryEntriesToSource(recentEntries);
    const existingMemorySummary = await readRequiredTextFile(longMemoryPath).catch((error) => {
      if (error.code === "ENOENT") return "";
      throw error;
    });
    const dreamSettings = optionalSetting("dream_settings", {});
    const memoryLayersSettings = optionalSetting("memory_layers", {});
    const storyThoughtControl = thoughtInfluenceControl("story", 0.5);
    const thoughts = storyThoughtControl.useThoughts
      ? await readRecentMemoryFiles(
        agentFolder,
        dreamSettings.thoughts_folder || "soul/consciousness/thoughts",
        /\.(md|txt)$/i,
        12,
        5000,
      )
      : [];
    const journals = await readRecentMemoryFiles(
      agentFolder,
      dreamSettings.journals_folder || "soul/consciousness/journals",
      /\.(md|txt)$/i,
      8,
      7000,
    );
    const neuralMemory = await readRecentMemoryFiles(
      agentFolder,
      memoryLayersSettings.folder || "soul/memory-layers",
      /^layer-\d+\.jsonl$/i,
      5,
      9000,
    ).catch((error) => [{
      relativeFilePath: memoryLayersSettings.folder || "soul/memory-layers",
      text: `(neural memory unavailable: ${error.message})`,
      unavailable: true,
    }]);
    const neuralMemoryNodeCount = neuralMemory
      .filter((file) => !file.unavailable)
      .reduce((count, file) => count + file.text.split(/\r?\n/).filter(Boolean).length, 0);
    const savedStories = await listStoryFiles();
    const relevantStories = await selectRelevantStories(userInstructions || storyPrompt, savedStories).catch((error) => {
      console.error(`Story evidence selection failed: ${error.message}`);
      return [];
    });
    const messages = [
      {
        role: "system",
        content: [
          `# Persona: ${agentName}`,
          systemPrompt(),
          "",
          "# Story Task",
          storyPrompt,
          "",
          "Write one short story as this agent, in first person by default unless the user explicitly asks for another perspective.",
          "Treat memory as evidence, not as permission to invent.",
          "Search the provided saved stories, recent shortmemory, thoughts when story.use_thoughts is enabled, journals, neural memory if present, and memorysummary for the scene or subject the user is asking about.",
          formatThoughtInfluenceInstruction("Story", storyThoughtControl),
          semanticMemoryUsageContract(),
          "Use only facts, scenes, character details, emotions, preferences, continuity, and plans that appear in that evidence.",
          "Use the user's story prompt to decide what part of memory they are asking about.",
          "If the prompt is blank, choose a relevant recent scene or thread from the evidence.",
          "Stories should lean toward what actually happened, but can become creative, poetic, scientific, chaotic, or stylized when the user asks for that.",
          "Treat any user mention of creativity, realism, poetic style, scientific detail, chaos, or numeric style values as temporary natural-language guidance only.",
          "Do not add new events, locations, outcomes, names, relationships, or lore that are not supported by the evidence.",
          "Small connective prose is allowed only to make supported memory read smoothly.",
          "If the evidence is too thin, say that the memory is thin inside the story_markdown instead of filling the gap with new facts.",
          `Keep story_markdown short enough to fit in one Discord message under ${discordReplyCharacterLimit} characters.`,
          "Prefer a vivid story summary over a long full scene.",
          "Return only strict JSON with this shape:",
          "{\"title\":\"short title\",\"story_markdown\":\"markdown story beginning with a matching # title\"}",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          "# User Story Prompt",
          storyPrompt,
          "",
          "# Relevant Saved Stories",
          formatStoriesForContext(relevantStories, 9000),
          "",
          "# Memorysummary",
          existingMemorySummary || "(empty)",
          "",
          "# Recent Shortmemory",
          recentShortMemory || "(empty)",
          "",
          "# Recent Thoughts",
          storyThoughtControl.useThoughts
            ? formatSourceFilesForContext(thoughts)
            : "(disabled by story.use_thoughts)",
          "",
          "# Recent Journals",
          formatSourceFilesForContext(journals),
          "",
          "# Neural Memory If Available",
          formatSourceFilesForContext(neuralMemory),
        ].join("\n"),
      },
    ];
    await writeRawOpenRouterText(messages, "story");

    const response = await fetch(`${requiredSetting("openrouter_base_url")}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openrouterApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: Number(requiredSetting("chaos")),
        max_tokens: Number(requiredSetting("max_tokens")),
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenRouter error ${response.status}: ${await response.text()}`);
    }

    const payload = await response.json();
    const raw = payload.choices?.[0]?.message?.content?.trim();
    if (!raw) throw new Error("OpenRouter returned an empty story.");

    const parsed = parseJsonObjectFromText(raw);
    const title = String(parsed.title || "Story").trim() || "Story";
    let storyMarkdown = String(parsed.story_markdown || "").trim();
    if (!storyMarkdown) throw new Error("OpenRouter returned a story without story_markdown.");
    if (!storyMarkdown.startsWith("# ")) {
      storyMarkdown = [`# ${title}`, "", storyMarkdown].join("\n");
    }

    const fileName = `${timestampForFileName()}-${safeFileName(title)}.md`;
    const storyPath = path.join(storiesFolder, fileName);
    await mkdir(storiesFolder, { recursive: true });
    const fileText = [
      storyMarkdown,
      "",
      "---",
      `agent: ${agentName}`,
      `created: ${new Date().toISOString()}`,
      `prompt: ${storyPrompt.replace(/\r?\n/g, " ")}`,
      `local_file: soul/stories/${fileName}`,
      `shortmemory_entries_included_count: ${recentEntries.length}`,
      `thoughts_included_count: ${thoughts.length}`,
      `journals_included_count: ${journals.length}`,
      `neural_memory_nodes_included_count: ${neuralMemoryNodeCount}`,
      `saved_stories_included_count: ${relevantStories.length}`,
      "",
    ].join("\n");
    await writeFile(storyPath, fileText, "utf8");

    const storiesPost = await findMemoryForumPostByName("stories").catch(() => null);
    let postedToDiscord = false;
    if (storiesPost?.send) {
      await storiesPost.send(
        storyMarkdown.length <= 1900
          ? storyMarkdown
          : `${storyMarkdown.slice(0, 1900)}\n\n_memory-grounded story summary clipped to fit Discord_`,
      );
      postedToDiscord = true;
    }

    return {
      title,
      relativeFilePath: path.join("soul", "stories", fileName),
      absoluteFilePath: storyPath,
      postedToDiscord,
    };
  }

  return {
    name: "story",
    memoryForumPostName: "stories",
    command: {
      name: "uploadstory",
      description: "Upload a local soul/stories Markdown story to the Discord stories thread.",
      options: [
        {
          name: "filename",
          description: "Story filename in soul/stories. .md is assumed if omitted.",
          type: 3,
          required: true,
        },
      ],
    },
    async handleInteraction(interaction) {
      if (interaction.commandName !== "uploadstory") return false;
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ ephemeral: true });
      }

      try {
        const filename = interaction.options.getString("filename", true);
        const result = await uploadStoryFile(filename);
        await interaction.editReply(`Uploaded ${result.fileName} to stories in ${result.chunks} message${result.chunks === 1 ? "" : "s"}.`);
      } catch (error) {
        await interaction.editReply(`Error uploading story: ${error.message}`);
      }
      return true;
    },
    async handlePipeCommand(command, message) {
      if (command?.kind !== "story") return false;
      await message.channel.sendTyping();
      await generateStory(command.content);
      await replyTemporarily(message, "story saved in thread");
      return true;
    },
    async getContextBlocks(message) {
      const requestText = message?.content || "";
      const blocks = [{
        title: "Story Skill",
        source: "story skill",
        priority: 15,
        content: [
          "Story generation and upload are available.",
          "When the user asks to write a new story, use the story pipe command workflow.",
          "Stories should be grounded in saved stories, shortmemory, and memorysummary instead of inventing new continuity.",
        ].join("\n"),
      }];

      const stories = await listStoryFiles();
      const selectedStories = await selectRelevantStories(requestText, stories).catch((error) => {
        console.error(`Story recall selection failed: ${error.message}`);
        return [];
      });
      if (selectedStories.length === 0) return blocks;

      blocks.push({
        title: "Relevant Saved Stories",
        source: "soul/stories",
        priority: 75,
        content: [
          "The user appears to be asking about saved story material.",
          "Use the relevant saved story text below to answer naturally.",
          "Also use the memorysummary and recent shortmemory context that are already included in this request.",
          "Do not pretend to search; you have the saved story context here.",
          "Do not add unsupported story details. If evidence is missing, say the saved memory does not show that.",
          "If the user asks what happened, summarize the story.",
          "If the user asks what you remember, answer from the agent's point of view using the story as evidence.",
          "If the user asks a focused question, answer that question instead of reciting the whole story.",
          "",
          formatStoriesForContext(selectedStories),
        ].join("\n\n"),
      });

      return blocks;
    },
  };
}
