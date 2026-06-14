# Music Skill

The music skill is the music-link search and formatting capability layer.

Discord is only one interface for this skill. A local app, website, Yculth page, or future API server should be able to call the same underlying skill hooks.

## Commands

Infer music from recent shortmemory:

```text
||@agent music||
```

Search for music from a description, or format a direct link:

```text
||@agent music: link or text||
```

## Hooks

The skill exposes implementation hooks:

* `findMusic({ input, sourceText, useRecentContext })` : Find or format a music link from direct text, an existing link, or recent context.
* `findMusicFromConversation(sourceText)` : Use recent shortmemory plus the latest user text to decide what music link to post.
* `formatMusicLink(title, url)` : Format a music URL as the standard Discord markdown music link.

Existing Discord reactions, pipe commands, and natural-language intent checks call those hooks. Other interfaces should call the hooks directly or through a future local API instead of reimplementing music search logic.

## Search Behavior

Known-song requests prefer enabled catalog-style sites, such as YouTube Music, Spotify, Apple Music, Bandcamp, or SoundCloud.

Vibe requests use YouTube discovery when enabled.

The skill can also accept a direct URL and wrap it in the standard music link format.

## Storage

Posted music links are archived to the configured music memory thread:

```text
music_skill.music_thread_id
```

The local skill does not need a secret file.

## Boundary

The music skill should not assume Discord is the permanent interface.

Keep search, classification, and formatting behavior in the skill. Keep interface behavior at the edge.
