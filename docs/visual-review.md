# Visual Review

Visual review is how generated outputs and pending requests are judged before they are promoted, posted, or remembered.

This is partly wired into the Discord runtime through `visual note`, `visual review`, and `visual promote`, which record human guidance before image generation exists.

Use `docs/visual-variants.md` when reviewing multiple variants of the same request.

## Default Rule

Generated visuals start as unreviewed experiments.

A visual should not become durable soul material until it has a review note or an explicit user promotion.

## Storage

Use a review log beside generated outputs:

```text
agents/<Agent>/regenerated/visualexpression/reviews.jsonl
```

Use one JSON object per review or request note.

```json
{
  "id": "2026-06-13-example-visual-review",
  "output_id": "2026-06-13-example-visual",
  "agent": "AgentName",
  "reviewer": "human",
  "review_state": "usable",
  "score": 4,
  "tags": ["good likeness", "expressive face"],
  "notes": "Face and mood are useful. Hands need cleanup before promotion.",
  "created_at": "2026-06-13T00:00:00.000Z"
}
```

Before an output exists, `visual note` or `visual review` may write a row with `output_id` blank and `request_id` filled in:

```json
{
  "id": "2026-06-13-example-visual-note",
  "output_id": "",
  "request_id": "2026-06-13-example-visual-request",
  "agent": "AgentName",
  "reviewer": "human",
  "review_state": "note",
  "score": null,
  "tags": [],
  "notes": "Keep the sleepy expression, but make the room darker next time.",
  "created_at": "2026-06-13T00:00:00.000Z"
}
```

## Review States

Suggested `review_state` values:

* unreviewed : no decision yet.
* note : human note attached before a final review decision.
* usable : worth keeping as a generated experiment.
* promote_candidate : likely worth promoting to `soul/art/` or `soul/emojis/`.
* needs_edit : useful direction, but needs crop, cleanup, retry, or inpaint.
* rejected : not useful.
* blocked : should not be used or posted.

## Scores

Use a simple 1 to 5 score when useful.

* 1 : broken or unusable.
* 2 : has one useful idea, but mostly wrong.
* 3 : usable reference or experiment.
* 4 : strong result, may be promoted after review.
* 5 : durable soul material candidate.

Scores are optional. A short note matters more than a number.

## Review Checks

Useful checks:

* likeness : does it match the agent or intended subject?
* expression : does it convey the intended feeling?
* composition : is the image readable at intended size?
* continuity : does it conflict with persona, appearance, or memory?
* artifact level : are hands, face, text, limbs, or layout broken?
* privacy : does it expose hidden context, local paths, or private notes?
* reuse value : is it useful enough to become art, emoji, reference, or memory?

## AI Review

Future AI review may help triage outputs, but human review wins.

AI review should use a small, structured response:

```json
{
  "review_state": "needs_edit",
  "score": 3,
  "tags": ["good pose", "bad hands"],
  "notes": "The pose works, but the fingers are malformed.",
  "safe_to_post": false,
  "safe_to_promote": false
}
```

## Promotion Interaction

Promotion should prefer outputs with `promote_candidate` or an explicit user confirmation.

`visual promote` records `review_state: promote_candidate`. It does not move files, copy images into soul folders, or post images to Discord yet.

Rejected or blocked outputs should not be promoted unless the user intentionally overrides the review.

## Boundaries

* Do not make review a hidden destructive step.
* Do not delete rejected outputs automatically.
* Do not let AI review override human notes.
* Do not post blocked outputs to Discord.
