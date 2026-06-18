# Rena

Rena is a new aiassistant agent.

## Bring Online Checklist

* `settings.jsonc` : Fill `memory_forum_channel_id` before starting Rena.
* `backups/` : Automatic timestamped backups before major local overwrites.
* `secrets/discord_token.txt` : Replace `DISCORD_APP_TOKEN` with Rena's Discord app token.
* `secrets/openrouter_api_key.txt` : Replace `OPENROUTER_API_KEY` with an OpenRouter API key.
* `soul/persona.md` : Write Rena's identity, voice, personality, boundaries, and role.
* `soul/origin.md` : Optional full lore dump for Rena's origin/backstory. On startup, the bot mirrors non-empty text from the Discord `origin` memory post into this file. This is editable source material and is not sent in every model request.
* `soul/origin_summary.md` : Optional compact origin summary generated from `soul/origin.md`. If non-empty, it is sent as hidden Origin Summary context.
* `soul/visual-references/` : Downloaded or manually collected visual references for future visual expression work. Keep source and attribution notes beside internet downloads.
* `soul/memorysum.txt` : Compact active durable memory sent to the model. Starts mostly empty.
* `soul/shortmemory.jsonl` : Recent memory cache. Starts empty.
* `soul/consciousness/thoughts/` : Private first-person internal thought files. Thoughts are softer than shortmemory, are not posted publicly, and can feed stories, dreams, and end-of-day memory work.
* `soul/consciousness/journals/` : Durable first-person emotional journal files. Journals are not cleared by ordinary cleanup and can feed dreams and memory updates later.
* `soul/dream_summary.md` : Compact dream memory used by higher-chaos dreams. It is not factual waking memory.
* `soul/raw/` : Latest OpenRouter request split into readable text parts.
* `soul/raw.txt` : Concatenated compatibility copy of the latest raw parts.
* `soul/trash/shortmemory-trash.jsonl` : Recoverable local trash for shortmemory entries. Trashed entries are ignored by replies, memory updates, stories, and dreams.
* `soul/status.json` : Current state used by state/status-aware skills.
* `start_rena_discord_bot.bat` : Double-click this to start Rena after secrets and memory forum are ready.
* `BRING_ONLINE.md` : Step-by-step Discord, OAuth, memory forum, and first-test checklist.

## Commands

* `▶️ continue reaction` : React with `:arrow_forward:` to have Rena continue from the current scene without adding a pipe command to shortmemory.
* `||@rena reply||` : Has Rena continue the story from recent context. In DMs, `@rena` is optional.
* `||@rena continue||` : Has Rena continue from recent context without adding this command to shortmemory.
* `||@rena continue: text||` : Has Rena continue with one-time instructions without adding this command to shortmemory.
* direct Rena control : Natural text like `Rena is...`, `Rena has...`, or `Rena does...` is treated as authoritative roleplay direction for Rena, similar to a softer in-scene adjustment.
* `||@rena state||` : Show raw state.
* `||@rena status||` : Generate a natural-language status update.
* `||@rena status: text||` : Generate a natural-language status update from suggested text.
* `||@rena summarize||` : Summarize recent shortmemory into Memorysum.
* `||@rena thought: thought prompt||` : Write a first-person internal thought from the prompt, shortmemory, Memorysum, and recent thoughts.
