# Visual Discord Posting

Visual Discord posting is the future bridge from local generated visuals back into chat.

The local machine stays the source of truth. Discord receives selected outputs, not the entire visual workspace.

This is a planning contract only. It is not wired into the Discord runtime yet.

Use `docs/visual-privacy-boundary.md` before posting generated visual notes or attachments to Discord.

## Default Rule

Generated visuals should not be posted to Discord automatically by default.

Posting should happen only when the user confirms it, or when a future setting explicitly allows a narrow automatic behavior.

## Posting Flow

Future posting should use this order:

1. Generate the visual locally.
2. Save the output under `regenerated/visualexpression/`.
3. Write an output manifest entry.
4. Show a local preview in Yculth.
5. Let the user post, promote, retry, or discard.

## Message Shape

When a generated visual is posted, the Discord message should be short.

Suggested content:

```text
visual saved from <agent name>
```

If the visual is tied to a reply, the Discord post may include a short link-back note such as:

```text
visual for recent reply
```

Avoid posting long prompts, private prompt context, hidden memory, or provider metadata into Discord.

## Allowed Automatic Posting

Automatic posting should stay conservative.

It may be acceptable later for:

* emoji-sized reactions explicitly requested by the user.
* dream images posted into a dream thread after a dream command.
* manually enabled visual requests in a private testing channel.

It should not be acceptable by default for:

* private thoughts.
* hidden subtext.
* Memorysum-derived images.
* unreviewed internet reference downloads.
* generated images that may expose private local files or prompt internals.

## Attachments

Future posting should attach the generated image file itself, not upload an external URL.

If Discord rejects the file because of size or format, Yculth should offer a local export step before retrying.

## Safety

Do not send secrets, full raw prompts, hidden context, local absolute paths, or downloaded reference source notes into Discord by default.

If attribution is needed for a posted image, keep it short and human-readable.

## UI

Yculth should show posting controls beside a generated output preview.

The UI should show:

* whether Discord posting is enabled.
* whether preview is required.
* which channel or thread would receive the image.
* whether the post includes only the image or also a short note.
* whether the output has already been posted.
