# AGENT

Instructions for using this repository as a reusable Discord chatbot template.

## Purpose

This repository contains a shared Discord/OpenRouter bot runtime plus per-agent folders. To create a custom chatbot, make a new folder under `agents/`, give it its own settings, persona, memory files, and secrets, then start the shared runtime with `AGENT_NAME` set to that folder name.

## Agent Identity Rule

* one agent : one soul folder, one Discord application, one bot token, one memory forum.
* shared runtime : `discord-bot/` is only shared code. Agent identity stays in the agent folder.
* agent folder : The character's only local identity folder. It contains persona, memory, status, thoughts, stories, dreams, settings overrides, and secrets.
* Discord application : The character's only Discord account/profile. The avatar and username set in Discord Developer Portal belong to this one agent.

## Create A New Agent

* Copy an existing agent folder into `agents/<YourAgentName>/`.
* Edit `agents/<YourAgentName>/settings.jsonc` for only that agent's overrides.
* Edit root `settings.jsonc` only when a default should apply to every agent.
* Edit root `global-persona.md` only when a generation default should apply to every agent and every model-written artifact.
* Edit `agents/<YourAgentName>/soul/persona.md`.
* Keep local secrets in `agents/<YourAgentName>/secrets/`.
* Keep automatic overwrite backups in `agents/<YourAgentName>/backups/`.
* Keep durable character memory and creative files in `agents/<YourAgentName>/soul/`.
* Keep `soul/shortmemory.jsonl` inside the agent folder.
* Read `docs/memory-layers.md` before changing the memory architecture. It preserves the Memory Layers / Neural Memory direction, but neural memory is not active runtime behavior yet.

## Required Discord Setup

* Create a Discord application in the Discord Developer Portal.
* Add a bot to that Discord application.
* Copy the Discord app token from Developer Portal > app > Bot > Token.
* Paste only the raw token into `agents/<YourAgentName>/secrets/discord_token.txt`.
* Enable Message Content Intent for the Discord app.
* Invite the bot to the server where it should run.
* Create a Discord forum channel for the agent's memory.
* Copy that forum channel ID into `memory_forum_channel_id`.
* Run `/setupmemoryforum` after the bot starts to populate memory forum posts.

## Required OpenRouter Setup

* Put the OpenRouter API key in `agents/<YourAgentName>/secrets/openrouter_api_key.txt`.
* Set the OpenRouter model string in root `settings.jsonc`, or override it in `agents/<YourAgentName>/settings.jsonc`.
* Keep API keys out of readmes, logs, screenshots, and public commits.

## Agent Settings

Settings are loaded from root `settings.jsonc` first, then merged with `agents/<YourAgentName>/settings.jsonc`. Objects merge; arrays replace the global array. Keep agent files small and only put actual differences there.

