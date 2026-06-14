# Vision Skill

The vision skill describes images. It should stay separate from image generation and image prompt training unless the user explicitly copies or summarizes the description into the image skill.

## Command

Use an image attachment, or reply to a message with an image attachment:

```text
||@agent vision: describe this image||
```

The text after `vision:` is an instruction for how to inspect the image.

Examples:

```text
||@agent vision: describe visible composition and possible anatomy issues||
||@agent vision: what style does this appear to use?||
||@agent vision: describe the background and lighting only||
```

## Boundary

Vision output is not truth.

Vision output is an uncertain description that may help the user critique faster.

Priority order:

* user critique
* image metadata, prompt, and workflow facts
* vision model observations
* agent guesses

The vision skill should not:

* update image prompt guidance by itself.
* write visual memory by itself.
* decide that an image is good or bad by itself.
* claim character identity or lore unless the image visibly supports it.
* connect directly to image generation in the first implementation.

## Current Implementation

The runtime loads `vision` only when an agent includes it in `enabled_skills`.

Settings live in:

```text
vision_skill
```

The first implementation sends one Discord image attachment to `vision_skill.model` through OpenRouter and replies with a concise description.
