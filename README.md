# Volcano Island — Cargo Run

A standalone 3D arcade game on a compact, closed volcanic lake in permanent daylight. Ember Isle and Cinder Key share the same detailed volcano model. Sail between the two islands, load and discharge six connected deliveries, and stay afloat while mines drift and two U.S. Navy carriers patrol slowly around the water.

## Play

Open `index.html` in a modern browser with WebGL enabled. It includes Three.js and runs offline. `Volcano-Island-offline.html` is the same self-contained game as a separate download.

## Controls

- **W / S** or **↑ / ↓**: accelerate / reverse
- **A / D** or **← / →**: steer
- **Hold E** (or Enter) at the highlighted dock to load or discharge; the boat must be nearly stopped and within 3.5 m
- **Drag**: orbit the camera; **scroll**: zoom
- **P** is not used; use the Pause button in the panel
- Touch controls are available on phones and tablets

A run has six cargo contracts and twelve dock actions between the two volcanoes. The starting island changes on some restarts. Each loaded leg has a deadline; mine and carrier hits damage cargo as well as the hull. A missed deadline or destroyed cargo ends the run, and damaged cargo pays less. Earn delivery cash and collect expiring money and health packs. The upgrade shop uses earned money for engine, steering, and hull improvements. Six coast batteries can destroy mines close to the islands. The carriers patrol closed routes with gradual turns, intercept the boat briefly when it comes close, and return to their patrol paths. They fire within 43 game units and launch a flare every 40 seconds. Escort jets fly wider, slower orbits and shoot repeatedly within 30 game units; each hit removes 1% of maximum hull life.

Each island has a five-unit safe zone beyond its shoreline, marked by a dashed green ring. The boat takes no mine, carrier, or aircraft damage inside it; mines stay beyond the boundary, and the navy stops chasing or firing at a protected boat. Shots already in flight also cannot damage the boat after it enters the zone. Outside the zones, mines remove 10% of hull integrity on contact, and carrier and aircraft fire damages the boat. At zero hull life, the boat sinks over ten seconds before a restart prompt appears. All locations are fictional arcade scenery rather than a navigation chart.

## Build the offline page

Install dependencies and rebuild after editing `game.js` or `index.template.html`:

```sh
npm install
npm run build
```

The build writes the playable `index.html`, the duplicate `Volcano-Island-offline.html`, and `dist/index.html` for Cloudflare.

Three.js is distributed under the MIT license; see `THREE-LICENSE.txt`.
