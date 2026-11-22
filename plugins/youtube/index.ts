import { definePlugin, TidepullError, type Info } from "@boy-offi9-inc/tidepull";
import { solveNChallenges, encipheredN, applyN } from "./nsig.ts";

/** Extracts stream URLs from public YouTube video pages.
 *
 *  Scope (v0.1.0, honest): public videos and shorts, what the served HTML
 *  embeds — `ytInitialPlayerResponse` JSON and adaptive manifest URLs. No
 *  signature decipher: formats whose URL carries an enciphered `n` parameter
 *  are skipped rather than downloaded broken. No OAuth, no PO tokens, no
 *  botguard — when YouTube serves a consent/bot wall the plugin fails with a
 *  clear error instead of pretending (see README).
 */
export default definePlugin({
  name: "youtube",
  apiVersion: 1,
  extractors: [
    {
      name: "youtube",
      suitable: (url) => suitable(url),
      async extract(url, ctx) {
        const canonical = canonicalUrl(url);
        const page = await ctx.http.text(canonical.href);
        const html = page.text;

        const player = playerResponse(html);
        if (!player) {
          throw new TidepullError(
            "No player response embedded in the YouTube page. This usually means a consent wall, " +
            "an age gate, or YouTube serving a bot check to this IP. The plugin does not bypass those — " +
            "report persistent failures at https://github.com/boy-offi9-inc/tidepull-plugins/issues",
          );
        }
        if (player.playabilityStatus?.status === "LOGIN_REQUIRED") {
          throw new TidepullError(
            `YouTube is gating this video behind a login/bot check (reason: ${player.playabilityStatus?.reason ?? "LOGIN_REQUIRED"}). ` +
            "The plugin does not bypass bot walls, PO tokens or OAuth — see the README. " +
            "Report persistent failures at https://github.com/boy-offi9-inc/tidepull-plugins/issues",
          );
        }

        const videoId = String(player.videoDetails?.videoId ?? canonical.searchParams.get("v") ?? canonical.pathname);
        const title = String(player.videoDetails?.title ?? /<title>([^<]*)<\/title>/i.exec(html)?.[1]?.replace(/ - YouTube$/, "").trim() ?? "video");
        const thumb = bestThumbnail(player);

        const formats: Info["formats"] = [];

        // Collect raw candidate formats first; decipher the n challenge in bulk.
        const raw: Array<{ f: any; n?: string }> = [];
        for (const f of [...(player.formats ?? []), ...(player.adaptiveFormats ?? [])]) {
          if (typeof f.url !== "string") continue; // signatureCipher-only: s-decipher, still out of scope
          raw.push({ f, n: encipheredN(f.url) });
        }

        const playerUrl = findPlayerUrl(html);
        if (raw.some((r) => r.n) && playerUrl) {
          try {
            const solved = await solveNChallenges(raw.filter((r) => r.n).map((r) => r.n!), playerUrl, ctx.signal);
            for (const r of raw) {
              if (r.n && solved.has(r.n)) {
                r.f = { ...r.f, url: applyN(r.f.url, solved.get(r.n)!) };
                r.n = undefined;
              }
            }
            ctx.log.debug(`n-challenge: solved ${solved.size} challenge(s) via player JS`);
          } catch (e) {
            ctx.log.debug(`n-challenge solving failed: ${e instanceof Error ? e.message : String(e)}`);
          }
        }

        for (const { f, n } of raw) {
          if (n) continue; // still enciphered after solving attempt: skip, don't serve dead URLs
          addFormat(formats, f);
        }

        // DASH/HLS manifests, when the player hands them over unenciphered.
        for (const key of ["dashManifestUrl", "hlsManifestUrl"] as const) {
          const manifest = player.streamingData?.[key];
          if (typeof manifest === "string") {
            formats.push({
              format_id: key === "dashManifestUrl" ? "yt-dash-manifest" : "yt-hls-manifest",
              url: manifest,
              ext: key === "dashManifestUrl" ? "mpd" : "m3u8",
              protocol: key === "dashManifestUrl" ? "dash" : "hls",
              vcodec: "unknown",
              acodec: "unknown",
              format_note: key === "dashManifestUrl" ? "manifest-dash" : "manifest-hls",
            });
          }
        }

        if (formats.length === 0) {
          throw new TidepullError(
            "No downloadable stream found: every format YouTube served needs signature deciphering (or the video " +
            "has none). Tidepull's youtube plugin does not implement deciphering by design — see the README for why.",
          );
        }

        return {
          id: videoId,
          title,
          extractor: "youtube",
          webpage_url: page.finalUrl || canonical.href,
          thumbnail: thumb,
          formats: sortByQuality(formats),
        };
      },
    },
  ],
});

function suitable(url: URL): boolean {
  const h = url.hostname.toLowerCase();
  if (h === "youtu.be") return url.pathname.length > 1;
  if (h !== "youtube.com" && h !== "www.youtube.com" && h !== "m.youtube.com" && h !== "music.youtube.com") return false;
  const segs = url.pathname.split("/").filter(Boolean);
  if (segs[0] === "watch") return url.searchParams.has("v");
  if (segs[0] === "shorts" || segs[0] === "live" || segs[0] === "embed") return Boolean(segs[1]);
  return false;
}

