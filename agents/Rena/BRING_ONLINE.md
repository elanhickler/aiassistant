# Bring Rena Online

## Agent Identity Rule

* Rena : one soul, one Discord application, one bot token, one memory forum.
* Rena soul folder : `agents/Rena/`.
* Shared runtime : `../../discord-bot/` is only shared code.

## Local Files

* `settings.jsonc` : Rena's local overrides.
* `soul/persona.md` : Rena's identity and voice.
* `soul/memorysum.txt` : Durable memory.
* `soul/shortmemory.jsonl` : Recent memory cache.
* `soul/status.json` : Current raw state.
* `secrets/discord_token.txt` : Rena's Discord app token.
* `secrets/openrouter_api_key.txt` : OpenRouter key.
* `start_rena_discord_bot.bat` : Double-click launcher.

## Discord App Check

* Discord Developer Portal : <https://discord.com/developers/applications>
* Existing app : Use Rena's existing Discord application.
* Bot token : Copy the token into `secrets/discord_token.txt`.
* Message Content Intent : Enable it on the Bot page.

## OAuth Invite Setup

* OAuth2 URL Generator : Open Rena's app, then go to OAuth2.
* Scopes : Check `bot`.
* Scopes : Check `applications.commands`.
* Bot Permissions : Check `View Channels`.
* Bot Permissions : Check `Send Messages`.
* Bot Permissions : Check `Send Messages in Threads`.
* Bot Permissions : Check `Create Public Threads`.
* Bot Permissions : Check `Read Message History`.
* Bot Permissions : Check `Add Reactions`.
* Bot Permissions : Check `Manage Messages`.
* Bot Permissions : Check `Attach Files`.
* Bot Permissions : Optional `Use Slash Commands`.
* Bot Permissions : Optional `Embed Links`.
* Generated URL : Open it and invite Rena to the server.

## Memory Forum Setup

* In Discord : Create a forum channel for Rena's memory.
* Copy forum channel ID : Paste it into `memory_forum_channel_id` in `settings.jsonc`.
* Start Rena : Double-click `start_rena_discord_bot.bat`.
* In Discord : Run `/setupmemoryforum`.
* Copy shortmemory post/thread ID : Paste it into `shortmemory_thread_id` in `settings.jsonc`.
* Restart Rena : Close the bot window with Ctrl+C, confirm, then double-click the launcher again.

## First Test

* `||@rena state||` : Confirm raw state works.
* `||@rena status||` : Generate a natural-language status update.
* Say Rena's name in an allowed channel : Confirm she replies.
