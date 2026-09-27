# Volcano Island — Cargo Run

A standalone 3D arcade game on a compact, closed volcanic lake in permanent daylight. Ember Isle and Cinder Key share the same detailed volcano model. Sail between the two islands, load and discharge six connected deliveries, and stay afloat while mines drift and two U.S. Navy carriers patrol slowly around the water.

## Play

Open `index.html` in a modern browser with WebGL enabled. It includes Three.js and runs offline. `npm run build` also writes the same page as `Volcano-Island-offline.html` for anyone who wants a standalone download.

## Controls

- **W / S** or **↑ / ↓**: accelerate / reverse
- **A / D** or **← / →**: steer
- **Hold E** (or Enter) at the highlighted dock to load or discharge; the boat must be nearly stopped and within 3.5 m
- **Drag**: orbit the camera; **scroll**: zoom
- **P** is not used; use the Pause button in the panel
- Touch controls are available on phones and tablets

A run has six cargo contracts and twelve dock actions between the two volcanoes. The starting island changes on some restarts. The radar shows both islands and the enclosing shoreline. Each loaded leg has a deadline; mine and carrier hits damage cargo as well as the hull. A missed deadline or destroyed cargo ends the run, and damaged cargo pays less. Earn delivery cash and collect expiring money and health packs. The upgrade shop uses earned money for engine, steering, and hull improvements, and closes once a run has ended. Six coast batteries destroy nearby mines and shoot visible anti-air beams at aircraft within 35 game units; flak bursts are cosmetic and do not damage or divert the aircraft. The carriers patrol closed routes with gradual turns, intercept the boat briefly when it comes close, and return to their patrol paths. They fire within 43 game units and launch a flare every 40 seconds. Escort jets fly wider, slower orbits and fire four-round machine-gun bursts within 30 game units.

Each island has a four-unit safe zone beyond its shoreline, marked by a dashed green ring. The boat takes no mine, carrier, or aircraft damage inside it; mines stay beyond the boundary, and the navy stops chasing or firing at a protected boat. Shots already in flight also cannot damage the boat after it enters the zone. Outside the zones, mines and carrier shells each remove 10% of maximum hull life and a single aircraft bullet removes 1%, so hull upgrades raise the boat's tolerance without changing what each threat costs in relative terms. At zero hull life, the boat sinks over ten seconds before a restart prompt appears. All locations are fictional arcade scenery rather than a navigation chart.

## Repository layout

- `game.js` — the whole game: procedural scene building, boat handling, missions, navy AI and HUD wiring.
- `index.template.html` — page shell, HUD markup and the minified stylesheet. Its CSS stays minified on purpose, because the styles ship verbatim inside the single-file build.
- `index.html` — the built, playable page. It is generated, so it is excluded from diffs (see `.gitattributes`); edit `game.js` or the template and rebuild instead.
- `dist/index.html` — the same page for the Cloudflare Worker asset directory. Not tracked; `npm run build` recreates it.
- `build.mjs` — bundles `game.js` with esbuild, inlines it into the template, and syntax-checks the result.

## Build the offline page

Install dependencies and rebuild after editing `game.js` or `index.template.html`:

```sh
npm ci
npm run build
```

The build writes the playable `index.html`, the standalone `Volcano-Island-offline.html` download, and `dist/index.html` for Cloudflare. Only `index.html` is committed; attach the standalone file to a GitHub release when you want a separate download.

```sh
npm run format   # prettier over the source and docs
npm run check    # format check + rebuild + fail if index.html is stale
```

CI runs `npm run check` on every push and pull request, so a source change that was never rebuilt fails the build instead of shipping a stale page.

## Deploy

The Worker serves generated files, so the build has to run before a deploy:

```sh
npm ci && npm run build && npx wrangler deploy
```

Point the Cloudflare build command at `npm run build` (or `npm run check`); `dist/` is not committed, so a deploy that skips the build would serve nothing.

## License

The game source is MIT licensed; see `LICENSE`. Three.js is distributed under the MIT license; see `THREE-LICENSE.txt`.
