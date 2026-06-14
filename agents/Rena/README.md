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
* `soul/longmemory.txt` : Durable summary memory. Starts mostly empty.
* `soul/shortmemory.jsonl` : Recent memory cache. Starts empty.
* `soul/status.json` : Current state used by state/status-aware skills.
* `start_rena_discord_bot.bat` : Double-click this to start Rena after secrets and memory forum are ready.
* `BRING_ONLINE.md` : Step-by-step Discord, OAuth, memory forum, and first-test checklist.

## Commands

* `||@rena state||` : Show raw state.
* `||@rena status||` : Generate a natural-language status update.
* `||@rena status: text||` : Generate a natural-language status update from suggested text.
* `||@rena summarize||` : Summarize recent shortmemory into longmemory.
