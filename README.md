# tidepull-plugins

Official plugins and authoring helpers for [Tidepull](https://github.com/boy-offi9-inc/Tidepull) — the minimal, zero-dependency media downloader.

**Status: scaffolding. Private until the core plugin loader is stable.**

## Layout

```
plugins/
  _template/            Clone-and-go scaffold (apiVersion 1 contract)
  youtube/              @boy-offi9-inc/tidepull-plugin-youtube      (planned)
  soundcloud/           @boy-offi9-inc/tidepull-plugin-soundcloud   (planned)
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
