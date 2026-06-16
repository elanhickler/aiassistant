# Memory Layers / Neural Memory

Memory Layers are the current visual/debug surface for the future `neural_memory` system.

This is a design and preservation document only. It does not change runtime behavior.

The clearer current framing is:

```text
Semantic memory downscales raw conversation into compact meaning.
Replies, dreams, journals, and stories upscale that meaning back into rich text.
```

Raw shortmemory is original-resolution recent text. Thoughts are private interpretation. Semantic downscale creates compact memory nodes. Text upscale is when the model expands downscaled memory back into replies, dreams, journals, stories, and memory updates.

This is not exact zip/unzip compression. It is lossy semantic downscale: the system deliberately throws away some detail to preserve meaning, then uses `do_not_invent` and `confidence` to stop the later text upscale from inventing false continuity.

The project direction is moving from:

```text
Memory Layers = visual semantic downscale experiment
```

to:

```text
Neural Memory / Consciousness Loop = private thoughts, daily journals, dreams, memory entries, memorysummary, and a large memory graph
```

Keep the existing Memory Layers page, layer rows, memory nodes, inspector, Debug Downscale, Debug Upscale Context, and manual builder. They become the interface for inspecting and debugging `neural_memory`.

Current active memory remains:

* `soul/shortmemory.jsonl` : recent detailed memory.
* `soul/memorysummary.txt` : compact active durable memory sent to the model.
* `soul/consciousness/thoughts/` : temporary private first-person thoughts.
* `soul/consciousness/journals/` : durable first-person emotional journals.
* `soul/stories/` : story material.
* `soul/dreams/` : dream material.

Memory Layers should not replace shortmemory or memorysummary until the system is proven useful in real use.

## Consciousness Loop Model

The intended model is:

```text
shortmemory = raw recent reply context
thoughts = private first-person internal monologue generated every reply
neural_memory = large semantic downscale system / memory layer graph
journal = durable first-person emotional daily reflection
dream = mandatory daily first-person symbolic/emotional artifact
memorysummary = compact active durable memory update
```

The core loop should eventually work like this:

* every visible reply also creates a private thought.
* thoughts are saved silently and are not spoken unless a later reply naturally chooses similar material.
* thoughts are temporary.
* daily cycle generates a journal, dream, optional dreamjournal, memory entry, and memorysummary update.
* daily memory work absorbs useful temporary thoughts into durable memory.
* daily cleanup backs up and clears temporary thoughts only after journal, dream, and memory work has succeeded enough for absorption.
* journals, dreams, and dream journals are durable.
* memory updates create entries and update `soul/memorysummary.txt`.
* `neural_memory` downscales larger windows into graph nodes for pattern, scene meaning, emotional subtext, and future relevance.

The current core runtime milestone is now:

```text
Every generated visible reply also generates and saves a private first-person thought first.
```

That gives the system internal monologue material before we make the larger neural memory graph authoritative. Thought cleanup, journaling, dream absorption, and neural-memory reply context are still later phases.

## Official Name

The current UI name is `Memory Layers`.

The future system name is `Neural Memory`.

For now, use `Memory Layers / Neural Memory` when a document needs to bridge both ideas. Memory Layers are the visible graph interface; `neural_memory` is the larger semantic downscale and consciousness system behind it.

The visual metaphor is a neuron-like memory graph:

* memories connect to other memories.
* some memories become stronger through repetition or emotional importance.
* nearby ideas cluster together.
* higher layers carry broader meaning.
* lower layers keep more detail.
* lower layers downscale upward into compact meaning.
* replies, dreams, journals, and stories later upscale useful meaning into rich text.

## Descriptor Model

The current system uses `consciousness_descriptors` as the main artifact-definition surface.

`consciousness_descriptors` defines what each artifact is:

* thought.
* journal.
* dream.
* dreamjournal.
* story.
* memory.
* memorysummary.
* neural_memory.

