# Stardust

Stardust is the first agent in the `aiassistant` multi-agent project.

## File Map

* `settings.jsonc` : Stardust's runtime setting overrides. Shared defaults live in `../../settings.jsonc`.
* `start_stardust_discord_bot.bat` : Double-click launcher that starts the shared Discord bot runtime as Stardust.
* `secrets/` : Stardust's local secret text files.
    * `discord_token.txt` : Stardust's Discord app token from Discord Developer Portal > app > Bot > Token.
    * `openrouter_api_key.txt` : Stardust's OpenRouter API key.

* `soul/` : Stardust's long-term memory files plus creative soul folders.
    * `art/` : Visual art and image references for Stardust.
    * `dreams/` : Literal dream drafts, surreal memory fragments, and proposed summary drafts created by future background processes.
    * `thoughts/` : First-person internal thought files. Thoughts are softer than shortmemory and can feed stories, dreams, and end-of-day memory work.
    * `emojis/` : Custom emoji assets and notes for Stardust.
    * `visual-references/` : Downloaded or manually collected visual references for future visual expression work. Keep source and attribution notes beside internet downloads.
    * `memorysummary.txt` : Memorysummary file that summarization updates with `# Past`, `# Present`, and `# Future / Plans` sections.
    * `persona.md` : Stardust's persona; each time the bot asks OpenRouter's AI model to write a reply, it sends this Markdown text as the instruction for how Stardust should behave. This can include personality descriptors, what to say when, and conversationally written guidance.
    * `raw/` : Latest OpenRouter request split into readable text parts for checking exactly what context was sent.
    * `raw.txt` : Concatenated compatibility copy of the latest `raw/` parts.
    * `shortmemory.jsonl` : Local safety fallback/cache for shortmemory. When `shortmemory_thread_id` is set, Discord is the authority and startup syncs that forum post/thread back into this file.
    * `trash/shortmemory-trash.jsonl` : Recoverable local trash for shortmemory entries. Trashed entries are not used for replies, memory updates, stories, or dreams.
    * `status.json` : Current Stardust state used by core replies and status-aware skills.
    * `stories/` : Story drafts, lore, scenes, and character writing that can later help durable memory entries or prompt context. Prefer `.txt` for plain text, `.md` for human-readable structured notes, and `.jsonl` only when storing many structured story entries one per line.

## Memory And Cost

OpenRouter does not have a special Memorysummary slot for this bot. Anything the bot wants the model to know must be sent as text in the request, and that text costs tokens.

