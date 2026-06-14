# Visual Yculth UI

Yculth should be the first local interface for visual expression.

This is a planning contract only. It is not fully implemented yet.

## Goal

Give the user a local, inspectable workflow for visual expression before any Discord posting exists.

The UI should make it easy to:

* create a manual visual request.
* review queued, running, failed, and completed visual requests.
* inspect downloaded references and source notes.
* preview generated images.
* promote useful images into `soul/art/` or `soul/emojis/`.
* keep generated experiments separate from durable soul material.

## Suggested Page

Add a future `Visuals` page, separate from `Imagegen`.

`Imagegen` remains the generator surface.

`Visuals` becomes the workflow surface:

* request list
* request detail
* selected references
* prompt preview
* generated output preview
* promote buttons
* failure/retry controls

## Sections

### Requests

Show recent events from:

```text
regenerated/visualexpression/requests.jsonl
```

Useful columns:

* state
* output type
* reason
* updated time
* linked output

### References

Show downloaded or curated references from:

```text
soul/visual-references/manifest.jsonl
```

Useful controls:

* filter by output type
* open source URL
* open sidecar note
* preview local image

### Output

Show completed generated outputs from:

```text
regenerated/visualexpression/outputs.jsonl
```

Useful controls:

* open image
* open prompt note
* copy prompt
* promote to art
* promote to emoji

## Promotion UI

Promotion should use the app-wide click-once-to-arm, click-again-to-confirm pattern.

Promotion destinations:

* `soul/art/`
* `soul/emojis/`

Promotion should write a short note beside the promoted image.

Use `docs/visual-promotion.md` for details.

## Boundaries

* Do not post generated visuals to Discord by default.
* Do not treat all generated images as memory.
* Do not make visual generation automatic until manual/local workflow is reliable.
* Do not merge reference downloads and generated outputs into one folder.
