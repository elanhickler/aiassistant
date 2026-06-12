# Trish

Trish is an agent in the `aiassistant` multi-agent project.

## File Map

* `settings.jsonc` : Trish's commented runtime settings.
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
    * `shortmemory.jsonl` : Local safety fallback/cache for shortmemory. When `shortmemory_thread_id` is set, Discord is the authority and startup syncs that forum post/thread back into this file.
    * `status.json` : Current Trish state used by core replies and status-aware skills.
    * `stories/` : Story drafts, lore, scenes, and character writing that can later help long-term summaries or prompt context. Prefer `.txt` for plain text, `.md` for human-readable structured notes, and `.jsonl` only when storing many structured story entries one per line.

## Memory And Cost

OpenRouter does not have a special long memory slot for this bot. Anything the bot wants the model to know must be sent as text in the request, and that text costs tokens.

* `soul/persona.md` : Keep short and stable. This is sent as behavior and identity instructions.
* `persona_source_thread_id` : Found in `settings.jsonc`; when filled with a Discord forum post/thread ID, `/reloadpersona` grabs that post's message text into `soul/persona.md` and reloads it. In Discord's API, forum posts are threads.
* `enabled_skills` : Found in `settings.jsonc`; lists optional shared bot skills loaded for Trish. Trish currently enables `time` and `music`.
* `access_thread_id` : Found in `settings.jsonc`; when filled with a Discord forum post/thread ID, this gives Trish a configured place to read extra agent-specific information later.
* `shortmemory_thread_id` : Found in `settings.jsonc`; when filled with a Discord forum post/thread ID, Discord is the authority for shortmemory. If blank, the bot finds the `shortmemory` post in the memory forum. New entries are mirrored there, and startup syncs local `soul/shortmemory.jsonl` with Discord.
* `music_skill.music_thread_id` : Found in `settings.jsonc`; required only when `enabled_skills` contains `music`. `||@trish music||` copies posted music links there.
* `memory_forum_channel_id` : Found in `settings.jsonc`; required Discord forum channel ID for Trish's memory forum. The bot errors at startup if this is blank.
* `memory_forum_posts` : Found in `settings.jsonc`; core memory forum posts that startup and `/setupmemoryforum` create or confirm: help, emoji, persona, adjustments, status, profilepic, longmemory, shortmemory, dreams, art, and stories. Skill posts such as music are added only when that skill is enabled and implemented.
* `music_skill` : Found in `settings.jsonc`; contains `music_thread_id`, `website_config_url`, plus one boolean per music site, such as `youtube_enabled`, `bandcamp_enabled`, and `soundcloud_enabled`. Known-song requests use catalog-style sites; vibe requests use YouTube discovery.
* `planned_skill_settings` : Found in `settings.jsonc`; placeholder settings for future skills. These do not do anything until the matching skill is implemented.
* `soul/longmemory.txt` : Keep compact and important. This is sent as hidden durable context and should contain durable facts, preferences, relationship context, ongoing project context, and plans, not raw transcripts. It uses `# Past`, `# Present`, and `# Future / Plans`.
* `longmemory` Discord forum post : Receives a latest longmemory preview/notice after `||@trish summarize||`. The full memory is only stored in the local txt file because Discord posts have text limits.
* `soul/shortmemory.jsonl` : Local shortmemory fallback/cache. Recent entries are sent as hidden context. This is useful for audit and future summarization, but when `shortmemory_thread_id` is set the Discord copy should be treated as the source of truth.
* `conversation_history_limit` : Found in `settings.jsonc`; controls how much recent conversation is sent as hidden context. Higher values remember more but cost more per reply.
* `/clearshortmemory` : Clears `soul/shortmemory.jsonl`, live recent context, and bot-written `shortmemory:` entries in the Discord shortmemory forum post.
* `/clean adjustments` : Deletes messages inside the Discord `adjustments` memory post.
* `/syncshortmemory` : Syncs local `soul/shortmemory.jsonl` with the Discord shortmemory forum post. Use `both` to push missing local entries and then refresh local from Discord.
* `/scrapeshortmemory` : Appends recent channel messages to shortmemory, ending at Trish's latest reply in that channel. Uses `conversation_history_limit` as the scrape size. This is for blunt recovery when local and Discord shortmemory are missing context.
* `/scrapedmshortmemory` : Appends recent DMs with the command user to shortmemory, ending at Trish's latest DM reply.
* `/uploadstory filename` : Uploads a local Markdown file from `soul/stories/` to the Discord `stories` memory forum post. `.md` is assumed if omitted, and long stories are split across multiple replies.
* automatic summarization : Runs in the background when enough new shortmemory has accumulated, using `conversation_history_limit` as the rough trigger size.
* `❌ reaction` : Deletes a Trish reply and removes the matching assistant shortmemory entry.
* `||@trish reply||` : Has Trish continue the story from recent context. In DMs, `@trish` is optional.
* `normal text ||@trish subtext: private text||` : Inline private subtext lets you communicate assumptions and quick persona adjustments. It is not spoken text to quote or answer directly, and it may be loosely stored later by summaries. In DMs, `@trish` is optional.
* `||@trish adjust: adjustment instructions||` : Gives instructions for adjusting the previous Trish reply. Trish deletes the old reply, redoes the reply, and updates the matching shortmemory entry.
* `||@trish summarize||` : Summarizes recent shortmemory into `soul/longmemory.txt`. In DMs, `@trish` is optional.
* `||@trish story||` : Writes a short story from recent context and longmemory, then saves it in `soul/stories/` and posts it to the `stories` memory forum post. In DMs, `@trish` is optional.
* `||@trish story: story prompt||` : Writes a short story using the prompt plus shortmemory and longmemory.
* `||@trish music||` : Infers the latest music request from shortmemory, posts a formatted music link, and archives it to the configured music thread. In DMs, `@trish` is optional.
* `||@trish music: description or link||` : Runs the music skill with direct input.
* `||@trish sleep||` : Sets `soul/status.json` mode to `sleeping`.
* `||@trish wake||` : Sets `soul/status.json` mode to `awake`.
* `||@trish busy||` : Sets `soul/status.json` mode to `busy`; normal replies only happen when Trish is directly mentioned or named.
* `||@trish away||` : Sets `soul/status.json` mode to `away`; normal replies are blocked until status changes.
* `||@trish status||` : Shows the current status mode, energy, and current activity.
* `||@trish passtimeminutes: 60||` : Queues explicit experienced time for Trish before her next reply and updates energy when sleeping or dreaming.
* `||@trish dream: dream seed text||` : Generates one dream from memory, previous dreams, and the seed text. In DMs, `@trish` is optional. This requires status mode `sleeping`.
* `||@trish dream||` : Generates an automatic dream from context and previous dreams. In DMs, `@trish` is optional. This requires status mode `sleeping`.
* `soul/dreams/` : Dream output folder used by the pipe dream command.
* `soul/stories/` : Story output folder used by `||@trish story||`.
* `soul/art/` and `soul/emojis/` : Not sent by default. These are placeholder content folders until future skills or targeted retrieval use them.

The ideal pattern is to summarize, review, then prune: run `||@trish summarize||`, check `soul/longmemory.txt`, then run `/clean adjustments` only after the useful adjustment lessons made it into memory.
