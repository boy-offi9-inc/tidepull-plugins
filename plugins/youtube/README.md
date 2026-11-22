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
- **n-challenge and s-signature deciphering are implemented** (v0.2.0 for `n`,
  v0.3.0 for `s`): when formats carry an enciphered `n` parameter or a
  `signatureCipher` (`s`/`sp`/`url`), the plugin fetches YouTube's player JS
  and solves both challenges locally via yt-dlp's official ejs solver core
  (`yt.solver.core.js`, Unlicense) bundled with meriyah + astring — no
  external runtime, no network round-trips beyond the player JS itself. If
  solving fails (player rotation, missing player URL), enciphered formats are
  skipped and the error says so — dead URLs are never served.
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

## Standalone bundle

For drop-in use without node_modules, a single-file build is generated:

```bash
node scripts/build-standalone.mjs   # writes dist-youtube.ts (~180 KB)
```

`dist-youtube.ts` inlines meriyah (ISC), astring (MIT) and the yt-dlp ejs
solver core (Unlicense) as strings — copy it into `~/.config/tidepull/plugins/`
as `youtube.ts` and it works with zero extra dependencies. Regenerate it after
updating any of the three vendored pieces.

## Test

```bash
npm install
npm run typecheck && npm test
```

Tests run fully offline against fixture player responses and a synthetic
player JS; no network access.
