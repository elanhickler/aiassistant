# Bring Tek Online

## Discord App

* Discord Developer Portal : <https://discord.com/developers/applications>
* Create or choose the application for Tek.
* Bot page : Reset/copy the Discord app token into `secrets/discord_token.txt`.
* Bot page : Enable Message Content Intent.

## OAuth Invite

* OAuth2 URL Generator : Check `bot` and `applications.commands`.
* Permissions : View Channels, Send Messages, Send Messages in Threads, Create Public Threads, Read Message History, Add Reactions, Manage Messages, Attach Files, Use Slash Commands, Embed Links.
* Invite Tek to the server.

## Memory Forum

* Create a Discord forum channel for Tek's memory.
* Copy the forum channel ID into `memory_forum_channel_id` in `settings.jsonc`.
* Start Tek with the generated launcher.
* In Discord, run `/setupmemoryforum`.
* Copy the shortmemory post/thread ID into `shortmemory_thread_id` in `settings.jsonc`.
* Restart Tek.

## First Test

* `||@tek state||` : Confirm raw state works.
* `||@tek status||` : Generate a natural-language status update.
* Say Tek's name in an allowed channel or DM test path.
