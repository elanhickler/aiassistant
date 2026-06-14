# AGENT

Instructions for using this repository as a reusable Discord chatbot template.

## Purpose

This repository contains a shared Discord/OpenRouter bot runtime plus per-agent folders. To create a custom chatbot, make a new folder under `agents/`, give it its own settings, persona, memory files, and secrets, then start the shared runtime with `AGENT_NAME` set to that folder name.

## Agent Identity Rule

* one agent : one soul folder, one Discord application, one bot token, one memory forum.
* shared runtime : `discord-bot/` is only shared code. Agent identity stays in the agent folder.
* agent folder : The character's only local identity folder. It contains persona, memory, status, stories, dreams, settings overrides, and secrets.
* Discord application : The character's only Discord account/profile. The avatar and username set in Discord Developer Portal belong to this one agent.

## Create A New Agent

* Copy an existing agent folder into `agents/<YourAgentName>/`.
* Edit `agents/<YourAgentName>/settings.jsonc` for only that agent's overrides.
* Edit root `settings.jsonc` only when a default should apply to every agent.
* Edit root `global-persona.md` only when a persona addition should apply to every agent.
* Edit `agents/<YourAgentName>/soul/persona.md`.
* Keep local secrets in `agents/<YourAgentName>/secrets/`.
* Keep automatic overwrite backups in `agents/<YourAgentName>/backups/`.
* Keep durable character memory and creative files in `agents/<YourAgentName>/soul/`.
* Keep `soul/shortmemory.jsonl` inside the agent folder.

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
* `enabled_skills` : Optional implemented skills to load. Story and time are core systems and always loaded.
* `discord_status_update.source_skills` : Optional enabled skills allowed to provide hints for natural-language status notes after summarization. Unknown or unavailable skills are ignored.
* `global_persona_file` : Repo-level persona addition appended to every agent persona at runtime.
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
* `conversation_history_limit` : Number of recent messages sent as hidden model context.
* `seconds_before_reply` : Tupper/delete-race hack. Wait this many seconds before normal OpenRouter replies and skip if the source message vanished.
* `chaos` : OpenRouter temperature; higher is looser, lower is steadier.
* `max_tokens` : Maximum generated output tokens.
* `discord_reply_character_limit` : Maximum Discord reply characters before truncation.

## Persona And Memory

* `soul/persona.md` : Identity, voice, preferences, boundaries, and behavior guidance.
* `global-persona.md` : Shared behavior/style addition appended after the agent persona.
* `backups/` : Automatic timestamped backups created before large local overwrites such as persona reloads, longmemory summaries, and shortmemory rewrites.
* `soul/origin.md` : Optional full lore dump for origin/backstory material. On startup, the bot mirrors non-empty text from the Discord `origin` memory post into this file. This is editable source material and is not sent in every model request.
* `soul/origin_summary.md` : Optional compact origin summary generated from `soul/origin.md`. If present and non-empty, it is sent as hidden `Origin Summary` context.
* `soul/longmemory.txt` : Compact durable memory sent as hidden context. It should keep `# Past`, `# Present`, and `# Future / Plans` sections.
* `soul/shortmemory.jsonl` : Recent local shortmemory cache and fallback.
* `soul/art/` : Placeholder folder for future art context.
* `soul/dreams/` : Dream output folder used by the pipe dream command.
* `soul/emojis/` : Placeholder folder for future emoji behavior.
* `soul/visual-references/` : Future folder for downloaded or manually collected visual references. Store source and attribution notes beside internet downloads.
* `soul/stories/` : Story output folder used by `||@agent story||`.
* `soul/status.json` : Current agent state used by core replies and status-aware skills. Current modes are `awake`, `sleepy`, `sleeping`, `dreaming`, and `away`.

## Runtime Commands

