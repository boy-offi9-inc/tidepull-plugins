# @boy-offi9-inc/tidepull-plugin-soundcloud

SoundCloud extractor for [Tidepull](https://github.com/boy-offi9-inc/Tidepull).

Extracts a single progressive stream URL from a **public** track page
(`soundcloud.com/<artist>/<track>` and `on.soundcloud.com` short links).
The URL is read from what the served HTML already contains, in order of
trust: `og:audio` metas, JSON-LD `AudioObject` (`contentUrl`), then
`progressive`/`stream` URLs in the page's script data.

## Limitations (read this first)

- **Public tracks only.** Private, members-only and go+ content is never
  touched and cannot be reached this way.
- **No OAuth flow.** SoundCloud's `/media/` endpoints need the site's rotating
  `client_id`; this plugin scrapes the public frontend id from the served JS
  assets (the same id the SoundCloud web player itself uses, and the technique
  yt-dlp uses) — no hardcoded IDs, no OAuth, no private-content bypass
  (they break) and no scraping of other clients' IDs. If a track page
  serves its stream only via the JS app, extraction throws a `TidepullError`
  pointing at [tidepull-plugins#issues](https://github.com/boy-offi9-inc/tidepull-plugins/issues).
- Format metadata is honest: `vcodec: "none"`, `acodec` is `mp3`/`unknown`.

## Test

```bash
npm install
npm run typecheck && npm test
```

Tests run fully offline against a fixture track page; no network access.
