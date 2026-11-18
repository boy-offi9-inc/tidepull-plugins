import { definePlugin, TidepullError } from "@boy-offi9-inc/tidepull";

export default definePlugin({
  name: "mysite",
  apiVersion: 1,
  extractors: [
    {
      name: "mysite",
      suitable: (url) => url.hostname === "mysite.com" && url.pathname.startsWith("/watch/"),
      async extract(url, ctx) {
        const { text } = await ctx.http.text(url.href);
        const src = /"videoUrl":"([^"]+)"/.exec(text)?.[1];
        if (!src) throw new TidepullError("Could not find the video URL on the page");
        return {
          id: url.pathname.split("/").pop() ?? "video",
          title: /<title>([^<]*)<\/title>/.exec(text)?.[1] ?? "video",
          extractor: "mysite",
          webpage_url: url.href,
          formats: [
            {
              format_id: "http",
              url: new URL(src, url).href,
              ext: "mp4",
              protocol: "https",
              vcodec: "unknown",
              acodec: "unknown",
            },
          ],
        };
      },
    },
  ],
});