```powershell
cd C:\Users\argit\Documents\_PROGRAMMING\aiassistant\discord-bot
$env:AGENT_NAME='<YourAgentName>'
npm.cmd run install:deps
npm.cmd run check
npm.cmd start
```

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
* `▶️ replace reaction` : React with `:arrow_forward:` to temporarily reply `next reply replaces my text`.
* `🎵 music reaction` : React with `:musical_note:` to run the music skill from recent shortmemory and post a formatted music link.

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
* `||@agent music||` : Optional skill command, available only when the `music` skill is enabled. In DMs, `@agent` is optional.
* `||@agent music: description or link||` : Optional music skill command with direct input.
* `||@agent sleep||` : Sets `soul/status.json` mode to `sleeping`.
* `||@agent wake||` : Sets `soul/status.json` mode to `awake`.
* `||@agent away||` : Sets `soul/status.json` mode to `away`; normal replies are blocked until status changes.
* `||@agent state||` : Shows the raw state mode, energy, and current activity.
* `||@agent status||` : Generates a natural-language status update from memory and current state.
* `||@agent status: text||` : Generates a natural-language status update using text as the basis or suggested status.
* `||@agent passtimeminutes: 60||` : Queues explicit experienced time for the agent before their next reply and updates energy when sleeping or dreaming. Extra text after the number describes interruptions or restful conditions.
* `||@agent passtimehours: 8||` : Queues explicit experienced time in hours for longer sleep or dream gaps. Extra text after the number can make `utility_model` adjust sleep remaining.
* `||@agent dream: dream seed text||` : Generates one dream from memory, previous dreams, and the seed text. In DMs, `@agent` is optional. This requires status mode `sleeping`.
* `||@agent dream||` : Generates an automatic dream from context and previous dreams. In DMs, `@agent` is optional. This requires status mode `sleeping`.
* automatic status inference : The `time` skill can update `soul/status.json` after normal replies when the latest exchange clearly implies sleep, waking, dreaming, away, or another state. It keeps the current state when clues are weak or metaphorical. When status changes to sleeping, `utility_model` may decide to create an immediate dream.
* automatic Discord status update : The `discordstatusupdate` skill can write a concise human-readable status note into `soul/status.json` after successful summarization, then mirror that status dump to the Discord `status` memory post.
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
* `planned_skill_settings.tts` : Placeholder settings for normal expressive voice output. Fish Audio is the first planned provider; this is local Yculth TTS only until a runtime skill is implemented.
* `planned_skill_settings.visualexpression` : Placeholder settings for future AI-chosen generated visuals. The public Discord-facing workflow is `||@agent image: text||`, which records natural-language prompt/style critique for future image prompts. Intended output types are emojis, self-images, scenes, backgrounds, thoughts, and dreams. Keep this local-first until Discord posting behavior is deliberately designed. Internet reference downloads should go to `soul/visual-references/`; generated images should go to `regenerated/visualexpression/`.

## Current Architecture

The shared runtime handles Discord login, slash commands, reply policy, memory forum setup, shortmemory logging, and OpenRouter requests.

The context assembler builds each normal model request from:

* `soul/persona.md`
* optional `soul/origin_summary.md`
* `soul/longmemory.txt`
* latest longmemory preview/notice in the Discord `longmemory` memory post
* recent `soul/shortmemory.jsonl`
* current `soul/status.json`
* adjustment audit entries in the Discord `adjustments` memory post
* status change dumps in the Discord `status` memory post
* generated dreams in `soul/dreams`
* automatic longmemory updates
* queued time passage context
* enabled skill context blocks
* recent conversation history

## Memory Maintenance Flow

* `||@agent summarize||` : Summarize recent shortmemory and adjustment history into `soul/longmemory.txt`, then clean adjustment audit messages.
* review summary result : Check that useful adjustment lessons made it into longmemory.

## Safety Notes

* Never commit real Discord app tokens or OpenRouter keys.
* Treat any token shown in screenshots or chat as exposed and rotate it.
* Do not run two processes for the same Discord app token.
* If a bot logs in as the wrong Discord account, check that the agent's token file contains the correct Discord app token.
