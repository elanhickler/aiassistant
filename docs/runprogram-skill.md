# Runprogram Skill

The runprogram skill is a conversational adapter for launching or controlling local programs.

Discord is only one interface for this skill. Yculth, a local app, website, or future API server should be able to call the same underlying hook.

## User Shape

Pipe command:

```text
||@agent runprogram: open krita||
```

The skill sends the user request to the configured external runner. The external runner is responsible for matching app names and aliases, deciding whether to launch or control a program, and returning a short result.

## Settings

```jsonc
"runprogram_skill": {
    "command": "",
    "args": [],
    "apps": {
        "krita": {
            "aliases": ["krita", "paint"],
            "command": "C:\\Path\\To\\krita.exe",
            "args": [],
            "working_directory": ""
        }
    },
    "timeout_milliseconds": 30000,
    "max_output_characters": 1600
}
```

## Payload

The external command receives one JSON object on stdin:

```json
{
  "request": "open krita",
  "source": "discord_pipe",
  "agent": "Stardust",
  "agent_folder": "C:\\...",
  "metadata": {},
  "apps": {}
}
```

The command may return plain text or JSON with `reply`, `message`, or `text`.

Keep program launching behavior in the external runner. Keep Discord/Yculth behavior at the interface edge.
