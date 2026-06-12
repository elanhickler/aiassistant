# aiassistant

Starter project for a multi-agent AI assistant system.

## File Map

* `README.md` : This project overview.

* `agents/` : One folder per assistant, bot, or agent identity.

* `discord-bot/` : Shared Discord/OpenRouter runtime code used by agents.
    * `.gitignore` : Keeps local secrets and regenerated dependency folders out of git.
    * `.npmrc` : Prevents npm from writing a root `package-lock.json`.
    * `bot.js` : Shared Discord bot runtime. Uses `AGENT_NAME` to choose an agent folder and defaults to `Stardust`.
    * `context.js` : Builds OpenRouter request context from persona, longmemory, recent shortmemory, and enabled skill context blocks.
    * `package.json` : Runtime scripts for installing dependencies, checking syntax, and starting the bot.
    * `skills/` : Optional skill modules loaded through each agent's `enabled_skills` setting.
        * `README.md` : Skills overview.
        * `music.js` : Optional pipe-command music skill.
        * `placeholders.js` : Registry of planned skills that are documented but not implemented yet.
        * `time.js` : Optional pipe-command time, sleep, status, and dream skill.
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

## Discord Slash Commands

* `/reloadpersona` : Reloads the agent persona. If `persona_source_thread_id` is set, it grabs message text from that Discord forum post/thread into `soul/persona.md` first.
* `/clearshortmemory` : Clears the agent's `soul/shortmemory.jsonl` file, clears the live recent context held by the running bot process, and deletes bot-written `shortmemory:` entries from the Discord shortmemory forum post.
* `/clean adjustments` : Deletes messages inside the Discord `adjustments` memory post. For now, this command only cleans adjustment audit entries.
* `/setupmemoryforum` : Populates the agent's Discord memory forum with core memory posts plus posts for enabled implemented skills. `memory_forum_channel_id` is required; the bot errors at startup if it is blank. The bot must be able to view and send messages in that forum.
* `/syncshortmemory direction` : Syncs shortmemory between local `soul/shortmemory.jsonl` and the Discord shortmemory forum post. Direction can be `both`, `local to discord`, or `discord to local`.
* `/scrapeshortmemory channel_id` : Appends recent messages from a channel to shortmemory, ending at the agent's latest reply in that channel. Uses `conversation_history_limit` as the scrape size, capped at Discord's recent-message fetch limit. This is a dumb recovery tool; it does not summarize or dedupe.
* `/scrapedmshortmemory` : Appends recent DMs between the command user and the agent to shortmemory, ending at the agent's latest DM reply. Uses `conversation_history_limit` as the scrape size.
* `/uploadstory filename` : Uploads a local Markdown file from `soul/stories/` to the Discord `stories` memory forum post. `.md` is assumed if omitted, and long stories are split across multiple replies.
* `❌ reaction` : React to a bot reply with ❌ to delete that reply and remove its matching assistant entry from local and Discord shortmemory.

## Pipe Text

* `||@agent reply||` : Has the agent continue the story from recent context. In DMs, `@agent` is optional.
* `normal text ||@agent subtext: private text||` : Inline private subtext lets you communicate assumptions and quick persona adjustments. It is not spoken text to quote or answer directly, and it may be loosely stored later by summaries. In DMs, `@agent` is optional.
* `||@agent adjust: adjustment instructions||` : Gives instructions for adjusting the previous bot reply. The bot deletes the old reply, redoes the reply, and updates the matching shortmemory entry.
* `||@agent summarize||` : Summarizes recent shortmemory into `soul/longmemory.txt`. In DMs, `@agent` is optional.
* `||@agent story||` : Writes a short story from recent context and longmemory, then saves it in `soul/stories/` and posts it to the `stories` memory forum post. In DMs, `@agent` is optional.
* `||@agent story: story prompt||` : Writes a short story using the prompt plus shortmemory and longmemory.
* `||@agent music||` : Optional `music` skill. Infers the latest music request from shortmemory, posts a formatted music link, and archives it to the configured music thread. In DMs, `@agent` is optional.
* `||@agent music: description or link||` : Optional `music` skill with direct input. Can use a music description, a specific music link, or `Artist - Song | https://...`.
* `||@agent sleep||` : Sets `soul/status.json` mode to `sleeping`.
* `||@agent wake||` : Sets `soul/status.json` mode to `awake`.
* `||@agent busy||` : Sets `soul/status.json` mode to `busy`; normal replies only happen when the agent is directly mentioned or named.
* `||@agent away||` : Sets `soul/status.json` mode to `away`; normal replies are blocked until status changes.
* `||@agent status||` : Shows the current status mode, energy, and current activity.
* `||@agent passtimeminutes: 60||` : Queues explicit experienced time for the agent before their next reply and updates energy when sleeping or dreaming.
* `||@agent dream: dream seed text||` : Generates one dream from memory, previous dreams, and the seed text. In DMs, `@agent` is optional. This requires status mode `sleeping`.
* `||@agent dream||` : Generates an automatic dream from context and previous dreams. In DMs, `@agent` is optional. This requires status mode `sleeping`.
* automatic status inference : The `time` skill can update `soul/status.json` after normal replies when the latest exchange clearly implies sleep, waking, dreaming, busy, away, or another state. It keeps the current state when clues are weak or metaphorical.

