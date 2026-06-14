# Visual Retention

Visual retention controls how long generated experiments and downloaded references stay around.

This is a planning contract only. It is not wired into the Discord runtime yet.

## Default Rule

Generated experiments are disposable.

Promoted soul material is not disposable.

## Generated Outputs

Generated outputs live in:

```text
agents/<Agent>/regenerated/visualexpression/
```

Future cleanup may remove old generated outputs when:

* they are older than the configured retention days.
* they were never promoted.
* they are not referenced by a current request state.
* they are not manually pinned.

## Downloaded References

Downloaded references live in:

```text
agents/<Agent>/soul/visual-references/
```

References should be cleaned more cautiously than generated outputs because they may be useful source material.

Future cleanup should prefer review-first behavior for references.

## Protected Files

Never clean automatically:

* files under `soul/art/`
* files under `soul/emojis/`
* promoted visual notes
* persona, memory, status, or settings files
* secret files

## Trash Behavior

Future cleanup should move files to system trash or a local trash folder when possible.

Avoid permanent deletes for visual files unless the user explicitly asks for destructive cleanup.

## UI

Yculth cleanup controls should use the app-wide click-once-to-arm, click-again-to-confirm pattern.

The UI should show:

* how many generated outputs would be cleaned.
* whether promoted outputs are excluded.
* whether references are included.
* the destination for cleaned files.
