# Visual Expression Intent

Visual expression should feel like the agent choosing a meaningful extra expression, not an image generator firing constantly.

This is a planning contract only. It is not wired into the Discord runtime yet.

## Decision Goal

Before generating a visual, a utility model should decide whether the current moment benefits from one.

```json
{
  "should_generate_visual": false,
  "output_type": "",
  "reason": "",
  "confidence": 0,
  "prompt_seed": ""
}
```

## Generate When

Generate when the image adds something the text alone does not carry well.

* emotional peak : a strong facial expression, reaction, realization, or confession.
* visual reveal : outfit, body change, pose, room, object, weather, or creature detail.
* scene anchor : a new location or background becomes important.
* dream logic : the agent is sleeping, dreaming, or describing dream imagery.
* thought image : the agent has a strong internal mental picture or memory flash.
* emoji moment : the agent needs a tiny recurring expression or symbol.
* user asks : the user directly asks for an image, emoji, background, scene, dream image, or visual reference.

## Do Not Generate When

Skip generation when a visual would be noise.

* the reply is simple acknowledgement.
* the moment is mostly logistics, settings, or command handling.
* the same visual idea was just generated recently.
* the model is uncertain what should be shown.
* the result would interrupt fast conversation flow.
* the output type is not enabled in settings.

## Output Type Choice

* `emoji` : Use for repeatable mood or reaction stamps.
* `self` : Use when the agent's expression, body, outfit, pose, or physical state matters.
* `scene` : Use for roleplay action moments with characters and staging.
* `background` : Use when the place matters more than the characters.
* `thought` : Use for internal symbolism, memory flashes, imagined possibilities, or feelings.
* `dream` : Use only when sleep or dream context is active.

## Confidence

The utility model should usually require high confidence.

* `0.0` to `0.49` : no visual.
* `0.5` to `0.74` : only queue a local preview if the user asked.
* `0.75` to `1.0` : may queue a local visual request.

Discord posting should need a separate explicit policy later.

## Prompt Seed

`prompt_seed` should be short. It is not the full image prompt.

Good prompt seed:

```text
Rena's ears flatten as Bimbomon begins to surface, purple eyes wide, bedroom lit by a laptop glow
```

Bad prompt seed:

```text
make image
```

The full prompt should be assembled later from persona, status, current reply intent, memory, and selected references.
