# Discord Bot Skills

Optional skills and core behavior modules live here. Agents choose optional skills with `enabled_skills`; dreamjournal, emoji, journal, story, thought, and time are core systems and always load.

## File Map

* `README.md` : This skills overview.
* `code.js` : Implemented optional conversational coding adapter skill. It calls a configured external command over stdin/stdout instead of doing code operations itself.
* `discordstatusupdate.js` : Implemented optional status-note skill. It runs after summarization, asks `utility_model` for a concise natural-language status, writes status fields into `soul/status.json`, and mirrors the result through the status memory post.
* `external-command.js` : Shared helper for skills that call configured external commands with JSON on stdin and text or JSON on stdout.
* `file.js` : Implemented optional conversational file-management adapter skill. It calls a configured external command over stdin/stdout instead of doing file operations itself.
* `journal.js` : Core journal system. It owns `||@agent journal||` and `||@agent journal: text||`, reads recent shortmemory, private thoughts, neural memory files if present, and Memorysum, then saves durable private journal files under `soul/consciousness/journals/`.
* `dreamjournal.js` : Core dream journal system. It owns `||@agent dreamjournal||` and `||@agent dreamjournal: text||`, interprets the latest saved dream using bounded memory, and saves durable private Markdown under `soul/consciousness/dream-journals/`. It does not create new dreams.
* `emoji.js` : Core emoji posting system. It owns `||@agent emoji||` and `||@agent emoji: text||`, chooses an image from `soul/emojis/` using mood, status, recent context, and filename meanings, then posts the selected image.
* `music.js` : Implemented optional music search and link-formatting hook skill. Discord pipe commands and reactions are one interface; future local or website interfaces can call the same hooks.
* `placeholders.js` : Registry of planned skills that are allowed to be documented without being implemented.
* `registry.js` : Central skill registry. It owns core skill factories, optional skill factories, and planned-skill error handling.
* `runprogram.js` : Implemented optional conversational program-runner adapter skill. It calls a configured external command and passes configured app names and aliases in the request payload.
* `speak.js` : Implemented optional text-to-speech and voice-training hook skill. Discord pipe commands are one interface; future local or website interfaces can call the same hooks.
* `story.js` : Core story system. It owns `||@agent story||`, `||@agent story: text||`, `/uploadstory`, local story files, story recall context, and the Discord `stories` memory post.
* `textgen.js` : Implemented optional text generation skill. Its first mode is remux, an intent-preserving rewrite from one expressive register to another.
* `thought.js` : Core thought system. It owns `||@agent thought: text||` and writes private first-person thought files under `soul/consciousness/thoughts/`. Automatic visible replies also create private thought files. Thought bodies are not posted publicly.
* `time.js` : Core time system. It owns sleep, wake, status, time passage, and dream behavior.
* `vision.js` : Implemented optional image-description skill. It describes an attached image or an image in the replied-to message, but does not update memory or image-generation guidance by itself.
* `visualexpression.js` : Implemented optional planning skill for future generated visuals. It validates visualexpression settings, records conversational `image:` prompt/style guidance as visual memory, keeps legacy request-queue internals available for debugging, and exposes compact context/status hints, but does not generate images yet.

## Skill Interface

Implemented skills can expose these fields:

* `name` : Module name used by the runtime; optional skills also use this name in `enabled_skills`.
* `command` : Optional Discord slash command definition, or an array of definitions.
* `handleInteraction(interaction)` : Optional slash command handler.
* `handlePipeCommand(command, message)` : Optional whole-message pipe command handler.
* `getPipeHelp({ agentCommandName, pipeRowsWithAliases })` : Optional help rows for pipe commands owned by this skill.
* `onReady()` : Optional startup hook.
* `afterSummary(summaryContext)` : Optional hook called after successful summarization.
* `getContextBlocks(message)` : Optional hidden context provider for normal replies.
* `getStatusHints(summaryContext)` : Optional plain-text hints used only by `discordstatusupdate` when the skill is listed in `discord_status_update.source_skills`.
* `requiredSettings()` : Optional list of settings the skill expects.
* `requiresStatus` : Optional boolean marker for skills that use the shared status API.
* `requiredStatusModes` : Optional list of status modes the skill can run in.

