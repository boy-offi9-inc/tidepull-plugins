# tidepull-plugins

Official plugins and authoring helpers for [Tidepull](https://github.com/boy-offi9-inc/Tidepull) — the minimal, zero-dependency media downloader.

[![CI](https://github.com/boy-offi9-inc/tidepull-plugins/actions/workflows/ci.yml/badge.svg)](https://github.com/boy-offi9-inc/tidepull-plugins/actions/workflows/ci.yml)
[![plugin API: v1](https://img.shields.io/badge/plugin%20API-v1-blue)](docs/PLUGINS.md)
[![core: @boy-offi9-inc/tidepull](https://img.shields.io/badge/core-%40boy--offi9--inc%2Ftidepull-00b4d8)](https://github.com/boy-offi9-inc/Tidepull)
[![plugins: 2](https://img.shields.io/badge/plugins-2-90e0ef)](#plugins)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

## Plugins

| Plugin | Package | Extracts |
|---|---|---|
| [example](plugins/example) | [@boy-offi9-inc/tidepull-plugin-example](https://www.npmjs.com/package/@boy-offi9-inc/tidepull-plugin-example) | Direct media URLs from `og:video` / `og:audio` metas, JSON-LD `VideoObject`/`AudioObject`, bare `<video src>` |
| [soundcloud](plugins/soundcloud) | [@boy-offi9-inc/tidepull-plugin-soundcloud](https://www.npmjs.com/package/@boy-offi9-inc/tidepull-plugin-soundcloud) | Progressive streams from public SoundCloud track pages (`og:audio`, JSON-LD `AudioObject`, script data) |

## Layout

```
plugins/
  _template/            Clone-and-go scaffold (apiVersion 1 contract)
  example/              @boy-offi9-inc/tidepull-plugin-example
  soundcloud/           @boy-offi9-inc/tidepull-plugin-soundcloud
  youtube/              @boy-offi9-inc/tidepull-plugin-youtube      (planned)
  subtitles/            @boy-offi9-inc/tidepull-plugin-subtitles    (planned)
helpers/                @boy-offi9-inc/tidepull-helpers
  src/                  Media-format parsing utilities for plugin authors
                        (HLS manifest walking, DASH MPD parsing, signature
                        solvers). Plugins may depend on this; the core never.
fixtures/
  hls/                  Sample m3u8 manifests (VOD, AES-128, live)
  dash/                 Sample MPD manifests (static, segment-template)
docs/
  PLUGINS.md            The plugin contract, authoring guide, review policy
.github/workflows/      One CI lane: typecheck + test + pack every plugin
```

## Naming convention

- Official plugins: `@boy-offi9-inc/tidepull-plugin-<name>` (scoped = maintained here)
- Community plugins: `tidepull-plugin-<name>` (unscoped, own repo)
- Authoring helpers: `@boy-offi9-inc/tidepull-helpers`

The core validates `apiVersion` at load and rejects mismatches with a clear
error — see `PLUGIN_API_VERSION` in the core repo.

## The rule that keeps the core thin

Plugins may depend on anything. The core never grows a dependency because a
site is hard — hard sites become plugins. Helpers live here too: media-format
parsing belongs in `helpers/`, transport/resilience belongs in
[reqkit](https://github.com/boy-offi9-inc/reqkit).

## Authoring

Start from `plugins/_template/`:

```bash
cp -r plugins/_template plugins/mysite
cd plugins/mysite
npm install
npm test
```

Every plugin declares `apiVersion: 1` and exports `definePlugin({...})` with
extractors following the contract in `docs/PLUGINS.md`.

## License

MIT — same as Tidepull.
