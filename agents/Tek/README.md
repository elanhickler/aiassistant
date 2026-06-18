# Tek

Tek is an aiassistant agent created from Yculth.

## Bring Online Checklist

* `settings.jsonc` : Fill `memory_forum_channel_id` before starting Tek.
* `secrets/discord_token.txt` : Replace `DISCORD_APP_TOKEN` with Tek's Discord app token.
* `secrets/openrouter_api_key.txt` : Replace `OPENROUTER_API_KEY` with an OpenRouter API key.
* `soul/persona.md` : Final persona text generated or pasted from Create Character.
* `soul/memorysum.txt` : Compact active durable memory sent to the model.
* `soul/shortmemory.jsonl` : Recent memory cache. Starts empty.
* `soul/status.json` : Current state used by status-aware systems.
* `start_*_discord_bot.bat` : Start Tek after secrets and memory forum are ready.
* `BRING_ONLINE.md` : Step-by-step Discord, OAuth, memory forum, and first-test checklist.
