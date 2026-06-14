import { appendFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const knownOutputTypes = ["emoji", "self", "scene", "background", "thought", "dream"];
const reviewStates = ["usable", "promote_candidate", "needs_edit", "rejected", "blocked"];

function asList(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
}

function requireStringSetting(settings, key) {
  const value = String(settings?.[key] || "").trim();
  if (!value) throw new Error(`Missing planned_skill_settings.visualexpression.${key}`);
  return value;
}

function requireNumberSetting(settings, key, minimum) {
  const value = Number(settings?.[key]);
  if (!Number.isFinite(value) || value < minimum) {
    throw new Error(`planned_skill_settings.visualexpression.${key} must be ${minimum} or higher.`);
  }
  return value;
}

function validateSettings(settings) {
  requireStringSetting(settings, "provider");
  requireStringSetting(settings, "output_folder");
  requireStringSetting(settings, "output_manifest_file");
  requireStringSetting(settings, "request_log_file");
  requireStringSetting(settings, "visual_review_file");
  requireStringSetting(settings, "visual_memory_file");
  requireStringSetting(settings, "style_presets_file");
  requireNumberSetting(settings, "provider_timeout_seconds", 1);
  requireNumberSetting(settings, "provider_max_retries", 0);
  requireNumberSetting(settings, "max_visuals_per_reply", 0);
  requireNumberSetting(settings, "max_variants_per_request", 1);
  requireNumberSetting(settings, "prompt_context_character_limit", 0);
  requireNumberSetting(settings, "max_reference_ids_per_prompt", 0);
  requireNumberSetting(settings, "max_reference_notes_to_scan", 0);
  requireNumberSetting(settings, "max_visual_memories_per_context", 0);

  const outputTypes = asList(settings.output_types);
  const unknownTypes = outputTypes.filter((outputType) => !knownOutputTypes.includes(outputType));
  if (outputTypes.length === 0) {
    throw new Error("planned_skill_settings.visualexpression.output_types must include at least one output type.");
  }
  if (unknownTypes.length > 0) {
    throw new Error(`Unknown visual expression output types: ${unknownTypes.join(", ")}`);
  }
}

function stylePresetSummary(settings) {
  return [
    `emoji: ${settings.default_emoji_style_preset || "emoji-clean"}`,
    `self: ${settings.default_self_style_preset || "self-portrait"}`,
    `scene: ${settings.default_scene_style_preset || "scene-readable"}`,
    `background: ${settings.default_background_style_preset || "background-mood"}`,
    `thought: ${settings.default_thought_style_preset || "thought-symbol"}`,
    `dream: ${settings.default_dream_style_preset || "dream-surreal"}`,
  ].join("\n");
}

function timestampId() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function safeIdText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function defaultStylePresetForType(settings, outputType) {
  const defaults = {
    emoji: settings.default_emoji_style_preset || "emoji-clean",
    self: settings.default_self_style_preset || "self-portrait",
    scene: settings.default_scene_style_preset || "scene-readable",
    background: settings.default_background_style_preset || "background-mood",
    thought: settings.default_thought_style_preset || "thought-symbol",
    dream: settings.default_dream_style_preset || "dream-surreal",
  };
  return defaults[outputType] || "";
}

function requestPrompt(command) {
  const prompt = String(command.content || "").trim();
  return prompt || "Use current context to decide the visual subject and mood.";
}

function defaultSizeForType(outputType) {
  if (outputType === "emoji" || outputType === "thought" || outputType === "dream") {
    return { width: 768, height: 768 };
  }
  if (outputType === "scene" || outputType === "background") {
    return { width: 1152, height: 768 };
  }
  return { width: 768, height: 1152 };
}

function requestTimestamp(request) {
  const timestamps = [
    request?.result?.failed_at,
    request?.result?.created_at,
    request?.created_at,
    request?.id?.slice(0, 24),
  ];
  for (const timestamp of timestamps) {
    const value = Date.parse(String(timestamp || ""));
    if (Number.isFinite(value)) return value;
  }
  return 0;
}

function requestPath(requestFolder, requestId) {
  return path.join(requestFolder, `${requestId}.json`);
}

function requestIdSuffix(request) {
  return safeIdText(request?.output_type || "retry") || "retry";
}

export function createVisualExpressionSkill(context) {
  const { agentFolder, agentName, safeReply, requiredSetting } = context;
  const plannedSkillSettings = requiredSetting("planned_skill_settings");
  const settings = plannedSkillSettings.visualexpression;
  if (!settings) throw new Error("Missing planned_skill_settings.visualexpression because visualexpression is enabled.");
  validateSettings(settings);
  const outputFolder = path.join(agentFolder, settings.output_folder);
  const requestFolder = path.join(outputFolder, "requests");
  const promptFolder = path.join(outputFolder, "prompts");
  const requestLogPath = path.join(outputFolder, settings.request_log_file);
  const reviewLogPath = path.join(outputFolder, settings.visual_review_file);
  const visualMemoryPath = path.join(outputFolder, settings.visual_memory_file);

  async function appendRequestEvent(requestId, state, message, extra = {}) {
    await mkdir(outputFolder, { recursive: true });
    await appendFile(requestLogPath, `${JSON.stringify({
      request_id: requestId,
      state,
      updated_at: new Date().toISOString(),
      message,
      ...extra,
    })}\n`);
  }

  async function writeRequest(request) {
    await mkdir(requestFolder, { recursive: true });
    await writeFile(requestPath(requestFolder, request.id), `${JSON.stringify(request, null, 2)}\n`);
  }

  function promptNoteText(request) {
    return [
      `# Visual Request: ${request.id}`,
      "",
      `* agent : ${request.agent}`,
      `* output_type : ${request.output_type || "auto"}`,
      `* status : ${request.result?.status || "queued"}`,
      `* provider : ${request.generation?.provider || settings.provider}`,
      `* style_preset : ${request.style_preset || ""}`,
      `* size : ${request.generation?.width || ""} x ${request.generation?.height || ""}`,
      `* variant_group_id : ${request.variants?.variant_group_id || ""}`,
      `* variant_count : ${request.variants?.variant_count || 1}`,
      `* variant_strategy : ${request.variants?.variant_strategy || ""}`,
      "",
      "## Prompt",
      "",
      request.prompt || "",
      "",
      "## Negative Prompt",
      "",
      request.negative_prompt || "",
      "",
      "## Source",
      "",
      `* message_id : ${request.source_context?.message_id || ""}`,
      `* channel_id : ${request.source_context?.channel_id || ""}`,
      `* reference_ids : ${(request.source_context?.reference_ids || []).join(", ")}`,
      `* story_files : ${(request.source_context?.story_files || []).join(", ")}`,
      `* dream_files : ${(request.source_context?.dream_files || []).join(", ")}`,
    ].join("\n");
  }

  async function writePromptNote(request) {
    if (!request.prompt_path) return;
    await mkdir(promptFolder, { recursive: true });
    await writeFile(path.join(outputFolder, request.prompt_path), `${promptNoteText(request)}\n`);
  }

  async function queueVisualRequest(command, message) {
    const outputType = command.outputType || "";
    const allowedOutputTypes = asList(settings.output_types);
    if (outputType && !allowedOutputTypes.includes(outputType)) {
      throw new Error(`Unknown visual output type: ${outputType}`);
    }

    const createdAt = new Date().toISOString();
    const idSuffix = safeIdText(outputType || "visual");
    const requestId = `${timestampId()}-${idSuffix || "visual"}`;
    const selectedOutputType = outputType || "";
    const size = defaultSizeForType(selectedOutputType);
    const variantCount = Math.min(
      Number(settings.max_variants_per_request || 1),
      selectedOutputType === "emoji" ? 4 : selectedOutputType === "dream" ? 3 : 2,
    );
    const request = {
      id: requestId,
      agent: agentName,
      output_type: selectedOutputType,
      reason: "manual visual pipe command",
      visibility: "local",
      prompt: requestPrompt(command),
      prompt_path: `prompts/${requestId}.md`,
      negative_prompt: "",
      style_preset: selectedOutputType ? defaultStylePresetForType(settings, selectedOutputType) : "",
      source_context: {
        message_id: String(message.id || ""),
        channel_id: String(message.channelId || ""),
        shortmemory_ids: [],
        longmemory_sections: [],
        story_files: [],
        dream_files: [],
        reference_ids: [],
      },
      generation: {
        provider: settings.provider,
        width: size.width,
        height: size.height,
        model: "",
        seed: "",
      },
      variants: {
        variant_group_id: requestId,
        variant_count: Math.max(1, variantCount),
        variant_strategy: settings.default_variant_strategy || "same prompt, different seeds",
        parent_output_id: "",
      },
      result: {
        status: "queued",
        local_path: "",
        created_at: createdAt,
      },
    };

    await writeRequest(request);
    await writePromptNote(request);
    await appendRequestEvent(
      requestId,
      "queued",
      `manual visual request queued${selectedOutputType ? ` for ${selectedOutputType}` : ""}`,
      { updated_at: createdAt },
    );

    return request;
  }

  async function readQueuedRequests() {
    return (await readAllRequests()).filter((request) => request?.result?.status === "queued");
  }

  async function readAllRequests() {
    const files = await readdir(requestFolder).catch((error) => {
      if (error.code === "ENOENT") return [];
      throw error;
    });
    const requests = [];
    for (const file of files.filter((name) => name.endsWith(".json"))) {
      const filePath = path.join(requestFolder, file);
      const request = JSON.parse(await readFile(filePath, "utf8"));
      requests.push(request);
    }
    return requests.sort((left, right) => requestTimestamp(right) - requestTimestamp(left));
  }

  async function formatRequestList({ limit = 8 } = {}) {
    const requests = (await readAllRequests()).slice(0, limit);
    if (requests.length === 0) return "no visual requests found";

    return [
      "visual requests:",
      ...requests.map((request) => {
        const status = request?.result?.status || "unknown";
        const type = request?.output_type || "auto";
        const prompt = String(request?.prompt || "").replace(/\s+/g, " ").slice(0, 80);
        return `* ${request.id} : ${status} : ${type} : ${prompt}`;
      }),
    ].join("\n");
  }

  async function findRequestByIdOrLatest(requestId = "") {
    const targetId = String(requestId || "").trim();
    const requests = await readAllRequests();
    if (targetId) {
      const request = requests.find((candidate) => candidate.id === targetId);
      if (!request) throw new Error(`Visual request not found: ${targetId}`);
      return request;
    }

    const latestRequest = requests[0];
    if (!latestRequest) throw new Error("No visual request found.");
    return latestRequest;
  }

  async function readAllReviews() {
    const text = await readFile(reviewLogPath, "utf8").catch((error) => {
      if (error.code === "ENOENT") return "";
      throw error;
    });
    if (!text.trim()) return [];

    const reviews = [];
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const review = JSON.parse(line);
      reviews.push(review);
    }
    return reviews.sort((left, right) => Date.parse(right.created_at || "") - Date.parse(left.created_at || ""));
  }

  async function readReviewsForRequest(requestId, { limit = 3 } = {}) {
    return (await readAllReviews())
      .filter((review) => review?.request_id === requestId)
      .slice(0, limit);
  }

  async function formatRequestDetails(requestId = "") {
    const request = await findRequestByIdOrLatest(requestId);
    const result = request.result || {};
    const generation = request.generation || {};
    const variants = request.variants || {};
    const prompt = String(request.prompt || "").replace(/\s+/g, " ").slice(0, 240);
    const lines = [
      "visual request:",
      `id: ${request.id}`,
      `status: ${result.status || "unknown"}`,
      `type: ${request.output_type || "auto"}`,
      `prompt_path: ${request.prompt_path || ""}`,
      `style_preset: ${request.style_preset || ""}`,
      `size: ${generation.width || ""} x ${generation.height || ""}`,
      `variant_group_id: ${variants.variant_group_id || ""}`,
      `variant_count: ${variants.variant_count || 1}`,
    ];
    if (result.retry_of) lines.push(`retry_of: ${result.retry_of}`);
    if (result.error_kind) lines.push(`error_kind: ${result.error_kind}`);
    if (result.message) lines.push(`message: ${result.message}`);
    lines.push("prompt:", prompt || "(empty)");
    const reviews = await readReviewsForRequest(request.id);
    if (reviews.length > 0) {
      lines.push(
        "reviews:",
        ...reviews.map((review) => {
          const noteText = String(review.notes || "").replace(/\s+/g, " ").slice(0, 180);
          return `* ${review.created_at || ""} : ${review.review_state || "note"} : ${noteText}`;
        }),
      );
    }
    return lines.join("\n");
  }

  async function formatReviewedRequestList({ limit = 8 } = {}) {
    const reviews = (await readAllReviews()).filter((review) => reviewStates.includes(review?.review_state || ""));
    if (reviews.length === 0) return "no reviewed visual requests found";

    return formatReviewList("reviewed visual requests:", reviews, limit);
  }

  function formatReviewList(title, reviews, limit) {
    const latestByRequest = new Map();
    for (const review of reviews) {
      if (!review?.request_id || latestByRequest.has(review.request_id)) continue;
      latestByRequest.set(review.request_id, review);
      if (latestByRequest.size >= limit) break;
    }

    return [
      title,
      ...[...latestByRequest.values()].map((review) => {
        const note = String(review.notes || "").replace(/\s+/g, " ").slice(0, 80);
        return `* ${review.request_id} : ${review.review_state}${note ? ` : ${note}` : ""}`;
      }),
    ].join("\n");
  }

  async function formatPromotedRequestList({ limit = 8 } = {}) {
    const reviews = (await readAllReviews()).filter((review) => review?.review_state === "promote_candidate");
    if (reviews.length === 0) return "no promoted visual requests found";

    return formatReviewList("promoted visual requests:", reviews, limit);
  }

  async function readAllVisualMemories() {
    const text = await readFile(visualMemoryPath, "utf8").catch((error) => {
      if (error.code === "ENOENT") return "";
      throw error;
    });
    if (!text.trim()) return [];

    const memories = [];
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue;
      memories.push(JSON.parse(line));
    }
    return memories.sort((left, right) => Date.parse(right.created_at || "") - Date.parse(left.created_at || ""));
  }

  function visualMemorySearchText(memory) {
    return [
      memory.id,
      memory.output_type,
      memory.memory_type,
      memory.summary,
      memory.prompt,
      memory.style_preset,
      memory.source_review_state,
    ].map((part) => String(part || "").toLowerCase()).join("\n");
  }

  async function formatVisualMemoryList({ limit = 8, query = "" } = {}) {
    const searchText = String(query || "").trim().toLowerCase();
    const allMemories = await readAllVisualMemories();
    const memories = (searchText
      ? allMemories.filter((memory) => visualMemorySearchText(memory).includes(searchText))
      : allMemories
    ).slice(0, limit);
    if (memories.length === 0) {
      return searchText ? `no visual memories found for: ${query}` : "no visual memories found";
    }

    return [
      searchText ? `visual memories for: ${query}` : "visual memories:",
      ...memories.map((memory) => {
        const summary = String(memory.summary || "").replace(/\s+/g, " ").slice(0, 90);
        return `* ${memory.id} : ${memory.output_type || "auto"} : ${summary}`;
      }),
    ].join("\n");
  }

  async function formatVisualMemoryContext({ query = "" } = {}) {
    const limit = Math.max(0, Number(settings.max_visual_memories_per_context || 0));
    if (limit <= 0) return "";

    const searchText = String(query || "").trim().toLowerCase();
    const allMemories = await readAllVisualMemories();
    const memories = (searchText
      ? allMemories.filter((memory) => visualMemorySearchText(memory).includes(searchText))
      : allMemories
    ).slice(0, limit);
    if (memories.length === 0) return "";

    return [
      searchText ? `Remembered visual guidance for: ${query}` : "Remembered visual guidance:",
      ...memories.map((memory) => {
        const type = memory.output_type || memory.memory_type || "visual";
        const summary = String(memory.summary || "").replace(/\s+/g, " ").trim();
        const style = String(memory.style_preset || "").trim();
        return `* ${type}${style ? ` / ${style}` : ""} : ${summary}`;
      }),
    ].join("\n");
  }

  function parseReviewNoteInput(content = "") {
    const text = String(content || "").trim();
    if (!text) throw new Error("visual note needs text.");

    const delimiterIndex = text.indexOf("|");
    if (delimiterIndex === -1) {
      return { requestId: "", note: text };
    }

    const requestId = text.slice(0, delimiterIndex).trim();
    const note = text.slice(delimiterIndex + 1).trim();
    if (!requestId) throw new Error("visual note request id is blank before |.");
    if (!note) throw new Error("visual note text is blank after |.");
    return { requestId, note };
  }

  async function noteRequest(content = "") {
    const { requestId, note } = parseReviewNoteInput(content);
    const request = await findRequestByIdOrLatest(requestId);
    const createdAt = new Date().toISOString();
    const review = {
      id: `${timestampId()}-note`,
      output_id: "",
      request_id: request.id,
      agent: agentName,
      reviewer: "human",
      review_state: "note",
      score: null,
      tags: [],
      notes: note,
      created_at: createdAt,
    };

    await mkdir(outputFolder, { recursive: true });
    await appendFile(reviewLogPath, `${JSON.stringify(review)}\n`);
    return { request, review };
  }

  function parseReviewInput(content = "") {
    const text = String(content || "").trim();
    if (!text) throw new Error(`visual review needs a state: ${reviewStates.join(", ")}.`);

    const parts = text.split("|").map((part) => part.trim()).filter(Boolean);
    let requestId = "";
    let state = "";
    let note = "";

    if (parts.length === 1) {
      state = parts[0];
    } else if (reviewStates.includes(parts[0].toLowerCase())) {
      state = parts[0];
      note = parts.slice(1).join(" | ");
    } else {
      requestId = parts[0];
      state = parts[1] || "";
      note = parts.slice(2).join(" | ");
    }

    state = state.toLowerCase();
    if (!reviewStates.includes(state)) {
      throw new Error(`Unknown visual review state: ${state || "(blank)"}. Use ${reviewStates.join(", ")}.`);
    }
    return { requestId, state, note };
  }

  async function reviewRequest(content = "") {
    const { requestId, state, note } = parseReviewInput(content);
    const request = await findRequestByIdOrLatest(requestId);
    const createdAt = new Date().toISOString();
    const review = {
      id: `${timestampId()}-${state}`,
      output_id: "",
      request_id: request.id,
      agent: agentName,
      reviewer: "human",
      review_state: state,
      score: null,
      tags: [],
      notes: note,
      created_at: createdAt,
    };

    await mkdir(outputFolder, { recursive: true });
    await appendFile(reviewLogPath, `${JSON.stringify(review)}\n`);
    return { request, review };
  }

  function parsePromoteInput(content = "") {
    const text = String(content || "").trim();
    if (!text) {
      return { requestId: "", note: "marked as promotion candidate" };
    }

    const delimiterIndex = text.indexOf("|");
    if (delimiterIndex === -1) {
      return { requestId: text, note: "marked as promotion candidate" };
    }

    const requestId = text.slice(0, delimiterIndex).trim();
    const note = text.slice(delimiterIndex + 1).trim();
    if (!requestId) throw new Error("visual promote request id is blank before |.");
    return { requestId, note: note || "marked as promotion candidate" };
  }

  async function promoteRequest(content = "") {
    const { requestId, note } = parsePromoteInput(content);
    const request = await findRequestByIdOrLatest(requestId);
    const createdAt = new Date().toISOString();
    const review = {
      id: `${timestampId()}-promote-candidate`,
      output_id: "",
      request_id: request.id,
      agent: agentName,
      reviewer: "human",
      review_state: "promote_candidate",
      score: null,
      tags: ["promotion candidate"],
      notes: note,
      created_at: createdAt,
    };

    await mkdir(outputFolder, { recursive: true });
    await appendFile(reviewLogPath, `${JSON.stringify(review)}\n`);
    return { request, review };
  }

  function parseRememberInput(content = "") {
    const text = String(content || "").trim();
    if (!text) {
      return { requestId: "", note: "" };
    }

    const delimiterIndex = text.indexOf("|");
    if (delimiterIndex === -1) {
      return { requestId: text, note: "" };
    }

    const requestId = text.slice(0, delimiterIndex).trim();
    const note = text.slice(delimiterIndex + 1).trim();
    if (!requestId) throw new Error("visual remember request id is blank before |.");
    return { requestId, note };
  }

  async function rememberRequest(content = "") {
    const { requestId, note } = parseRememberInput(content);
    const request = await findRequestByIdOrLatest(requestId);
    const reviews = await readReviewsForRequest(request.id, { limit: 5 });
    const latestReview = reviews.find((review) => reviewStates.includes(review?.review_state || ""));
    const latestPromotion = reviews.find((review) => review?.review_state === "promote_candidate");
    const summaryParts = [
      note,
      latestPromotion?.notes,
      latestReview?.notes,
      request.prompt,
    ].map((part) => String(part || "").trim()).filter(Boolean);
    const memory = {
      id: `${timestampId()}-${safeIdText(request.output_type || "visual") || "visual"}`,
      request_id: request.id,
      agent: agentName,
      output_type: request.output_type || "",
      summary: summaryParts[0] || "Remember this visual direction.",
      prompt: request.prompt || "",
      style_preset: request.style_preset || "",
      source_review_state: latestReview?.review_state || "",
      source_review_id: latestReview?.id || "",
      source_prompt_path: request.prompt_path || "",
      created_at: new Date().toISOString(),
    };

    await mkdir(outputFolder, { recursive: true });
    await appendFile(visualMemoryPath, `${JSON.stringify(memory)}\n`);
    return { request, memory };
  }

  async function findRequestByIdOrLatestQueued(requestId) {
    const targetId = String(requestId || "").trim();
    if (targetId) {
      const request = (await readAllRequests()).find((candidate) => candidate.id === targetId);
      if (!request) throw new Error(`Visual request not found: ${targetId}`);
      return request;
    }

    const latestQueued = (await readQueuedRequests())[0];
    if (!latestQueued) throw new Error("No queued visual request found to cancel.");
    return latestQueued;
  }

  async function findRequestByIdOrLatestRetryable(requestId) {
    const targetId = String(requestId || "").trim();
    const requests = await readAllRequests();
    if (targetId) {
      const request = requests.find((candidate) => candidate.id === targetId);
      if (!request) throw new Error(`Visual request not found: ${targetId}`);
      return request;
    }

    const latestRetryable = requests.find((request) => {
      const status = request?.result?.status || "";
      const retryable = request?.result?.retryable;
      return status === "cancelled" || (status === "failed" && retryable !== false);
    });
    if (!latestRetryable) throw new Error("No failed or cancelled visual request found to retry.");
    return latestRetryable;
  }

  async function cancelRequest(requestId = "") {
    const request = await findRequestByIdOrLatestQueued(requestId);
    const status = request?.result?.status || "unknown";
    if (status !== "queued") {
      throw new Error(`Visual request ${request.id} is ${status}, only queued requests can be cancelled.`);
    }

    const cancelledAt = new Date().toISOString();
    const nextRequest = {
      ...request,
      result: {
        ...(request.result || {}),
        status: "cancelled",
        cancelled_at: cancelledAt,
        message: "cancelled by visual pipe command",
      },
    };
    await appendRequestEvent(request.id, "cancelled", "visual request cancelled by pipe command", {
      updated_at: cancelledAt,
    });
    await writeRequest(nextRequest);
    await writePromptNote(nextRequest);
    return nextRequest;
  }

  async function retryRequest(requestId = "") {
    const request = await findRequestByIdOrLatestRetryable(requestId);
    const status = request?.result?.status || "unknown";
    const retryable = request?.result?.retryable;
    if (status !== "cancelled" && status !== "failed") {
      throw new Error(`Visual request ${request.id} is ${status}, only failed or cancelled requests can be retried.`);
    }
    if (status === "failed" && retryable === false) {
      throw new Error(`Visual request ${request.id} is not retryable.`);
    }

    const createdAt = new Date().toISOString();
    const retryId = `${timestampId()}-${requestIdSuffix(request)}`;
    const nextRequest = {
      ...request,
      id: retryId,
      reason: `retry of ${request.id}`,
      result: {
        status: "queued",
        local_path: "",
        created_at: createdAt,
        retry_of: request.id,
      },
      variants: {
        ...(request.variants || {}),
        parent_output_id: request.variants?.parent_output_id || "",
      },
    };

    await writeRequest(nextRequest);
    await writePromptNote(nextRequest);
    await appendRequestEvent(retryId, "queued", `retry queued from ${request.id}`, {
      retry_of: request.id,
      updated_at: createdAt,
    });
    return nextRequest;
  }

  async function markRequestProviderUnimplemented(request) {
    const assemblingAt = new Date().toISOString();
    const failedAt = new Date().toISOString();
    const nextRequest = {
      ...request,
      result: {
        ...(request.result || {}),
        status: "failed",
        failed_at: failedAt,
        error_kind: "provider_unimplemented",
        message: "visual provider handoff is not implemented yet",
        retryable: true,
      },
    };

    await appendRequestEvent(request.id, "assembling_prompt", "validated queued visual request", {
      updated_at: assemblingAt,
    });
    await appendRequestEvent(request.id, "failed", "visual provider handoff is not implemented yet", {
      error_kind: "provider_unimplemented",
      retryable: true,
      provider: request.generation?.provider || settings.provider,
      updated_at: failedAt,
    });
    await writeRequest(nextRequest);
    await writePromptNote(nextRequest);
    return nextRequest;
  }

  async function processQueuedRequests({ limit = 5 } = {}) {
    const queuedRequests = (await readQueuedRequests()).slice(0, limit);
    const processed = [];
    for (const request of queuedRequests) {
      processed.push(await markRequestProviderUnimplemented(request));
    }
    return processed;
  }

  return {
    name: "visualexpression",
    requiredSettings() {
      return ["planned_skill_settings.visualexpression"];
    },
    async getContextBlocks() {
      const memoryContext = await formatVisualMemoryContext();
      return {
        title: "Visual Expression Skill",
        source: "discord-bot/skills/visualexpression.js",
        priority: 8,
        enabled: true,
        content: [
          "Visual expression planning is enabled, but image generation is not wired into chat replies yet.",
          "Do not claim that an image was generated unless a future provider result exists.",
          "Potential future visual output types:",
          asList(settings.output_types).join(", "),
          "",
          "Default style presets:",
          stylePresetSummary(settings),
          "",
          `Provider: ${settings.provider}`,
          `Output folder: ${settings.output_folder}`,
          `Max visuals per reply: ${settings.max_visuals_per_reply}`,
          `Max variants per request: ${settings.max_variants_per_request}`,
          "",
          memoryContext,
        ].join("\n"),
      };
    },
    getStatusHints() {
      return [
        `visual expression provider is planned as ${settings.provider}`,
        `visual outputs available later: ${asList(settings.output_types).join(", ")}`,
      ];
    },
    async handlePipeCommand(command, message) {
      if (command?.kind !== "visual") return false;
      if (command.action === "process") {
        const processed = await processQueuedRequests();
        await safeReply(message, `visual request processor checked ${processed.length} queued request${processed.length === 1 ? "" : "s"}`);
        return true;
      }
      if (command.action === "requests") {
        await safeReply(message, await formatRequestList());
        return true;
      }
      if (command.action === "reviewed") {
        await safeReply(message, await formatReviewedRequestList());
        return true;
      }
      if (command.action === "promoted") {
        await safeReply(message, await formatPromotedRequestList());
        return true;
      }
      if (command.action === "memories") {
        await safeReply(message, await formatVisualMemoryList({ query: command.content }));
        return true;
      }
      if (command.action === "context") {
        const contextText = await formatVisualMemoryContext({ query: command.content });
        await safeReply(message, contextText || (command.content
          ? `no visual memory context found for: ${command.content}`
          : "no visual memory context found"));
        return true;
      }
      if (command.action === "show") {
        await safeReply(message, await formatRequestDetails(command.content));
        return true;
      }
      if (command.action === "note") {
        const { request } = await noteRequest(command.content);
        await safeReply(message, [
          "visual request noted",
          `id: ${request.id}`,
        ].join("\n"));
        return true;
      }
      if (command.action === "review") {
        const { request, review } = await reviewRequest(command.content);
        await safeReply(message, [
          "visual request reviewed",
          `id: ${request.id}`,
          `state: ${review.review_state}`,
        ].join("\n"));
        return true;
      }
      if (command.action === "promote") {
        const { request } = await promoteRequest(command.content);
        await safeReply(message, [
          "visual request marked for promotion",
          `id: ${request.id}`,
          "state: promote_candidate",
        ].join("\n"));
        return true;
      }
      if (command.action === "remember") {
        const { request, memory } = await rememberRequest(command.content);
        await safeReply(message, [
          "visual request remembered",
          `id: ${request.id}`,
          `memory: ${memory.id}`,
        ].join("\n"));
        return true;
      }
      if (command.action === "cancel") {
        const cancelled = await cancelRequest(command.content);
        await safeReply(message, `visual request cancelled\nid: ${cancelled.id}`);
        return true;
      }
      if (command.action === "retry") {
        const retry = await retryRequest(command.content);
        await safeReply(message, [
          "visual request retry queued",
          `id: ${retry.id}`,
          `retry_of: ${retry.result.retry_of}`,
        ].join("\n"));
        return true;
      }
      const request = await queueVisualRequest(command, message);
      await safeReply(message, [
        "visual request queued",
        `id: ${request.id}`,
        `type: ${request.output_type || "auto"}`,
        "generation: not started",
      ].join("\n"));
      return true;
    },
    cancelRequest,
    formatRequestList,
    formatRequestDetails,
    formatReviewedRequestList,
    formatPromotedRequestList,
    formatVisualMemoryList,
    formatVisualMemoryContext,
    noteRequest,
    processQueuedRequests,
    promoteRequest,
    rememberRequest,
    reviewRequest,
    retryRequest,
    onReady() {
      console.log(`Visual expression skill loaded with provider ${settings.provider}. Generation remains planning-only.`);
    },
  };
}