* `identity` : The bot's name, unique ID, nicknames, and optional mention role IDs.
* `identity.mention_role_ids` : Optional Discord role IDs that count as targeting this agent inside pipe commands.
* `enabled_skills` : Optional implemented skills to load. Journal, story, thought, and time are core systems and always loaded.
* `skill_aliases` : Pipe command aliases for canonical skills or commands. This can be overridden per agent, for example to let `image:` also be called `paint:`.
* `code_skill` : Settings for the optional coding adapter skill. The configured command owns real code operations.
* `file_skill` : Settings for the optional file-management adapter skill. The configured command owns real file operations.
* `music_skill` : Settings for the optional music search and link-formatting skill. Provider/search hooks should stay reusable outside Discord.
* `speak_skill` : Settings for the optional text-to-speech and voice-training skill. Provider hooks should stay reusable outside Discord.
* `discord_status_update.source_skills` : Optional enabled skills allowed to provide hints for natural-language status notes after summarization. Unknown or unavailable skills are ignored.
* `vision_skill` : Settings for the optional standalone image-description skill. Vision descriptions are uncertain observations and should not be treated as durable truth without user confirmation.
* `global_persona_file` : Repo-level generation defaults applied to every agent model request.
* `use_memory_forum_persona_source` : If true, the bot can load persona from the memory forum `persona` post when no explicit persona source thread is set. If false, the bot uses the local persona file.
* `model` : Main OpenRouter model used for character replies and creative writing.
* `utility_model` : Free or cheap OpenRouter model used for small structured decisions like status inference and whether sleep should create a dream.
* `system_prompt_file` : Usually `soul/persona.md`.
* `memory_forum_channel_id` : Required Discord forum channel ID for memory posts.
* `memory_forum_posts` : Core memory post names created by `/setupmemoryforum`, including `help` for a clean command reference and `origin` for full editable origin/lore source material.
* `intent_triggers` : Cheap local trigger words that decide whether a skill may spend tokens on an AI intent check.
* `location_reply_policy` : Ambient reply zones where the bot may reply without being directly mentioned or named. Direct `@agent` mentions and name calls can reply outside these lists unless blocked by do-not-reply lists.
* `location_reply_policy.only_allow_replies_to_specific_channels` : If true, the bot only replies inside listed channels, listed servers, or DMs. If false, direct mentions and name calls can reply outside ambient zones.
* `user_reply_policy` : Users the bot can or cannot reply to.
* `control_user_ids` : Discord user IDs allowed to run slash-command control actions. If blank, everyone can run slash-command controls.
* `bot_reply_policy` : Other bot IDs this bot is allowed to reply to.
* `recent_context_entries` : Number of recent shortmemory/live conversation entries sent as hidden model context for normal replies.
* `summarization_settings.daily_summary_entries` : Number of recent shortmemory entries read during the larger daily sleep/dream memory pass.
* `shortmemory_trash.keep_auto_summary_cycles` : Number of scheduled automatic memory cycles to keep trashed shortmemory entries before cleanup deletes them.
* `consciousness_cycle.seconds_per_message` and `consciousness_cycle.cycle_hours` : Estimate how many meaningful memory entries equal one day of interaction. The default is `24 * 60 * 60 / 300 = 288` entries.
* `daily_memory_cycle.automatic_cycle_hours` : Bot runtime hours between backup consciousness-cycle checks. The actual cycle still runs only when enough new memory entries accumulated.
* `consciousness.cleanup.backup_retention_days` : Calendar days to keep overwrite backups before they are eligible for cleanup. The default is `7`.
* `consciousness.cleanup.move_expired_backups_to_os_trash` : When true, expired backups are moved to the operating system trash / Windows Recycle Bin. If OS trash fails, backups are left untouched.
* `consciousness.cleanup.permanently_delete_expired_backups` : Dangerous override for permanent deletion of expired backups. The default is false; cleanup does not permanently delete unless this is explicitly enabled.
* `memory_layers` : Disabled experimental Memory Layers / Neural Memory settings. Read `docs/memory-layers.md` before changing this system.
* Memory Layers routing : thoughts feed stories; journals feed dreams. Private thoughts and durable journals live under `soul/consciousness/`, but current reply behavior does not use neural memory layers yet.
* consciousness loop direction : `shortmemory` is raw recent reply context, thoughts are private first-person internal monologue generated every reply, `neural_memory` is the large semantic downscale graph, journal is durable daily first-person emotional reflection, dream is mandatory daily symbolic/emotional artifact, and memorysummary is the compact active durable memory update.
* `consciousness_descriptors` : Human-editable artifact definitions for thought, journal, dream, dreamjournal, story, memory, memorysummary, neural memory, and reply behavior.
* `thought_influence_scale` : Human-editable numeric interpretation scale for future thought influence settings. This is a scale descriptor, not a separate thought-usage system.
* thought influence controls : `journal`, `dream`, `story`, and `memorysummary_update` each have `use_thoughts` and `thought_influence`. When `use_thoughts` is false, that process does not read private thoughts. When true, the model receives the influence number plus `thought_influence_scale` and interpolates naturally between scale points.
* `natural_time_settings` : Controls natural roleplay time inference. Keep this conservative; explicit pass-time pipe commands are still the reliable manual override.
* `agent_time_debug` : Visible reply header for tuning roleplay time. Leave it off unless you want the bot to show in-game time and latest advanced duration at the start of generated model replies.
* `seconds_before_reply` : Tupper/delete-race hack. Wait this many seconds before normal OpenRouter replies and skip if the source message vanished.
* `chaos` : OpenRouter temperature; higher is looser, lower is steadier.
* `max_tokens` : Maximum generated output tokens.
* `discord_reply_character_limit` : Maximum Discord reply characters before truncation.

## Persona And Memory