New implemented skills should be registered in `registry.js`. Planned-but-unimplemented ideas should be listed in `placeholders.js` until they have real behavior.

Startup logs the loaded skill names so a running bot makes its active skill surface visible in the terminal.

Registry helpers classify skill names as `core`, `implemented`, `planned`, `unknown`, or `blank` so future UI/diagnostics can explain skill settings without duplicating registry logic.

Private local skills may live in `discord-bot/local-skills/<name>.js`. That folder is ignored by git. A local skill is loaded only when its name appears in `enabled_skills`, and it must export `createSkill(context)` or a default factory function. Use this path for machine-local behavior that should not be published with the main repo.

Run `node skills/print-registry.js` from `discord-bot/` to print the current core, implemented, planned, and pipe-command skill names from the registry. Use `--json` when another tool needs structured registry data.

## Core Systems

These are always loaded and should not be listed in `enabled_skills`.

* `story` : Writes first-person evidence-grounded short stories from saved stories, recent shortmemory, thoughts, journals, neural memory files if available, and Memorysum; it should not invent new continuity when memory is thin. It saves stories under `soul/stories/`, posts them to the `stories` memory forum post, uploads edited local story files with `/uploadstory`, and injects relevant saved stories into context when a normal message asks about them. Creativity, realism, poetic style, scientific detail, chaos, and numeric style values are natural-language story instructions, not formal settings.
* `dreamjournal` : Interprets the latest saved dream from `soul/dreams/`, separates supported meaning from speculation, and saves private Markdown under `soul/consciousness/dream-journals/`. It posts only a temporary `dream journal saved` confirmation. If `dream_journal.auto_enabled` is true, dream generation also creates one automatically after the dream file is saved.
* `emoji` : Posts one image from `soul/emojis/` with `||@agent emoji||` or `||@agent emoji: text||`. The utility model interprets image filenames through natural language and cross-references them with current mood, status, activity, recent context, and optional one-time guidance.
* `journal` : Writes durable first-person private journals from recent shortmemory, private thoughts, neural memory files if available, and Memorysum. It saves Markdown under `soul/consciousness/journals/` and posts only a temporary `journal saved` confirmation.
* `thought` : Writes first-person internal thoughts from a user thought prompt, recent shortmemory, Memorysum, and recent thoughts. Thoughts are softer than memory and are meant to support end-of-day memory work, stories, and dreams.
* `feelings` : Runtime-generated private first-person emotional/body/atmosphere state saved under `soul/consciousness/feelings/` before visible replies. Feelings are not public messages; they feed rich status display and future emotional memory work.
* `time` : Handles `||@agent sleep||`, `||@agent wake||`, `||@agent away||`, `||@agent state||`, `||@agent passtimeminutes: 60||`, `||@agent passtimehours: 8||`, and `||@agent dream||`. Dreaming requires `soul/status.json` mode `sleeping`. Dreams read configured source files, thoughts, journals, previous dreams, neural memory files if present, and dream summary. It can infer status changes, create immediate dreams after sleep transitions, evaluate natural-language sleep disturbances using `utility_model`, and treat chaos, creativity, realism, symbolism, or numeric style values as one-time natural-language dream instructions rather than formal settings.

## Implemented Optional Skills

