# Music Search Website

Static music search workbench for humans and bots.

## File Map

* `README.md` : This overview.
* `index.html` : Human-facing browser interface.
* `styles.css` : Website styling.
* `app.js` : Browser logic for known-song and vibe link generation.
* `music-sites.json` : Bot-readable music site registry and URL templates.

## Upload

Upload every file in this folder to the same web directory.

After upload, the bot can read:

```text
https://your-site.example/music-sites.json
```

Put that URL in an agent's `music_skill.website_config_url`.

## Notes

This is static-only. It has no secrets, no backend, and no private API keys.