* `soul/persona.md` : Keep short and stable. This is sent as behavior and identity instructions.
* `soul/raw/` : Latest OpenRouter message text split into readable parts.
* `soul/raw.txt` : Concatenated compatibility copy of the latest raw parts.
* `BRING_ONLINE.md` : Step-by-step Discord application, OAuth, memory forum, and first-test checklist.
* `backups/` : Automatic timestamped backups before major local overwrites.
* `../../settings.jsonc` : Global defaults used by Stardust unless `settings.jsonc` overrides them.
* `settings.jsonc` : Stardust-only overrides such as identity, memory forum ID, reply channels, and Tupper compatibility.
* `persona_source_thread_id` : Global default is blank; when filled with a Discord forum post/thread ID, `/reloadpersona` grabs that post's message text into `soul/persona.md` and reloads it. In Discord's API, forum posts are threads.
* `enabled_skills` : Global default currently enables optional `discordstatusupdate`; override this list only when Stardust needs a different optional skill set. Time, thought, and story are core systems and always loaded.
* `memory_forum_channel_id` : Required Stardust override for the Discord memory forum channel ID.
* `music_skill.music_thread_id` : Required only when `enabled_skills` contains `music`.
* `memory_forum_posts` : Global default list of core memory forum posts.
* `planned_skill_settings` : Global placeholder settings for future skills. These do not do anything until the matching skill is implemented.
* `soul/memorysummary.txt` : Keep compact and important. This is sent as hidden durable context and should contain durable facts, preferences, relationship context, ongoing project context, and plans, not raw transcripts. It uses `# Past`, `# Present`, and `# Future / Plans`.
* `Memorysummary` Discord forum post : Receives a latest Memorysummary preview/notice after `||@stardust summarize||`. The full memory is only stored in the local txt file because Discord posts have text limits.
* `soul/shortmemory.jsonl` : Local shortmemory fallback/cache. Recent entries are sent as hidden context. This is useful for audit and future summarization, but when `shortmemory_thread_id` is set the Discord copy should be treated as the source of truth.
* `soul/trash/shortmemory-trash.jsonl` : Recoverable local trash for shortmemory entries. Scheduled automatic memory cycles age this trash and delete entries after `shortmemory_trash.keep_auto_summary_cycles`.
* `recent_context_entries` : Found in global `settings.jsonc` unless overridden; controls how much recent conversation is sent as hidden context on normal replies. Higher values remember more but cost more per reply.
* `/clearshortmemory` : Clears `soul/shortmemory.jsonl`, live recent context, and bot-written `shortmemory:` entries in the Discord shortmemory forum post.
* `/raw` : Shows the latest OpenRouter message text uploaded by Stardust. Large raw prompts are sent as a private text file attachment.
* `/syncshortmemory` : Syncs local `soul/shortmemory.jsonl` with the Discord shortmemory forum post. Use `both` to push missing local entries and then refresh local from Discord.
* `/scrapeshortmemory` : Reads all available channel message pages, anchors at Stardust's latest reply when one exists, appends new entries to shortmemory, dedupes, and rewrites local shortmemory in timestamp order.
* `/scrapedmshortmemory` : Reads all available DM message pages with the command user, anchors at Stardust's latest DM reply when one exists, appends new entries to shortmemory, dedupes, and rewrites local shortmemory in timestamp order.
* `/uploadstory filename` : Story command that uploads a local Markdown file from `soul/stories/` to the Discord `stories` memory forum post. `.md` is assumed if omitted, and long stories are split across multiple replies.
* automatic summarization : Runs in the background when a daily-sized amount of new shortmemory has accumulated. Entering sleep also runs the daily summary when `summarization_settings.summarize_on_sleep` is true.
* automatic Discord status update : When summarization succeeds, `discordstatusupdate` writes a natural-language status note into `soul/status.json` and mirrors it to the `status` Discord forum post.
* `❌ delete reaction` : React with `:x:` to delete a Stardust reply and remove the matching assistant shortmemory entry.
* `🔁 redo reaction` : React with `:repeat:` to delete a Stardust reply from memory and generate a fresh answer to the previous user message.
* `⏪ rewind reaction` : React with `:rewind:` to delete a Stardust reply, remove that one assistant shortmemory entry, and remove the previous user message from shortmemory only.
* `▶️ continue reaction` : React with `:arrow_forward:` to have Stardust continue from the current scene without adding a pipe command to shortmemory.
* `🎵 music reaction` : React with `:musical_note:` to run the music skill from recent shortmemory and post a formatted music link.
* `||@stardust reply||` : Has Stardust continue the story from recent context. In DMs, `@stardust` is optional.
* direct Stardust control : Natural text like `Stardust is...`, `Stardust has...`, or `Stardust does...` is treated as authoritative roleplay direction for Stardust, similar to a softer in-scene adjustment.
* `normal text ||@stardust subtext: private text||` : Inline private subtext lets you communicate assumptions and quick persona adjustments. It is not spoken text to quote or answer directly, and it may be loosely stored later by memory updates. In DMs, `@stardust` is optional.
* `||@stardust adjust: adjustment instructions||` : Redoes the previous Stardust reply with adjustment instructions. Stardust deletes the old reply, removes that assistant shortmemory entry, and writes a replacement reply to the original user message.
* `||@stardust summarize||` : Summarizes recent shortmemory into `soul/memorysummary.txt`, posts a Memorysummary preview, and cleans adjustment audit messages. In DMs, `@stardust` is optional.
* `||@stardust thought: thought prompt||` : Writes a first-person internal thought from the prompt, shortmemory, Memorysummary, and recent thoughts.
* `||@stardust story||` : Story command that writes an evidence-grounded short story from saved stories, recent shortmemory, and Memorysummary, then saves it in `soul/stories/` and posts it to the `stories` memory forum post. In DMs, `@stardust` is optional.
* `||@stardust story: story prompt||` : Story command that searches saved stories, shortmemory, and Memorysummary for the requested subject, then writes only what the evidence supports.
* story recall : Normal messages that ask about saved stories search `soul/stories/`, combine that with shortmemory and Memorysummary context, and let Stardust answer with a focused summary or explanation without inventing unsupported details.
* `||@stardust music||` : Infers the latest music request from shortmemory, posts a formatted music link, and archives it to the configured music thread. In DMs, `@stardust` is optional.
* `||@stardust music: description or link||` : Runs the music skill with direct input.
* `||@stardust sleep||` : Sets `soul/status.json` mode to `sleeping`.
* `||@stardust wake||` : Sets `soul/status.json` mode to `awake`.
* `||@stardust away||` : Sets `soul/status.json` mode to `away`; normal replies are blocked until status changes.
* `||@stardust state||` : Shows the raw state mode, energy, and current activity.
* `||@stardust status||` : Generates a natural-language status update from memory and current state.
* `||@stardust status: text||` : Generates a natural-language status update using text as the basis or suggested status.
* `||@stardust passtimeminutes: 60||` : Queues explicit experienced time for Stardust before her next reply and updates energy when sleeping or dreaming.
* `||@stardust passtimehours: 8||` : Queues explicit experienced time in hours for longer sleep or dream gaps.
* `||@stardust dream: dream seed text||` : Generates one dream from memory, previous dreams, and the seed text. In DMs, `@stardust` is optional. This requires status mode `sleeping`.
* `||@stardust dream||` : Generates an automatic dream from context and previous dreams. In DMs, `@stardust` is optional. This requires status mode `sleeping`.
* `soul/dreams/` : Dream output folder used by the pipe dream command.
* `soul/dream_summary.md` : Compact dream memory used by higher-chaos dreams. It is not factual waking memory.
* `soul/stories/` : Story output folder used by `||@stardust story||` and searched by story recall.
* `soul/art/` and `soul/emojis/` : Not sent by default. These are placeholder content folders until future skills or targeted retrieval use them.

The memory maintenance pattern is now one action: run `||@stardust summarize||`, then check `soul/memorysummary.txt`. Summarize also cleans adjustment audit messages after Memorysummary is written.
