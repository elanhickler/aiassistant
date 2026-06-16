# aiassistant

Starter project for a multi-agent AI assistant system.

## File Map

* `README.md` : This project overview.
* `settings.jsonc` : Global shared default settings for every agent. Per-agent settings override this file.

* `agents/` : One folder per assistant, bot, or agent identity.

* `discord-bot/` : Shared Discord/OpenRouter runtime code used by agents.
    * `.gitignore` : Keeps local secrets and regenerated dependency folders out of git.
    * `.npmrc` : Prevents npm from writing a root `package-lock.json`.
    * `bot.js` : Shared Discord bot runtime. Uses `AGENT_NAME` to choose an agent folder and defaults to `Stardust`.
    * `context.js` : Builds OpenRouter request context from persona, Memorysummary, recent shortmemory, and enabled skill context blocks.
    * `memory-layers.js` : Manual experimental Memory Layers builder. It writes only `soul/memory-layers/` files and does not affect replies.
    * `memory.js` : Shared shortmemory parsing and formatting helpers.
    * `package.json` : Runtime scripts for installing dependencies, checking syntax, and starting the bot.
    * `skills/` : Core behavior modules plus optional skills loaded through each agent's `enabled_skills` setting.
        * `README.md` : Skills overview.
        * `code.js` : Optional conversational adapter to an external coding command.
        * `discordstatusupdate.js` : Optional status-note skill that updates natural-language status after summarization.
        * `external-command.js` : Shared helper for external-command-backed skills.
        * `file.js` : Optional conversational adapter to an external file-management command.
        * `journal.js` : Core private journal generation system.
        * `music.js` : Optional pipe-command music skill.
        * `placeholders.js` : Registry of planned skills that are documented but not implemented yet.
        * `registry.js` : Central registry for core, optional, and planned skill loading.
        * `runprogram.js` : Optional conversational adapter to an external program runner command with configured app names and aliases.
        * `speak.js` : Optional text-to-speech and voice-training hook skill.
        * `story.js` : Core story generation, recall, and story upload system.
        * `textgen.js` : Optional text remux and style-editing skill.
        * `thought.js` : Core private thought generation system.
        * `time.js` : Core time, sleep, status, and dream system.
        * `vision.js` : Optional image-description skill for attached images.
        * `visualexpression.js` : Optional visual prompt/style guidance and future image planning skill.
* `docs/` : Planning and architecture notes.
    * `code-skill.md` : Interface-neutral coding adapter notes.
    * `file-skill.md` : Interface-neutral file-management adapter notes.
    * `memory-layers.md` : Preserved plan for Memory Layers / Neural Memory, where raw memory, private thoughts, journals, dreams, memory entries, and memorysummary become an inspectable neuron-like memory graph.
    * `runprogram-skill.md` : Interface-neutral program runner adapter notes.
    * `speak-skill.md` : Interface-neutral text-to-speech and voice-training skill notes.
    * `music-skill.md` : Interface-neutral music search and link-formatting skill notes.
    * `vision-skill.md` : Boundary and usage notes for the standalone image-description skill.
    * `visual-expression-plan.md` : Future local-first generated visual expression pipeline for emojis, self-images, scenes, backgrounds, thoughts, and dreams.
    * `visual-expression-intent.md` : Intent rules for deciding when a generated visual is useful.
    * `visual-expression-request.md` : Request object format for future generated visual expressions.
    * `visual-pipe-commands.md` : Planned manual pipe command shape for user-requested local visual expressions.
    * `visual-prompt-assembly.md` : Rules for assembling focused image prompts from selected context.
    * `visual-style-presets.md` : Reusable style presets for emoji, portraits, scenes, backgrounds, thoughts, and dreams.
    * `visual-provider-contract.md` : Provider input, output, error, retry, and path rules for image generation adapters.
    * `visual-privacy-boundary.md` : Rules for what visual tooling may send to providers, web search, or Discord.
    * `visual-output-manifest.md` : Manifest and prompt-note format for completed generated visual expressions.
    * `visual-review.md` : Review notes for judging generated outputs before posting, promotion, or memory.
    * `visual-variants.md` : Variant group rules for exploring alternate versions of the same visual idea.
    * `visual-memory.md` : Compact memory notes for meaningful visuals that should be recallable later.
    * `visual-promotion.md` : Rules for promoting generated visuals into durable `soul/art/` or `soul/emojis/` material.
    * `visual-discord-posting.md` : Rules for posting selected generated visuals back into Discord.
    * `visual-reference-acquisition.md` : Rules for finding and downloading internet visual references.
    * `visual-reference-search.md` : Search log format for internet reference candidates before download.
    * `visual-reference-manifest.md` : Manifest and sidecar note format for downloaded or manually collected visual references.
    * `visual-reference-selection.md` : Rules for choosing relevant references for one visual request.
    * `visual-request-lifecycle.md` : State flow for queued, generating, previewed, saved, promoted, failed, and cancelled visual requests.
    * `visual-retention.md` : Cleanup and retention rules for generated visual experiments and references.
    * `visual-yculth-ui.md` : Future Yculth UI shape for requests, references, outputs, and promotion.
    * `regenerated/` : Generated dependency area, ignored by git.
        * `node_modules/` : Installed npm packages.
        * `package-lock.json` : Exact generated dependency versions.
        * `package.json` : Generated dependency manifest.