* `soul/persona.md` : Identity, voice, preferences, boundaries, and behavior guidance.
* `global-persona.md` : Shared behavior/style defaults used by replies, dreams, journals, stories, memorysummary updates, status updates, and text transformation.
* `backups/` : Automatic timestamped backups created before large local overwrites such as persona reloads, memorysummary rewrites, and shortmemory rewrites.
* `soul/origin.md` : Optional full lore dump for origin/backstory material. On startup, the bot mirrors non-empty text from the Discord `origin` memory post into this file. This is editable source material and is not sent in every model request.
* `soul/origin_summary.md` : Optional compact origin summary generated from `soul/origin.md`. If present and non-empty, it is sent as hidden `Origin Summary` context.
* `soul/memorysummary.txt` : Compact durable memory sent as hidden context. It should keep `# Past`, `# Present`, and `# Future / Plans` sections.
* `soul/shortmemory.jsonl` : Recent local shortmemory cache and fallback.
* `soul/raw/` : Latest OpenRouter request split into readable text parts for inspection.
* `soul/raw.txt` : Concatenated compatibility copy of the latest raw parts.
* `soul/trash/shortmemory-trash.jsonl` : Recoverable local trash for shortmemory entries. It is ignored by reply context and memory updates, then aged by scheduled automatic memory cycles.
* `soul/art/` : Placeholder folder for future art context.
* `soul/dreams/` : Dream output folder used by the pipe dream command.
* `soul/dream_summary.md` : Compact dream memory for recurring symbols, fears, wishes, and motifs. It is not factual waking memory.
* `soul/emojis/` : Emoji image folder used by `||@agent emoji||`. Filenames are interpreted naturally and cross-referenced with mood/status when choosing which image to post.
* `soul/visual-references/` : Future folder for downloaded or manually collected visual references. Store source and attribution notes beside internet downloads.
* `soul/stories/` : Story output folder used by `||@agent story||`.
* `soul/consciousness/thoughts/` : Private first-person thought files. Thoughts are softer than shortmemory, are not posted publicly, and support stories, dreams, and end-of-day memory work. They are temporary and are backed up, then cleared after a successful memory cycle.
* `soul/consciousness/journals/` : Durable first-person emotional journal files. Journals are not cleared by ordinary memory cleanup and are intended to feed dreams and memory updates later.
* `soul/consciousness/dream-journals/` : Durable private interpretations of existing dreams. Dream journals analyze meaning and support later memory work; they do not create new dream events.
* automatic thoughts : Generated visible replies first create a private first-person thought and save it silently. These thoughts are temporary and are cleared only after successful summarization has a chance to absorb useful material.
* `soul/status.json` : Current agent state used by core replies and status-aware skills. Current modes are `awake`, `sleepy`, `sleeping`, `dreaming`, and `away`.

## Runtime Commands

```powershell
cd C:\Users\argit\Documents\_PROGRAMMING\aiassistant\discord-bot
$env:AGENT_NAME='<YourAgentName>'
npm.cmd run install:deps
npm.cmd run check
npm.cmd start
```

## Manual Memory Layers Experiment

Memory Layers are experimental and disabled by default. They do not affect replies unless future context settings explicitly enable that. Treat the current Memory Layers UI and builder as the visual/debug surface for future `neural_memory`.

The current framing is semantic downscale and text upscale. Raw shortmemory is original-resolution recent text. Semantic memory downscales that text into compact memory nodes. Replies, dreams, journals, and stories can later upscale those compact meanings back into rich text.

To inspect counts without writing files or calling OpenRouter:

```powershell
cd C:\Users\argit\Documents\_PROGRAMMING\aiassistant\discord-bot
npm.cmd run layerinspect -- --agent <YourAgentName>
```

To generate sidecar Memory Layers files, enable `memory_layers.enabled` or pass `--force` for one manual build:

```powershell
cd C:\Users\argit\Documents\_PROGRAMMING\aiassistant\discord-bot
npm.cmd run memorylayers -- --agent <YourAgentName> --force
```

The tool reads the configured `memory_layers.layer_0_source`, usually `soul/shortmemory.jsonl`, and writes only under `soul/memory-layers/`. It can spend OpenRouter tokens because it asks the utility model to write layer-1 scene interpretations. New memory nodes prefer `kind`, `compressed`, `upscale_direction`, `do_not_invent`, `confidence`, and `source`, while `summary` remains as a compatibility mirror for older readers. Higher layers are conservative semantic downscales derived from the generated lower layer.

Full semantic downscale is still manual for now. The automatic consciousness cycle refreshes `layer-0.jsonl` from recent shortmemory, but full model-generated downscale still belongs to the manual builder until Yculth visual inspection proves the files help. Keep `memory_layers.use_in_context` false and `neural_memory.mode` off until the layer quality is proven. `neural_memory.mode: debug` writes an inspectable local report under `agents/<Agent>/regenerated/neural-memory-debug/latest-report.md` without adding semantic memory to the reply prompt. Only use `on` after Yculth can preview exactly what neural memory context would be sent to OpenRouter.

