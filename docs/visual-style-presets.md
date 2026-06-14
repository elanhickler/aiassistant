# Visual Style Presets

Visual style presets are reusable style instructions for generated visual expression.

They keep prompts consistent without forcing every request to repeat a long style paragraph.

This is a planning contract only. It is not wired into the Discord runtime yet.

## Default Rule

A visual request may name one style preset.

If no preset is named, choose the default for the output type.

## Storage

Use a preset file under the agent soul:

```text
agents/<Agent>/soul/visual-style-presets.jsonc
```

The file may override global defaults later, but the first implementation can use global defaults only.

## Preset Shape

```jsonc
{
  "emoji-clean": {
    "output_types": ["emoji"],
    "positive": "simple expression, clean silhouette, readable at tiny size, transparent or plain background",
    "negative": "busy background, tiny details, unreadable expression",
    "default_width": 512,
    "default_height": 512
  }
}
```

## Suggested Presets

### `emoji-clean`

Use for custom emoji, reaction stamps, and tiny mood icons.

* positive : simple expression, clean silhouette, readable at tiny size, bold shape language.
* negative : cluttered background, tiny details, unreadable expression, text.
* default size : 512 x 512.

### `self-portrait`

Use for the agent's face, body, expression, outfit, or pose.

* positive : expressive character portrait, clear face, clear body language, consistent character details.
* negative : duplicate face, malformed hands, unreadable anatomy, unrelated character details.
* default size : 768 x 1152.

### `character-sheet`

Use for stable reference images and future character design notes.

* positive : clear full body, readable design, simple background, useful reference pose.
* negative : heavy perspective, cropped body, unreadable costume details.
* default size : 768 x 1152.

### `scene-readable`

Use for roleplay scenes and important moments.

* positive : readable staging, clear subject, clear action, environment supports the mood.
* negative : confusing composition, unclear focal point, excessive background noise.
* default size : 1152 x 768.

### `background-mood`

Use for locations, rooms, landscapes, weather, and atmosphere.

* positive : strong place identity, lighting, atmosphere, readable depth, no unnecessary characters.
* negative : random people, cluttered foreground, text, logo-like elements.
* default size : 1152 x 768.

### `thought-symbol`

Use for internal imagery, memory fragments, and symbolic feelings.

* positive : symbolic composition, clear emotional motif, surreal but readable.
* negative : literal chat transcript, text blocks, unrelated objects.
* default size : 768 x 768.

### `dream-surreal`

Use for sleep and dream visuals.

* positive : dream logic, emotional continuity, soft transitions, symbolic details.
* negative : random chaos, unreadable mess, hard text, unrelated subjects.
* default size : 768 x 768.

## Selection Rules

Choose presets by output type first, then by request intent.

Suggested defaults:

* emoji : `emoji-clean`
* self : `self-portrait`
* scene : `scene-readable`
* background : `background-mood`
* thought : `thought-symbol`
* dream : `dream-surreal`

Use `character-sheet` when the user asks for reference art, model sheet, or stable appearance.

## Prompt Assembly

Prompt assembly should include:

```text
style preset: self-portrait
style: expressive character portrait, clear face, clear body language, consistent character details
negative style: duplicate face, malformed hands, unreadable anatomy, unrelated character details
```

Do not hide style preset changes. Show the selected preset in Yculth preview.

## Boundaries

* Do not put identity facts only in style presets.
* Do not use style presets as a substitute for persona or visual memory.
* Do not let style presets override privacy boundaries.
* Do not silently change the selected preset after preview.
