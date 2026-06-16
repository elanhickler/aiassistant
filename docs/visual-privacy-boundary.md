# Visual Privacy Boundary

Visual privacy boundaries define what visual tooling may send to a generator, a web search, or Discord.

This is a planning contract only. It is not wired into the Discord runtime yet.

## Default Rule

Send the smallest useful visual description.

Do not send raw private context when a short derived description will work.

## Never Send

Never send these outside the local process by default:

* secret files or secret values.
* local absolute paths.
* raw `shortmemory.jsonl`.
* full `memorysummary.txt`.
* full `raw.txt`.
* full persona or settings files.
* hidden subtext as direct quotes.
* private Discord IDs unless needed for local traceability.
* provider stack traces.
* downloaded reference source notes that contain private comments.

## Image Provider Boundary

Image providers should receive focused prompt text, not raw memory dumps.

Allowed:

* selected appearance facts.
* selected scene facts.
* selected visual memory summaries.
* selected reference file paths already approved for provider use.
* size, model, seed, and generation settings.

Not allowed by default:

* unrelated chat logs.
* complete story files.
* complete dream files.
* unfiltered origin text.
* entire status dumps.

## Internet Search Boundary

Internet search queries should be short visual queries.

Allowed:

```text
rainy neon alley background
sleeping fox character blanket pose
sparkle heart emoji transparent
```

Not allowed:

```text
verbatim private roleplay text
hidden subtext instructions
full character persona
local file paths
```

## Discord Boundary

Discord posts should receive selected outputs and short notes.

Do not post:

* full generation prompts by default.
* full source context.
* local absolute paths.
* raw hidden memory.
* downloaded reference notes.

## Redaction

When a field is useful for debugging but private, record a redacted value.

Examples:

```text
local_path : [redacted local path]
source_context : [selected visual summary only]
secret_status : [secret file exists]
```

## Review

Before future tooling sends a visual request to an external service, Yculth should be able to show:

* the exact prompt that will be sent.
* selected reference paths.
* selected memory summaries.
* whether any private fields were redacted.

Local-only generation still benefits from this preview because it makes prompts inspectable and editable.
