# Visual Pipe Commands

Visual pipe commands should feel conversational. The user should not need to think in request IDs, settings, samplers, CFG, or provider details.

The public command is:

```text
||@agent image: natural language guidance||
```

In DMs, `@agent` may be optional when the runtime already knows which agent is being addressed.

## Meaning

`image:` means:

```text
Update your understanding of how future image prompts and visual styles should be shaped.
```

It is mainly for prompt critique and style guidance.

Examples:

```text
||@agent image: add rough pencil construction lines to sketch prompts||
||@agent image: remove clean manga lineart from sketch prompts||
||@agent image: save this as the sketch style||
||@agent image: load the sketch style for the next image||
||@agent image: rename sketch style to rough sketch||
||@agent image: style dream images as symbolic and surreal||
||@agent image: sketches should be rougher and less polished||
||@agent image: make faces larger and easier to read in portrait generations||
||@agent image: dream images should feel more symbolic and surreal||
||@agent image: avoid clean manga lineart for sketch style, prefer loose construction lines||
```

## Explicit Verbs

The command stays conversational, but these verbs should be treated as intentional control language:

* `add` : Add prompt/style guidance.
* `remove` : Remove, avoid, forget, erase, or stop using prompt/style guidance.
* `load` : Switch to an existing style or workflow for the next image request.
* `save` : Save the current guidance or result as a named style.
* `rename` : Rename an existing style.
* `style` : Set or adjust the look, workflow, ratio, or prompt direction.

`delete` is not a separate concept. Treat it as `remove`.

The command currently records durable visual guidance in:

```text
agents/<Agent>/regenerated/visualexpression/visual-memory.jsonl
```

## Current Behavior

The current implementation does not generate an image from Discord.

It records the user guidance as visual memory with tags:

```text
image
style
prompt
add, remove, load, save, rename, style, or note
```

Expected response:

```text
image style guidance remembered
memory: memory-id
```

Future visual prompt assembly can then include compact remembered guidance, such as:

```text
Remembered visual guidance:
* image / conversational [image, style, prompt] : sketches should be rougher and less polished
```

## Design Rule

Do not expose command syntax for style creation, critique, and adjustment unless the user explicitly asks for technical/debug controls.

Prefer:

```text
||@agent image: make sketch prompts rougher||
```

Avoid making the human use:

```text
||@agent visual style adjust sketch: make it rougher||
```

The system can infer whether the guidance is global, style-specific, prompt-specific, character-specific, or critique of the latest output later.

## Legacy Internal Commands

Older `visual ...` commands still exist in code as compatibility/debug scaffolding for request queues, reviews, memories, and dry-run processing.

They are intentionally hidden from help because they are too syntax-heavy for normal use.

Keep them as internal tools until Yculth or a proper local image-generation bridge replaces them with a visual interface.
