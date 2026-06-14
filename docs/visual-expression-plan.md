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
* `docs/visual-reference-acquisition.md` : Rules for finding and downloading internet visual references.
* `docs/visual-reference-search.md` : Search log format for internet reference candidates before download.
* `docs/visual-reference-manifest.md` : Manifest and sidecar note format for downloaded or manually collected visual references.
* `docs/visual-reference-selection.md` : Rules for choosing relevant references for one visual request.
* `docs/visual-expression-intent.md` : Intent rules for deciding when a generated visual is useful.
* `docs/visual-expression-request.md` : Request object format for future generated visual expressions.
* `docs/visual-request-lifecycle.md` : State flow for queued, generating, previewed, saved, promoted, failed, and cancelled visual requests.
* `docs/visual-pipe-commands.md` : Planned manual pipe command shape for user-requested local visual expressions.
* `docs/visual-prompt-assembly.md` : Rules for assembling focused image prompts from selected context.
* `docs/visual-style-presets.md` : Reusable style presets for emoji, portraits, scenes, backgrounds, thoughts, and dreams.
* `docs/visual-provider-contract.md` : Provider input, output, error, retry, and path rules for image generation adapters.
* `docs/visual-privacy-boundary.md` : Rules for what visual tooling may send to providers, web search, or Discord.
* `docs/visual-output-manifest.md` : Manifest and prompt-note format for completed generated visual expressions.
* `docs/visual-review.md` : Review notes for judging generated outputs before posting, promotion, or memory.
* `docs/visual-memory.md` : Compact memory notes for meaningful visuals that should be recallable later.
* `docs/visual-promotion.md` : Rules for promoting generated visuals into durable `soul/art/` or `soul/emojis/` material.
* `docs/visual-retention.md` : Cleanup and retention rules for generated visual experiments and references.
* `docs/visual-discord-posting.md` : Rules for posting selected generated visuals back into Discord.
* `docs/visual-yculth-ui.md` : Future Yculth UI shape for requests, references, outputs, and promotion.

## Internet References

Internet downloads should stay deliberate and traceable.

* Download only into `soul/visual-references/`.
* Search queries should follow `docs/visual-privacy-boundary.md`.
* Keep a sidecar note beside each downloaded reference when possible.
* The sidecar note should include source URL, creator/license when known, download time, and why the reference was useful.
* Track downloaded references in `soul/visual-references/manifest.jsonl`.
* Track reference searches and candidates in `soul/visual-references/searches.jsonl`.
* Use `docs/visual-reference-search.md` before download when search candidates need review.
* Use `docs/visual-reference-acquisition.md` for download limits, source handling, and preview-first behavior.
* Do not treat downloaded references as agent-owned generated output.
* Prefer references that are clearly reusable, user-provided, public-domain, Creative Commons, or otherwise suitable for private local reference use.

## Future Runtime Shape

The first implementation should be local-first.

1. A reply is drafted normally.
2. A cheap utility model follows `docs/visual-expression-intent.md` to decide whether a visual is useful.
3. The decision chooses one output type: emoji, self, scene, background, thought, or dream.
4. The system follows `docs/visual-reference-selection.md` to choose relevant visual references.
5. The system follows `docs/visual-prompt-assembly.md` to assemble a focused image prompt from selected persona, current message, status, memory, and relevant visual references.
6. The prompt includes a style preset from `docs/visual-style-presets.md`.
7. The provider contract sends one focused generation job to Yculth imagegen.
8. The generated image is cached under `regenerated/visualexpression/`.
9. The output can receive a visual review note.
10. If the visual matters, write a compact visual memory note.
11. Discord posting remains opt-in and should be designed separately.

Requests should follow `docs/visual-expression-request.md` so manual Yculth actions, future bot hooks, and generated output metadata all speak the same shape.
Request states should follow `docs/visual-request-lifecycle.md`.
Future manual Discord control should follow `docs/visual-pipe-commands.md`.
Future Discord image posting should follow `docs/visual-discord-posting.md`.
Visual memory should follow `docs/visual-memory.md`.
Visual providers should follow `docs/visual-provider-contract.md`.
Visual privacy boundaries should follow `docs/visual-privacy-boundary.md`.
Visual review should follow `docs/visual-review.md`.
Visual style presets should follow `docs/visual-style-presets.md`.

## Boundaries

* This is not implemented as a Discord skill yet.
* The agent should not generate visuals on every reply.
* The first useful behavior is likely manual/local: generate a visual from selected context in Yculth, then later let the bot request it automatically.
* The local UI should follow `docs/visual-yculth-ui.md`.
* Generated visuals should be attached to memory only when they become meaningful, not merely because they exist.
* Visual memory should summarize meaning, not full prompt history.
* Generated visuals become durable soul material only through the promotion rules in `docs/visual-promotion.md`.
* Generated visual cleanup should follow `docs/visual-retention.md`.
* Generated visual Discord posting should follow `docs/visual-discord-posting.md`.
