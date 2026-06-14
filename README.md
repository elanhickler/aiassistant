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
    * `context.js` : Builds OpenRouter request context from persona, longmemory, recent shortmemory, and enabled skill context blocks.
    * `memory.js` : Shared shortmemory parsing and formatting helpers.
    * `package.json` : Runtime scripts for installing dependencies, checking syntax, and starting the bot.
    * `skills/` : Core behavior modules plus optional skills loaded through each agent's `enabled_skills` setting.
        * `README.md` : Skills overview.
        * `code.js` : Optional conversational adapter to an external coding command.
        * `discordstatusupdate.js` : Optional status-note skill that updates natural-language status after summarization.
        * `external-command.js` : Shared helper for external-command-backed skills.
        * `file.js` : Optional conversational adapter to an external file-management command.
        * `music.js` : Optional pipe-command music skill.
        * `placeholders.js` : Registry of planned skills that are documented but not implemented yet.
        * `speak.js` : Optional text-to-speech and voice-training hook skill.
        * `story.js` : Core story generation, recall, and story upload system.
        * `time.js` : Core time, sleep, status, and dream system.
        * `vision.js` : Optional image-description skill for attached images.
        * `visualexpression.js` : Optional visual prompt/style guidance and future image planning skill.
* `docs/` : Planning and architecture notes.
    * `code-skill.md` : Interface-neutral coding adapter notes.
    * `file-skill.md` : Interface-neutral file-management adapter notes.
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

## Settings

## Agent Identity Rule

* one agent : one soul folder, one Discord application, one bot token, one memory forum.
* shared runtime : `discord-bot/` is only shared code. Agent identity stays in the agent folder.
* agent folder : The character's only local identity folder. It contains persona, memory, status, stories, dreams, settings overrides, and secrets.
* Discord application : The character's only Discord account/profile. The avatar and username set in Discord Developer Portal belong to this one agent.

* `settings.jsonc` : Global defaults used by every bot.
* `global-persona.md` : Repo-level persona addition appended to every agent persona at runtime.
* `agents/<AGENT_NAME>/settings.jsonc` : Per-agent overrides only. Arrays replace the global array; objects merge with the global object.
* `agents/<AGENT_NAME>/backups/` : Automatic timestamped backups created before large local overwrites such as persona reloads, longmemory summaries, and shortmemory rewrites.
* required per-agent overrides : `identity` and `memory_forum_channel_id`.
* `model` : Main OpenRouter model used for character replies and creative writing.
* `utility_model` : Free or cheap OpenRouter model used for small structured decisions like status inference and whether sleep should create a dream.
* `identity.mention_role_ids` : Optional Discord role IDs that count as targeting that agent inside pipe commands.
* `global_persona_file` : Repo-level persona addition appended to every agent persona at runtime.
* `intent_triggers` : Cheap local trigger words that decide whether a skill is allowed to spend tokens on an AI intent check. For example, music intent only checks OpenRouter when a message contains a configured music trigger.
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
* `▶️ replace reaction` : React to a bot reply with `:arrow_forward:` to make the bot temporarily say `next reply replaces my text`.
* `🎵 music reaction` : React to a bot reply with `:musical_note:` to run the music skill from recent shortmemory and post a formatted music link.

## Pipe Text