## Error Messages

* Slash command errors : Ephemeral Discord replies where Discord supports them.
* DM and normal message errors : Temporary bot replies that auto-delete after 30 seconds.

## Agent Secrets

Each agent keeps its own secrets under `agents/<AGENT_NAME>/secrets/`.

## Context Assembly

Each normal reply sends an assembled OpenRouter request instead of only `soul/persona.md`.

* `soul/persona.md` : Identity and behavior anchor.
* `soul/longmemory.txt` : Durable compact memory sent as hidden context when present. It uses explicit `# Past`, `# Present`, and `# Future / Plans` sections.
* `soul/shortmemory.jsonl` : Recent local shortmemory lines sent as hidden context.
* `shortmemory` Discord forum post : Mirrored shortmemory authority when available. If `shortmemory_thread_id` is blank, the bot finds this post from the memory forum.
* `help` Discord forum post : Clean command reference for slash commands, pipe commands, and delete reaction behavior.
* `longmemory` Discord forum post : Receives a latest longmemory preview/notice from `||@agent summarize||`. The full memory is only stored in the local txt file because Discord posts have text limits.
* `adjustments` Discord forum post : Receives an audit entry whenever `||@agent adjust: ...||` replaces a reply.
* `status` Discord forum post : Receives a status dump whenever status changes, including AI-inferred status changes.
* `summarization_settings.summary_policy` : Summarization guidance. Remember durable per-user context when it improves future replies, but do not save every passing detail. Longmemory keeps `# Past`, `# Present`, and `# Future / Plans`.
* automatic summarization : Runs in the background after enough new shortmemory has accumulated. It uses `conversation_history_limit` as the rough trigger size and does not block normal chat replies.
* `dream_settings` : Controls the dream part of the `time` skill. `||@agent dream||` requires `soul/status.json` mode `sleeping`, reads configured source files and previous dreams, writes a dream draft into `soul/dreams`, and does not update longmemory.
* `||@agent passtimeminutes: 60||` : Adds a one-shot hidden time passage block to the next normal reply.
* `enabled_skills` : Implemented skills may contribute small context blocks.
* `soul/status.json` : Current agent state used by core replies and status-aware skills. `mode` is the primary state; `status` contains boolean flags. Current modes are `awake`, `sleepy`, `sleeping`, `dreaming`, `busy`, and `away`. `busy` only allows direct attention; `away` blocks normal replies.
* `soul/dreams/` : Dream output folder used by the pipe dream command.
* `soul/stories/` : Story output folder used by `||@agent story||`.
* `soul/art/` and `soul/emojis/` : Placeholder content folders. They are not automatically sent until a future skill or retrieval feature chooses them.

## Memory Maintenance Flow

* `||@agent summarize||` : First, summarize recent shortmemory and adjustment history into `soul/longmemory.txt`.
* review summary result : Check that the useful adjustment lessons made it into longmemory.
* `/clean adjustments` : After review, delete the adjustment audit entries from Discord.
