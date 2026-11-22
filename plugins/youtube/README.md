# @boy-offi9-inc/tidepull-plugin-youtube

YouTube extractor for [Tidepull](https://github.com/boy-offi9-inc/Tidepull).

Extracts stream URLs from a **public** video page
(`youtube.com/watch?v=…`, `youtu.be/…`, `/shorts/…`, `/live/…`, `/embed/…`,
and `m.` / `music.` host variants, all normalized to a watch page).
Everything is read from the `ytInitialPlayerResponse` JSON the served HTML
already contains: `videoDetails` for metadata, `streamingData` for
`formats`, `adaptiveFormats`, and any DASH/HLS manifest URLs.

## Limitations (read this first)

- **Public videos only.** Private, unlisted, members-only and
  purchase-required content is never touched and cannot be reached this way.
- **No signature deciphering.** Some pages (bot-gated, age-restricted, and
  increasingly the default for logged-out requests) serve formats whose URLs
  need YouTube's `n`-parameter challenge solved in JS. This plugin
  deliberately does not implement that: such pages fail with a clear
  `TidepullError` explaining why, instead of silently producing dead URLs.
- **No live/DVR or post-live content.** `liveBroadcastContent != "none"`
  throws with a clear error.
- **No age-gate bypass.** Age-restricted videos are refused, not worked
  around.
- Manifest formats (DASH `.mpd` / HLS `.m3u8`) are surfaced with
  `protocol: "dash"/"hls"` when the page provides them unenciphered —
  Tidepull's DASH MPD walking is planned in `helpers/`, not done yet.
- Adaptive formats are video-only or audio-only (`vcodec: "none"` /
  `acodec: "none"` respectively); muxing is Tidepull's job, not this
  plugin's.

## Test

```bash
npm install
npm run typecheck && npm test
```

Tests run fully offline against a fixture player response; no network access.
