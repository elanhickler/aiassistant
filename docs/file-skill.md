# File Skill

The file skill is the conversational adapter for file management.

Discord is only one interface for this skill. A local app, website, Yculth page, or future API server should be able to call the same underlying skill hook.

## Commands

Send file-management instructions to the configured external command:

```text
||@agent file: organize these images by character name||
```

## Hooks

The skill exposes one implementation hook:

* `runFileRequest({ input, source, metadata })` : Send a user request to the configured file-management command and return the command's reply text.

Discord currently calls this hook from pipe commands. Other interfaces should call the hook directly or through a future local API instead of reimplementing file-management routing.

## External Command Contract

The skill does not implement file management itself. It launches the configured command from:

```text
file_skill.command
file_skill.args
```

The command receives one JSON object on stdin:

```json
{
  "request": "user's file request",
  "source": "discord_pipe",
  "agent": "AgentName",
  "agent_folder": "../agents/AgentName",
  "metadata": {
    "channel_id": "discord channel id",
    "message_id": "discord message id",
    "author_id": "discord user id"
  }
}
```

The command may return plain text on stdout, or JSON with one of these text fields:

```json
{
  "reply": "what the agent should say back"
}
```

Accepted response fields are `reply`, `message`, or `text`.

## Boundary

Keep real file operations inside your external file-management command.

Keep the skill small: parse the conversational request, call the command, and report the result.

This makes it easier to reuse the same file-management logic from Discord, Yculth, a website, or another future interface.
