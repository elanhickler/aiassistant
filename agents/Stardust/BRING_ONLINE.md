# Bring Stardust Online

## Agent Identity Rule

* Stardust : one soul, one Discord application, one bot token, one memory forum.
* Stardust soul folder : `agents/Stardust/`.
* Shared runtime : `../../discord-bot/` is only shared code.

## Local Files

* `settings.jsonc` : Stardust's local overrides.
* `soul/persona.md` : Stardust's identity and voice.
* `soul/longmemory.txt` : Durable memory.
* `soul/shortmemory.jsonl` : Recent memory cache.
* `soul/status.json` : Current raw state.
* `secrets/discord_token.txt` : Stardust's Discord app token.
* `secrets/openrouter_api_key.txt` : OpenRouter key.
* `start_stardust_discord_bot.bat` : Double-click launcher.

## Discord App Check

* Discord Developer Portal : <https://discord.com/developers/applications>
* Existing app : Use Stardust's existing Discord application.
* Bot token : Confirm the token is saved in `secrets/discord_token.txt`.
* Message Content Intent : Must be enabled on the Bot page.

## OAuth Invite Check

* OAuth2 URL Generator : Open Stardust's app, then go to OAuth2.
* Scopes : `bot` and `applications.commands`.
* Bot Permissions : `View Channels`, `Send Messages`, `Send Messages in Threads`, `Create Public Threads`, `Read Message History`, `Add Reactions`, `Manage Messages`, and `Attach Files`.
* Invite : Use the generated URL if Stardust is not already in the server.

## Memory Forum

* `memory_forum_channel_id` : `1514778590888067303`
* `shortmemory_thread_id` : blank unless Stardust gets a dedicated shortmemory post/thread override.
* Setup : Start Stardust, then run `/setupmemoryforum` if memory posts are missing.

## First Test

* `||@stardust state||` : Confirm raw state works.
* `||@stardust status||` : Generate a natural-language status update.
* Say Stardust's name in an allowed channel : Confirm she replies.
