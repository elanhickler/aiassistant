# Visual Provider Contract

Visual providers are the future adapters that turn a visual expression request into an image file.

The first intended provider is local Yculth imagegen. Other providers should use the same contract so the rest of the system does not care how the image was made.

This is a planning contract only. It is not wired into the Discord runtime yet.

## Provider Input

A provider receives one focused generation job.

```json
{
  "request_id": "2026-06-13-example-visual",
  "agent": "AgentName",
  "output_type": "scene",
  "prompt": "focused image prompt",
  "negative_prompt": "",
  "width": 768,
  "height": 1152,
  "model": "",
  "seed": "",
  "reference_paths": [],
  "output_folder": "agents/AgentName/regenerated/visualexpression/images"
}
```

## Provider Output

A successful provider returns enough information to write `outputs.jsonl`.

```json
{
  "ok": true,
  "request_id": "2026-06-13-example-visual",
  "local_path": "images/2026-06-13-example-visual.png",
  "provider": "yculth-imagegen",
  "model": "",
  "width": 768,
  "height": 1152,
  "seed": "",
  "created_at": "2026-06-13T00:00:00.000Z",
  "notes": ""
}
```

## Provider Failure

A failed provider returns a short diagnostic object.

```json
{
  "ok": false,
  "request_id": "2026-06-13-example-visual",
  "provider": "yculth-imagegen",
  "error_kind": "timeout",
  "message": "generation timed out after 120 seconds",
  "retryable": true,
  "created_at": "2026-06-13T00:00:00.000Z"
}
```

Suggested `error_kind` values:

* unavailable : provider is not running or cannot be reached.
* timeout : provider did not finish before the configured timeout.
* rejected : provider refused the prompt or settings.
* bad_request : missing prompt, bad size, missing model, or invalid reference path.
* output_missing : provider claimed success but no file was found.
* unknown : unexpected failure.

## Retry Rules

Retries should be bounded.

Retry is useful for:

* temporary provider unavailable errors.
* network or local bridge timeouts.
* provider queue hiccups.

Retry is not useful for:

* invalid prompt objects.
* missing local paths.
* impossible image sizes.
* unsupported provider settings.

## Path Rules

Providers must write inside the configured output folder.

Do not accept an output path outside the selected agent folder.

Do not read reference paths outside:

```text
agents/<Agent>/soul/visual-references/
agents/<Agent>/soul/art/
agents/<Agent>/soul/emojis/
```

## Chat Flow

Provider failures should not derail normal chat.

If a visual was optional, the text reply can still be sent without the image.

If a visual was explicitly requested by the user, show a short local/Yculth error and keep enough request state for retry.

Do not paste full provider stack traces into Discord by default.