Do not automatically migrate old memory. Keep `soul/shortmemory.jsonl` and `soul/memorysummary.txt` in place, preserve backups before cleanup, run the builder manually, inspect Yculth's debug downscale/upscale surfaces, and only enable neural memory after inspection. Never dump Memorysummary into `soul/persona.md`; persona should stay identity, personality, voice, preferences, boundaries, and behavior guidance.

## Discord Slash Commands

Slash commands are control actions. Only users listed in `control_user_ids` can run them.

* `/reloadpersona` : Reloads persona from the configured forum post/thread or local `soul/persona.md`.
* `/clearshortmemory` : Clears local shortmemory, live recent context, and bot-written `shortmemory:` entries in Discord.
* `/setupmemoryforum` : Creates missing memory posts in the configured memory forum.
* `/raw` : Shows the latest OpenRouter message text uploaded by the agent. Large raw prompts are sent as a private text file attachment.
* `/scrapeshortmemory` : Reads all available channel message pages, anchors at the agent's latest reply when one exists, appends new entries to shortmemory, dedupes, and rewrites local shortmemory in timestamp order.
* `/scrapedmshortmemory` : Reads all available DM message pages with the command user, anchors at the agent's latest DM reply when one exists, appends new entries to shortmemory, dedupes, and rewrites local shortmemory in timestamp order.
* `/uploadstory filename` : Story command that uploads a local Markdown file from `soul/stories/` to the Discord `stories` memory forum post. `.md` is assumed if omitted, and long stories are split across multiple replies.
* `❌ delete reaction` : React with `:x:` to delete a bot reply and remove the matching assistant shortmemory entry.
* `🔁 redo reaction` : React with `:repeat:` to delete a bot reply from memory and generate a fresh answer to the previous user message.
* `⏪ rewind reaction` : React with `:rewind:` to delete a bot reply, remove that one assistant shortmemory entry, and remove the previous user message from shortmemory only.
* `▶️ continue reaction` : React with `:arrow_forward:` to continue from the current scene without adding a pipe command to shortmemory.
* `🎵 music reaction` : React with `:musical_note:` to run the music skill from recent shortmemory and post a formatted music link.

## Pipe Text

