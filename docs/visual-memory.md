# Visual Memory

Visual memory is how the agent remembers meaningful generated visuals without dragging every prompt, file, and image into normal chat context.

This is partly wired into the Discord runtime through `visual remember`, which records remembered request guidance before image generation exists.

## Default Rule

A generated image is not memory by itself.

A visual becomes memory only when a short human-readable note says why it matters.

## Storage

Use a small memory index beside generated visual outputs:

```text
agents/<Agent>/regenerated/visualexpression/visual-memory.jsonl
```

Use one JSON object per remembered visual.

```json
{
  "id": "2026-06-13-example-visual-memory",
  "output_id": "2026-06-13-example-visual",
  "agent": "AgentName",
  "memory_type": "appearance",
  "title": "Example expression",
  "summary": "The agent has a soft, worried expression used when they are trying to be gentle.",
  "recall_tags": ["gentle", "worried", "expression"],
  "local_path": "images/example-visual.png",
  "promoted_path": "",
  "source": "generated",
  "created_at": "2026-06-13T00:00:00.000Z",
  "updated_at": "2026-06-13T00:00:00.000Z"
}
```

Before an output image exists, `visual remember` may write a request-backed memory row:

```json
{
  "id": "2026-06-13-example-visual-memory",
  "request_id": "2026-06-13-example-visual-request",
  "agent": "AgentName",
  "output_type": "self",
  "summary": "Good likeness direction.",
  "prompt": "soft portrait",
  "style_preset": "self-portrait",
  "source_review_state": "promote_candidate",
  "source_review_id": "2026-06-13-example-promote-candidate",
  "source_prompt_path": "prompts/2026-06-13-example-visual-request.md",
  "created_at": "2026-06-13T00:00:00.000Z"
}
```

## Memory Types

Suggested `memory_type` values:

* appearance : stable details about body, face, outfit, expression, or species traits.
* emoji : a recurring mood stamp or reaction image.
* location : a room, home, landscape, background, or recurring environment.
* scene : a remembered event or roleplay moment.
* symbol : a thought image, dream motif, emotional anchor, or abstract visual idea.
* reference : a useful downloaded source image that informs later generation.

## Recall

Visual memory should be recalled by tags and summary, not by reading every prompt.

For a normal reply, the context assembler should only include visual memory when:

* the user asks about appearance, image, art, emoji, location, dream, scene, or memory.
* a skill specifically needs a visual reference.
* a recent message refers to a remembered visual by name or tag.
* the visual has been promoted and is relevant to the current conversation.

## Context Shape

When included in hidden context, visual memory should be compact.

Example:

```text
Remembered visual guidance:
* self / self-portrait : The agent has a soft, worried expression used when they are trying to be gentle.
```

Do not include full prompts, absolute paths, provider metadata, or hidden prompt context in normal chat context.

The current Discord runtime includes up to `planned_skill_settings.visualexpression.max_visual_memories_per_context` recent visual memories through the `visualexpression` skill context block.

## Summary Interaction

Longmemory may mention visual memory only when the visual changes durable continuity.

Good longmemory fact:

```text
The agent's recurring dream symbol is a glass hallway lit by blue emergency lights.
```

Bad longmemory fact:

```text
There is an image file named 2026-06-13-example.png.
```

## Promotion Interaction

Promotion can create or update a visual memory entry.

`visual remember` creates an append-only memory entry from an existing request. It does not move files, promote images into `soul/art/`, or post images to Discord.

Promoted `soul/art/` and `soul/emojis/` files should have stronger recall weight than unpromoted generated experiments.

## Boundaries

* Do not load every generated image into context.
* Do not summarize every generated image into longmemory.
* Do not store private prompt internals in visual memory summaries.
* Do not rely on Discord as the only record of visual memory.