* `music-search-website/` : Static human and bot music search workbench.
    * `README.md` : Upload and usage notes.
    * `index.html` : Human-facing browser interface.
    * `styles.css` : Website styling.
    * `app.js` : Browser logic for known-song and vibe link generation.
    * `music-sites.json` : Bot-readable music site registry and URL templates.

## Discord Bot Commands

```powershell
cd C:\Users\argit\Documents\_PROGRAMMING\aiassistant\discord-bot
npm.cmd run install:deps
npm.cmd run check
npm.cmd start
```

To run a different agent later, set `AGENT_NAME` before starting the bot.

```powershell
$env:AGENT_NAME='Stardust'
npm.cmd start
```

## Manual Memory Layers Experiment

Memory Layers are disabled by default and are not used in replies. The current Memory Layers page and builder are now the visual/debug surface for future `neural_memory`, not the active reply memory system. The current framing is semantic downscale and text upscale: raw shortmemory is original-resolution recent text, semantic memory downscales that text into compact memory nodes, and replies, dreams, journals, and stories can later upscale those compact meanings back into rich text. To inspect counts without writing files or calling OpenRouter:

```powershell
cd C:\Users\argit\Documents\_PROGRAMMING\aiassistant\discord-bot
npm.cmd run layerinspect -- --agent Stardust
```

To generate experimental Memory Layers files, enable `memory_layers.enabled` or pass `--force` for one manual build:

```powershell
cd C:\Users\argit\Documents\_PROGRAMMING\aiassistant\discord-bot
npm.cmd run memorylayers -- --agent Stardust --force
```

This reads the selected agent's configured `memory_layers.layer_0_source`, usually `soul/shortmemory.jsonl`, then writes generated files under `soul/memory-layers/`. It can spend OpenRouter tokens because layer-1 scene interpretations are model-generated. New memory nodes prefer `kind`, `compressed`, `upscale_direction`, `do_not_invent`, `confidence`, and `source`, while `summary` remains as a compatibility mirror for older readers. Higher layers are conservative semantic downscales derived from the generated lower layer.

Full semantic downscale is still manual for now. The automatic consciousness cycle refreshes `layer-0.jsonl` from recent shortmemory, but full model-generated downscale still belongs to the manual builder until Yculth visual inspection proves the files help. `memory_layers.use_in_context` must stay false and `neural_memory.mode` must stay `off` by default, so replies do not read Memory Layers or Neural Memory. `neural_memory.mode: debug` writes an inspectable local report under `agents/<Agent>/regenerated/neural-memory-debug/latest-report.md` without adding semantic memory to the reply prompt. Before enabling `on` later, Yculth must be able to preview exactly what neural memory context would be sent to OpenRouter.

To validate the semantic memory node shape without OpenRouter:

```powershell
cd C:\Users\argit\Documents\_PROGRAMMING\aiassistant\discord-bot
npm.cmd run test:semantic-memory
```

The fixture lives in `discord-bot/fixtures/semantic-memory/` and checks `kind`, `compressed`, `upscale_direction`, `do_not_invent`, `confidence`, and `source`.

Old memory does not need automatic migration. Keep `soul/shortmemory.jsonl` as raw recent conversation and `soul/memorysummary.txt` as durable memory until neural memory is proven. Do not dump Memorysummary into `soul/persona.md`; persona should stay identity, personality, voice, preferences, boundaries, and behavior guidance. For a manual migration experiment, preserve backups, run the Memory Layers builder, inspect Yculth Debug Downscale / Debug Upscale Context, and only enable neural memory in replies after inspection.