* `||@agent reply||` : Has the agent continue the story from recent context. In DMs, `@agent` is optional.
* `||@agent continue||` : Has the agent continue the story from recent context without adding the command itself to shortmemory. In DMs, `@agent` is optional.
* `||@agent continue: instructions||` : Has the agent continue with one-time instructions. The command itself is not added to shortmemory.
* `normal text ||@agent subtext: private text||` : Inline private subtext lets you communicate assumptions and quick persona adjustments. It is not spoken text to quote or answer directly, and it may be loosely stored later by memory updates. In DMs, `@agent` is optional.
* `||@agent adjust: adjustment instructions||` : Redoes the previous bot reply with adjustment instructions. The bot deletes the old reply, removes that assistant shortmemory entry, and writes a replacement reply to the original user message.
* `||@agent summarize||` : Summarizes recent shortmemory plus useful thoughts, journals, dreams, stories, and neural memory into compact `soul/memorysummary.txt`, posts a Memorysummary preview, clears temporary thought files after backing them up, and cleans adjustment audit messages. In DMs, `@agent` is optional.
* `||@agent thought: thought prompt||` : Writes a first-person internal thought from the prompt, shortmemory, Memorysummary, and recent thoughts.
* `||@agent journal||` : Writes a private first-person journal entry from recent shortmemory, saved thoughts, neural memory if available, and Memorysummary. The journal is saved locally and only a temporary `journal saved` confirmation is posted.
* `||@agent journal: instructions||` : Writes a private first-person journal entry using the journal descriptor plus one-time instructions.
* `||@agent emoji||` : Posts one image from `soul/emojis/` based on mood, status, recent context, and natural-language filename meaning. In DMs, `@agent` is optional.
* `||@agent emoji: text||` : Posts one emoji image using extra one-time mood or context guidance.
* `||@agent story||` : Story command that writes a first-person evidence-grounded short story from saved stories, recent shortmemory, thoughts, journals, neural memory if present, and Memorysummary, then saves it in `soul/stories/` and posts it to the `stories` memory forum post. In DMs, `@agent` is optional.
* `||@agent story: story prompt||` : Story command that searches saved stories, shortmemory, thoughts, journals, neural memory if present, and Memorysummary for the requested subject, then writes only what the evidence supports. Mentions of creativity, realism, poetic style, scientific detail, chaos, or numeric style values are treated as one-time natural-language guidance.
* story recall : Normal messages that ask about saved stories search `soul/stories/`, combine that with shortmemory and Memorysummary context, and let the agent answer with a focused summary or explanation without inventing unsupported details.
* `||@agent music||` : Optional skill command, available only when the `music` skill is enabled. In DMs, `@agent` is optional.
* `||@agent music: description or link||` : Optional music skill command with direct input.
* `||@agent textgen: instructions: text here||` : Optional textgen skill command. Its first mode is `remux`, meaning intent-preserving text transformation from one expressive register to another, such as public-safe text, polished prose, cleaner dialogue, or implication/metaphor.
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
* `||@agent passtimehours: 8||` : Queues explicit experienced time in hours for longer sleep or dream gaps. Extra text after the number can make `utility_model` adjust sleep remaining.
* `||@agent dream: dream seed text||` : Generates one first-person dream from memory, thoughts, journals, previous dreams, and the seed text. In DMs, `@agent` is optional. This requires status mode `sleeping`. Mentions of chaos, creativity, realism, symbolism, or numeric style values are treated as one-time natural-language guidance.
* `||@agent dream||` : Generates an automatic first-person dream from context, thoughts, journals, and previous dreams. In DMs, `@agent` is optional. This requires status mode `sleeping`.
* `||@agent dreamjournal||` : Interprets the latest saved dream and saves a private dream journal under `soul/consciousness/dream-journals/`. It does not create a new dream.
* `||@agent dreamjournal: focus text||` : Interprets the latest saved dream with extra focus instructions, such as what the dream says about a person or relationship.
* `dream_journal.auto_enabled` : If true, successful dream generation automatically creates a dream journal from the saved dream file. If false, dream journals are only created by `||@agent dreamjournal||`.
* `dream_journal.read_limits` : Bounded lane limits for dreamjournal context. It controls recent shortmemory, thoughts, journals, stories, previous dream journals, memory entries, neural memory nodes, and origin summary inclusion so dreamjournal never reads an unlimited archive into one request.
* automatic status inference : The core time system can update `soul/status.json` after normal replies when the latest exchange clearly implies sleep, waking, dreaming, away, or another state. It keeps the current state when clues are weak or metaphorical. When status changes to sleeping, `utility_model` may decide to create an immediate dream.
* automatic Discord status update : The `discordstatusupdate` skill can write a concise human-readable status note into `soul/status.json` after successful summarization, then mirror that status dump to the Discord `status` memory post.
* natural time inference : Before normal replies, the core time system can ask `utility_model` whether the latest roleplay message clearly implies time passed. High-confidence guesses update `soul/status.json` fields like `current_datetime`, `last_time_passed_minutes`, `last_time_passed_reason`, and `total_experienced_minutes`, then the elapsed time is included as hidden context for the reply.
* natural sleep disturbance : While status is `sleeping`, incoming natural-language messages are checked by `utility_model` before normal replies. Quiet or irrelevant messages can be ignored, interruptions can adjust `sleep_remaining_minutes`, and wake events can switch status to `awake` before the main reply model answers.
* sleep timer : When status changes to `sleeping`, `utility_model` estimates `sleep_planned_minutes` and stores `sleep_remaining_minutes` in `soul/status.json`. Passing time counts that value down. Extra pass-time context can adjust the timer; interruptions reduce it faster, restful protection can extend it. If it reaches zero or below, status becomes `awake` and `woke_minutes_ago` records how long ago the agent woke.

## Skills

Implemented skills live in `discord-bot/skills/`.

