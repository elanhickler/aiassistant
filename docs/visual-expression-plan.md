# Visual Expression Plan

Visual expression is the future system where an agent can decide that a reply would benefit from an image-like expression in addition to text.

## Goal

Let agents eventually generate their own visual artifacts as needed:

* emoji : tiny reaction images, icons, and mood stamps.
* self : images of the agent's body, pose, outfit, or expression.
* scene : the current roleplay location or action moment.
* background : environmental images that set place, weather, or atmosphere.
* thought : symbolic internal images, memories, mental snapshots, or feelings.
* dream : dream images generated from sleep and dream context.

## Storage

* `soul/art/` : User-curated art, reference images, and visual notes.
* `soul/emojis/` : Custom emoji assets and emoji notes.
* `soul/visual-references/` : Downloaded or manually collected references from the internet. These are source materials, not generated outputs.
* `regenerated/visualexpression/` : Generated images created by future tooling.

## Internet References

Internet downloads should stay deliberate and traceable.

* Download only into `soul/visual-references/`.
* Keep a sidecar note beside each downloaded reference when possible.
* The sidecar note should include source URL, creator/license when known, download time, and why the reference was useful.
* Do not treat downloaded references as agent-owned generated output.
* Prefer references that are clearly reusable, user-provided, public-domain, Creative Commons, or otherwise suitable for private local reference use.

## Future Runtime Shape

The first implementation should be local-first.

1. A reply is drafted normally.
2. A cheap utility model decides whether a visual is useful.
3. The decision chooses one output type: emoji, self, scene, background, thought, or dream.
4. The system assembles a focused image prompt from persona, current message, status, shortmemory, longmemory, and relevant visual references.
5. Yculth imagegen generates the image locally.
6. The generated image is cached under `regenerated/visualexpression/`.
7. Discord posting remains opt-in and should be designed separately.

## Boundaries

* This is not implemented as a Discord skill yet.
* The agent should not generate visuals on every reply.
* The first useful behavior is likely manual/local: generate a visual from selected context in Yculth, then later let the bot request it automatically.
* Generated visuals should be attached to memory only when they become meaningful, not merely because they exist.