## Settings

## Agent Identity Rule

* one agent : one soul folder, one Discord application, one bot token, one memory forum.
* shared runtime : `discord-bot/` is only shared code. Agent identity stays in the agent folder.
* agent folder : The character's only local identity folder. It contains persona, memory, status, thoughts, stories, dreams, settings overrides, and secrets.
* Discord application : The character's only Discord account/profile. The avatar and username set in Discord Developer Portal belong to this one agent.

* `settings.jsonc` : Global defaults used by every bot.
* `global-persona.md` : Repo-level generation defaults applied to every agent model request.
* `agents/<AGENT_NAME>/settings.jsonc` : Per-agent overrides only. Arrays replace the global array; objects merge with the global object.
* `agents/<AGENT_NAME>/backups/` : Automatic timestamped backups created before large local overwrites such as persona reloads, memorysummary rewrites, shortmemory rewrites, and trash rewrites.
* required per-agent overrides : `identity` and `memory_forum_channel_id`.
* `model` : Main OpenRouter model used for character replies and creative writing.
* `utility_model` : Free or cheap OpenRouter model used for small structured decisions like status inference and whether sleep should create a dream.
* `identity.mention_role_ids` : Optional Discord role IDs that count as targeting that agent inside pipe commands.
* `global_persona_file` : Repo-level generation defaults applied to every agent model request.
* `intent_triggers` : Cheap local trigger words that decide whether a skill is allowed to spend tokens on an AI intent check. For example, music intent only checks OpenRouter when a message contains a configured music trigger.
* `recent_context_entries` : Number of recent shortmemory/live conversation entries sent as hidden context on normal replies. This affects recall, cost, and reply speed, but not how much shortmemory is saved locally.
* `shortmemory_trash.keep_auto_summary_cycles` : Number of successful scheduled automatic memory cycles to keep trashed shortmemory entries before cleanup deletes them. This is cycle-based, not calendar-date-based, so a bad system clock cannot instantly erase trash.
* `consciousness_cycle.seconds_per_message` and `consciousness_cycle.cycle_hours` : Estimate how many meaningful memory entries equal one day of interaction. The default is `24 * 60 * 60 / 300 = 288` entries.
* `daily_memory_cycle.automatic_cycle_hours` : Bot runtime hours between backup consciousness-cycle checks. The actual cycle still runs only when enough new memory entries accumulated.
* `consciousness.cleanup.backup_retention_days` : Calendar days to keep overwrite backups before they are eligible for cleanup. The default is `7`.
* `consciousness.cleanup.move_expired_backups_to_os_trash` : When true, expired backups are moved to the operating system trash / Windows Recycle Bin. If OS trash fails, backups are left untouched.
* `consciousness.cleanup.permanently_delete_expired_backups` : Dangerous override for permanent deletion of expired backups. The default is false; cleanup does not permanently delete unless this is explicitly enabled.
* `memory_layers` : Disabled experimental Memory Layers / Neural Memory settings. Layer 0 is raw/original-resolution recent text derived from shortmemory; higher layers become semantic downscales such as scene interpretation, story/session memory nodes, emotional arcs, and durable truths beside the current memory system. This is the visual/debug surface for future `neural_memory`.
* Memory Layers routing : thoughts feed stories; journals feed dreams. Private thoughts and durable journals live under `soul/consciousness/`, but current reply behavior does not use neural memory layers yet.
* consciousness loop direction : `shortmemory` is raw recent reply context, thoughts are private first-person internal monologue generated every reply, `neural_memory` is the large semantic downscale graph, journal is durable daily first-person emotional reflection, dream is mandatory daily symbolic/emotional artifact, and memorysummary is the compact active durable memory update.
* `consciousness_descriptors` : Human-editable artifact definitions for thought, journal, dream, dreamjournal, story, memory, memorysummary, neural memory, and reply behavior.
* `thought_influence_scale` : Human-editable numeric interpretation scale for future thought influence settings. This is a scale descriptor, not a separate thought-usage system.
* thought influence controls : `journal`, `dream`, `story`, and `memorysummary_update` each have `use_thoughts` and `thought_influence`. When `use_thoughts` is false, that process does not read private thoughts. When true, the model receives the influence number plus `thought_influence_scale` and interpolates naturally between scale points.
* `conversation_history_limit` : Deprecated compatibility fallback. Prefer `recent_context_entries`.
* `control_user_ids` : Discord user IDs allowed to run slash-command control actions. If blank, everyone can run slash-command controls.
* `skill_aliases` : Global/local pipe command aliases. For example, the canonical `image:` command can also be called `imagegen:`, or an agent can override it to `paint:`.
* common per-agent overrides : optional `enabled_skills`, Discord thread IDs, reply channel IDs, and skill-specific thread IDs such as `music_skill.music_thread_id`.

