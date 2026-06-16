import { readFile } from "node:fs/promises";
import {
  readRecentPrivateThoughts,
  savePrivateThought,
} from "../consciousness.js";
import { readShortMemoryEntries, shortMemoryEntriesToSource } from "../memory.js";

function parseJsonObjectFromText(text) {
  const trimmed = String(text || "").trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const jsonText = fenced ? fenced[1].trim() : trimmed;
  const objectMatch = jsonText.match(/\{[\s\S]*\}/);
  if (!objectMatch) throw new Error(`No JSON object found in thought response: ${trimmed}`);
  return JSON.parse(objectMatch[0]);
}

async function readOptionalTextFile(filePath) {
  return readFile(filePath, "utf8").catch((error) => {
    if (error.code === "ENOENT") return "";
    throw error;
  });
}

export function createThoughtSkill(context) {
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

  async function listRecentThoughts(limit = 5) {
    return readRecentPrivateThoughts(agentFolder, limit, 4000);
  }

  async function generateThought(commandContent = "", sourceMessage = null) {
    const thoughtPrompt = String(commandContent || "").trim() ||
      "What am I thinking about right now?";
    const neuralMemorySettings = requiredSetting("neural_memory");
    const consciousnessDescriptors = requiredSetting("consciousness_descriptors");
    const thoughtWindowEntries = Math.max(1, Number(neuralMemorySettings.thought_window_entries) || 1);
    const thoughtInstruction = String(consciousnessDescriptors.thought || "").trim();
    if (!thoughtInstruction) throw new Error("Missing consciousness_descriptors.thought.");

    const recentEntries = (await readShortMemoryEntries(shortMemoryPath)).slice(-thoughtWindowEntries);
    const recentShortMemory = shortMemoryEntriesToSource(recentEntries);
    const existingMemorySummary = await readOptionalTextFile(longMemoryPath);
    const recentThoughts = await listRecentThoughts();
    const messages = [
      {
        role: "system",
        content: [
          `# Persona: ${agentName}`,
          systemPrompt(),
          "",
          "# Thought Task",
          thoughtInstruction,
          "This is not a visible reply, not a public message, and not a story. It is temporary private working memory.",
          "Thoughts are less stable than shortmemory. They can support end-of-day summarization, stories, and dreams later, but they are not hard facts by themselves.",
          "Use the prompt, recent shortmemory, memorysummary, and recent thoughts as evidence.",
          "Do not write as an outside narrator. Use first person: I think, I feel, I notice, I wonder.",
          "Do not address the user directly unless the thought naturally includes what I want to say or avoid saying.",
          "Do not claim certainty when the evidence is thin.",
          "Return only strict JSON with this shape:",
          "{\"title\":\"short title\",\"thought_markdown\":\"markdown thought beginning with a matching # title\"}",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          "# Thought Prompt",
          thoughtPrompt,
          "",
          "# Memorysummary",
          existingMemorySummary || "(empty)",
          "",
          "# Recent Shortmemory",
          recentShortMemory || "(empty)",
          "",
          "# Recent Thoughts",
          recentThoughts || "(empty)",
        ].join("\n"),
      },
    ];
    await writeRawOpenRouterText(messages, "thought");

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
    if (!raw) throw new Error("OpenRouter returned an empty thought.");
    const parsed = parseJsonObjectFromText(raw);
    const title = String(parsed.title || "Thought").trim() || "Thought";
    let thoughtMarkdown = String(parsed.thought_markdown || "").trim();
    if (!thoughtMarkdown) throw new Error("OpenRouter returned a thought without thought_markdown.");
    if (!thoughtMarkdown.startsWith("# ")) {
      thoughtMarkdown = [`# ${title}`, "", thoughtMarkdown].join("\n");
    }

    const { fileName, filePath } = await savePrivateThought({
      agentFolder,
      agentName,
      sourceMessage,
      instruction: thoughtInstruction,
      thoughtWindowEntries,
      title,
      thoughtMarkdown,
    });
    return { title, fileName, filePath };
  }

  return {
    name: "thought",
    getPipeHelp({ agentCommandName }) {
      return [
        [`||${agentCommandName} thought: text||`, "Write a private first-person internal thought from the prompt, recent memory, memorysummary, and recent thoughts."],
      ];
    },
    async handlePipeCommand(command, message) {
      if (command?.kind !== "thought") return false;
      await message.channel.sendTyping();
      await generateThought(command.content, message);
      await replyTemporarily(message, "thought saved privately");
      return true;
    },
  };
}
