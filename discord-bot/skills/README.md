# Discord Bot Skills

Optional bot skills live here. Agents choose which skills to load with `enabled_skills` in their `settings.jsonc`.

## File Map

* `README.md` : This skills overview.
* `music.js` : Implemented optional pipe-command music skill. It can infer music from shortmemory, classify the request as a known song or a vibe, find a music link from enabled music sites, format the link, and archive it to `music_skill.music_thread_id`. Site switches live in `music_skill`; `website_config_url` can point at the static website's `music-sites.json`.
* `placeholders.js` : Registry of planned skills that are allowed to be documented without being implemented.
* `time.js` : Implemented optional pipe-command time skill. It owns sleep, wake, status, time passage, and dream behavior.

## Skill Interface

Implemented skills can expose these fields:

* `name` : Skill name used by `enabled_skills`.
* `command` : Optional Discord slash command definition.
* `handleInteraction(interaction)` : Optional slash command handler.
* `handlePipeCommand(command, message)` : Optional whole-message pipe command handler.
* `onReady()` : Optional startup hook.
* `getContextBlocks(message)` : Optional hidden context provider for normal replies.
* `requiredSettings()` : Optional list of settings the skill expects.
* `requiresStatus` : Optional boolean marker for skills that use the shared status API.
* `requiredStatusModes` : Optional list of status modes the skill can run in.

## Implemented Skills

* `music` : Finds and formats music links through `||@agent music||` or `||@agent music: description||`, archives them to its configured music thread, and contributes a small context note that the command exists.
* `time` : Handles `||@agent sleep||`, `||@agent wake||`, `||@agent busy||`, `||@agent away||`, `||@agent status||`, `||@agent passtimeminutes: 60||`, and `||@agent dream||`. Dreaming requires `soul/status.json` mode `sleeping`. It can also infer status changes from clear context clues after normal replies.

## Planned Skills

These are placeholders only. Enabling them should error until they are implemented.

* `emoji` : Future emoji preference and emoji context provider.
* `profilepic` : Future avatar/profile image workflow.
* `summarization` : Future shortmemory to longmemory maintenance workflow.
* `art` : Future art prompt, reference, and visual memory workflow.
* `stories` : Future story, lore, and narrative retrieval workflow.
* `settings` : Future Discord-editable settings workflow.