## Discord Slash Commands

Slash commands are control actions. Only users listed in `control_user_ids` can run them.

* `/reloadpersona` : Reloads the agent persona. If `persona_source_thread_id` is set, it grabs message text from that Discord forum post/thread into `soul/persona.md` first.
* `/clearshortmemory` : Clears the agent's `soul/shortmemory.jsonl` file, clears the live recent context held by the running bot process, and deletes bot-written `shortmemory:` entries from the Discord shortmemory forum post.
* `/setupmemoryforum` : Populates the agent's Discord memory forum with core memory posts plus posts for enabled implemented skills. `memory_forum_channel_id` is required; the bot errors at startup if it is blank. The bot must be able to view and send messages in that forum.
* `/raw` : Shows the latest OpenRouter message text uploaded by the agent. Large raw prompts are sent as a private text file attachment.
* `/syncshortmemory direction` : Syncs shortmemory between local `soul/shortmemory.jsonl` and the Discord shortmemory forum post. Direction can be `both`, `local to discord`, or `discord to local`.
* `/scrapeshortmemory channel_id` : Reads all available message pages from a channel, anchors at the agent's latest reply when one exists, appends new entries to shortmemory, dedupes, and rewrites local shortmemory in timestamp order.
* `/scrapedmshortmemory` : Reads all available DM message pages with the command user, anchors at the agent's latest DM reply when one exists, appends new entries to shortmemory, dedupes, and rewrites local shortmemory in timestamp order.
* `/uploadstory filename` : Story command that uploads a local Markdown file from `soul/stories/` to the Discord `stories` memory forum post. `.md` is assumed if omitted, and long stories are split across multiple replies.
* `❌ delete reaction` : React to a bot reply with `:x:` to delete that reply and remove its matching assistant entry from local and Discord shortmemory.
* `🔁 redo reaction` : React to a bot reply with `:repeat:` to delete that reply from memory and generate a fresh answer to the previous user message.
* `⏪ rewind reaction` : React to a bot reply with `:rewind:` to delete that bot reply, remove that one assistant shortmemory entry, and remove the previous user message from shortmemory only. It does not delete the user's Discord message.
* `▶️ continue reaction` : React to a bot reply with `:arrow_forward:` to continue from the current scene without adding a pipe command to shortmemory.
* `🎵 music reaction` : React to a bot reply with `:musical_note:` to run the music skill from recent shortmemory and post a formatted music link.

## Pipe Text