Editable scales are separate setting descriptors, but they are not a second artifact-definition system. For example, `thought_influence_scale` defines how a numeric thought influence value should be interpreted by the model. Do not create a separate thought-usage descriptor section.

Processes that may read private thoughts use simple controls:

* `use_thoughts` : whether the process may read thoughts at all.
* `thought_influence` : a 0.0 through 1.0 value interpreted through `thought_influence_scale`.

The current processes are `journal`, `dream`, `story`, and `memorysummary_update`. If `use_thoughts` is false, the process should not include thoughts and should ignore `thought_influence`.

Use descriptors for durable behavior such as:

* how to write a private thought.
* how to write a visible reply.
* how to downscale neural memory.
* how to write a journal.
* how to write a dream.
* how to interpret an existing dream in a dream journal.
* how to write a story.
* how to create memory entries and update memorysummary.

Do not treat seed sliders or global creativity/chaos knobs as the main current interface. Chaos, creativity, realism, symbolism, and similar values belong in one-time natural-language instructions, such as `||@agent dream: chaos 0.8, assume 0 to 1, make it symbolic||`, not in mandatory global settings.

Useful routing remains:

* thoughts feed stories.
* journals feed dreams.
* memory updates preserve durable truth and can clean temporary thoughts after a successful daily cycle.

## How The Pieces Relate

Shortmemory is the vivid recent record.

Memorysummary is the compact active durable memory record.

Thoughts are private first-person internal monologue. They are generated before generated visible replies and saved silently under `soul/consciousness/thoughts/`. They are temporary and can help stories because stories often need motive, voice, and perspective.

Journals are durable emotional reflections. They should feed dreams more than stories because dreams are allowed to transform memory through emotion, symbolism, fear, desire, and mood.

Dream journals are durable interpretations of existing dreams. They analyze meaning, separate supported interpretation from speculation, and must not create new dream events.

`dream_journal.read_limits` defines what "read everything relevant" means for dream interpretation. The selected latest dream is required, but every other lane is bounded: shortmemory, thoughts, journals, stories, previous dream journals, memory entries, neural memory nodes, and origin summary.

Core routing rule:

```text
thoughts -> stories
journals -> dreams
```

Thoughts are temporary concrete or interpretive reflections. They can help stories understand motive, perspective, and immediate meaning. Thoughts must be cleared after the daily journal/dream/memory cycle once they have been absorbed into memory entries, memorysummary, stories, journals, dreams, or other durable memory.

Journals are durable emotional reflections. They can help dreams understand recurring feelings, fears, wishes, symbols, and unresolved emotional arcs. Journals should not be cleaned by ordinary summarize/cleanup.

Consciousness folders:

```text
soul/consciousness/thoughts/
soul/consciousness/journals/
soul/consciousness/dream-journals/
```

Thoughts are temporary working memory. Journals and dream journals are durable emotional reflections and should not be cleared by ordinary cleanup.

Stories should be more grounded. A story can be polished and literary, but it should still respect reality unless the user asks for something else.

Dreams should be more symbolic. A dream can bend time, body, place, and meaning because it focuses on felt emotion, mood, anxiety, longing, and unresolved emotional clusters.

Memory updates should preserve durable truth. They should also be allowed to clean temporary thoughts after those thoughts have been absorbed into something more stable.

## Generated Folder Convention

Generated semantic memory layer files live under:

```text
soul/memory-layers/
  layer-0.jsonl
  layer-1.jsonl
  layer-2.jsonl
  layer-3.jsonl
  layer-4.jsonl
  build-log.jsonl
```

These files are autogenerated.

They are not required to exist at bot startup. Helper code should create the folder and files lazily only when the Memory Layers builder runs.

Layer meanings:

* `layer-0.jsonl` : raw/highest-detail memory derived from shortmemory.
* `layer-1.jsonl` : scene-level interpretation. Can read thoughts.
* `layer-2.jsonl` : story/session memory nodes. Can read stories.
* `layer-3.jsonl` : emotional arcs. Can read journals and dreams.
* `layer-4.jsonl` : durable truths. Can read memorysummary.
* `build-log.jsonl` : semantic downscale run records.