/** Normalize the URL shapes YouTube accepts into a watch page on www. */
function canonicalUrl(url: URL): URL {
  const out = new URL("https://www.youtube.com/watch");
  if (url.hostname === "youtu.be") {
    out.searchParams.set("v", url.pathname.split("/").filter(Boolean)[0] ?? "");
    return out;
  }
  const segs = url.pathname.split("/").filter(Boolean);
  if (segs[0] === "shorts" || segs[0] === "live" || segs[0] === "embed") {
    out.searchParams.set("v", segs[1] ?? "");
    return out;
  }
  const v = url.searchParams.get("v");
  if (v && (url.hostname.toLowerCase() !== "www.youtube.com" || segs[0] === "watch")) {
    out.searchParams.set("v", v);
    return out;
  }
  return url;
}

/** Locate the player JS URL: "js":"/s/player/<id>/..." in the page (ytcfg or player response). */
function findPlayerUrl(html: string): string | undefined {
  const m = /"js":"(\/s\/player\/[^"]+\.js)"/.exec(html) ?? /"PLAYER_JS_URL":"(\/s\/player\/[^"]+\.js)"/.exec(html);
  return m?.[1];
}

/** Parse `ytInitialPlayerResponse = {...};` out of the served HTML. */
function playerResponse(html: string): any | undefined {
  const m = /ytInitialPlayerResponse\s*=\s*(\{.+?\})\s*;\s*(?:var|const|let|<\/script>|if)/s.exec(html);
  if (!m) return undefined;
  try {
    return JSON.parse(balancedJson(html, m.index + m[0].indexOf("{")));
  } catch {
    return undefined;
  }
}

/** Walk from a `{` to its matching `}` respecting strings and escapes. */
function balancedJson(html: string, start: number): string {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < html.length; i++) {
    const c = html[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return html.slice(start, i + 1);
    }
  }
  throw new Error("unbalanced player response JSON");
}

/** YouTube's `n` challenge: ciphered when the parameter is long and random-looking
 *  (short `n` values like `shortQ` are a handful of chars; challenges are 16+). */
function isEncipheredN(u: string): boolean {
  const n = new URL(u).searchParams.get("n") ?? "";
  return n.length > 12;
}

function addFormat(formats: Info["formats"], f: any): void {
  const url = String(f.url);
  if (formats.some((x) => x.url === url)) return;
  const mime = String(f.mimeType ?? "");
  const container = /container=(\w+)/.exec(mime)?.[1]?.toLowerCase() ?? extFromUrl(url) ?? "mp4";
  const codecs = /codecs="([^"]+)"/.exec(mime)?.[1] ?? String(f.codecs ?? "");
  const hasVideo = f.width !== undefined || /video\//.test(mime);
  const hasAudio = f.audioQuality !== undefined || /audio\//.test(mime);
  const itag = f.itag !== undefined ? String(f.itag) : "x";
  formats.push({
    format_id: `yt-${itag}-${f.height ?? (hasVideo ? "v" : "a")}`,
    url,
    ext: container,
    protocol: "https",
    ...(f.width ? { width: Number(f.width) } : {}),
    ...(f.height ? { height: Number(f.height) } : {}),
    ...(f.fps ? { fps: Number(f.fps) } : {}),
    vcodec: hasVideo ? (/av|vp9|vp8|h264/.test(codecs) ? codecs.split(",")[0].trim() : "unknown") : "none",
    acodec: /mp4a/.test(codecs) ? "mp4a" : /opus/.test(codecs) ? "opus" : hasAudio ? "unknown" : hasVideo ? "none" : "unknown",
    ...(f.bitrate ? { tbr: Math.round(Number(f.bitrate) / 1000) } : {}),
    ...(f.averageBitrate ? { tbr: Math.round(Number(f.averageBitrate) / 1000) } : {}),
    ...(f.audioSampleRate ? { abr: Math.round(Number(f.audioSampleRate) / 1000) } : {}),
    format_note: String(f.qualityLabel ?? f.audioQuality ?? "unknown"),
  });
}

function sortByQuality(formats: Info["formats"]): Info["formats"] {
  return [...formats].sort((a, b) => (b.height ?? b.tbr ?? 0) - (a.height ?? a.tbr ?? 0));
}

function extFromUrl(url: string): string | undefined {
  const m = /\.(mp4|webm|m4a|mp3|m3u8|mpd)(?:[?#]|$)/i.exec(url);
  return m?.[1].toLowerCase();
}

function bestThumbnail(player: any): string | undefined {
  const t = player.videoDetails?.thumbnail?.thumbnails;
  if (!Array.isArray(t) || t.length === 0) return undefined;
  return t.reduce((a: any, b: any) => ((b.width ?? 0) > (a.width ?? 0) ? b : a)).url as string;
}
