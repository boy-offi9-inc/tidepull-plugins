# HLS fixtures

Static sample manifests for extractor tests. Keep them tiny (a few segments),
pointed at https://test-streams.mux.dev or local relative URLs that never
resolve — extractors must parse without fetching segments.

- vod-basic.m3u8       plain VOD media playlist (planned)
- vod-aes128.m3u8      AES-128 encrypted VOD (planned)
- master-variants.m3u8 master playlist with 3 variants (planned)
