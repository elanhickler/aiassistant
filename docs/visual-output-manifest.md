# Visual Output Manifest

Use this format when a generated visual expression is saved.

Generated outputs belong in:

```text
agents/<Agent>/regenerated/visualexpression/
```

## Folder Shape

```text
regenerated/visualexpression/
    outputs.jsonl
    requests.jsonl
    images/
    prompts/
```

## `outputs.jsonl`

Use one JSON object per generated image.

```json
{
  "id": "2026-06-13-example-visual",
  "request_id": "2026-06-13-example-visual",
  "agent": "AgentName",
  "output_type": "scene",
  "visibility": "local",
  "local_path": "images/example-visual.png",
  "prompt_path": "prompts/example-visual.md",
  "prompt": "focused image prompt used by the generator",
  "negative_prompt": "",
  "provider": "yculth-imagegen",
  "model": "",
  "width": 768,
  "height": 1152,
  "seed": "",
  "source_reference_ids": [],
  "source_memory": {
    "message_id": "",
    "channel_id": "",
    "story_files": [],
    "dream_files": []
  },
  "created_at": "2026-06-13T00:00:00.000Z",
  "notes": ""
}
```

## Prompt Files

Prompt files should be human-readable Markdown.

```md
# Example Visual

* output_type : scene
* provider : yculth-imagegen
* model :
* seed :
* size : 768 x 1152

## Prompt

focused image prompt used by the generator

## Negative Prompt

optional negative prompt

## Source

* request_id : 2026-06-13-example-visual
* reference_ids :
* story_files :
* dream_files :
```

## Rules

* Generated outputs are not automatically longmemory.
* Save prompt and source IDs so useful images can be traced later.
* Keep generated images under `regenerated/visualexpression/`, not `soul/art/`, until the user promotes them.
* If a generated visual becomes durable character art, the user can move or copy it into `soul/art/`.
