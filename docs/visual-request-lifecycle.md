# Visual Request Lifecycle

Visual expression requests should move through clear states so local tools can show progress, retry failures, and avoid duplicate generation.

This is a planning contract only. It is not wired into the Discord runtime yet.

## States

* `queued` : Request exists but generation has not started.
* `selecting_references` : Reference selection is running.
* `assembling_prompt` : Prompt assembly is running.
* `generating` : Image generation is running.
* `preview` : Output is ready for local review.
* `saved` : Output is saved locally.
* `promoted` : Output was copied or moved into durable `soul/art/` or `soul/emojis/`.
* `posted` : Future opt-in Discord posting completed.
* `failed` : Something failed. Keep the error message.
* `cancelled` : User or system cancelled before completion.

## State Rules

* A request starts as `queued`.
* Local-first generation should usually end at `preview` or `saved`.
* `promoted` must be user-confirmed.
* `posted` must be future opt-in behavior, not default behavior.
* `failed` should keep enough error detail to retry or diagnose.
* `cancelled` should not delete source references, prompts, or completed outputs unless the user explicitly deletes them.

Provider failures should use the short failure shape from `docs/visual-provider-contract.md`.
Until provider handoff is implemented, the manual visual processor may mark queued requests as `failed` with `error_kind: provider_unimplemented`.

## Request Log

`requests.jsonl` should record state changes as append-only events when possible.

Request JSON files may be stored under:

```text
regenerated/visualexpression/requests/
```

```json
{
  "request_id": "2026-06-13-example-visual",
  "state": "generating",
  "updated_at": "2026-06-13T00:00:00.000Z",
  "message": "submitted to yculth-imagegen"
}
```

## Output Manifest

`outputs.jsonl` should only receive completed generated outputs, not every state change.

Use `docs/visual-output-manifest.md` for output rows.

## Retry

Retry should create a new request event and may reuse the same request ID with a retry count, or create a fresh request ID that points back to the failed one.

Retry should not overwrite the old prompt or error unless the user explicitly cleans the generated folder.

Use `provider_max_retries` to keep automatic retry behavior bounded.