Generated memory nodes should prefer these semantic downscale / text upscale fields:

* `kind` : what kind of memory node this is, such as `raw_shortmemory`, `scene_impression`, or `semantic_downscale`.
* `compressed` : the technical field that stores compact meaning produced by semantic downscale.
* `upscale_direction` : guidance for expanding the downscaled memory into useful text later.
* `do_not_invent` : boundaries the text upscaler should not fabricate past.
* `confidence` : how confident the builder is in the downscaled node.
* `source` : where the node came from, when available.

`compressed` is the technical field that stores downscaled semantic memory. `upscale_direction` guides the future text upscale. `do_not_invent` protects against false continuity. `confidence` helps decide whether to trust or soften the memory. `source` makes debugging possible.

Older nodes may only have `summary` or `content`; those should be treated as legacy downscaled text. New nodes keep `summary` as a compatibility mirror for older readers.

Consumers that read neural memory, including replies when `neural_memory.mode` is `debug` or `on`, dreams, journals, stories, memory updates, and Yculth's debug upscale context, must follow the text-upscaler contract:

* use downscaled memory as guidance, not exact transcript.
* expand only when relevant to the current request, scene, dream, journal, story, or memory update.
* treat low-confidence nodes softly.
* obey `do_not_invent` over `upscale_direction`.
* prefer recent raw shortmemory when it conflicts with downscaled memory.
* do not reveal internal memory field names in normal roleplay replies.

Default source routing:

```text
Layer 1 : Scene Impressions can read thoughts
Layer 2 : Story Memory Nodes can read stories
Layer 3 : Emotional Arcs can read journals, dreams, and dream journals
Layer 4 : Durable Truths can read memorysummary
```

Memory Layers must not delete existing shortmemory or memorysummary.

Memory Layers must not delete thoughts or journals directly. Thought cleanup belongs to the successful daily journal/dream/memory cycle, where useful temporary thought material can be absorbed before thoughts are backed up and cleared. Journals are durable and should not be removed by ordinary cleanup.

Memory Layers / Neural Memory must not be used in normal reply context yet.

`memory_layers.use_in_context` must stay false until the generated layers are readable, useful, previewable, and proven in real use.

## Migration Notes

There is no automatic migration from old memory into neural memory yet.

Current memory files keep their jobs:

* `soul/shortmemory.jsonl` remains the raw recent conversation source.
* `soul/memorysummary.txt` remains compact active durable memory until neural memory is proven better in real use.
* neural memory can read old shortmemory and memorysummary as source material.
* old memories do not need to be deleted.
* old memories should not be blindly dumped into persona.
* `soul/persona.md` should stay identity, personality, voice, preferences, boundaries, and behavior guidance. Persona is not a memory landfill.

Temporary manual migration path:

1. Keep old `soul/shortmemory.jsonl` and `soul/memorysummary.txt` where they are.
2. Preserve backups before any cleanup or rewrite.
3. Run the neural memory builder manually with `npm.cmd run memorylayers -- --agent <AgentName> --force`.
4. Inspect generated downscale files under `soul/memory-layers/`.
5. Inspect Yculth's Debug Downscale and Debug Upscale Context surfaces.
6. Optionally set `neural_memory.mode` to `debug` and inspect `agents/<Agent>/regenerated/neural-memory-debug/latest-report.md`.
7. Only enable neural memory in replies after inspection shows the memory nodes are useful and safe.

New agents do not need old memory files. If `shortmemory` or `memorysummary` is empty or missing during early setup, start from persona plus new conversation. The system should build memory gradually as interaction happens. Missing old memory is not an error.

## Manual Builder

The first manual helper lives at:

```text
discord-bot/memory-layers.js
```

To inspect counts without writing files or calling OpenRouter:

```powershell
cd C:\Users\argit\Documents\_PROGRAMMING\aiassistant\discord-bot
npm.cmd run layerinspect -- --agent Stardust
```

