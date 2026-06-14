# Trish

Trish is an agent in the `aiassistant` multi-agent project.

## File Map

* `settings.jsonc` : Trish's runtime setting overrides. Shared defaults live in `../../settings.jsonc`.
* `start_trish_discord_bot.bat` : Double-click launcher that starts the shared Discord bot runtime as Trish.
* `secrets/` : Trish's local secret text files.
    * `discord_token.txt` : Trish's Discord app token from Discord Developer Portal > app > Bot > Token.
    * `openrouter_api_key.txt` : Trish's OpenRouter API key.

* `soul/` : Trish's long-term memory files plus creative soul folders.
    * `art/` : Visual art and image references for Trish.
    * `dreams/` : Literal dream drafts, surreal memory fragments, and proposed summary drafts created by future background processes.
    * `emojis/` : Custom emoji assets and notes for Trish.
    * `longmemory.txt` : Long memory file that summarization updates with `# Past`, `# Present`, and `# Future / Plans` sections.
    * `persona.md` : Trish's persona; each time the bot asks OpenRouter's AI model to write a reply, it sends this Markdown text as the instruction for how Trish should behave. This can include personality descriptors, what to say when, and conversationally written guidance.
    * `raw.txt` : Latest OpenRouter message text uploaded by Trish. This overwrites on each OpenRouter request and is for checking exactly what context was sent.
    * `shortmemory.jsonl` : Local safety fallback/cache for shortmemory. When `shortmemory_thread_id` is set, Discord is the authority and startup syncs that forum post/thread back into this file.
    * `status.json` : Current Trish state used by core replies and status-aware skills.
    * `stories/` : Story drafts, lore, scenes, and character writing that can later help long-term summaries or prompt context. Prefer `.txt` for plain text, `.md` for human-readable structured notes, and `.jsonl` only when storing many structured story entries one per line.

## Memory And Cost

OpenRouter does not have a special long memory slot for this bot. Anything the bot wants the model to know must be sent as text in the request, and that text costs tokens.

