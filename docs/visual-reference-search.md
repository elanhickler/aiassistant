# Visual Reference Search

Visual reference search is the future step before downloading internet resources.

It records what the system looked for and which candidates were found, so downloads stay explainable and reviewable.

This is a planning contract only. It is not wired into the Discord runtime yet.

## Default Rule

Searching may find many candidates.

Downloading should stay selective.

## Storage

Use a search log inside the reference folder:

```text
agents/<Agent>/soul/visual-references/searches.jsonl
```

Use one JSON object per search.

```json
{
  "id": "2026-06-13-example-reference-search",
  "agent": "AgentName",
  "output_type": "background",
  "query": "rainy neon street background",
  "reason": "Need a reference for a wet city scene.",
  "source": "web",
  "created_at": "2026-06-13T00:00:00.000Z",
  "candidates": [
    {
      "title": "short result title",
      "source_url": "https://example.com/source-page",
      "thumbnail_url": "",
      "creator": "",
      "license": "",
      "notes": "why this candidate may be useful",
      "review_state": "unreviewed"
    }
  ]
}
```

## Review States

Suggested `review_state` values:

* unreviewed : found by search, not inspected yet.
* useful : likely worth downloading or keeping as a source page.
* rejected : not useful, low quality, wrong subject, or bad source.
* downloaded : copied into `soul/visual-references/images/` and recorded in `manifest.jsonl`.
* blocked : should not be used because of license, source, privacy, or safety concerns.

## Query Rules

Queries should be short and visual.

Good queries:

```text
rainy neon alley background
sleeping fox character curled up blanket
sparkle heart emoji transparent
```

Bad queries:

```text
everything about this roleplay so far
generate a picture from all memory
```

## Candidate Rules

Each candidate should record why it might help.

Do not download candidates just because they exist.

Prefer candidates with:

* visible source page.
* reusable or clear license when known.
* subject matter that matches the current output type.
* enough resolution for local reference use.
* creator/source notes that can be kept beside the file.

## Boundaries

* Do not store cookies, private headers, account-only URLs, or session data.
* Do not treat search candidates as downloaded references.
* Do not use a candidate in prompt assembly until it is downloaded or manually approved.
* Do not put raw roleplay hidden context into web search queries.
