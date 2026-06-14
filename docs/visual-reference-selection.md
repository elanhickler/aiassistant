# Visual Reference Selection

Reference selection decides which downloaded or curated visual references are relevant to one visual expression request.

This is a planning contract only. It is not wired into the Discord runtime yet.

## Inputs

Use lightweight metadata first.

* requested output type
* prompt seed or current visual request reason
* reference `id`
* reference `title`
* reference `intended_use`
* reference notes summary
* source URL domain when useful

Do not read every image file or every note file by default.

## Selection Steps

1. Load `soul/visual-references/manifest.jsonl`.
2. Filter references by output type and intended use when possible.
3. Score likely matches using title, intended use, notes path, and source URL.
4. Read only the short notes for the top candidates.
5. Select up to the configured reference limit.
6. Pass selected reference IDs into prompt assembly.

## Good Matches

* `background` request : references tagged for location, weather, architecture, lighting, or atmosphere.
* `scene` request : references tagged for staging, pose, room, object, or action.
* `self` request : references tagged for character design, outfit, body, expression, or pose.
* `emoji` request : references tagged for expression, icon, symbol, or simplified shape.
* `thought` request : references tagged for symbolism, memory, color mood, or abstract image.
* `dream` request : references tagged for surreal imagery, recurring motifs, sleep, or dream material.

## Bad Matches

Avoid references when:

* no reference is clearly useful.
* the reference would pull the image away from the current moment.
* the reference has unclear provenance and the output is intended for public posting.
* the same reference has been overused recently.

## Output

Reference selection should return IDs and short reasons.

```json
{
  "selected_reference_ids": ["rainy-city-001"],
  "reasons": {
    "rainy-city-001": "matches rainy street background and wet reflections"
  }
}
```

## Principle

References should guide the image, not become the image.
