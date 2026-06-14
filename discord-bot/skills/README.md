# Discord Bot Skills

Optional skills and core behavior modules live here. Agents choose optional skills with `enabled_skills`; story and time are core systems and always load.

## File Map

* `README.md` : This skills overview.
* `code.js` : Implemented optional conversational coding adapter skill. It calls a configured external command over stdin/stdout instead of doing code operations itself.
* `discordstatusupdate.js` : Implemented optional status-note skill. It runs after summarization, asks `utility_model` for a concise natural-language status, writes status fields into `soul/status.json`, and mirrors the result through the status memory post.
* `external-command.js` : Shared helper for skills that call configured external commands with JSON on stdin and text or JSON on stdout.
* `file.js` : Implemented optional conversational file-management adapter skill. It calls a configured external command over stdin/stdout instead of doing file operations itself.
* `music.js` : Implemented optional music search and link-formatting hook skill. Discord pipe commands and reactions are one interface; future local or website interfaces can call the same hooks.
* `placeholders.js` : Registry of planned skills that are allowed to be documented without being implemented.
* `registry.js` : Central skill registry. It owns core skill factories, optional skill factories, and planned-skill error handling.
* `speak.js` : Implemented optional text-to-speech and voice-training hook skill. Discord pipe commands are one interface; future local or website interfaces can call the same hooks.
* `story.js` : Core story system. It owns `||@agent story||`, `||@agent story: text||`, `/uploadstory`, local story files, story recall context, and the Discord `stories` memory post.
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

## Core Systems

These are always loaded and should not be listed in `enabled_skills`.

* `story` : Writes evidence-grounded short stories from saved stories, recent shortmemory, and longmemory; it should not invent new continuity when memory is thin. It saves stories under `soul/stories/`, posts them to the `stories` memory forum post, uploads edited local story files with `/uploadstory`, and injects relevant saved stories into context when a normal message asks about them.
* `time` : Handles `||@agent sleep||`, `||@agent wake||`, `||@agent away||`, `||@agent state||`, `||@agent passtimeminutes: 60||`, `||@agent passtimehours: 8||`, and `||@agent dream||`. Dreaming requires `soul/status.json` mode `sleeping`. It can infer status changes, create immediate dreams after sleep transitions, and evaluate natural-language sleep disturbances using `utility_model`.

## Implemented Optional Skills

* `music` : Finds and formats music links through natural language intent, `||@agent music||`, `||@agent music: description||`, or `:musical_note:` reactions. The skill exposes `findMusic`, `findMusicFromConversation`, and `formatMusicLink` so non-Discord interfaces can reuse the same behavior. Natural language intent is gated by `intent_triggers.music` before it spends tokens on an AI intent check.
* `discordstatusupdate` : Runs after successful summaries and handles `||@agent status||` and `||@agent status: text||`. It writes a human-readable status note into `soul/status.json`; other skills may only provide optional hints when listed in `discord_status_update.source_skills`.
* `code` : Sends `||@agent code: instructions||` to the configured external coding command. The skill exposes `runCodeRequest` so non-Discord interfaces can reuse the same adapter.
* `file` : Sends `||@agent file: instructions||` to the configured external file-management command. The skill exposes `runFileRequest` so non-Discord interfaces can reuse the same adapter.
* `speak` : Generates speech with `||@agent speak: text||` and can upload an attached audio sample for provider voice training with `||@agent speak: train voice title | transcript||`. The skill stores generated audio and voice model logs locally and keeps provider hooks reusable outside Discord.
* `vision` : Describes attached images through `||@agent vision: text||`. The description is an uncertain observation aid, not durable truth, and not automatic image-skill training.
* `visualexpression` : Planning-only bridge for future generated emojis, self-images, scenes, backgrounds, thoughts, and dreams. The public pipe command is `||@agent image: text||`, which records natural-language prompt/style critique for future image prompts. Legacy `visual ...` request-queue commands remain available internally for debugging, but should not be treated as the normal user workflow.

## Planned Skills

These are placeholders only. Enabling them should error until they are implemented.

* `emoji` : Future emoji preference and emoji context provider.
* `characterproxy` : Future webhook-based character proxy for roleplaying as saved character profiles. Intended for a separate bot with only this skill enabled.
* `gamemaster` : Future game master workflow for scenes, rules, pacing, world state, and roleplay coordination.
* `musiccomposition` : Future music composition workflow.
* `profilepic` : Future avatar/profile image workflow.
* `art` : Future art prompt, reference, and visual memory workflow.
* `settings` : Future Discord-editable settings workflow.
* `tts` : Older placeholder name for local voice-output experiments. Prefer the implemented `speak` skill for runtime TTS and provider voice-training hooks.
* `videogeneration` : Future video generation workflow.

## Core Memory Lifecycle

Summarization is not a skill. It is shared memory infrastructure used by the runtime and by skill lifecycle hooks.

* `summarization_settings` : Controls shortmemory to longmemory maintenance.
* `origin_summary_settings` : Controls origin source material condensation.
* `afterSummary(summaryContext)` : Optional skill hook called after a successful summary.
