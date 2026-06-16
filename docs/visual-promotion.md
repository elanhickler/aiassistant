# Visual Promotion

Generated visuals start as local regenerated outputs. They become durable soul material only when promoted.

This is a planning contract only. It is not wired into the Discord runtime yet.

## Source And Destination

Generated source:

```text
agents/<Agent>/regenerated/visualexpression/
```

Durable destinations:

```text
agents/<Agent>/soul/art/
agents/<Agent>/soul/emojis/
```

## Promotion Rules

Promote a generated visual only when it becomes stable character material.

Use `docs/visual-review.md` to record whether an output is a promotion candidate.

* recurring emoji : move or copy to `soul/emojis/`.
* character art : move or copy to `soul/art/`.
* scene reference : usually keep in `regenerated/visualexpression/` unless the scene becomes important lore.
* background : promote only if it becomes a recurring home, room, world, or location.
* thought image : promote only if it becomes a recurring symbol or memory anchor.
* dream image : usually keep with generated outputs unless it becomes a durable dream motif.

## Promotion Record

When a visual is promoted, record a short note beside it.

```md
# Promoted Visual

* promoted_from : regenerated/visualexpression/images/example.png
* output_id : 2026-06-13-example-visual
* promoted_to : soul/art/example.png
* promoted_at : 2026-06-13T00:00:00.000Z
* reason : stable character image

Why this matters:

* concise reason this became durable soul material
```

Promotion can also create or update a compact visual memory note.

Use `docs/visual-memory.md` for that memory shape.

## Memory Rules

Promotion does not automatically rewrite `memorysummary.txt`.

If a promoted visual changes durable identity, appearance, location, or lore, summarize that fact explicitly through the normal memory flow.

Good Memorysummary fact:

```text
Rena has a recurring Bimbomon expression image used as an emoji for corruption surfacing.
```

Bad Memorysummary fact:

```text
Generated image 2026-06-13-example-visual exists.
```

## Deletion

Deleting regenerated outputs should not delete promoted soul copies.

Deleting promoted soul art or emojis is a user-owned edit and should require the same care as editing persona or Memorysummary.
