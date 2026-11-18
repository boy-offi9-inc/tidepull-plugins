export interface M3u8Segment {
  uri: string;
  duration: number;
  title?: string;
  discontinuity: boolean;
  byteRange?: { length: number; offset?: number };
  key?: { method: string; uri?: string; iv?: string };
}

export interface M3u8Playlist {
  targetDuration: number;
  version?: number;
  endlist: boolean;
  segments: M3u8Segment[];
}

/** Parse a media playlist (#EXTM3U). Master playlists are out of scope here. */
export function parseM3u8(text: string): M3u8Playlist {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  if (!lines.includes("#EXTM3U")) throw new Error("not an m3u8 playlist");
  const pl: M3u8Playlist = { targetDuration: 0, endlist: false, segments: [] };
  let dur = 0;
  let title: string | undefined;
  let disc = false;
  let br: M3u8Segment["byteRange"];
  let key: M3u8Segment["key"];
  for (const line of lines) {
    if (!line || line.startsWith("#EXTM3U")) continue;
    if (line.startsWith("#EXT-X-VERSION:")) pl.version = Number(line.slice(15));
    else if (line.startsWith("#EXT-X-TARGETDURATION:")) pl.targetDuration = Number(line.slice(22));
    else if (line.startsWith("#EXT-X-ENDLIST")) pl.endlist = true;
    else if (line.startsWith("#EXT-X-DISCONTINUITY")) disc = true;
    else if (line.startsWith("#EXT-X-BYTERANGE:")) {
      const [len, off] = line.slice(17).split("@");
      br = { length: Number(len), offset: off !== undefined ? Number(off) : undefined };
    } else if (line.startsWith("#EXT-X-KEY:")) {
      const attrs = Object.fromEntries(
        line.slice(11).split(",").map((kv) => [kv.slice(0, kv.indexOf("=")), kv.slice(kv.indexOf("=") + 1).replace(/^"|"$/g, "")]),
      );
      key = { method: attrs.METHOD ?? "NONE", uri: attrs.URI, iv: attrs.IV };
    } else if (line.startsWith("#EXTINF:")) {
      const v = line.slice(8);
      const i = v.indexOf(",");
      dur = Number(i === -1 ? v : v.slice(0, i));
      if (i !== -1 && v.slice(i + 1)) title = v.slice(i + 1);
    } else if (!line.startsWith("#")) {
      pl.segments.push({ uri: line, duration: dur, title, discontinuity: disc, byteRange: br, key });
      dur = 0;
      title = undefined;
      disc = false;
      br = undefined;
      key = undefined;
    }
  }
  return pl;
}
