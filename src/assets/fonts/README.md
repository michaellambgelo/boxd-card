# Inter

[Inter](https://rsms.me/inter/) by Rasmus Andersson, licensed under the
[SIL Open Font License 1.1](./Inter-LICENSE.txt). Version 4.1.

Letterboxd's own site sets **Graphik** (Commercial Type) as its primary UI face,
with Tiempos and Pitch Sans alongside it. All are commercial retail typefaces and
none may be redistributed, so this is the nearest open-licence substitute — not
Letterboxd's font.

Two formats, same outlines, because the two rasterizers disagree about containers:

| Path | Format | Used by |
|---|---|---|
| `src/assets/fonts/*.woff2` | woff2 | The browser — extension popup and web app. Bundled by Vite. |
| `test/fixtures/fonts/*.ttf` | ttf | node-canvas `registerFont()` in the visual test suite. It cannot read woff2. |

The TTFs live under `test/` deliberately: they are ~830 KB and must not ship in
the extension or the web bundle, where the 226 KB of woff2 is what gets served.

Only Regular and Bold are shipped, because those are the only weights
`renderCard.ts` asks for. Adding a weight to the renderer means adding it here in
both formats and registering it in `test/canvasEnv.ts`.
