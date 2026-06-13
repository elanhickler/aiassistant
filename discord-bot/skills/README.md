# Discord Bot Skills

Optional bot skills live here. Agents choose which skills to load with `enabled_skills` in their `settings.jsonc`.

## File Map

* `README.md` : This skills overview.
* `discordstatusupdate.js` : Implemented optional status-note skill. It runs after summarization, asks `utility_model` for a concise natural-language status, writes status fields into `soul/status.json`, and mirrors the result through the status memory post.
* `music.js` : Implemented optional pipe-command music skill. It can infer music from shortmemory, classify the request as a known song or a vibe, find a music link from enabled music sites, format the link, and archive it to `music_skill.music_thread_id`. Site switches live in `music_skill`; `website_config_url` can point at the static website's `music-sites.json`.
* `placeholders.js` : Registry of planned skills that are allowed to be documented without being implemented.
* `story.js` : Implemented optional story skill. It owns `||@agent story||`, `||@agent story: text||`, `/uploadstory`, local story files, story recall context, and the Discord `stories` memory post.
* `time.js` : Implemented optional pipe-command time skill. It owns sleep, wake, status, time passage, and dream behavior.

## Skill Interface

Implemented skills can expose these fields:

* `name` : Skill name used by `enabled_skills`.
* `command` : Optional Discord slash command definition, or an array of definitions.
* `handleInteraction(interaction)` : Optional slash command handler.
* `handlePipeCommand(command, message)` : Optional whole-message pipe command handler.
* `onReady()` : Optional startup hook.
* `afterSummary(summaryContext)` : Optional hook called after successful summarization.
* `getContextBlocks(message)` : Optional hidden context provider for normal replies.
* `getStatusHints(summaryContext)` : Optional plain-text hints used only by `discordstatusupdate` when the skill is listed in `discord_status_update.source_skills`.
* `requiredSettings()` : Optional list of settings the skill expects.
* `requiresStatus` : Optional boolean marker for skills that use the shared status API.
* `requiredStatusModes` : Optional list of status modes the skill can run in.

## Implemented Skills

* `music` : Finds and formats music links through natural language intent, `||@agent music||`, `||@agent music: description||`, or `:musical_note:` reactions. Natural language intent is gated by `intent_triggers.music` before it spends tokens on an AI intent check.
* `story` : Writes evidence-grounded short stories from saved stories, recent shortmemory, and longmemory; it should not invent new continuity when memory is thin. It saves stories under `soul/stories/`, posts them to the `stories` memory forum post, uploads edited local story files with `/uploadstory`, and injects relevant saved stories into context when a normal message asks about them.
* `time` : Handles `||@agent sleep||`, `||@agent wake||`, `||@agent away||`, `||@agent state||`, `||@agent passtimeminutes: 60||`, `||@agent passtimehours: 8||`, and `||@agent dream||`. Dreaming requires `soul/status.json` mode `sleeping`. It can infer status changes, create immediate dreams after sleep transitions, and evaluate natural-language sleep disturbances using `utility_model`.
* `discordstatusupdate` : Runs after successful summaries and handles `||@agent status||` and `||@agent status: text||`. It writes a human-readable status note into `soul/status.json`; other skills may only provide optional hints when listed in `discord_status_update.source_skills`.

## Planned Skills

These are placeholders only. Enabling them should error until they are implemented.

* `emoji` : Future emoji preference and emoji context provider.
* `characterproxy` : Future webhook-based character proxy for roleplaying as saved character profiles. Intended for a separate bot with only this skill enabled.
* `gamemaster` : Future game master workflow for scenes, rules, pacing, world state, and roleplay coordination.
* `profilepic` : Future avatar/profile image workflow.
* `summarization` : Future shortmemory to longmemory maintenance workflow.
* `art` : Future art prompt, reference, and visual memory workflow.
* `settings` : Future Discord-editable settings workflow.