* `||@agent reply||` : Has the agent continue the story from recent context. In DMs, `@agent` is optional.
* `||@agent continue||` : Has the agent continue the story from recent context without adding the command itself to shortmemory. In DMs, `@agent` is optional.
* `||@agent continue: instructions||` : Has the agent continue with one-time instructions. The command itself is not added to shortmemory.
* `normal text ||@agent subtext: private text||` : Inline private subtext lets you communicate assumptions and quick persona adjustments. It is not spoken text to quote or answer directly, and it may be loosely stored later by summaries. In DMs, `@agent` is optional.
* `||@agent adjust: adjustment instructions||` : Redoes the previous bot reply with adjustment instructions. The bot deletes the old reply, removes that assistant shortmemory entry, and writes a replacement reply to the original user message.
* `||@agent summarize||` : Summarizes recent shortmemory into `soul/longmemory.txt`, posts a longmemory preview, and cleans adjustment audit messages. In DMs, `@agent` is optional.
* `||@agent story||` : Story command that writes an evidence-grounded short story from saved stories, recent shortmemory, and longmemory, then saves it in `soul/stories/` and posts it to the `stories` memory forum post. In DMs, `@agent` is optional.
* `||@agent story: story prompt||` : Story command that searches saved stories, shortmemory, and longmemory for the requested subject, then writes only what the evidence supports.
* story recall : Normal messages that ask about saved stories search `soul/stories/`, combine that with shortmemory and longmemory context, and let the agent answer with a focused summary or explanation without inventing unsupported details.
* natural music intent : If `music` is enabled and a message matches `intent_triggers.music`, the bot asks a small AI intent question. If the answer says the user wants music now, it posts a formatted music link instead of a normal reply.
* `||@agent music||` : Optional `music` skill. Infers the latest music request from shortmemory, posts a formatted music link, and archives it to the configured music thread. The `:musical_note:` reaction does the same thing without needing command text. In DMs, `@agent` is optional.
* `||@agent music: description or link||` : Optional `music` skill with direct input. Can use a music description, a specific music link, or `Artist - Song | https://...`.
* `||@agent sleep||` : Sets `soul/status.json` mode to `sleeping`.
* `||@agent wake||` : Sets `soul/status.json` mode to `awake`.
* `||@agent away||` : Sets `soul/status.json` mode to `away`; normal replies are blocked until status changes.
* `||@agent state||` : Shows the raw state mode, energy, and current activity.
* `||@agent status||` : Generates a natural-language status update from memory and current state.
* `||@agent status: text||` : Generates a natural-language status update using text as the basis or suggested status.
* `||@agent passtimeminutes: 60||` : Queues explicit experienced time for the agent before their next reply and updates energy when sleeping or dreaming. Extra text after the number describes interruptions or restful conditions.
* `||@agent passtimehours: 8||` : Queues explicit experienced time in hours for longer sleep or dream gaps. Extra text after the number can make `utility_model` adjust sleep remaining, such as loud noises waking the agent sooner.
* `||@agent dream: dream seed text||` : Generates one dream from memory, previous dreams, and the seed text. In DMs, `@agent` is optional. This requires status mode `sleeping`.
* `||@agent dream||` : Generates an automatic dream from context and previous dreams. In DMs, `@agent` is optional. This requires status mode `sleeping`.
* automatic status inference : The `time` skill can update `soul/status.json` after normal replies when the latest exchange clearly implies sleep, waking, dreaming, away, or another state. It keeps the current state when clues are weak or metaphorical.
* natural sleep disturbance : While status is `sleeping`, incoming natural-language messages are checked by `utility_model` before normal replies. Quiet or irrelevant messages can be ignored, interruptions can adjust `sleep_remaining_minutes`, and wake events can switch status to `awake` before the main reply model answers.

## Error Messages

* Slash command errors : Ephemeral Discord replies where Discord supports them.
* DM and normal message errors : Temporary bot replies that auto-delete after 30 seconds.

## Agent Secrets

Each agent keeps its own secrets under `agents/<AGENT_NAME>/secrets/`.

## Context Assembly

Each normal reply sends an assembled OpenRouter request instead of only `soul/persona.md`.

