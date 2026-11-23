import { definePlugin, TidepullError, type Info } from "@boy-offi9-inc/tidepull";

/** Extracts the stream URL from a public SoundCloud track page.
 *
 *  Scope (v0.2.0, honest): public tracks only. The page's script data embeds
 *  `/media/...` endpoints that answer with the real stream location once the
 *  site's public frontend `client_id` is appended — the same id SoundCloud's
 *  own web player uses, scraped from the served JS assets. No OAuth, no
 *  private-content bypass; everything stays on public pages.
 */
export default definePlugin({
  name: "soundcloud",
  apiVersion: 1,
  extractors: [
    {
      name: "soundcloud",
      suitable: (url) => suitable(url),
      async extract(url, ctx) {
        const page = await ctx.http.text(url.href, { headers: { "user-agent": "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36", "accept-language": "en" } });
        const html = page.text;
        const metas = metaTags(html);
        const metaContent = (prop: string) =>
          metas.find((t) => (t.property ?? "").toLowerCase() === prop)?.content;

        const formats: Info["formats"] = [];

        for (const prop of ["og:audio", "og:audio:secure_url"]) {
          const content = metaContent(prop);
          if (content) addFormat(formats, content, url, "og-audio");
        }

        for (const raw of jsonLdBlocks(html)) {
          for (const obj of flattenJsonLd(raw)) {
            if (!String(obj["@type"] ?? "").toLowerCase().includes("audioobject")) continue;
            for (const key of ["contentUrl", "embedUrl"]) {
              const value = obj[key];
              if (typeof value === "string" && isStreamUrl(value)) addFormat(formats, value, url, "jsonld", bitrateFrom(value));
            }
          }
        }

        for (const m of html.matchAll(/"url":"(https:\/\/[^"]*\/(?:progressive|stream|media\/)[^"]*)"/g)) {
          // JSON string unescape handles \/ and \u0026 (&) in the app-config URLs
          addFormat(formats, JSON.parse(`"${m[1]}"`) as string, url, "script-data", bitrateFrom(m[1]));
        }

        // Media endpoints (/media/.../stream/hls) answer 401 without the frontend's
        // client_id. The new (Next.js) web app embeds it INLINE in the page HTML
        // (client_id=<32hex> in the app config); older layouts carried it in the
        // served JS assets — try inline first, then assets.
        const mediaEndpoints = formats.filter((f) => /\/media\/.+\/(?:stream|progressive)/.test(f.url));
        if (mediaEndpoints.length > 0) {
          const inlineId = /client_id[=":\s]+([0-9a-zA-Z]{32})/.exec(html)?.[1];
          const clientId = inlineId ?? (await findClientId(html, ctx));
          if (!clientId) {
            throw new TidepullError(
              "Found /media/ stream endpoints but no client_id to authorize them — " +
              "SoundCloud's page layout may have changed. Report it at " +
              "https://github.com/boy-offi9-inc/tidepull-plugins/issues",
            );
          }
          if (clientId) {
            const resolved: Info["formats"] = [];
            for (const f of mediaEndpoints) {
              try {
                const auth = new URL(f.url);
                auth.searchParams.set("client_id", clientId);
                const res = await ctx.http.text(auth.href, { headers: { "user-agent": "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36" } });
                const body = JSON.parse(res.text) as { url?: string };
                if (typeof body.url !== "string") continue;
                const isPlaylist = /\.m3u8(?:[?#]|$)/.test(body.url);
                resolved.push({
                  format_id: `${f.format_id}-resolved`,
                  url: body.url,
                  ext: isPlaylist ? "mp4" : guessExt(body.url),
                  protocol: isPlaylist ? "hls" : "https",
                  vcodec: "none",
                  acodec: isPlaylist ? "unknown" : guessExt(body.url) === "mp3" ? "mp3" : "unknown",
                  format_note: `${f.format_note} (${isPlaylist ? "hls" : "progressive"})`,
                  ...(bitrateFrom(f.url) ? { abr: bitrateFrom(f.url) } : {}),
                });
              } catch {
                // endpoint failed (rotated id, regional block) — keep other candidates
              }
            }
            // resolved progressive/HLS beats raw auth-required endpoints
            if (resolved.length > 0) return finish(url, page.finalUrl || url.href, metaContent, html, resolved);
          }
        }

        if (formats.length === 0) {
          throw new TidepullError(
            "No stream URL found on the SoundCloud page. Public tracks are usually embedded in the HTML; " +
            "if this track still fails, the page likely needs JS rendering — report it at " +
            "https://github.com/boy-offi9-inc/tidepull-plugins/issues",
          );
        }

        return finish(url, page.finalUrl || url.href, metaContent, html, [best(formats)]);
      },
    },
  ],
});

function suitable(url: URL): boolean {
  if (url.hostname === "on.soundcloud.com") return true;
  if (url.hostname !== "soundcloud.com" && url.hostname !== "www.soundcloud.com") return false;
  const segs = url.pathname.split("/").filter(Boolean);
  if (segs.length < 2) return false;
  return !["discover", "charts", "upload", "pages", "you", "settings", "search", "terms-of-use"].includes(segs[0].toLowerCase());
}

function isStreamUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && /\.(mp3|m4a)(?:[?#]|$)|\/progressive|\/stream/.test(u.pathname + u.search);
  } catch {
    return false;
  }
}

function addFormat(formats: Info["formats"], raw: string, base: URL, note: string, abr?: number): void {
  const href = new URL(raw, base).href;
  if (formats.some((f) => f.url === href)) return;
  formats.push({
    format_id: `sc-${note}`,
    url: href,
    ext: guessExt(href),
    protocol: "https",
    vcodec: "none",
    acodec: guessExt(href) === "mp3" ? "mp3" : "unknown",
    format_note: note,
    ...(abr ? { abr } : {}),
  });
}

/** Bitrate encoded in a media URL (`.128.mp3`) or SoundCloud preset (`mp3_2_0` = 128 kbps). */
function bitrateFrom(raw: string): number | undefined {
  const plain = /\.(\d{2,3})\.(?:mp3|m4a)(?:[?#]|$)/i.exec(raw);
  if (plain) return Number(plain[1]);
  const preset = /mp3_([1-2])_0/.exec(raw);
  return preset ? (preset[1] === "2" ? 128 : 64) : undefined;
}

function best(formats: Info["formats"]): Info["formats"][number] {
  return formats.reduce((a, b) => (abrOf(b) > abrOf(a) ? b : a));
}

function abrOf(f: Info["formats"][number]): number {
  return typeof f.abr === "number" ? f.abr : 0;
}

function guessExt(url: string): string {
  const m = /\.(mp3|m4a|aac|ogg|opus)(?:[?#]|$)/i.exec(url);
  return m ? m[1].toLowerCase() : "mp3";
}

/** SoundCloud's web player ships its public client_id in one of the page's JS assets.
 *  Scrape the id out of the served scripts (same pattern yt-dlp uses; no OAuth involved). */
async function findClientId(trackHtml: string, ctx: { http: { text: (url: string, init?: { headers?: Record<string, string> }) => Promise<{ text: string }> } }): Promise<string | undefined> {
  const scriptSrcs = [...trackHtml.matchAll(/<script[^>]+src="(https:\/\/a-v2\.sndcdn\.com\/assets\/[^"]+\.js)"/g)].map((m) => m[1]).reverse();
  for (const src of scriptSrcs.slice(0, 15)) {
    try {
      const res = await ctx.http.text(src, { headers: { "user-agent": "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36" } });
      const m = /client_id\s*:\s*"([0-9a-zA-Z]{32})"/.exec(res.text);
      if (m) return m[1];
    } catch {
      // asset fetch failed — try the next one
    }
  }
  return undefined;
}

function finish(url: URL, finalUrl: string, metaContent: (prop: string) => string | undefined, html: string, formats: Info["formats"]): Info {
  return {
    id: url.pathname.split("/").filter(Boolean).pop() ?? "track",
    title: metaContent("og:title") ?? /<title>([^<]*)<\/title>/i.exec(html)?.[1]?.trim() ?? "track",
    extractor: "soundcloud",
    webpage_url: finalUrl,
    thumbnail: metaContent("og:image"),
    formats,
  };
}

interface MetaTag {
  property?: string;
  name?: string;
  content?: string;
}

function metaTags(html: string): MetaTag[] {
  const tags: MetaTag[] = [];
  for (const m of html.matchAll(/<meta\b([^>]*)>/gi)) {
    const attrs = m[1];
    const pick = (name: string): string | undefined => {
      const re = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i");
      const hit = re.exec(attrs);
      return hit ? (hit[1] ?? hit[2]) : undefined;
    };
    tags.push({ property: pick("property"), name: pick("name"), content: pick("content") });
  }
  return tags;
}

function jsonLdBlocks(html: string): unknown[] {
  const out: unknown[] = [];
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      out.push(JSON.parse(m[1]));
    } catch {
      // malformed JSON-LD on the page: skip it, keep the rest
    }
  }
  return out;
}

function flattenJsonLd(json: unknown): Record<string, unknown>[] {
  if (Array.isArray(json)) return json.flatMap(flattenJsonLd);
  if (!json || typeof json !== "object") return [];
  const obj = json as Record<string, unknown>;
  if (Array.isArray(obj["@graph"])) return (obj["@graph"] as unknown[]).flatMap(flattenJsonLd);
  return [obj];
}
