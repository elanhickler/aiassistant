# Agents

Each agent gets exactly one soul folder here. Each agent also uses exactly one Discord application and one bot token saved under that agent's `secrets/` folder.

## File Map

* `../settings.jsonc` : Global shared default settings for all agents.
* `Rena/` : Rena agent workspace, including settings overrides, persona, secrets, soul files, launcher, and bring-online checklist.
* `Stardust/` : Stardust agent workspace, including settings overrides, persona, secrets, soul files, launcher, and bring-online checklist.
* `Trish/` : Trish agent workspace, including settings overrides, persona, secrets, and soul files.

## Identity Rule

* one agent : one soul
* one agent : one Discord application
* one agent : one `secrets/discord_token.txt`
* one agent : one `memory_forum_channel_id`
* keep each agent identity singular and local to that agent folder