* `soul/persona.md` : Identity and behavior anchor.
* `global-persona.md` : Shared behavior/style addition appended after the agent persona.
* `soul/origin.md` : Optional full lore dump for origin/backstory material. On startup, the bot mirrors non-empty text from the Discord `origin` memory post into this file. This is editable source material and is not sent in every model request.
* `soul/origin_summary.md` : Optional compact origin summary generated from `soul/origin.md`. If present and non-empty, it is sent as hidden `Origin Summary` context.
* `soul/longmemory.txt` : Durable compact memory sent as hidden context when present. It uses explicit `# Past`, `# Present`, and `# Future / Plans` sections.
* `soul/shortmemory.jsonl` : Recent local shortmemory lines sent as hidden context.
* `shortmemory` Discord forum post : Mirrored shortmemory authority when available. If `shortmemory_thread_id` is blank, the bot finds this post from the memory forum.
* `help` Discord forum post : Clean command reference for slash commands, pipe commands, and delete reaction behavior.
* `longmemory` Discord forum post : Receives a latest longmemory preview/notice from `||@agent summarize||`. The full memory is only stored in the local txt file because Discord posts have text limits.
* `adjustments` Discord forum post : Receives an audit entry whenever `||@agent adjust: ...||` replaces a reply.
* `status` Discord forum post : Receives a status dump whenever status changes, including AI-inferred status changes.
* `discord_status_update` : Controls which enabled skills may provide optional hints for natural-language status text after summarization. Unknown or unavailable skill names are ignored.
* `seconds_before_reply` : Tupper/delete-race hack. The bot waits this many seconds before a normal OpenRouter reply, re-checks that the source message still exists, and skips the model call if the message was deleted.
* `summarization_settings.summary_policy` : Summarization guidance. Remember durable per-user context when it improves future replies, but do not save every passing detail. Longmemory keeps `# Past`, `# Present`, and `# Future / Plans`.
* `origin_summary_settings.summary_policy` : Origin summary guidance. This controls how `soul/origin.md` becomes `soul/origin_summary.md`, with more emphasis on memorable lore, triggers, voice anchors, and roleplay hooks.
* automatic summarization : Runs in the background after enough new shortmemory has accumulated. It uses `conversation_history_limit` as the rough trigger size and does not block normal chat replies.
* automatic Discord status update : When `discordstatusupdate` is enabled, successful summarization writes a concise human-readable status into `soul/status.json` and mirrors it to the `status` Discord forum post.
* `dream_settings` : Controls the dream part of the core time system. `||@agent dream||` requires `soul/status.json` mode `sleeping`, reads configured source files and previous dreams, writes a dream draft into `soul/dreams`, and does not update longmemory. When status changes to sleeping, `utility_model` may decide to create an immediate dream.
* `||@agent passtimeminutes: 60||` : Adds a one-shot hidden time passage block to the next normal reply.
* `||@agent passtimehours: 8||` : Adds a longer one-shot hidden time passage block to the next normal reply.
* sleep timer : When status changes to `sleeping`, `utility_model` estimates `sleep_planned_minutes` and stores `sleep_remaining_minutes` in `soul/status.json`. Passing time counts that value down. Extra pass-time context can adjust the timer; interruptions reduce it faster, restful protection can extend it. If it reaches zero or below, status becomes `awake` and `woke_minutes_ago` records how long ago the agent woke.
* `enabled_skills` : Optional implemented skills may contribute small context blocks. Story and time are core systems and always loaded.
* `code_skill` : Settings for the optional coding adapter skill. Discord can call it through `code:`, but the external command hook is meant to be reusable from local or website interfaces too.
* `file_skill` : Settings for the optional file-management adapter skill. Discord can call it through `file:`, but the external command hook is meant to be reusable from local or website interfaces too.
* `speak_skill` : Settings for the optional TTS and voice-training skill. Discord can call it through `speak:`, but the skill is meant to be reusable from local or website interfaces too.
* `music_skill` : Settings for the optional music search skill. Discord can call it through `music:`, but the skill exposes hooks for local or website interfaces too.
* `vision_skill` : Settings for the optional standalone image-description skill. Vision descriptions are uncertain observations and do not train image generation by themselves.
* `soul/status.json` : Current agent state used by core replies and status-aware skills. `mode` is the primary state; `status` contains boolean flags. Current modes are `awake`, `sleepy`, `sleeping`, `dreaming`, and `away`. `away` blocks normal replies.
* `soul/dreams/` : Dream output folder used by the pipe dream command.
* `soul/stories/` : Story output folder used by `||@agent story||`. Story generation and recall search `.md` and `.txt` files here, then combine relevant story text with shortmemory and longmemory as evidence.
* `soul/art/` and `soul/emojis/` : Placeholder content folders. They are not automatically sent until a future skill or retrieval feature chooses them.
* `planned_skill_settings.tts` : Older placeholder for normal expressive voice output. Use `speak_skill` for implemented runtime TTS and voice-training hooks.
* `planned_skill_settings.musiccomposition` : Placeholder for future music composition.
* `planned_skill_settings.videogeneration` : Placeholder for future video generation.
* `planned_skill_settings.visualexpression` : Placeholder settings for future AI-chosen generated visuals. The public Discord-facing workflow is `||@agent image: text||`, which records natural-language prompt/style critique for future image prompts. The intended outputs are emojis, self-images, scenes, backgrounds, thoughts, and dreams. Yculth imagegen is the intended local-first generation surface; Discord posting behavior is not implemented yet.
* `soul/visual-references/` : Future folder for downloaded or manually collected visual references. Keep source and attribution notes beside internet downloads; generated outputs belong in `regenerated/visualexpression/`.
* visual promotion : Generated visuals stay in `regenerated/visualexpression/` until the user promotes them into `soul/art/` or `soul/emojis/`.

## Memory Maintenance Flow

* `||@agent summarize||` : Summarize recent shortmemory and adjustment history into `soul/longmemory.txt`, then clean adjustment audit messages.
* review summary result : Check that useful adjustment lessons made it into longmemory.
