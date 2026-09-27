# Volcano Island — Cargo Run

A standalone 3D arcade game set around Ember Isle and Cinder Key. Sail a small cargo boat between two volcano docks and two ports, load and discharge four randomized delivery contracts, and stay afloat while mines drift and two U.S. Navy carriers patrol the sea.

## Play

Open `index.html` in a modern browser with WebGL enabled. It includes Three.js and runs offline. `Volcano-Island-offline.html` is the same self-contained game as a separate download.

## Controls

- **W / S** or **↑ / ↓**: accelerate / reverse
- **A / D** or **← / →**: steer
- **Hold E** (or Enter) at the highlighted dock to load or discharge; the boat must be stopped and within 4.5 m
- **Drag**: orbit the camera; **scroll**: zoom
- **P** is not used; use the Pause button in the panel
- Touch controls are available on phones and tablets

A run has four cargo contracts and eight dock actions. The route varies on restart and visits both volcanoes and both ports. Earn delivery cash and collect expiring money and health packs. The upgrade shop uses earned money for engine, steering, and hull improvements. Six coast batteries can destroy mines close to the islands. The carriers patrol closed routes, intercept the boat briefly when it comes close, and return to their patrol paths. They fire at close range and launch a flare every 40 seconds.

Mines remove 10% of hull integrity on contact; carrier fire damages the boat as well. The run ends if the hull reaches zero. All locations are fictional arcade scenery rather than a navigation chart.

## Build the offline page

Install dependencies and rebuild after editing `game.js` or `index.template.html`:

```sh
npm install
npm run build
```

The build writes the playable `index.html` and the duplicate `Volcano-Island-offline.html`.

Three.js is distributed under the MIT license; see `THREE-LICENSE.txt`.