* `||@agent reply||` : Has the agent continue the story from recent context. In DMs, `@agent` is optional.
* `||@agent continue||` : Has the agent continue the story from recent context without adding the command itself to shortmemory. In DMs, `@agent` is optional.
* `||@agent continue: instructions||` : Has the agent continue with one-time instructions. The command itself is not added to shortmemory.
* direct agent control : Natural text like `AgentName is...`, `AgentName has...`, or `AgentName does...` is treated as authoritative roleplay direction for that agent, similar to a softer in-scene adjustment.
* `normal text ||@agent subtext: private text||` : Inline private subtext lets you communicate assumptions and quick persona adjustments. It is not spoken text to quote or answer directly, and it may be loosely stored later by memory updates. In DMs, `@agent` is optional.
* `||@agent adjust: adjustment instructions||` : Redoes the previous bot reply with adjustment instructions. The bot deletes the old reply, removes that assistant shortmemory entry, and writes a replacement reply to the original user message.
* `||@agent summarize||` : Summarizes recent shortmemory plus useful thoughts, journals, dreams, stories, and neural memory into compact `soul/memorysummary.txt`, posts a Memorysummary preview, clears temporary thought files after backing them up, and cleans adjustment audit messages. In DMs, `@agent` is optional.
* `||@agent thought: thought prompt||` : Writes a first-person internal thought from the prompt, shortmemory, Memorysummary, and recent thoughts. Thoughts are softer than memory and can support end-of-day memory work, stories, and dreams.
* `||@agent journal||` : Writes a private first-person journal entry from recent shortmemory, saved thoughts, neural memory if available, and Memorysummary. The journal is saved locally and only a temporary `journal saved` confirmation is posted.
* `||@agent journal: instructions||` : Writes a private first-person journal entry using the journal descriptor plus one-time instructions.
* `||@agent emoji||` : Posts one image from `soul/emojis/` based on mood, status, recent context, and natural-language filename meaning. In DMs, `@agent` is optional.
* `||@agent emoji: text||` : Posts one emoji image using extra one-time mood or context guidance.
* `||@agent story||` : Story command that writes a first-person evidence-grounded short story from saved stories, recent shortmemory, thoughts, journals, neural memory if present, and Memorysummary, then saves it in `soul/stories/` and posts it to the `stories` memory forum post. In DMs, `@agent` is optional.
* `||@agent story: story prompt||` : Story command that searches saved stories, shortmemory, thoughts, journals, neural memory if present, and Memorysummary for the requested subject, then writes only what the evidence supports. Mentions of creativity, realism, poetic style, scientific detail, chaos, or numeric style values are treated as one-time natural-language guidance.
* story recall : Normal messages that ask about saved stories search `soul/stories/`, combine that with shortmemory and Memorysummary context, and let the agent answer with a focused summary or explanation without inventing unsupported details.
* natural music intent : If `music` is enabled and a message matches `intent_triggers.music`, the bot asks a small AI intent question. If the answer says the user wants music now, it posts a formatted music link instead of a normal reply.
* `||@agent music||` : Optional `music` skill. Infers the latest music request from shortmemory, posts a formatted music link, and archives it to the configured music thread. The `:musical_note:` reaction does the same thing without needing command text. In DMs, `@agent` is optional.
* `||@agent music: description or link||` : Optional `music` skill with direct input. Can use a music description, a specific music link, or `Artist - Song | https://...`.
* `||@agent textgen: instructions: text here||` : Optional `textgen` skill. Its first mode is `remux`, meaning intent-preserving text transformation from one expressive register to another. Use it for NSFW to SFW, NSFW to another NSFW register, blunt notes to polished prose, raw RP to cleaner dialogue, or explicit text to implication/metaphor.
* `||@agent textgen: remux this for public Discord: text here||` : Example remux command.
* `||@agent textgen: use sfw-discord: text here||` : Example remux command using a named editable style preset.
* `||@agent textgen: make this more poetic, still NSFW: text here||` : Example remux command using natural-language style direction.
* `||@agent sleep||` : Sets `soul/status.json` mode to `sleeping`.
* `||@agent wake||` : Sets `soul/status.json` mode to `awake`.
* `||@agent away||` : Sets `soul/status.json` mode to `away`; normal replies are blocked until status changes.
* `||@agent state||` : Shows the raw state mode, energy, and current activity.
* `||@agent status||` : Generates a natural-language status update from memory and current state.
* `||@agent status: text||` : Generates a natural-language status update using text as the basis or suggested status.
* `||@agent passtimeminutes: 60||` : Queues explicit experienced time for the agent before their next reply and updates energy when sleeping or dreaming. Extra text after the number describes interruptions or restful conditions.
* `||@agent passtimehours: 8||` : Queues explicit experienced time in hours for longer sleep or dream gaps. Extra text after the number can make `utility_model` adjust sleep remaining, such as loud noises waking the agent sooner.
* `||@agent dream: dream seed text||` : Generates one first-person dream from memory, thoughts, journals, previous dreams, and the seed text. In DMs, `@agent` is optional. This requires status mode `sleeping`. Mentions of chaos, creativity, realism, symbolism, or numeric style values are treated as one-time natural-language guidance.
* `||@agent dream||` : Generates an automatic first-person dream from context, thoughts, journals, and previous dreams. In DMs, `@agent` is optional. This requires status mode `sleeping`.
* `||@agent dreamjournal||` : Interprets the latest saved dream and saves a private dream journal under `soul/consciousness/dream-journals/`. It does not create a new dream.
* `||@agent dreamjournal: focus text||` : Interprets the latest saved dream with extra focus instructions, such as what the dream says about a person or relationship.
* `dream_journal.auto_enabled` : If true, successful dream generation automatically creates a dream journal from the saved dream file. If false, dream journals are only created by `||@agent dreamjournal||`.
* `dream_journal.read_limits` : Bounded lane limits for dreamjournal context. It controls recent shortmemory, thoughts, journals, stories, previous dream journals, memory entries, neural memory nodes, and origin summary inclusion so dreamjournal never reads an unlimited archive into one request.
* automatic status inference : The core time system can update `soul/status.json` after normal replies when the latest exchange clearly implies sleep, waking, dreaming, away, or another state. It keeps the current state when clues are weak or metaphorical.
* natural time inference : Before normal replies, the core time system can ask `utility_model` whether the latest roleplay message clearly implies time passed, such as showering, cooking, travel, later, next morning, or days later. High-confidence guesses update `soul/status.json` fields like `current_datetime`, `last_time_passed_minutes`, `last_time_passed_reason`, and `total_experienced_minutes`, then the elapsed time is included as hidden context for the reply.
* natural sleep disturbance : While status is `sleeping`, incoming natural-language messages are checked by `utility_model` before normal replies. Quiet or irrelevant messages can be ignored, interruptions can adjust `sleep_remaining_minutes`, and wake events can switch status to `awake` before the main reply model answers.