* Enable an optional skill by adding its name to `enabled_skills`.
* Each implemented skill owns its own settings and slash commands.
* Skills that want to influence natural-language status should expose `getStatusHints(summaryContext)` and let `discordstatusupdate` own the final status write.
* Status-aware skills use `soul/status.json` and should clearly state which modes they require.
* Planned placeholder skills should not be enabled until they are implemented.
* Optional skill-specific memory forum posts are created only when the skill is enabled and implemented. Core posts for time and story behavior are always available through the standard memory forum posts.
* summarization : Core memory lifecycle infrastructure, not a skill. Skills may provide context before replies or react through `afterSummary`, but memory entries and memorysummary maintenance belong to the runtime.
* `code_skill` : Implemented optional runtime skill for conversational coding. Discord is only one possible interface; real code operations happen in the configured external command.
* `file_skill` : Implemented optional runtime skill for conversational file management. Discord is only one possible interface; real file operations happen in the configured external command.
* `music_skill` : Implemented optional runtime skill for music search and formatted music links. Discord is only one possible interface for this skill.
* `speak_skill` : Implemented optional runtime skill for normal expressive voice output and Fish Audio voice-training hooks. Discord is only one possible interface for this skill.
* `textgen_skill` : Implemented optional runtime skill in the `imagegen / videogen / textgen` naming scheme. `remux` is the first mode inside textgen, not a separate skill name unless an alias is deliberately added later. Style JSONC files live under `textgen_skill.styles_folder`, and dated remux history JSONL files can be saved under `textgen_skill.history_folder`.
* `planned_skill_settings.visualexpression` : Placeholder settings for future AI-chosen generated visuals. The public Discord-facing workflow is `||@agent image: text||`, which records natural-language prompt/style critique for future image prompts. Intended output types are emojis, self-images, scenes, backgrounds, thoughts, and dreams. Keep this local-first until Discord posting behavior is deliberately designed. Internet reference downloads should go to `soul/visual-references/`; generated images should go to `regenerated/visualexpression/`.

## Textgen And Remux

* `textgen` : Optional text generation skill in the `imagegen / videogen / textgen` naming scheme.
* `remux` : First mode inside `textgen`. It keeps the same intent while changing the language container, tone, safety level, or prose style.
* skill name : Keep `textgen` as the top-level skill name. Do not create a separate `remux` skill unless the project intentionally adds it as an alias later.
* style presets : Editable JSONC files, similar to imagegen styles. They define what to preserve, change, avoid, and output.
* style editing : Use the same `textgen:` pipe command to create, adjust, rename, and delete style presets through natural language.
* style example : `||@agent textgen: create a style called gothic-innuendo that makes explicit text sound like vampire romance||`
* style example : `||@agent textgen: adjust sfw-discord to keep more flirtation||`
* style example : `||@agent textgen: rename dirty-talk-cleanup to explicit-polish||`
* style example : `||@agent textgen: delete explicit-polish||`
* lifecycle boundary : Sleep, dream, and summarize are core runtime lifecycle systems, not optional skills.

## Current Architecture

The shared runtime handles Discord login, slash commands, reply policy, memory forum setup, shortmemory logging, and OpenRouter requests.

The context assembler builds each normal model request from:

* `soul/persona.md`
* optional `soul/origin_summary.md`
* `soul/memorysummary.txt`
* latest Memorysummary preview/notice in the Discord `Memorysummary` memory post
* recent `soul/shortmemory.jsonl`
* current `soul/status.json`
* adjustment audit entries in the Discord `adjustments` memory post
* status change dumps in the Discord `status` memory post
* generated dreams in `soul/dreams`
* automatic memorysummary updates
* queued time passage context
* enabled skill context blocks
* recent conversation history

## Memory Maintenance Flow

* `||@agent summarize||` : Summarize recent shortmemory plus useful thoughts, journals, dreams, stories, neural memory, and adjustment history into `soul/memorysummary.txt`, then back up and clear temporary thoughts and clean adjustment audit messages.
* automatic consciousness cycle : Runs after about `consciousness_cycle.cycle_hours * 60 * 60 / consciousness_cycle.seconds_per_message` new memory entries. Default target is 288 entries.
* cycle order : refresh `soul/memory-layers/layer-0.jsonl`, generate journal, generate dream, update Memorysummary summary, back up thoughts, clear temporary thoughts.
* backup cleanup : After successful memory maintenance, only old files directly under `agents/<YourAgentName>/backups/` are eligible for cleanup. Active soul files, persona, origin, settings, shortmemory, memorysummary, memory entries, journals, dreams, dream journals, stories, and neural memory files are never cleanup targets.
* review memory result : Check that useful adjustment lessons made it into memory entries and memorysummary.

## Safety Notes

* Never commit real Discord app tokens or OpenRouter keys.
* Treat any token shown in screenshots or chat as exposed and rotate it.
* Do not run two processes for the same Discord app token.
* If a bot logs in as the wrong Discord account, check that the agent's token file contains the correct Discord app token.
