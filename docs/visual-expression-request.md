# Visual Expression Request

Use this format when an agent or local tool wants to request a generated visual expression.

This is a planning contract only. It is not wired into the Discord runtime yet.

Use `docs/visual-request-lifecycle.md` for request state changes after creation.

## Request Object

```json
{
  "id": "2026-06-13-example-visual",
  "agent": "AgentName",
  "output_type": "scene",
  "reason": "why this visual belongs with the current moment",
  "visibility": "local",
  "prompt": "focused image prompt for the generator",
  "negative_prompt": "",
  "source_context": {
    "message_id": "",
    "channel_id": "",
    "shortmemory_ids": [],
    "longmemory_sections": [],
    "story_files": [],
    "dream_files": [],
    "reference_ids": []
  },
  "generation": {
    "provider": "yculth-imagegen",
    "width": 768,
    "height": 1152,
    "model": "",
    "seed": ""
  },
  "result": {
    "status": "queued",
    "local_path": "",
    "created_at": ""
  }
}
```

## Output Types

* `emoji` : Tiny reaction image, expression stamp, symbol, or mood icon.
* `self` : The agent's body, face, outfit, pose, or expression.
* `scene` : The current roleplay moment or location.
* `background` : Environment, weather, room, landscape, or atmosphere.
* `thought` : Internal image, memory snapshot, symbolic feeling, or mental picture.
* `dream` : Dream image generated from sleeping status and dream context.

## Visibility

* `local` : Save locally only.
* `preview` : Show in Yculth for user approval.
* `discord` : Future opt-in posting behavior.

Default to `local` until posting behavior is deliberately designed.

## Intent Decision

The utility model should answer a small structured question before a normal reply requests a visual.

Use `docs/visual-expression-intent.md` for the decision rules.

```json
{
  "should_generate_visual": false,
  "output_type": "",
  "reason": "",
  "confidence": 0
}
```

Generate only when the visual adds meaning. Do not generate just because the model can.

## Prompt Assembly

Visual prompts should be assembled from only the useful pieces:

Use `docs/visual-prompt-assembly.md` for the full prompt assembly rules.

* agent persona and appearance
* current message and reply intent
* status, including sleep or dream state
* relevant shortmemory
* relevant longmemory
* selected story or dream files
* selected visual reference IDs

The prompt should name the intended output type clearly.
