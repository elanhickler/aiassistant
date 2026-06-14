# Visual Variants

Visual variants are intentional alternate generations of the same visual idea.

They are different from retries. A retry repairs a failed generation. A variant explores another version of a successful or plausible request.

This is a planning contract only. It is not wired into the Discord runtime yet.

## Default Rule

Generate a small number of variants, then review them.

Do not create endless variations without user review or a clear agent need.

## Variant Group

Use `variant_group_id` to connect related outputs.

Example:

```json
{
  "variant_group_id": "2026-06-13-rainy-bedroom-scene",
  "variant_index": 2,
  "variant_reason": "different camera angle and softer lighting"
}
```

## Request Fields

A visual request may include:

```json
{
  "variant_group_id": "2026-06-13-rainy-bedroom-scene",
  "variant_count": 3,
  "variant_strategy": "same prompt, different seeds",
  "parent_output_id": ""
}
```

## Output Fields

Each completed output should record:

```json
{
  "variant_group_id": "2026-06-13-rainy-bedroom-scene",
  "variant_index": 1,
  "variant_count": 3,
  "parent_output_id": "",
  "seed": "123456789"
}
```

## Variant Strategies

Suggested `variant_strategy` values:

* same prompt, different seeds : keep prompt identical and change only seed.
* slight prompt variation : adjust wording while keeping subject and intent.
* style variation : keep subject and moment, try a different style preset.
* crop or composition variation : keep subject and style, change framing.
* reference variation : keep prompt, change selected references.

## Variant Limits

Use conservative defaults.

* emoji : 4 variants is often enough.
* self : 2 variants is often enough.
* scene : 2 variants is often enough.
* background : 2 variants is often enough.
* thought : 2 variants is often enough.
* dream : 3 variants is often enough.

## Review

Variants should be reviewed as a group when possible.

Useful review questions:

* Which variant best matches the intended subject?
* Which variant is most readable?
* Which variant is worth promoting?
* Which variant should become visual memory?
* Which variant should be used as the parent for another pass?

Use `docs/visual-review.md` for review states and scores.

## Promotion

Promotion should record which variant won.

The winning variant may become:

* `soul/art/`
* `soul/emojis/`
* a visual memory entry
* a parent for a future variant group

Rejected variants should remain ordinary generated experiments until cleanup.

## Boundaries

* Do not treat every variant as a separate memory.
* Do not post multiple variants to Discord by default.
* Do not vary private context or hidden subtext directly.
* Do not use variants as an excuse to bypass review.
