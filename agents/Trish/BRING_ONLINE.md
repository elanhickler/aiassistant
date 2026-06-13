# Bring Trish Online

## Agent Identity Rule

* Trish : one soul, one Discord application, one bot token, one memory forum.
* Trish soul folder : `agents/Trish/`.
* Shared runtime : `../../discord-bot/` is only shared code.

## Local Files

* `settings.jsonc` : Trish's local overrides.
* `soul/persona.md` : Trish's identity and voice.
* `soul/longmemory.txt` : Durable memory.
* `soul/shortmemory.jsonl` : Recent memory cache.
* `soul/status.json` : Current raw state.
* `secrets/discord_token.txt` : Trish's Discord app token.
* `secrets/openrouter_api_key.txt` : OpenRouter key.
* `start_trish_discord_bot.bat` : Double-click launcher.

## Discord App Check

* Discord Developer Portal : <https://discord.com/developers/applications>
* Existing app : Use Trish's existing Discord application.
* Bot token : Confirm the token is saved in `secrets/discord_token.txt`.
* Message Content Intent : Must be enabled on the Bot page.

## OAuth Invite Check

* OAuth2 URL Generator : Open Trish's app, then go to OAuth2.
* Scopes : `bot` and `applications.commands`.
* Bot Permissions : `View Channels`, `Send Messages`, `Send Messages in Threads`, `Create Public Threads`, `Read Message History`, `Add Reactions`, `Manage Messages`, and `Attach Files`.
* Invite : Use the generated URL if Trish is not already in the server.

## Memory Forum

* `memory_forum_channel_id` : `1514698009097797712`
* `shortmemory_thread_id` : `1514708143865725048`
* `persona_source_thread_id` : `1514708952292786206`
* `music_skill.music_thread_id` : `1514763550680420374`
* Setup : Start Trish, then run `/setupmemoryforum` if memory posts are missing.

## First Test

* `||@trish state||` : Confirm raw state works.
* `||@trish status||` : Generate a natural-language status update.
* Say Trish's name in an allowed channel : Confirm she replies.
