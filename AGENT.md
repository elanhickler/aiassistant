# AGENT

Instructions for using this repository as a reusable Discord chatbot template.

## Purpose

This repository contains a shared Discord/OpenRouter bot runtime plus per-agent folders. To create a custom chatbot, make a new folder under `agents/`, give it its own settings, persona, memory files, and secrets, then start the shared runtime with `AGENT_NAME` set to that folder name.

## Create A New Agent

* Copy an existing agent folder into `agents/<YourAgentName>/`.
* Edit `agents/<YourAgentName>/settings.jsonc`.
* Edit `agents/<YourAgentName>/soul/persona.md`.
* Keep local secrets in `agents/<YourAgentName>/secrets/`.
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
* Set the OpenRouter model string in `settings.jsonc`.
* Keep API keys out of readmes, logs, screenshots, and public commits.

## Agent Settings

* `identity` : The bot's name, unique ID, and nicknames.
* `enabled_skills` : Optional implemented skills to load.
* `system_prompt_file` : Usually `soul/persona.md`.
* `memory_forum_channel_id` : Required Discord forum channel ID for memory posts.
* `memory_forum_posts` : Core memory post names created by `/setupmemoryforum`, including `help` for a clean command reference.
* `location_reply_policy` : Servers and channels where the bot can reply.
* `user_reply_policy` : Users the bot can or cannot reply to.
* `bot_reply_policy` : Other bot IDs this bot is allowed to reply to.
* `conversation_history_limit` : Number of recent messages sent as hidden model context.
* `chaos` : OpenRouter temperature; higher is looser, lower is steadier.
* `max_tokens` : Maximum generated output tokens.
* `discord_reply_character_limit` : Maximum Discord reply characters before truncation.

## Persona And Memory

* `soul/persona.md` : Identity, voice, preferences, boundaries, and behavior guidance.
* `soul/longmemory.txt` : Compact durable memory sent as hidden context. It should keep `# Past`, `# Present`, and `# Future / Plans` sections.
* `soul/shortmemory.jsonl` : Recent local shortmemory cache and fallback.
* `soul/art/` : Placeholder folder for future art context.
* `soul/dreams/` : Dream output folder used by the pipe dream command.
* `soul/emojis/` : Placeholder folder for future emoji behavior.
* `soul/stories/` : Story output folder used by `||@agent story||`.
* `soul/status.json` : Current agent state used by core replies and status-aware skills. Current modes are `awake`, `sleepy`, `sleeping`, `dreaming`, `busy`, and `away`.

## Runtime Commands

```powershell
cd C:\Users\argit\Documents\_PROGRAMMING\aiassistant\discord-bot
$env:AGENT_NAME='<YourAgentName>'
npm.cmd run install:deps
npm.cmd run check
npm.cmd start
```

## Discord Slash Commands

* `/reloadpersona` : Reloads persona from the configured forum post/thread or local `soul/persona.md`.
* `/clearshortmemory` : Clears local shortmemory, live recent context, and bot-written `shortmemory:` entries in Discord.
* `/clean adjustments` : Deletes messages inside the Discord `adjustments` memory post. For now, this command only cleans adjustment audit entries.
* `/setupmemoryforum` : Creates missing memory posts in the configured memory forum.
* `/scrapeshortmemory` : Appends recent channel messages to shortmemory, ending at the agent's latest reply in that channel.
* `/scrapedmshortmemory` : Appends recent DMs with the command user to shortmemory, ending at the agent's latest DM reply.
* `/uploadstory filename` : Uploads a local Markdown file from `soul/stories/` to the Discord `stories` memory forum post. `.md` is assumed if omitted, and long stories are split across multiple replies.
* `❌ reaction` : Deletes a bot reply and removes the matching assistant shortmemory entry.

## Pipe Text

* `||@agent reply||` : Has the agent continue the story from recent context. In DMs, `@agent` is optional.
* `normal text ||@agent subtext: private text||` : Inline private subtext lets you communicate assumptions and quick persona adjustments. It is not spoken text to quote or answer directly, and it may be loosely stored later by summaries. In DMs, `@agent` is optional.
* `||@agent adjust: adjustment instructions||` : Gives instructions for adjusting the previous bot reply. The bot deletes the old reply, redoes the reply, and updates the matching shortmemory entry.
* `||@agent summarize||` : Summarizes recent shortmemory into `soul/longmemory.txt`. In DMs, `@agent` is optional.
* `||@agent story||` : Writes a short story from recent context and longmemory, then saves it in `soul/stories/` and posts it to the `stories` memory forum post. In DMs, `@agent` is optional.
* `||@agent story: story prompt||` : Writes a short story using the prompt plus shortmemory and longmemory.
* `||@agent music||` : Optional skill command, available only when the `music` skill is enabled. In DMs, `@agent` is optional.
* `||@agent music: description or link||` : Optional music skill command with direct input.
* `||@agent sleep||` : Sets `soul/status.json` mode to `sleeping`.
* `||@agent wake||` : Sets `soul/status.json` mode to `awake`.
* `||@agent busy||` : Sets `soul/status.json` mode to `busy`; normal replies only happen when the agent is directly mentioned or named.
* `||@agent away||` : Sets `soul/status.json` mode to `away`; normal replies are blocked until status changes.
* `||@agent status||` : Shows the current status mode, energy, and current activity.
* `||@agent passtimeminutes: 60||` : Queues explicit experienced time for the agent before their next reply and updates energy when sleeping or dreaming.
* `||@agent dream: dream seed text||` : Generates one dream from memory, previous dreams, and the seed text. In DMs, `@agent` is optional. This requires status mode `sleeping`.
* `||@agent dream||` : Generates an automatic dream from context and previous dreams. In DMs, `@agent` is optional. This requires status mode `sleeping`.
* automatic status inference : The `time` skill can update `soul/status.json` after normal replies when the latest exchange clearly implies sleep, waking, dreaming, busy, away, or another state. It keeps the current state when clues are weak or metaphorical.

## Skills

Implemented skills live in `discord-bot/skills/`.

* Enable a skill by adding its name to `enabled_skills`.
* Each implemented skill owns its own settings and slash commands.
* Status-aware skills use `soul/status.json` and should clearly state which modes they require.
* Planned placeholder skills should not be enabled until they are implemented.
* Skill-specific memory forum posts are created only when the skill is enabled and implemented.

## Current Architecture

The shared runtime handles Discord login, slash commands, reply policy, memory forum setup, shortmemory logging, and OpenRouter requests.

The context assembler builds each normal model request from:

* `soul/persona.md`
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

* `||@agent summarize||` : First, summarize recent shortmemory and adjustment history into `soul/longmemory.txt`.
* review summary result : Check that the useful adjustment lessons made it into longmemory.
* `/clean adjustments` : After review, delete the adjustment audit entries from Discord.

## Safety Notes

* Never commit real Discord app tokens or OpenRouter keys.
* Treat any token shown in screenshots or chat as exposed and rotate it.
* Do not run two processes for the same Discord app token.
* If a bot logs in as the wrong Discord account, check that the agent's token file contains the correct Discord app token.
