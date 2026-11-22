# tidepull-plugins

Official plugins and authoring helpers for [Tidepull](https://github.com/boy-offi9-inc/Tidepull) — the minimal, zero-dependency media downloader.

[![CI](https://github.com/boy-offi9-inc/tidepull-plugins/actions/workflows/ci.yml/badge.svg)](https://github.com/boy-offi9-inc/tidepull-plugins/actions/workflows/ci.yml)
[![plugin API: v1](https://img.shields.io/badge/plugin%20API-v1-blue)](docs/PLUGINS.md)
[![core: @boy-offi9-inc/tidepull](https://img.shields.io/badge/core-%40boy--offi9--inc%2Ftidepull-00b4d8)](https://github.com/boy-offi9-inc/Tidepull)
[![plugins: 2](https://img.shields.io/badge/plugins-2-90e0ef)](#plugins)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

## Plugins

Two plugins live here today, both tested offline against fixtures:

| Plugin | Extracts | Install today |
|---|---|---|
| [example](plugins/example) | Direct media URLs from `og:video` / `og:audio` metas, JSON-LD `VideoObject`/`AudioObject`, bare `<video src>` | copy `plugins/example/index.ts` into `~/.config/tidepull/plugins/`, or pass `--plugin plugins/example/index.ts` |
| [soundcloud](plugins/soundcloud) | Progressive streams from **public** SoundCloud track pages (`og:audio`, JSON-LD `AudioObject`, script data). No client_id/OAuth — private tracks and catalog search are out of scope | copy `plugins/soundcloud/index.ts` into `~/.config/tidepull/plugins/`, or pass `--plugin plugins/soundcloud/index.ts` |
| [youtube](plugins/youtube) | Progressive + adaptive streams from **public** YouTube video pages (`ytInitialPlayerResponse`) with n-challenge + s-signature deciphering (yt-dlp ejs solver, bundled standalone). Honest scope: no bot-wall or age-gate bypass; live/DVR content not supported | install `@boy-offi9-inc/tidepull-plugin-youtube` from npm and copy `dist-youtube.ts` into `~/.config/tidepull/plugins/`, or pass `--plugin` |

All three are on npm under `@boy-offi9-inc/tidepull-plugin-*`. Plugins load from
disk (see below). Automatic discovery of npm-installed plugins
(`node_modules/tidepull-plugin-*`) is a planned core-loader addition, not
shipped yet.

## Loading a plugin

Tidepull auto-loads every plugin file from `~/.config/tidepull/plugins/`
(or `TIDEPULL_PLUGIN_DIR`), or load one explicitly:

```bash
tidepull --plugin ./plugins/soundcloud/index.ts -F <url>
```

Or programmatically:

```ts
import { createTidepull } from "@boy-offi9-inc/tidepull";
import example from "./plugins/example/index.ts";
const g = createTidepull({ plugins: [example] });
```

Plugins run before built-ins; the generic fallback is always last. The core
refuses a plugin with a mismatched `apiVersion` with a clear error.

## Layout

```
plugins/
  example/              @boy-offi9-inc/tidepull-plugin-example 0.1.0
  soundcloud/           @boy-offi9-inc/tidepull-plugin-soundcloud 0.1.0
  youtube/              @boy-offi9-inc/tidepull-plugin-youtube 0.3.0
helpers/                @boy-offi9-inc/tidepull-helpers
  src/                  Media-format parsing utilities for plugin authors
                        (parseM3u8 shipped; DASH MPD walking planned).
                        Plugins may depend on this; the core never.
fixtures/
  hls/                  Sample m3u8 manifests (docs first; manifests to be added)
  dash/                 Sample MPD manifests (docs first; manifests to be added)
docs/
  PLUGINS.md            The plugin contract, authoring guide, promotion policy
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
site is hard — hard sites become plugins. Media-format parsing helpers belong
in `helpers/` here; transport/resilience belongs in
[reqkit](https://github.com/boy-offi9-inc/reqkit).

## Authoring

There is no separate scaffold — `plugins/example/` is the living template.
Copy it, rename the plugin, and follow the contract in
[`docs/PLUGINS.md`](docs/PLUGINS.md):

```bash
cp -r plugins/example plugins/mysite
cd plugins/mysite
npm install
npm test
```

Every plugin declares `apiVersion: 1` and exports `definePlugin({...})` with
extractors following the contract in `docs/PLUGINS.md`.

## License

MIT — same as Tidepull.
