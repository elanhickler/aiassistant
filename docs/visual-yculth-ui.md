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
* clean old unpromoted experiments without touching promoted soul material.

## Suggested Page

Add a future `Visuals` page, separate from `Imagegen`.

`Imagegen` remains the generator surface.

`Visuals` becomes the workflow surface:

* request list
* request detail
* selected references
* prompt preview
* style preset selector
* variant controls
* privacy preview
* review note
* visual memory note
* generated output preview
* promote buttons
* Discord post controls
* failure/retry controls
* cleanup preview

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
* privacy status
* updated time
* linked output

### References

Show downloaded or curated references from:

```text
soul/visual-references/manifest.jsonl
```

Useful controls:

* open search log
* review candidate
* reject candidate
* download approved candidate
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
* select style preset
* create variant
* compare variants
* open privacy preview
* open review note
* open visual memory note
* copy prompt
* promote to art
* promote to emoji
* post to Discord if enabled

## Promotion UI

Promotion should use the app-wide click-once-to-arm, click-again-to-confirm pattern.

Promotion destinations:

* `soul/art/`
* `soul/emojis/`

Promotion should write a short note beside the promoted image.

Use `docs/visual-promotion.md` for details.
Use `docs/visual-review.md` for review states and promotion checks.
Use `docs/visual-style-presets.md` for style preset selection.
Use `docs/visual-variants.md` for variant creation and comparison.
Use `docs/visual-discord-posting.md` for posting selected outputs back into Discord.
Use `docs/visual-privacy-boundary.md` for outbound prompt and posting previews.

## Boundaries

* Do not post generated visuals to Discord by default.
* Do not treat all generated images as memory.
* Do not make visual generation automatic until manual/local workflow is reliable.
* Do not merge reference downloads and generated outputs into one folder.
* Cleanup should follow `docs/visual-retention.md`.
* Discord posting should follow `docs/visual-discord-posting.md`.
* Prompt, search, and posting previews should follow `docs/visual-privacy-boundary.md`.
