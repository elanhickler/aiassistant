import { mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const defaultStylePresets = {
  "sfw-discord": {
    name: "sfw-discord",
    description: "Make explicit NSFW text safe for public Discord while preserving emotional intent.",
    mode: "remux",
    preserve: [
      "speaker intent",
      "relationship dynamic",
      "emotional intensity",
    ],
    change: [
      "remove explicit anatomy",
      "replace sexual acts with implication",
      "keep flirtation and tension",
    ],
    avoid: [
      "clinical wording",
      "moralizing",
      "breaking character",
    ],
    output: "rewritten text only",
  },
  "creative-nsfw": {
    name: "creative-nsfw",
    description: "Rewrite explicit text into more vivid adult-only prose while preserving intent.",
    mode: "remux",
    preserve: [
      "speaker intent",
      "adult tone",
      "emotional intensity",
    ],
    change: [
      "make wording more creative",
      "improve rhythm and imagery",
      "smooth awkward phrasing",
    ],
    avoid: [
      "moralizing",
      "sudden censorship",
      "changing consent or relationship dynamics",
    ],
    output: "rewritten text only",
  },
  "dirty-talk-cleanup": {
    name: "dirty-talk-cleanup",
    description: "Clean up raw dirty talk into clearer, more intentional adult dialogue.",
    mode: "remux",
    preserve: [
      "speaker intent",
      "directness",
      "relationship dynamic",
    ],
    change: [
      "fix awkward phrasing",
      "make the sentence flow",
      "keep it conversational",
    ],
    avoid: [
      "flowery narration",
      "clinical wording",
      "softening the intent too much",
    ],
    output: "rewritten text only",
  },
  "romance-novel": {
    name: "romance-novel",
    description: "Rewrite text as soft romantic prose with sensual implication and emotional focus.",
    mode: "remux",
    preserve: [
      "speaker intent",
      "romantic charge",
      "emotional stakes",
    ],
    change: [
      "make the language gentler and more polished",
      "use implication and atmosphere",
      "favor touch, longing, and closeness",
    ],
    avoid: [
      "crude phrasing",
      "clinical wording",
      "breaking character",
    ],
    output: "rewritten text only",
  },
  "innuendo-mask": {
    name: "innuendo-mask",
    description: "Turn explicit text into implication, metaphor, and plausible innuendo.",
    mode: "remux",
    preserve: [
      "speaker intent",
      "flirtation",
      "subtext",
    ],
    change: [
      "hide explicit acts behind metaphor",
      "make the text safer to read in public",
      "keep tension and playfulness",
    ],
    avoid: [
      "explaining the metaphor",
      "moralizing",
      "making the text sterile",
    ],
    output: "rewritten text only",
  },
};

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

function safeRelativeFolder(agentFolder, relativeFolder, settingName) {
  const folder = path.resolve(agentFolder, String(relativeFolder || "").replace(/^[/\\]+/, ""));
  const root = path.resolve(agentFolder);
  if (folder !== root && !folder.startsWith(`${root}${path.sep}`)) {
    throw new Error(`${settingName} must stay inside the agent folder.`);
  }
  return folder;
}

function safeStyleName(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/\.jsonc?$/i, "")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function styleToJsonc(style) {
  return `${JSON.stringify(style, null, 4)}\n`;
}

async function readJsoncFile(filePath) {
  const text = await readFile(filePath, "utf8");
  return JSON.parse(stripJsonc(text));
}

function limitText(text, maxCharacters) {
  const cleanText = String(text || "").trim();
  if (cleanText.length <= maxCharacters) return cleanText;
  return `${cleanText.slice(0, maxCharacters)}...`;
}

function historyDate() {
  return new Date().toISOString().slice(0, 10);
}

function parseTextgenRequest(content) {
  const text = String(content || "").trim();
  const colonIndex = text.lastIndexOf(":");
  if (colonIndex > 0 && colonIndex < text.length - 1) {
    return {
      instruction: text.slice(0, colonIndex).trim(),
      sourceText: text.slice(colonIndex + 1).trim(),
    };
  }
  return {
    instruction: text,
    sourceText: text,
  };
}

function parseStyleEditRequest(content) {
  const text = String(content || "").trim();
  const createMatch = text.match(/^(?:create|make|add)\s+(?:a\s+)?style\s+(?:called|named)?\s*["'`]?([a-z0-9._-]+)["'`]?\s*(?:that|to|for|:)?\s*([\s\S]*)$/i);
  if (createMatch) {
    return {
      action: "create",
      styleName: safeStyleName(createMatch[1]),
      instructions: createMatch[2].trim(),
    };
  }

  const adjustMatch = text.match(/^(?:adjust|edit|update|change)\s+(?:the\s+)?(?:style\s+)?["'`]?([a-z0-9._-]+)["'`]?\s*(?:to|so|that|:)?\s*([\s\S]*)$/i);
  if (adjustMatch) {
    return {
      action: "adjust",
      styleName: safeStyleName(adjustMatch[1]),
      instructions: adjustMatch[2].trim(),
    };
  }

  const renameMatch = text.match(/^rename\s+(?:the\s+)?(?:style\s+)?["'`]?([a-z0-9._-]+)["'`]?\s+(?:to|as)\s+["'`]?([a-z0-9._-]+)["'`]?$/i);
  if (renameMatch) {
    return {
      action: "rename",
      styleName: safeStyleName(renameMatch[1]),
      newStyleName: safeStyleName(renameMatch[2]),
    };
  }

  const deleteMatch = text.match(/^(?:delete|remove)\s+(?:the\s+)?(?:style\s+)?["'`]?([a-z0-9._-]+)["'`]?$/i);
  if (deleteMatch) {
    return {
      action: "delete",
      styleName: safeStyleName(deleteMatch[1]),
    };
  }

  return null;
}

function parseModelJsonObject(text, label) {
  const raw = String(text || "").trim();
  const fencedMatch = raw.match(/```(?:json|jsonc)?\s*([\s\S]*?)```/i);
  const jsonText = fencedMatch ? fencedMatch[1].trim() : raw;
  const firstBrace = jsonText.indexOf("{");
  const lastBrace = jsonText.lastIndexOf("}");
  if (firstBrace < 0 || lastBrace <= firstBrace) {
    throw new Error(`${label} did not return a JSON object.`);
  }
  return JSON.parse(stripJsonc(jsonText.slice(firstBrace, lastBrace + 1)));
}

function validateRemuxStyle(style, styleName) {
  if (!style || typeof style !== "object" || Array.isArray(style)) {
    throw new Error(`Textgen style ${styleName} must be a JSON object.`);
  }
  if (String(style.mode || "").trim().toLowerCase() !== "remux") {
    throw new Error(`Textgen style ${styleName} must have "mode": "remux".`);
  }
  for (const field of ["name", "description", "output"]) {
    if (!String(style[field] || "").trim()) {
      throw new Error(`Textgen style ${styleName} is missing required field: ${field}.`);
    }
  }
  for (const field of ["preserve", "change", "avoid"]) {
    if (!Array.isArray(style[field])) {
      throw new Error(`Textgen style ${styleName} field ${field} must be a list.`);
    }
  }
}

export function createTextgenSkill(context) {
  const {
    agentFolder,
    agentName,
    model,
    openrouterApiKey,
    requiredSetting,
    safeReply,
    systemPrompt,
    writeRawOpenRouterText,
  } = context;

  const settings = requiredSetting("textgen_skill");
  const stylesFolder = safeRelativeFolder(agentFolder, settings.styles_folder || "soul/textgen/styles", "textgen_skill.styles_folder");
  const historyFolder = safeRelativeFolder(agentFolder, settings.history_folder || "soul/textgen/history", "textgen_skill.history_folder");
  const defaultStyleName = safeStyleName(settings.default_style || "sfw-discord");
  const saveHistory = Boolean(settings.save_history);

  async function ensureDefaultStyles() {
    await mkdir(stylesFolder, { recursive: true });
    for (const [styleName, style] of Object.entries(defaultStylePresets)) {
      const filePath = path.join(stylesFolder, `${styleName}.jsonc`);
      const existing = await readFile(filePath, "utf8").catch((error) => {
        if (error.code === "ENOENT") return null;
        throw error;
      });
      if (existing !== null) continue;
      await writeFile(filePath, styleToJsonc(style), "utf8");
      console.log(`Created default textgen style for ${agentName}: ${filePath}`);
    }
  }

  async function loadStyle(styleName) {
    const safeName = safeStyleName(styleName);
    if (!safeName) throw new Error("textgen style name is blank.");
    const filePath = path.join(stylesFolder, `${safeName}.jsonc`);
    const style = await readJsoncFile(filePath).catch((error) => {
      if (error.code === "ENOENT") {
        throw new Error(
          `Unknown textgen style: ${safeName}. Create ${filePath} or change textgen_skill.default_style to an existing style.`,
        );
      }
      throw error;
    });
    validateRemuxStyle(style, safeName);
    return { name: safeName, filePath, style };
  }

  function styleFilePath(styleName) {
    const safeName = safeStyleName(styleName);
    if (!safeName) throw new Error("textgen style name is blank.");
    return path.join(stylesFolder, `${safeName}.jsonc`);
  }

  async function listStyleNames() {
    await ensureDefaultStyles();
    const entries = await readdir(stylesFolder, { withFileTypes: true }).catch((error) => {
      if (error.code === "ENOENT") return [];
      throw error;
    });
    return entries
      .filter((entry) => entry.isFile() && /\.jsonc?$/i.test(entry.name))
      .map((entry) => safeStyleName(entry.name))
      .filter(Boolean);
  }

  async function chooseStyle(instruction) {
    const lowerInstruction = String(instruction || "").toLowerCase();
    const styleNames = (await listStyleNames()).sort((left, right) => right.length - left.length);
    const mentionedStyle = styleNames.find((styleName) => lowerInstruction.includes(styleName.toLowerCase()));
    const loadedStyle = await loadStyle(mentionedStyle || defaultStyleName);
    return {
      ...loadedStyle,
      requestedExplicitly: Boolean(mentionedStyle),
      wasDefault: !mentionedStyle,
    };
  }

  async function saveRemuxHistory({ instruction, inputText, outputText, loadedStyle }) {
    if (!saveHistory) return "";
    await mkdir(historyFolder, { recursive: true });
    const filePath = path.join(historyFolder, `${historyDate()}-remux.jsonl`);
    const entry = {
      timestamp: new Date().toISOString(),
      agent: agentName,
      mode: "remux",
      style: loadedStyle.name,
      model,
      style_file_path: loadedStyle.filePath,
      style_was_default: loadedStyle.wasDefault,
      style_requested_explicitly: loadedStyle.requestedExplicitly,
      instruction,
      input: inputText,
      output: outputText,
    };
    await writeFile(filePath, `${JSON.stringify(entry)}\n`, { encoding: "utf8", flag: "a" }).catch((error) => {
      throw new Error(`Could not write textgen history ${filePath}: ${error.message}`);
    });
    return filePath;
  }

  async function callStyleJsonModel({ messages, label }) {
    await writeRawOpenRouterText?.(messages, `textgen ${label}`);
    const response = await fetch(`${requiredSetting("openrouter_base_url")}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openrouterApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: Math.min(Number(requiredSetting("chaos")), 0.5),
        max_tokens: Number(requiredSetting("max_tokens")),
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenRouter error ${response.status}: ${await response.text()}`);
    }

    const payload = await response.json();
    const outputText = payload.choices?.[0]?.message?.content?.trim();
    if (!outputText) throw new Error(`OpenRouter returned an empty ${label} reply.`);
    return parseModelJsonObject(outputText, label);
  }

  async function createStyleFromInstructions(styleName, instructions) {
    const safeName = safeStyleName(styleName);
    if (!safeName) throw new Error("Style name is blank.");
    if (!instructions) throw new Error("Style creation needs instructions.");
    await ensureDefaultStyles();
    const filePath = styleFilePath(safeName);
    const existing = await readFile(filePath, "utf8").catch((error) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (existing !== null) {
      throw new Error(`Textgen style already exists: ${safeName}. Use adjust ${safeName} instead.`);
    }

    const style = await callStyleJsonModel({
      label: "style create",
      messages: [
        {
          role: "system",
          content: [
            "You create editable Textgen remux style presets.",
            "Return one JSON object only.",
            "The object must use this exact shape: name, description, mode, preserve, change, avoid, output.",
            "The mode must be remux.",
            "preserve, change, and avoid must be lists of short strings.",
            "output should describe the final output shape, usually rewritten text only.",
            "Do not include markdown fences or commentary.",
          ].join("\n"),
        },
        {
          role: "user",
          content: [
            "# Style Name",
            safeName,
            "",
            "# User Instructions",
            instructions,
            "",
            "Create a complete remux style JSON object.",
          ].join("\n"),
        },
      ],
    });
    style.name = safeName;
    style.mode = "remux";
    validateRemuxStyle(style, safeName);
    await writeFile(filePath, styleToJsonc(style), "utf8");
    return `created textgen style: ${safeName}`;
  }

  async function adjustStyleFromInstructions(styleName, instructions) {
    const safeName = safeStyleName(styleName);
    if (!safeName) throw new Error("Style name is blank.");
    if (!instructions) throw new Error("Style adjustment needs instructions.");
    const loadedStyle = await loadStyle(safeName);
    const style = await callStyleJsonModel({
      label: "style adjust",
      messages: [
        {
          role: "system",
          content: [
            "You update editable Textgen remux style presets.",
            "Return the full updated JSON object only.",
            "Keep the style name unchanged unless the user explicitly asked to rename, which this command does not handle.",
            "The object must use this exact shape: name, description, mode, preserve, change, avoid, output.",
            "The mode must be remux.",
            "preserve, change, and avoid must be lists of short strings.",
            "Do not include markdown fences or commentary.",
          ].join("\n"),
        },
        {
          role: "user",
          content: [
            "# Existing Style",
            JSON.stringify(loadedStyle.style, null, 2),
            "",
            "# User Adjustment Instructions",
            instructions,
            "",
            "Return the full adjusted remux style JSON object.",
          ].join("\n"),
        },
      ],
    });
    style.name = safeName;
    style.mode = "remux";
    validateRemuxStyle(style, safeName);
    await writeFile(loadedStyle.filePath, styleToJsonc(style), "utf8");
    return `updated textgen style: ${safeName}`;
  }

  async function renameStyle(styleName, newStyleName) {
    const oldName = safeStyleName(styleName);
    const nextName = safeStyleName(newStyleName);
    if (!oldName || !nextName) throw new Error("Rename needs an old style name and a new style name.");
    if (oldName === nextName) throw new Error("Rename needs a different new style name.");
    const loadedStyle = await loadStyle(oldName);
    const newPath = styleFilePath(nextName);
    const existing = await readFile(newPath, "utf8").catch((error) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (existing !== null) throw new Error(`Textgen style already exists: ${nextName}.`);
    loadedStyle.style.name = nextName;
    validateRemuxStyle(loadedStyle.style, nextName);
    await writeFile(loadedStyle.filePath, styleToJsonc(loadedStyle.style), "utf8");
    await rename(loadedStyle.filePath, newPath);
    return `renamed textgen style: ${oldName} -> ${nextName}`;
  }

  async function deleteStyle(styleName) {
    const safeName = safeStyleName(styleName);
    if (!safeName) throw new Error("Delete needs a style name.");
    if (safeName === defaultStyleName) {
      throw new Error(`Cannot delete default textgen style ${safeName}. Change textgen_skill.default_style first.`);
    }
    const loadedStyle = await loadStyle(safeName);
    await unlink(loadedStyle.filePath);
    return `deleted textgen style: ${safeName}`;
  }

  async function editStyle(commandContent) {
    const request = parseStyleEditRequest(commandContent);
    if (!request) return null;
    if (request.action === "create") return createStyleFromInstructions(request.styleName, request.instructions);
    if (request.action === "adjust") return adjustStyleFromInstructions(request.styleName, request.instructions);
    if (request.action === "rename") return renameStyle(request.styleName, request.newStyleName);
    if (request.action === "delete") return deleteStyle(request.styleName);
    return null;
  }

  async function remuxText(command) {
    const { instruction, sourceText } = parseTextgenRequest(command?.content);
    if (!instruction || !sourceText) throw new Error("textgen needs instructions and text.");
    const loadedStyle = await chooseStyle(instruction);
    const messages = [
      {
        role: "system",
        content: [
          `# Persona: ${agentName}`,
          typeof systemPrompt === "function" ? systemPrompt() : "",
          "",
          "# Textgen Task",
          "You are Textgen, an intent-preserving text transformation tool.",
          "Your first implemented mode is remux: same intent, different language container.",
          "Rewrite the user's text according to the selected style and instruction.",
          "Preserve the user's intended meaning, relationship dynamic, tone pressure, and emotional intent unless the instruction says otherwise.",
          "Do not add commentary, prefaces, labels, markdown fences, explanations, or safety notes.",
          "Return rewritten text only.",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          "# Agent",
          agentName,
          "",
          "# Selected Style",
          JSON.stringify(loadedStyle.style, null, 2),
          "",
          "# User Instruction And Text",
          instruction,
          "",
          "# Source Text",
          sourceText,
          "",
          "Return rewritten text only.",
        ].join("\n"),
      },
    ];
    await writeRawOpenRouterText?.(messages, "textgen remux");

    const response = await fetch(`${requiredSetting("openrouter_base_url")}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openrouterApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: Math.min(Number(requiredSetting("chaos")), 0.7),
        max_tokens: Number(requiredSetting("max_tokens")),
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenRouter error ${response.status}: ${await response.text()}`);
    }

    const payload = await response.json();
    const outputText = payload.choices?.[0]?.message?.content?.trim();
    if (!outputText) throw new Error("OpenRouter returned an empty textgen reply.");
    await saveRemuxHistory({
      instruction,
      inputText: sourceText,
      outputText,
      loadedStyle,
    });
    return limitText(outputText, 1900);
  }

  return {
    name: "textgen",
    requiredSettings() {
      return ["textgen_skill"];
    },
    async onReady() {
      await ensureDefaultStyles();
    },
    getPipeHelp({ agentCommandName, pipeRowsWithAliases }) {
      return pipeRowsWithAliases(
        agentCommandName,
        "textgen",
        ": instructions and text",
        "Remux text or conversationally create, adjust, rename, and delete textgen styles.",
      );
    },
    async handlePipeCommand(command, message) {
      if (command?.kind !== "textgen") return false;
      const styleEditResult = await editStyle(command.content);
      if (styleEditResult) {
        await safeReply(message, styleEditResult);
        return true;
      }
      const outputText = await remuxText(command);
      await safeReply(message, outputText);
      return true;
    },
  };
}
