# Blue Passage — 3D Gulf Run

A stylized 3D arcade voyage between India and Iraq, through the Indian Ocean, Sea of Oman, Strait of Hormuz and Persian Gulf. Choose either direction and reach the final beacon with at least 1% hull integrity.

## Play offline
Download **Blue-Passage-offline.html**, then double-click it. Everything is embedded: no server, packages, CDN, account or internet connection required. A browser with WebGL is required.

For the modular version, open `index.html` with `game.js` and `vendor/` alongside it, or serve the repository with any static web server.

## Controls
- A/D or left/right: steer
- W/S or up/down: throttle
- Shift: boost (automatically recharges)
- Space: brake
- C: switch camera
- P: pause/resume
- Touch buttons on phones/tablets

Follow mint waypoint rings in order. Green crates restore 22% hull. Orange rings warn of incoming rockets and drones; move out before impact. Mines appear randomly around Hormuz. Two volcanic islands rise beside the sea lanes, pale surf traces the coasts, and eight defense batteries intercept nearby rockets and drones. Three US Navy vessels patrol the Sea of Oman alongside four aircraft. Explorer mode reduces damage and attack frequency. Shoreline and ship collisions damage your hull.

This is a fictional arcade scenario, with compressed, approximate geography, not a navigation chart or real-world military simulation.

## Files
- `index.html`: interface
- `game.js`: game logic and procedural 3D scene
- `vendor/three.min.js`: bundled Three.js r160 (MIT; license alongside)
- `Blue-Passage-offline.html`: complete single-file edition
- `build-offline.py`: rebuild the offline edition after edits

Run `python3 build-offline.py` to regenerate the standalone file.
