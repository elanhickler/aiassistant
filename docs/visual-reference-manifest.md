# Visual Reference Manifest

Use this format when internet resources are downloaded or manually collected for visual expression work.

References belong in:

```text
agents/<Agent>/soul/visual-references/
```

Generated outputs belong in:

```text
agents/<Agent>/regenerated/visualexpression/
```

## Folder Shape

```text
soul/visual-references/
    manifest.jsonl
    images/
    notes/
```

## `manifest.jsonl`

Use one JSON object per downloaded or manually collected resource.

```json
{
  "id": "2026-06-13-example-reference",
  "local_path": "images/example-reference.png",
  "source_url": "https://example.com/source-page",
  "direct_download_url": "https://example.com/image.png",
  "title": "short human-readable title",
  "creator": "",
  "license": "",
  "downloaded_at": "2026-06-13T00:00:00.000Z",
  "collected_by": "human",
  "intended_use": "reference for scene mood, outfit, pose, background, emoji, thought, or dream",
  "notes_path": "notes/example-reference.md"
}
```

## Notes

Keep notes short and practical.

```md
# Example Reference

* source_url : https://example.com/source-page
* creator : unknown
* license : unknown
* intended_use : reference for rainy city background

Useful details:

* wet pavement reflections
* neon signs
* low evening light
```

## Rules

* Prefer source pages over direct image URLs when both are available.
* Keep creator and license blank when unknown instead of guessing.
* Do not store API keys, cookies, private headers, or session data.
* Do not treat downloaded references as generated agent-owned art.
* Generated images should include their prompt and source reference IDs when possible.