## Textgen And Remux

* `textgen` : Optional text generation skill in the `imagegen / videogen / textgen` naming scheme.
* `remux` : First mode inside `textgen`. It keeps the same intent while changing the language container, tone, safety level, or prose style.
* skill name : `textgen` is the skill name. `remux` is not a separate skill name unless a deliberate alias is added later.
* style presets : Human-editable JSONC files under `textgen_skill.styles_folder`, like imagegen styles. The selected style tells remux what to preserve, what to change, what to avoid, and what output shape to produce.
* history : Optional dated JSONL files under `textgen_skill.history_folder`, useful as examples, training material, and debugging notes.
* example : `||@agent textgen: remux this for public Discord: text here||`
* example : `||@agent textgen: use sfw-discord: text here||`
* example : `||@agent textgen: make this more poetic, still NSFW: text here||`
* style editing : The same `textgen:` command can create, adjust, rename, and delete style presets through natural language.
* style example : `||@agent textgen: create a style called gothic-innuendo that makes explicit text sound like vampire romance||`
* style example : `||@agent textgen: adjust sfw-discord to keep more flirtation||`
* style example : `||@agent textgen: rename dirty-talk-cleanup to explicit-polish||`
* style example : `||@agent textgen: delete explicit-polish||`
* core lifecycle : Sleep, dream, and summarize are core runtime lifecycle systems, not optional skills.

## Error Messages

* Slash command errors : Ephemeral Discord replies where Discord supports them.
* DM and normal message errors : Temporary bot replies that auto-delete after 30 seconds.

## Agent Secrets

Each agent keeps its own secrets under `agents/<AGENT_NAME>/secrets/`.

## Context Assembly

Each normal reply sends an assembled OpenRouter request instead of only `soul/persona.md`.

