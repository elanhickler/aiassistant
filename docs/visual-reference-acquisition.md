# Visual Reference Acquisition

Visual reference acquisition is the future process for finding and downloading internet resources into an agent's local reference folder.

This is a planning contract only. It is not wired into the Discord runtime yet.

## Destination

Downloads must stay inside:

```text
agents/<Agent>/soul/visual-references/
```

The downloader should create:

```text
soul/visual-references/
    manifest.jsonl
    images/
    notes/
```

## Search Inputs

Search should be driven by a clear visual need.

* output type : emoji, self, scene, background, thought, or dream.
* prompt seed : short description of what the visual should show.
* intended use : why this reference is being collected.
* preferred source list : optional sources from settings.

## Download Rules

* Prefer source pages over direct image URLs.
* Save only image resources with allowed MIME types.
* Save a short note file for each downloaded resource.
* Append one row to `manifest.jsonl` for each downloaded resource.
* Do not store cookies, authorization headers, API keys, or private session data.
* Do not overwrite existing files; generate a new ID when a name collides.
* Do not download unlimited results. Use the configured maximum.

## Suggested Flow

1. Build a search phrase from output type and prompt seed.
2. Search configured reference sources, if any.
3. Keep a short candidate list with source URLs.
4. Download only the best candidates within the configured limit.
5. Write sidecar notes.
6. Append manifest rows.
7. Let reference selection decide later whether these references are useful for a prompt.

## Manifest Minimum

Each downloaded resource must record at least:

* `id`
* `local_path`
* `source_url`
* `direct_download_url`
* `title`
* `downloaded_at`
* `collected_by`
* `intended_use`
* `notes_path`

Use `docs/visual-reference-manifest.md` for the full manifest format.

## Boundaries

Downloaded references are source material. They are not generated art, durable memory, or agent-owned imagery.

The first implementation should be manual or preview-first inside Yculth.
