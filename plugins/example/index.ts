import { definePlugin, TidepullError, type Info } from "@boy-offi9-inc/tidepull";

/** Meta properties whose content is a direct media URL. */
const MEDIA_META = new Set([
  "og:video",
  "og:video:url",
  "og:video:secure_url",
  "og:audio",
  "og:audio:secure_url",
]);

/** Example plugin: pull direct media URLs out of a page's metadata.
 *
 *  It understands three shapes, in order of trust:
 *   1. Open Graph `og:video*` / `og:audio*` meta tags
 *   2. schema.org JSON-LD `VideoObject` / `AudioObject` (contentUrl, embedUrl)
 *   3. a bare `<video src=...>` tag
 *
 *  `suitable()` only claims one hostname on purpose: a plugin that claims every
 *  URL would shadow the core's generic extractor. Point it at your site.
 */
export default definePlugin({
  name: "og-video",
  apiVersion: 1,
  extractors: [
    {
      name: "og-video",
      suitable: (url) => url.hostname === "video.example.com" || url.hostname.endsWith(".video.example.com"),
      async extract(url, ctx) {
        const { text } = await ctx.http.text(url.href);
        const formats: Info["formats"] = [];

        for (const tag of metaTags(text)) {
          const prop = (tag.property ?? tag.name ?? "").toLowerCase();
          if (!MEDIA_META.has(prop) || !tag.content) continue;
          addFormat(formats, tag.content, url, prop.startsWith("og:audio") ? "audio" : "video", prop);
        }

        for (const raw of jsonLdBlocks(text)) {
          for (const obj of flattenJsonLd(raw)) {
            const type = String(obj["@type"] ?? "").toLowerCase();
            if (!type.includes("videoobject") && !type.includes("audioobject")) continue;
            const kind = type.includes("audioobject") ? "audio" : "video";
            for (const key of ["contentUrl", "embedUrl"]) {
              const value = obj[key];
              if (typeof value === "string") addFormat(formats, value, url, kind, `ld-${key}`);
            }
          }
        }

        if (formats.length === 0) {
          const src = /<video[^>]+\bsrc=["']([^"']+)["']/i.exec(text)?.[1];
          if (src) addFormat(formats, src, url, "video", "video-src");
        }

        if (formats.length === 0) {
          throw new TidepullError("No og:video, JSON-LD VideoObject, or <video src> media URL found on the page");
        }

        const metas = metaTags(text);
        const metaContent = (prop: string) =>
          metas.find((t) => (t.property ?? "").toLowerCase() === prop)?.content;

        return {
          id: url.pathname.split("/").filter(Boolean).pop() ?? "video",
          title: metaContent("og:title") ?? /<title>([^<]*)<\/title>/i.exec(text)?.[1]?.trim() ?? "video",
          extractor: "og-video",
          webpage_url: url.href,
          thumbnail: metaContent("og:image"),
          formats,
        };
      },
    },
  ],
});

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

function addFormat(
  formats: Info["formats"],
  raw: string,
  base: URL,
  kind: "video" | "audio",
  note: string,
): void {
  const url = new URL(raw, base).href;
  if (formats.some((f) => f.url === url)) return;
  formats.push({
    format_id: kind === "video" ? kind : `${kind}-${guessExt(url, kind)}`,
    url,
    ext: guessExt(url, kind),
    protocol: "https",
    vcodec: kind === "video" ? "unknown" : "none",
    acodec: kind === "audio" ? "unknown" : "none",
    format_note: note,
  });
}

function guessExt(url: string, kind: "video" | "audio"): string {
  const m = /\.(mp4|m4v|webm|mkv|mov|m4a|mp3|ogg|opus|wav|aac|flac)(?:[?#]|$)/i.exec(url);
  return m ? m[1].toLowerCase() : kind === "audio" ? "m4a" : "mp4";
}