* `soul/persona.md` : Keep short and stable. This is sent as behavior and identity instructions.
* `soul/raw.txt` : Latest OpenRouter message text snapshot. It overwrites on normal replies, stories, summaries, music inference, dreams, and status inference.
* `BRING_ONLINE.md` : Step-by-step Discord application, OAuth, memory forum, and first-test checklist.
* `backups/` : Automatic timestamped backups before major local overwrites.
* `../../settings.jsonc` : Global defaults used by Trish unless `settings.jsonc` overrides them.
* `settings.jsonc` : Trish-only overrides such as identity, enabled skills, memory forum IDs, thread IDs, reply channels, and music archive thread.
* `identity.mention_role_ids` : Discord role IDs that count as targeting Trish inside pipe commands.
* `persona_source_thread_id` : Trish override; when filled with a Discord forum post/thread ID, `/reloadpersona` grabs that post's message text into `soul/persona.md` and reloads it. In Discord's API, forum posts are threads.
* `enabled_skills` : Trish overrides the global optional-skill list to enable `music` and `discordstatusupdate`. Time and story are core systems and always loaded.
* `access_thread_id` : Trish override for extra agent-specific information later.
* `shortmemory_thread_id` : Trish override where Discord shortmemory is mirrored and treated as authority.
* `music_skill.music_thread_id` : Trish override required because `music` is enabled.
* `memory_forum_channel_id` : Required Trish override for the Discord memory forum channel ID.
* `memory_forum_posts` : Global default list of core memory forum posts.
* `planned_skill_settings` : Global placeholder settings for future skills. These do not do anything until the matching skill is implemented.
* `soul/longmemory.txt` : Keep compact and important. This is sent as hidden durable context and should contain durable facts, preferences, relationship context, ongoing project context, and plans, not raw transcripts. It uses `# Past`, `# Present`, and `# Future / Plans`.
* `longmemory` Discord forum post : Receives a latest longmemory preview/notice after `||@trish summarize||`. The full memory is only stored in the local txt file because Discord posts have text limits.
* `soul/shortmemory.jsonl` : Local shortmemory fallback/cache. Recent entries are sent as hidden context. This is useful for audit and future summarization, but when `shortmemory_thread_id` is set the Discord copy should be treated as the source of truth.
* `conversation_history_limit` : Found in global `settings.jsonc` unless overridden; controls how much recent conversation is sent as hidden context. Higher values remember more but cost more per reply.
* `/clearshortmemory` : Clears `soul/shortmemory.jsonl`, live recent context, and bot-written `shortmemory:` entries in the Discord shortmemory forum post.
* `/raw` : Shows the latest OpenRouter message text uploaded by Trish. Large raw prompts are sent as a private text file attachment.
* `/syncshortmemory` : Syncs local `soul/shortmemory.jsonl` with the Discord shortmemory forum post. Use `both` to push missing local entries and then refresh local from Discord.
* `/scrapeshortmemory` : Reads all available channel message pages, anchors at Trish's latest reply when one exists, appends new entries to shortmemory, dedupes, and rewrites local shortmemory in timestamp order.
* `/scrapedmshortmemory` : Reads all available DM message pages with the command user, anchors at Trish's latest DM reply when one exists, appends new entries to shortmemory, dedupes, and rewrites local shortmemory in timestamp order.
* `/uploadstory filename` : Story command that uploads a local Markdown file from `soul/stories/` to the Discord `stories` memory forum post. `.md` is assumed if omitted, and long stories are split across multiple replies.
* automatic summarization : Runs in the background when enough new shortmemory has accumulated, using `conversation_history_limit` as the rough trigger size.
* automatic Discord status update : When summarization succeeds, `discordstatusupdate` writes a natural-language status note into `soul/status.json` and mirrors it to the `status` Discord forum post.
* `❌ delete reaction` : React with `:x:` to delete a Trish reply and remove the matching assistant shortmemory entry.
* `🔁 redo reaction` : React with `:repeat:` to delete a Trish reply from memory and generate a fresh answer to the previous user message.
* `⏪ rewind reaction` : React with `:rewind:` to delete a Trish reply, remove that one assistant shortmemory entry, and remove the previous user message from shortmemory only.
* `▶️ replace reaction` : React with `:arrow_forward:` to make Trish temporarily say `next reply replaces my text`.
* `🎵 music reaction` : React with `:musical_note:` to run the music skill from recent shortmemory and post a formatted music link.
* `||@trish reply||` : Has Trish continue the story from recent context. In DMs, `@trish` is optional.
* `normal text ||@trish subtext: private text||` : Inline private subtext lets you communicate assumptions and quick persona adjustments. It is not spoken text to quote or answer directly, and it may be loosely stored later by summaries. In DMs, `@trish` is optional.
* `||@trish adjust: adjustment instructions||` : Redoes the previous Trish reply with adjustment instructions. Trish deletes the old reply, removes that assistant shortmemory entry, and writes a replacement reply to the original user message.
* `||@trish summarize||` : Summarizes recent shortmemory into `soul/longmemory.txt`, posts a longmemory preview, and cleans adjustment audit messages. In DMs, `@trish` is optional.
* `||@trish story||` : Story command that writes an evidence-grounded short story from saved stories, recent shortmemory, and longmemory, then saves it in `soul/stories/` and posts it to the `stories` memory forum post. In DMs, `@trish` is optional.
* `||@trish story: story prompt||` : Story command that searches saved stories, shortmemory, and longmemory for the requested subject, then writes only what the evidence supports.
* story recall : Normal messages that ask about saved stories search `soul/stories/`, combine that with shortmemory and longmemory context, and let Trish answer with a focused summary or explanation without inventing unsupported details.
* `||@trish music||` : Infers the latest music request from shortmemory, posts a formatted music link, and archives it to the configured music thread. In DMs, `@trish` is optional.
* `||@trish music: description or link||` : Runs the music skill with direct input.
* `||@trish sleep||` : Sets `soul/status.json` mode to `sleeping`.
* `||@trish wake||` : Sets `soul/status.json` mode to `awake`.
* `||@trish away||` : Sets `soul/status.json` mode to `away`; normal replies are blocked until status changes.
* `||@trish state||` : Shows the raw state mode, energy, and current activity.
* `||@trish status||` : Generates a natural-language status update from memory and current state.
* `||@trish status: text||` : Generates a natural-language status update using text as the basis or suggested status.
* `||@trish passtimeminutes: 60||` : Queues explicit experienced time for Trish before her next reply and updates energy when sleeping or dreaming.
* `||@trish passtimehours: 8||` : Queues explicit experienced time in hours for longer sleep or dream gaps.
* `||@trish dream: dream seed text||` : Generates one dream from memory, previous dreams, and the seed text. In DMs, `@trish` is optional. This requires status mode `sleeping`.
* `||@trish dream||` : Generates an automatic dream from context and previous dreams. In DMs, `@trish` is optional. This requires status mode `sleeping`.
* `soul/dreams/` : Dream output folder used by the pipe dream command.
* `soul/stories/` : Story output folder used by `||@trish story||` and searched by story recall.
* `soul/art/` and `soul/emojis/` : Not sent by default. These are placeholder content folders until future skills or targeted retrieval use them.

The memory maintenance pattern is now one action: run `||@trish summarize||`, then check `soul/longmemory.txt`. Summarize also cleans adjustment audit messages after longmemory is written.