* `music` : Finds and formats music links through natural language intent, `||@agent music||`, `||@agent music: description||`, or `:musical_note:` reactions. The skill exposes `findMusic`, `findMusicFromConversation`, and `formatMusicLink` so non-Discord interfaces can reuse the same behavior. Natural language intent is gated by `intent_triggers.music` before it spends tokens on an AI intent check.
* `discordstatusupdate` : Runs after successful memory updates and handles `||@agent status||` and `||@agent status: text||`. It writes a human-readable status note into `soul/status.json`; other skills may only provide optional hints when listed in `discord_status_update.source_skills`.
* `code` : Sends `||@agent code: instructions||` to the configured external coding command. The skill exposes `runCodeRequest` so non-Discord interfaces can reuse the same adapter.
* `file` : Sends `||@agent file: instructions||` to the configured external file-management command. The skill exposes `runFileRequest` so non-Discord interfaces can reuse the same adapter.
* `runprogram` : Sends `||@agent runprogram: instructions||` to the configured external program runner command. The skill exposes `runProgramRequest` and passes `runprogram_skill.apps` so local app names and aliases can resolve to launch/control commands outside Discord.
* `speak` : Generates speech with `||@agent speak: text||` and can upload an attached audio sample for provider voice training with `||@agent speak: train voice title | transcript||`. The skill stores generated audio and voice model logs locally and keeps provider hooks reusable outside Discord.
* `textgen` : Remuxes text with `||@agent textgen: instructions: source text||`. It preserves intent while changing the language container, such as NSFW to public Discord-safe, blunt notes to polished prose, raw RP to cleaner dialogue, or explicit text to implication/metaphor. Style presets are human-editable JSONC files under `textgen_skill.styles_folder`, and dated history files like `YYYY-MM-DD-remux.jsonl` are saved under `textgen_skill.history_folder` when enabled. Textgen follows the `imagegen / videogen / textgen` naming scheme; `remux` is a mode inside textgen, not a separate top-level skill.
* `textgen` example : `||@agent textgen: remux this for public Discord: text here||`
* `textgen` example : `||@agent textgen: use sfw-discord: text here||`
* `textgen` example : `||@agent textgen: make this more poetic, still NSFW: text here||`
* `textgen` style editing : The same command can create, adjust, rename, and delete style presets through natural language.
* `textgen` style example : `||@agent textgen: create a style called gothic-innuendo that makes explicit text sound like vampire romance||`
* `textgen` style example : `||@agent textgen: adjust sfw-discord to keep more flirtation||`
* `textgen` style example : `||@agent textgen: rename dirty-talk-cleanup to explicit-polish||`
* `textgen` style example : `||@agent textgen: delete explicit-polish||`
* `vision` : Describes attached images through `||@agent vision: text||`. The description is an uncertain observation aid, not durable truth, and not automatic image-skill training.
* `visualexpression` : Planning-only bridge for future generated emojis, self-images, scenes, backgrounds, thoughts, and dreams. The public pipe command is `||@agent image: text||`, which records natural-language prompt/style critique for future image prompts. Legacy `visual ...` request-queue commands remain available internally for debugging, but should not be treated as the normal user workflow.

## Planned Skills

These are placeholders only. Enabling them should error until they are implemented.

* `characterproxy` : Future webhook-based character proxy for roleplaying as saved character profiles. Intended for a separate bot with only this skill enabled.
* `gamemaster` : Future game master workflow for scenes, rules, pacing, world state, and roleplay coordination.
* `musiccomposition` : Future music composition workflow.
* `profilepic` : Future avatar/profile image workflow.
* `art` : Future art prompt, reference, and visual memory workflow.
* `settings` : Future Discord-editable settings workflow.
* `tts` : Older placeholder name for local voice-output experiments. Prefer the implemented `speak` skill for runtime TTS and provider voice-training hooks.
* `videogeneration` : Future video generation workflow.

## Core Memory Lifecycle

Summarization is not a skill. It is shared memory infrastructure used by the runtime and by skill lifecycle hooks. It reads recent shortmemory plus useful thoughts, journals, dreams, stories, and neural memory files if present, creates durable memory entries, updates compact Memorysum, then backs up and clears temporary thoughts after successful memory absorption. Feelings are private state artifacts for rich status and future emotional memory work. Journals, dreams, stories, and Memorysum persist.

Sleep, dream, and summarize behavior are core lifecycle systems. They should not be moved into optional skills just because optional skills can read their context or react to lifecycle hooks.

* `summarization_settings` : Controls memory entries and memorysum maintenance.
* `origin_summary_settings` : Controls origin source material condensation.
* `afterSummary(summaryContext)` : Optional skill hook called after a successful summary.
