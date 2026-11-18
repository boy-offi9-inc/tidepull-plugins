# Tidepull plugin contract (apiVersion 1)

A Tidepull plugin is a module whose default export is created with
`definePlugin({...})` from `@boy-offi9-inc/tidepull`. It contributes
**extractors**: matchers + fetchers that turn a URL into an `Info` dict.

```ts
import { definePlugin } from "@boy-offi9-inc/tidepull";

export default definePlugin({
  name: "mysite",           // unique, lowercase, no spaces
  apiVersion: 1,            // must equal PLUGIN_API_VERSION in the core
  extractors: [
    {
      name: "mysite",
      suitable: (url) => url.hostname === "mysite.com",
      async extract(url, ctx) { /* ... */ },
    },
  ],
});
```

## Rules

1. **`apiVersion` must match.** The loader rejects plugins targeting a
   different version with a clear error naming the plugin and the versions.
   Breaking contract changes bump the major version of the core, never
   silently.
2. **`suitable(url)` is cheap and synchronous.** No network, no regex
   backtracking on unbounded input. Match on hostname or fixed path shapes.
   The core runs it for every registered extractor on every URL — keep it
   microseconds.
3. **`extract(url, ctx)` returns an `Info`** with at least one `Format`, or a
   playlist object (`{ kind: "playlist", entries: [...] }`). Throw
   `TidepullError` for user-facing failures — anything else becomes a stack
   trace.
4. **Use `ctx.http`, never global `fetch`.** It applies the core's redirect
   rules, header scoping, and cancellation. `ctx.log` and `ctx.emit` are for
   progress and diagnostics.
5. **Format fields are the selection vocabulary.** Set `vcodec`/`acodec`
   (`"none"` when absent, `"unknown"` when present but unidentified),
   `protocol` (`"https" | "hls" | "dash"`), and `tbr`/`abr` in kbit/s. Wrong
   metadata breaks `select()` for users — when unsure, use `"unknown"`.
6. **Dependencies are allowed.** This is why plugins exist. Declare them in
   your plugin's `package.json`. The core's zero-dependency guarantee is
   unaffected.
7. **No environment leakage.** Don't read env vars beyond what you document;
   don't write outside a user-configured output path; don't phone home.

## Loading

Plugins load from (in order, first match wins per URL):

1. `--plugin <file-or-dir>` CLI flags
2. `TIDEPULL_PLUGIN_DIR` env (default `~/.config/tidepull/plugins/`)
3. Built-in extractors, then the generic extractor last

Each directory entry may be a single `.mjs`/`.ts` file or a folder with an
`index.*`. See the core `src/loader.ts` for the exact resolution rules.

## Becoming "official"

A community plugin is promoted into this monorepo (and gets the scoped
`@boy-offi9-inc/tidepull-plugin-<name>` name) when it:

- passes CI here (typecheck, tests against fixtures, pack)
- follows the format-metadata rules (rule 5)
- has a maintainer willing to own it

Open an issue in the core repo to nominate one.

## Versioning

- Contract changes: `PLUGIN_API_VERSION` in the core bumps (1 → 2 …).
- Plugins declare the version they target; loaders accept exactly one
  version. Keep plugins buildable against old cores where possible.
