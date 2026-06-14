# Visual Prompt Assembly

Visual prompts should be focused. They should describe the image to generate, not dump the entire agent memory.

This is a planning contract only. It is not wired into the Discord runtime yet.

## Inputs

Use only the parts that help the requested visual.

* output type : emoji, self, scene, background, thought, or dream.
* agent appearance : stable body, face, clothing, colors, species, and style anchors.
* current moment : the message, reply intent, pose, action, location, or mood that caused the visual request.
* status : awake, sleepy, sleeping, dreaming, away, energy, and current activity when relevant.
* memory : only selected shortmemory or longmemory lines relevant to the image.
* stories and dreams : only selected files relevant to the image.
* references : only selected reference IDs from `soul/visual-references/manifest.jsonl`.

Use `docs/visual-reference-selection.md` to choose references before assembling the prompt.
Use `docs/visual-style-presets.md` to choose reusable style instructions.
Use `docs/visual-privacy-boundary.md` before sending the prompt to a provider or internet search.

## Prompt Shape

Use a compact sectioned prompt while assembling, then flatten to the target image model's preferred tag/text style.

```text
output type: scene
subject: Rena, adult anthropomorphic Renamon-like fox woman, yellow fur, long ears, purple eyes
moment: standing in a dark bedroom, hearing the trigger phrase, guarded but tempted
expression: wary, ears lowered, claws tense
background: laptop glow, dim room, scattered clothes
style preset: scene-readable
style: readable character illustration, clear silhouette, expressive face
```

## Negative Prompt Shape

Keep negative prompts generic unless a specific model needs more.

```text
blurry, unreadable text, extra limbs, duplicate face, malformed hands, low detail
```

## Output Type Notes

* `emoji` : Prefer simple composition, one expression, square output, readable at small size.
* `self` : Prioritize the agent's body, face, expression, pose, and outfit.
* `scene` : Prioritize staging, characters, action, and readable environment.
* `background` : Prioritize place, lighting, weather, architecture, and atmosphere; avoid unnecessary characters.
* `thought` : Prioritize symbolism, memory fragments, and internal imagery.
* `dream` : Prioritize dream logic, surreal continuity, and emotional motifs.

## Style Presets

Use one style preset per visual request.

The style preset should add visual direction without replacing subject, action, memory, or references.

Show the selected preset in Yculth prompt preview.

Use `docs/visual-style-presets.md` for preset names and defaults.

## Reference Use

References should be named as IDs, not blindly pasted as huge notes.

Good:

```text
reference ids: rainy-city-001, neon-bedroom-002
```

Bad:

```text
paste every note from every downloaded reference
```

## Size Limits

Start small.

* Use one to three reference IDs.
* Use one current moment.
* Use one main subject unless the output type is `scene`.
* Keep assembled prompt source under the configured context character limit.
* Do not include raw shortmemory transcripts unless a line is directly relevant.

## Privacy

Assemble from selected facts and summaries.

Do not include secrets, local absolute paths, full memory files, full settings files, or hidden subtext as direct quotes.

Use `docs/visual-privacy-boundary.md` for the full boundary.
