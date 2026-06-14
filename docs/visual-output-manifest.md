# Visual Output Manifest

Use this format when a generated visual expression is saved.

Use `docs/visual-request-lifecycle.md` for request state changes before a completed output is written here.
Use `docs/visual-provider-contract.md` for the provider success shape that feeds completed output rows.

Generated outputs belong in:

```text
agents/<Agent>/regenerated/visualexpression/
```

## Folder Shape

```text
regenerated/visualexpression/
    outputs.jsonl
    requests.jsonl
    reviews.jsonl
    visual-memory.jsonl
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
  "variant_group_id": "",
  "variant_index": 1,
  "variant_count": 1,
  "parent_output_id": "",
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
* variant_group_id :
* variant_index : 1 of 1
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

## Visual Memory

If a generated output becomes meaningful, write a compact memory entry to:

```text
regenerated/visualexpression/visual-memory.jsonl
```

Use `docs/visual-memory.md` for the memory shape and recall rules.

## Visual Review

Generated outputs may receive review notes in:

```text
regenerated/visualexpression/reviews.jsonl
```

Use `docs/visual-review.md` for review states, scores, and promotion checks.
Use `docs/visual-variants.md` when outputs belong to a variant group.

## Rules

* Generated outputs are not automatically longmemory.
* Generated outputs are not automatically visual memory.
* Generated outputs are not automatically reviewed.
* Save prompt and source IDs so useful images can be traced later.
* Keep generated images under `regenerated/visualexpression/`, not `soul/art/`, until the user promotes them.
* If a generated visual becomes durable character art, the user can move or copy it into `soul/art/`.