To generate sidecar Memory Layers files, enable `memory_layers.enabled` or pass `--force` for one manual build:

```powershell
cd C:\Users\argit\Documents\_PROGRAMMING\aiassistant\discord-bot
npm.cmd run memorylayers -- --agent Stardust --force
```

The builder reads `memory_layers.layer_0_source`, usually `soul/shortmemory.jsonl`, and writes only inside `memory_layers.folder`, usually `soul/memory-layers`.

Layer 1 interprets shortmemory clusters using the current descriptor model and asks the utility model for explicit `compressed`, `upscale_direction`, `do_not_invent`, `confidence`, and `source` fields. Higher layers are conservative semantic downscales derived from lower-layer memory nodes. The inspection command prints sample compact-node text, upscale direction, and do-not-invent boundaries for debugging.

The builder is manual. Normal bot startup should not create or update Memory Layers files.

## Deterministic Fixture

A tiny no-API fixture lives under:

```text
discord-bot/fixtures/semantic-memory/
```

It contains fake shortmemory, one private thought, and one expected semantic memory node. The fixture demonstrates:

* `compressed` stores compact downscaled meaning.
* `upscale_direction` explains how to re-expand the meaning later.
* `do_not_invent` prevents false continuity.
* `confidence` is a trust/softening signal.
* `source` points back to the fixture range.

Run it without OpenRouter:

```powershell
cd C:\Users\argit\Documents\_PROGRAMMING\aiassistant\discord-bot
npm.cmd run test:semantic-memory
```

The fixture is for node-shape safety only. It does not enable neural memory in replies.

## Future UI Direction

The Memory Layers UI should remain the debug surface for Neural Memory.

First design goals:

* simple controls.
* no dense menus.
* thick, readable buttons.
* clear visual state.
* plain labels.
* easy preview before anything affects replies.

Later visual direction:

* animated layer graph.
* neuron-like dots and connections.
* visible clusters for thoughts, journals, stories, dreams, memory entries, memorysummary, and durable continuity.
* selected node inspector.
* gentle animation showing memories downscaling or moving between layers.

Current and future debug controls:

* `Build Layers`.
* `Preview Meaning`.
* `Debug Downscale`.
* `Debug Upscale Context`.
* `Mode`: `Off`, `Debug`, or `On`.

Mode must stay `Off` by default until Memory Layers are proven useful. `Debug` writes a local report under `agents/<Agent>/regenerated/neural-memory-debug/latest-report.md` showing what semantic memory would add, why nodes were selected, and what the text-upscaler boundaries are, but it does not add those nodes to normal reply context. `On` should not be used for normal replies until Yculth can preview exactly what would be sent to OpenRouter and the generated memory nodes are proven useful.

## Runtime Direction

The implementation order should be:

* add settings for `neural_memory` and consciousness descriptors.
* generate a private first-person thought before every generated visible reply.
* save automatic thoughts silently under `soul/consciousness/thoughts/`.
* make thoughts inspectable in Yculth.
* add durable daily journal generation.
* make the daily cycle generate journal, dream, optional dreamjournal, memory entry, memorysummary update, then clear temporary thoughts.
* make the neural memory builder read shortmemory plus thoughts first.
* only later, allow reply context to include `neural_memory`.

Do not jump straight to enabling neural memory in replies. Automatic thoughts are the first runtime milestone, and the next useful milestone is making those thoughts inspectable and useful in the daily journal/dream/memory cycle.

## Safety Boundary

For now:

* do not hook Memory Layers into normal replies.
* do not hook Neural Memory into normal replies.
* do not enable neural memory in replies by default.
* keep thought clearing tied to successful memory absorption, with journals, dreams, stories, memory entries, and memorysummary preserved.
* do not replace `shortmemory.jsonl`.
* do not replace `memorysummary.txt`.
* do not delete current memory files.
* do not make Memory Layers authoritative.

The current shortmemory and memorysummary behavior remains active until Memory Layers are proven useful.