* `soul/persona.md` : Identity and behavior anchor.
* `global-persona.md` : Shared behavior/style defaults used by replies, dreams, journals, stories, memorysummary updates, status updates, and text transformation.
* `soul/origin.md` : Optional full lore dump for origin/backstory material. On startup, the bot mirrors non-empty text from the Discord `origin` memory post into this file. This is editable source material and is not sent in every model request.
* `soul/origin_summary.md` : Optional compact origin summary generated from `soul/origin.md`. If present and non-empty, it is sent as hidden `Origin Summary` context.
* `soul/memorysummary.txt` : Durable compact memory sent as hidden context when present. It uses explicit `# Past`, `# Present`, and `# Future / Plans` sections.
* `soul/shortmemory.jsonl` : Recent local shortmemory lines sent as hidden context.
* `soul/consciousness/thoughts/` : Private first-person thought files created by `||@agent thought: ...||` and automatic pre-reply thought generation. They are interpretations and emotional reflections, less stable than shortmemory, not posted publicly, and useful for stories, dreams, and end-of-day memory work. Thoughts are temporary and are cleared after a successful memory cycle backs them up and absorbs useful material into memory entries and memorysummary.
* `soul/consciousness/journals/` : Durable first-person emotional journal files created by `||@agent journal||` and future daily cycles. Journals are private local memory, are not dumped into chat, are not cleared by ordinary memory cleanup, and are intended to feed dreams and memory updates later.
* `soul/consciousness/dream-journals/` : Durable private interpretations of existing dreams. Dream journals analyze meaning and support later memory work; they do not create new dream events.
* automatic thoughts : Generated visible replies first create a private first-person thought and save it silently. These thoughts are temporary and are cleared only after successful summarization has a chance to absorb useful material.
* `soul/raw/` : Latest OpenRouter request split into readable text parts. This is the canonical raw inspection surface.
* `soul/raw.txt` : Concatenated compatibility copy of the latest `soul/raw/` parts for slash-command download and older tools.
* `soul/trash/shortmemory-trash.jsonl` : Recoverable user-curated trash for shortmemory entries. Trashed entries are not sent to OpenRouter, memory updates, story recall, or dreams.
* `shortmemory` Discord forum post : Mirrored shortmemory authority when available. If `shortmemory_thread_id` is blank, the bot finds this post from the memory forum.
* `help` Discord forum post : Clean command reference for slash commands, pipe commands, and delete reaction behavior.
* `Memorysummary` Discord forum post : Receives a latest Memorysummary preview/notice from `||@agent summarize||`. The full memory is only stored in the local txt file because Discord posts have text limits.
* `adjustments` Discord forum post : Receives an audit entry whenever `||@agent adjust: ...||` replaces a reply.
* `status` Discord forum post : Receives a status dump whenever status changes, including AI-inferred status changes.
* `discord_status_update` : Controls which enabled skills may provide optional hints for natural-language status text after summarization. Unknown or unavailable skill names are ignored.
* `seconds_before_reply` : Tupper/delete-race hack. The bot waits this many seconds before a normal OpenRouter reply, re-checks that the source message still exists, and skips the model call if the message was deleted.
* `summarization_settings.summary_policy` : Summarization guidance. Remember durable per-user context when it improves future replies, but do not save every passing detail. Memorysummary keeps `# Past`, `# Present`, and `# Future / Plans`.
* `origin_summary_settings.summary_policy` : Origin summary guidance. This controls how `soul/origin.md` becomes `soul/origin_summary.md`, with more emphasis on memorable lore, triggers, voice anchors, and roleplay hooks.
* `natural_time_settings` : Controls natural roleplay time inference before normal replies. `minimum_confidence` prevents weak guesses, `vague_max_minutes` caps loose phrases like later, and `explicit_max_minutes` caps direct phrases like three days later.
* `agent_time_debug` : Visible reply header for tuning roleplay time. Leave it off for normal roleplay; when enabled, generated model replies start with current in-game time, how much time advanced, and optionally the reason. Command replies, errors, music links, and dream links do not use the header.
* `summarization_settings.daily_summary_entries` : Number of recent shortmemory entries used for the daily sleep/dream memory pass. This can be much higher than `recent_context_entries` because it is meant to run about once per sleep cycle, not on every reply.
* `summarization_settings.summarize_on_sleep` : If true, entering sleep runs daily summarization quietly as part of the sleep/dream memory cycle.
* automatic consciousness cycle : Runs when user interaction has added about `consciousness_cycle.cycle_hours * 60 * 60 / consciousness_cycle.seconds_per_message` new memory entries since the last cycle. The default target is 288 entries. The cycle refreshes neural memory layer 0, generates a journal, generates a dream, updates Memorysummary from shortmemory plus useful thoughts, journals, dreams, stories, and neural memory, backs up and clears temporary thoughts, then ages shortmemory trash. Journals, dreams, stories, and Memorysummary persist.
* backup cleanup : After successful memory maintenance, only old files directly under `agents/<AGENT_NAME>/backups/` are eligible for cleanup. Active soul files, persona, origin, settings, shortmemory, memorysummary, memory entries, journals, dreams, dream journals, stories, and neural memory files are never cleanup targets.
* cycle order : refresh `soul/memory-layers/layer-0.jsonl`, generate journal, generate dream, update Memorysummary summary, back up thoughts, clear temporary thoughts.
* automatic Discord status update : When `discordstatusupdate` is enabled, successful summarization writes a concise human-readable status into `soul/status.json` and mirrors it to the `status` Discord forum post.
* `dream_settings` : Controls the dream part of the core time system. `||@agent dream||` requires `soul/status.json` mode `sleeping`, reads configured source files, thoughts, journals, previous dreams, neural memory files if present, and `soul/dream_summary.md`, writes a dream draft into `soul/dreams`, and lets summarization later decide what dream material belongs in Memorysummary. Extra chaos, creativity, realism, symbolism, or style should be expressed as natural-language dream command instructions rather than global settings.
* `||@agent passtimeminutes: 60||` : Adds a one-shot hidden time passage block to the next normal reply.
* `||@agent passtimehours: 8||` : Adds a longer one-shot hidden time passage block to the next normal reply.
* sleep timer : When status changes to `sleeping`, `utility_model` estimates `sleep_planned_minutes` and stores `sleep_remaining_minutes` in `soul/status.json`. Passing time counts that value down. Extra pass-time context can adjust the timer; interruptions reduce it faster, restful protection can extend it. If it reaches zero or below, status becomes `awake` and `woke_minutes_ago` records how long ago the agent woke.
* natural roleplay time : Normal messages may also advance experienced time when the wording strongly implies it. Vague guesses are capped conservatively; explicit phrases like `three hours later` can move time farther. Explicit pipe pass-time commands remain the reliable manual override.
* `enabled_skills` : Optional implemented skills may contribute small context blocks. Journal, story, thought, and time are core systems and always loaded.
* `code_skill` : Settings for the optional coding adapter skill. Discord can call it through `code:`, but the external command hook is meant to be reusable from local or website interfaces too.
* `file_skill` : Settings for the optional file-management adapter skill. Discord can call it through `file:`, but the external command hook is meant to be reusable from local or website interfaces too.
* `runprogram_skill` : Settings for the optional program runner adapter skill. Discord can call it through `runprogram:`, but the hook is meant to be reusable from Yculth, local apps, or website interfaces too. `runprogram_skill.apps` maps app names and aliases to launch/control command details for the external runner.
* `textgen_skill` : Settings for the optional text generation skill in the `imagegen / videogen / textgen` naming scheme. `remux` is the first mode inside textgen, not a separate skill name. `default_style` chooses the remux preset when no style is named, `styles_folder` stores human-editable style JSONC files, `history_folder` stores dated remux history JSONL files, and `save_history` controls local history logging.
* `speak_skill` : Settings for the optional TTS and voice-training skill. Discord can call it through `speak:`, but the skill is meant to be reusable from local or website interfaces too.
* `music_skill` : Settings for the optional music search skill. Discord can call it through `music:`, but the skill exposes hooks for local or website interfaces too.
* `vision_skill` : Settings for the optional standalone image-description skill. Vision descriptions are uncertain observations and do not train image generation by themselves.
* `soul/status.json` : Current agent state used by core replies and status-aware skills. `mode` is the primary state; `status` contains boolean flags. Current modes are `awake`, `sleepy`, `sleeping`, `dreaming`, and `away`. `away` blocks normal replies.
* `soul/dreams/` : Dream output folder used by the pipe dream command.
* `soul/dream_summary.md` : Compact summary of recurring dream symbols, fears, wishes, settings, and motifs. It is dream memory, not factual waking memory.
* `soul/stories/` : Story output folder used by `||@agent story||`. Story generation and recall search `.md` and `.txt` files here, then combine relevant story text with shortmemory, thoughts, journals, neural memory files if present, and Memorysummary as evidence. Extra creativity, realism, scientific detail, chaos, or style should be expressed as natural-language story command instructions rather than global settings.
* `soul/art/` : Placeholder content folder for future art context.
* `soul/emojis/` : Emoji image folder used by `||@agent emoji||`. Filenames are interpreted naturally and cross-referenced with mood/status when choosing which image to post.
* `planned_skill_settings.tts` : Older placeholder for normal expressive voice output. Use `speak_skill` for implemented runtime TTS and voice-training hooks.
* `planned_skill_settings.musiccomposition` : Placeholder for future music composition.
* `planned_skill_settings.videogeneration` : Placeholder for future video generation.
* `planned_skill_settings.visualexpression` : Placeholder settings for future AI-chosen generated visuals. The public Discord-facing workflow is `||@agent image: text||`, which records natural-language prompt/style critique for future image prompts. The intended outputs are emojis, self-images, scenes, backgrounds, thoughts, and dreams. Yculth imagegen is the intended local-first generation surface; Discord posting behavior is not implemented yet.
* `soul/visual-references/` : Future folder for downloaded or manually collected visual references. Keep source and attribution notes beside internet downloads; generated outputs belong in `regenerated/visualexpression/`.
* visual promotion : Generated visuals stay in `regenerated/visualexpression/` until the user promotes them into `soul/art/` or `soul/emojis/`.

## Memory Maintenance Flow

Summarization is core memory infrastructure, not an optional skill.

* `||@agent summarize||` : Summarize recent shortmemory plus useful thoughts, journals, dreams, stories, neural memory, and adjustment history into `soul/memorysummary.txt`, then back up and clear temporary thoughts and clean adjustment audit messages.
* review memory result : Check that useful adjustment lessons made it into memory entries and memorysummary.
