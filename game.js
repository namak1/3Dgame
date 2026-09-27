import * as THREE from 'three';
/* Volcano Island — scene source. The distributed HTML includes this code and Three.js. */
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8bb7c1);
scene.fog = new THREE.FogExp2(0x8bb7c1, 0.008);

const canvas = document.querySelector('#scene');
canvas.tabIndex = 0;
canvas.setAttribute(
  'aria-label',
  'Interactive volcano island. Sail with W A S D or the arrow keys.'
);
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
  powerPreference: 'high-performance'
});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
renderer.shadowMap.enabled = true;
// PCFSoftShadowMap was removed in three r186 (it silently fell back to PCF).
renderer.shadowMap.type = THREE.PCFShadowMap;
const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 650);
let yaw = 0.62,
  pitch = 0.35,
  distance = 15.5,
  targetYaw = yaw,
  targetPitch = pitch,
  targetDistance = distance;
let running = true,
  eruptionPower = 0.68,
  elapsed = 0,
  nextBurst = 1.3;
// THREE.Clock is deprecated in three r186; Timer also reports a zero delta while
// the tab is hidden, which keeps the boat from teleporting on the next frame.
const clock = new THREE.Timer();
clock.connect(document);
const $ = (s) => document.querySelector(s);
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = THREE.MathUtils.clamp;
// Respect the OS "reduce motion" setting: keep the world readable without the
// constant boat bob and hit shake.
const reduceMotion =
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
eruptionPower = rand(0.38, 0.86);
nextBurst = rand(2, 4.5);
const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
// The whole volcano (terrain, crater, lava, trees) lives in one group that is
// scaled as a unit, so coast() and every height-derived placement below stay in
// sync with what is drawn.
const VOLCANO_SCALE = 1.6;
const CRATER_TOP_Y = 3.15 * VOLCANO_SCALE;
const LAVA_POOL_Y = 2.55 * VOLCANO_SCALE;
const volcano = new THREE.Group();
scene.add(volcano);

const hemi = new THREE.HemisphereLight(0xccefff, 0x5c5246, 3.1);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffefd5, 4.5);
sun.position.set(-8, 13, 7);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
// The shadow box follows the boat (see updateShadowLight) instead of sitting on
// the origin, so the water and island you are actually looking at keep shadows.
const SHADOW_EXTENT = 24;
const sunOffset = new THREE.Vector3(-8, 13, 7);
sun.shadow.camera.left = -SHADOW_EXTENT;
sun.shadow.camera.right = SHADOW_EXTENT;
sun.shadow.camera.top = SHADOW_EXTENT;
sun.shadow.camera.bottom = -SHADOW_EXTENT;
sun.shadow.camera.near = 0.5;
sun.shadow.camera.far = 90;
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.03;
scene.add(sun);
scene.add(sun.target);
function updateShadowLight(x, z) {
  sun.target.position.set(x, 0, z);
  sun.position.set(x + sunOffset.x, sunOffset.y, z + sunOffset.z);
  sun.target.updateMatrixWorld();
}
const fireLight = new THREE.PointLight(0xff4a14, 22, 11, 1.8);
fireLight.position.set(0, CRATER_TOP_Y + 0.45, 0);
scene.add(fireLight);
const fill = new THREE.DirectionalLight(0x8eb7d0, 1.5);
fill.position.set(8, 5, -8);
scene.add(fill);

function noise(x, z) {
  return (
    Math.sin(x * 2.61 + Math.cos(z * 1.3)) * Math.cos(z * 2.17) * 0.45 +
    Math.sin(x * 5.1 + z * 3.8) * 0.16 +
    Math.cos(z * 6.2 - x * 2.9) * 0.08
  );
}
function baseCoast(a) {
  return (
    4.95 +
    0.19 * Math.sin(a * 5 + 0.3) +
    0.11 * Math.sin(a * 9 - 1.2) +
    0.1 * Math.sin(a * 13 + 0.6)
  );
}
function coast(a) {
  return baseCoast(a) * VOLCANO_SCALE;
}
const lakeCenterZ = 12;
function lakeRadius(a) {
  const ellipse = 1 / Math.hypot(Math.cos(a) / 155, Math.sin(a) / 112);
  return ellipse * (1 + 0.045 * Math.sin(a * 3 - 0.5) + 0.025 * Math.cos(a * 8 + 1.2));
}
function insideLake(x, z, margin = 0) {
  const dx = x,
    dz = z - lakeCenterZ,
    a = Math.atan2(dz, dx);
  return Math.hypot(dx, dz) < lakeRadius(a) - margin;
}
function landHeight(r, a) {
  const x = r * Math.cos(a),
    z = r * Math.sin(a);
  const peak = 3.15 * Math.exp(-Math.pow(r / 2.45, 1.82));
  const wrinkles =
    noise(x, z) * 0.12 * Math.min(r, 1.3) + Math.sin(a * 7 + r * 2.3) * 0.065 * Math.min(r, 1);
  return Math.max(-0.12, 0.06 + peak + wrinkles - 0.12 * Math.max(0, r - 3.6));
}
function terrainMesh() {
  const segments = 192,
    rings = 75,
    pos = [],
    colors = [],
    indices = [];
  const color = new THREE.Color(),
    soil = new THREE.Color(0x3b3029),
    ash = new THREE.Color(0x454344);
  const forest = new THREE.Color(0x304d38),
    beach = new THREE.Color(0x9a8060);
  for (let j = 0; j <= rings; j++)
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2,
        t = j / rings;
      const r = 0.68 + (baseCoast(a) - 0.68) * t;
      const h = landHeight(r, a);
      const x = r * Math.cos(a),
        z = r * Math.sin(a);
      pos.push(x, h, z);
      const jitter = noise(x, z) * 0.045;
      if (r < 1.8) color.copy(ash).lerp(soil, Math.max(0, r - 0.8) * 0.34);
      else if (r < 4.25) color.copy(soil).lerp(forest, Math.min(0.8, (r - 1.6) * 0.31));
      else color.copy(forest).lerp(beach, clamp((r - 4.25) / 0.62, 0, 1));
      color.offsetHSL(0, 0, jitter);
      colors.push(color.r, color.g, color.b);
    }
  for (let j = 0; j < rings; j++)
    for (let i = 0; i < segments; i++) {
      const k = j * (segments + 1) + i;
      indices.push(k, k + segments + 1, k + 1, k + 1, k + segments + 1, k + segments + 2);
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const land = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.97, side: THREE.DoubleSide })
  );
  land.castShadow = true;
  land.receiveShadow = true;
  volcano.add(land);

  const innerPos = [],
    innerIdx = [];
  for (let j = 0; j <= 16; j++)
    for (let i = 0; i <= 96; i++) {
      const a = (i / 96) * Math.PI * 2,
        r = 0.05 + (j / 16) * 0.64;
      const h = 2.45 + 0.75 * Math.pow(j / 16, 1.4) + (Math.sin(a * 8) * 0.04 * j) / 16;
      innerPos.push(r * Math.cos(a), h, r * Math.sin(a));
    }
  for (let j = 0; j < 16; j++)
    for (let i = 0; i < 96; i++) {
      let k = j * 97 + i;
      innerIdx.push(k, k + 97, k + 1, k + 1, k + 97, k + 98);
    }
  const bowl = new THREE.BufferGeometry();
  bowl.setAttribute('position', new THREE.Float32BufferAttribute(innerPos, 3));
  bowl.setIndex(innerIdx);
  bowl.computeVertexNormals();
  volcano.add(
    new THREE.Mesh(
      bowl,
      new THREE.MeshStandardMaterial({ color: 0x251d20, side: THREE.DoubleSide, roughness: 1 })
    )
  );
}
terrainMesh();

const lavaCore = new THREE.Mesh(
  new THREE.CircleGeometry(0.46, 64),
  new THREE.MeshBasicMaterial({ color: 0xff4a0a, side: THREE.DoubleSide })
);
lavaCore.rotation.x = -Math.PI / 2;
lavaCore.position.y = 2.55; // local to the volcano group; VOLCANO_SCALE is applied on top
volcano.add(lavaCore);
const lavaInner = new THREE.Mesh(
  new THREE.CircleGeometry(0.37, 64),
  new THREE.MeshBasicMaterial({
    color: 0xffb32d,
    transparent: true,
    opacity: 0.65,
    side: THREE.DoubleSide
  })
);
lavaInner.rotation.x = -Math.PI / 2;
lavaInner.position.y = 2.57;
volcano.add(lavaInner);
const rim = new THREE.Mesh(
  new THREE.TorusGeometry(0.53, 0.05, 7, 82),
  new THREE.MeshBasicMaterial({ color: 0xff5c14, transparent: true, opacity: 0.78 })
);
rim.rotation.x = Math.PI / 2;
rim.position.y = 3.12;
volcano.add(rim);

const lavaFlows = [];
function makeFlow(direction, length, width, seed) {
  const flowGroup = new THREE.Group();
  volcano.add(flowGroup);
  for (let layer = 0; layer < 3; layer++) {
    const points = [],
      indices = [];
    const count = 90;
    for (let i = 0; i <= count; i++) {
      const t = i / count,
        r = 0.63 + t * (length - 0.63),
        a = direction + Math.sin(t * 8 + seed) * 0.1 * t + Math.sin(t * 17 + seed * 2) * 0.027 * t;
      const spread =
        width *
        (0.75 + 0.5 * Math.sin(t * 4 + seed)) *
        (1 - 0.45 * t) *
        (layer === 0 ? 1.65 : layer === 1 ? 1 : 0.3);
      for (const side of [-1, 1]) {
        let angle = a + (side * spread) / (2 * r),
          x = r * Math.cos(angle),
          z = r * Math.sin(angle);
        points.push(x, landHeight(r, angle) + 0.035 + layer * 0.013, z);
      }
      if (i < count) {
        let k = i * 2;
        indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    const mat = new THREE.MeshBasicMaterial({
      color: [0x8e1609, 0xff4c08, 0xffc54d][layer],
      side: THREE.DoubleSide,
      transparent: true,
      opacity: [0.85, 0.95, 0.75][layer],
      depthWrite: false
    });
    const mesh = new THREE.Mesh(geo, mat);
    flowGroup.add(mesh);
    lavaFlows.push({ mesh, layer, phase: seed });
  }
}
makeFlow(0.26, 4.4, 0.31, 0.2);
makeFlow(2.58, 3.65, 0.29, 1.9);
makeFlow(4.55, 3.95, 0.2, 3.4);
// Cinder Key is a clone of this group, so both islands share one definition.
volcano.scale.setScalar(VOLCANO_SCALE);

function radialMesh(inner, outer, rings = 16, segments = 192) {
  const positions = [],
    colors = [],
    indices = [],
    beach = new THREE.Color(0x9e8e70),
    forest = new THREE.Color(0x415c43),
    rock = new THREE.Color(0x55544e);
  for (let j = 0; j <= rings; j++)
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2,
        t = j / rings,
        shore = lakeRadius(a),
        r = inner ? shore + t * (outer - shore) : t * shore;
      const x = Math.cos(a) * r,
        z = lakeCenterZ + Math.sin(a) * r;
      const hill = inner ? Math.min(1, t * 7) * (1.2 + 2.7 * (0.5 + 0.5 * Math.sin(a * 6 + 1))) : 0;
      const height = inner
        ? 0.08 + hill + Math.sin(r * 0.11 + a * 9) * 0.38 * Math.min(1, t * 7)
        : -0.095;
      positions.push(x, height, z);
      if (inner) {
        const c = beach
          .clone()
          .lerp(forest, Math.min(1, t * 12))
          .lerp(rock, Math.min(1, Math.max(0, t - 0.06) * 3));
        c.offsetHSL(0, 0, noise(x * 0.12, z * 0.12) * 0.06);
        colors.push(c.r, c.g, c.b);
      }
    }
  for (let j = 0; j < rings; j++)
    for (let i = 0; i < segments; i++) {
      const k = j * (segments + 1) + i;
      indices.push(k, k + segments + 1, k + 1, k + 1, k + segments + 1, k + segments + 2);
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  if (inner) {
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();
  }
  return geo;
}
const shore = new THREE.Mesh(
  radialMesh(true, 650),
  new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide })
);
shore.receiveShadow = true;
scene.add(shore);
const lakeFoamPoints = [];
for (let i = 0; i <= 360; i++) {
  const a = (i / 360) * Math.PI * 2,
    r = lakeRadius(a) - 0.4;
  lakeFoamPoints.push(new THREE.Vector3(Math.cos(a) * r, -0.035, lakeCenterZ + Math.sin(a) * r));
}
scene.add(
  new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(lakeFoamPoints),
    new THREE.LineBasicMaterial({ color: 0xa2d4c2, transparent: true, opacity: 0.47 })
  )
);

const ocean = new THREE.Mesh(
  radialMesh(false, 0, 24),
  new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uLight: { value: new THREE.Vector3(-0.55, 0.8, 0.35) },
      uDay: { value: 1 }
    },
    vertexShader: `varying vec3 vWorld; void main(){vec4 p=modelMatrix*vec4(position,1.);vWorld=p.xyz;gl_Position=projectionMatrix*viewMatrix*p;}`,
    fragmentShader: `uniform float uTime;uniform float uDay;varying vec3 vWorld;
    void main(){vec2 p=vWorld.xz;float w=sin(p.x*1.65+uTime*.8)*sin(p.y*1.2-uTime*.55)*.5+.5;
    w+=sin(p.x*3.7+p.y*1.8-uTime*1.15)*.11;
    float dist=length(p);float edge=smoothstep(5.,7.3,dist);
    vec3 deep=mix(vec3(.023,.095,.16),vec3(.065,.27,.34),uDay);
    vec3 col=mix(deep,vec3(.15,.36,.47),.18*w);
    float sheen=pow(max(0.,sin((p.x+p.y)*2.4-uTime)*.5+.5),18.)*.11;
    col+=vec3(.22,.32,.37)*sheen;
    col=mix(col,vec3(.06,.18,.25),smoothstep(22.,115.,dist)*.35);
    gl_FragColor=vec4(col,1.);}`,
    side: THREE.DoubleSide
  })
);
scene.add(ocean);

const foamPoints = [];
for (let i = 0; i <= 360; i++) {
  let a = (i / 360) * Math.PI * 2,
    r = coast(a) + 0.045;
  foamPoints.push(new THREE.Vector3(r * Math.cos(a), -0.055, r * Math.sin(a)));
}
const foam = new THREE.LineLoop(
  new THREE.BufferGeometry().setFromPoints(foamPoints),
  new THREE.LineBasicMaterial({ color: 0x85c3bd, transparent: true, opacity: 0.43 })
);
scene.add(foam);
const outerFoam = [];
for (let i = 0; i <= 360; i++) {
  let a = (i / 360) * Math.PI * 2,
    r = coast(a) + 0.19;
  outerFoam.push(new THREE.Vector3(r * Math.cos(a), -0.06, r * Math.sin(a)));
}
const outerFoamLine = new THREE.LineLoop(
  new THREE.BufferGeometry().setFromPoints(outerFoam),
  new THREE.LineBasicMaterial({ color: 0x589ba3, transparent: true, opacity: 0.22 })
);
scene.add(outerFoamLine);

// ---- ISLAND RUNNER: the player's workboat ---------------------------------
// Local units are roughly metres and the group is scaled 1.35, so the hull keeps
// the footprint the rest of the game is tuned around (bow -1.72, transom +1.68,
// beam 0.88). The hull is a loft over nine stations and every station is a closed
// section, so the shell, the bulwark cap rail and the deck all fall out of one
// table with no open edges except the bow and the transom, which are capped.
const ship = new THREE.Group();
ship.position.set(2.2, -0.025, 6.3);
ship.rotation.y = -0.68;
ship.scale.setScalar(1.35);
scene.add(ship);

const HULL_STATIONS = [
  // x, halfBeam, sheerY, chineY, keelY
  [-1.72, 0.03, 0.335, 0.11, 0.03],
  [-1.54, 0.18, 0.298, 0.065, -0.05],
  [-1.24, 0.31, 0.232, 0.01, -0.13],
  [-0.84, 0.39, 0.19, -0.03, -0.18],
  [-0.34, 0.43, 0.148, -0.05, -0.21],
  [0.22, 0.44, 0.118, -0.05, -0.215],
  [0.78, 0.425, 0.104, -0.04, -0.2],
  [1.26, 0.39, 0.11, -0.02, -0.165],
  [1.68, 0.345, 0.135, 0.01, -0.105]
];
const BULWARK = 0.055; // how far the deck sits below the sheer
const DECK_INSET = 0.03; // deck edge inset from the sheer, leaving the cap rail
const WATERLINE = -0.052; // local y of the lake surface while the boat floats

function stationAt(x) {
  const last = HULL_STATIONS.length - 1;
  if (x <= HULL_STATIONS[0][0]) return HULL_STATIONS[0];
  if (x >= HULL_STATIONS[last][0]) return HULL_STATIONS[last];
  for (let i = 0; i < last; i++) {
    const [x0] = HULL_STATIONS[i];
    const x1 = HULL_STATIONS[i + 1][0];
    if (x <= x1) {
      const t = (x - x0) / (x1 - x0);
      return HULL_STATIONS[i].map((v, k) => v + (HULL_STATIONS[i + 1][k] - v) * t);
    }
  }
  return HULL_STATIONS[last];
}
// Half width of the hull surface at height y, interpolating sheer -> chine -> keel.
function hullHalfWidth(station, y) {
  const halfBeam = station[1];
  const sheerY = station[2];
  const chineY = station[3];
  const keelY = station[4];
  const chineWidth = halfBeam * 0.62;
  if (y >= chineY) {
    const t = clamp((sheerY - y) / Math.max(0.001, sheerY - chineY), 0, 1);
    return halfBeam + (chineWidth - halfBeam) * t;
  }
  const t = clamp((chineY - y) / Math.max(0.001, chineY - keelY), 0, 1);
  return chineWidth * (1 - t);
}
const deckYAt = (x) => stationAt(x)[2] - BULWARK;
const deckEdgeAt = (x) => Math.max(0.02, hullHalfWidth(stationAt(x), deckYAt(x)) - DECK_INSET);

function hullSection(station) {
  const [x, halfBeam, sheerY, chineY, keelY] = station;
  const chineWidth = halfBeam * 0.62;
  const deckY = sheerY - BULWARK;
  const deckWidth = Math.max(0.02, hullHalfWidth(station, deckY) - DECK_INSET);
  return [
    [x, sheerY, -halfBeam], // 0 port sheer
    [x, chineY, -chineWidth], // 1 port chine
    [x, keelY, 0], // 2 keel
    [x, chineY, chineWidth], // 3 starboard chine
    [x, sheerY, halfBeam], // 4 starboard sheer
    [x, deckY, deckWidth], // 5 starboard deck edge
    [x, deckY, -deckWidth] // 6 port deck edge
  ];
}
const hullSections = HULL_STATIONS.map(hullSection);
const ringAt = (i) => i * 7;
function loftGeometry(edgePairs, { capBow = false, capStern = false } = {}) {
  const positions = [];
  const indices = [];
  for (const section of hullSections) for (const [x, y, z] of section) positions.push(x, y, z);
  const addQuad = (a, b, c, d) => indices.push(a, b, c, a, c, d);
  for (let i = 0; i < hullSections.length - 1; i++)
    for (const [j0, j1] of edgePairs)
      addQuad(ringAt(i) + j0, ringAt(i) + j1, ringAt(i + 1) + j1, ringAt(i + 1) + j0);
  const cap = (ringStart, apex) => {
    const apexIndex = positions.length / 3;
    positions.push(apex[0], apex[1], apex[2]);
    for (let j = 0; j < 7; j++) indices.push(ringStart + j, ringStart + ((j + 1) % 7), apexIndex);
  };
  if (capBow) cap(ringAt(0), [-1.8, 0.15, 0]);
  if (capStern) cap(ringAt(hullSections.length - 1), [1.68, 0, 0]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

const bHull = new THREE.MeshStandardMaterial({
  color: 0xd2392a,
  metalness: 0.16,
  roughness: 0.42,
  side: THREE.DoubleSide
});
const bDeck = new THREE.MeshStandardMaterial({
  color: 0xcbc0aa,
  metalness: 0.04,
  roughness: 0.8,
  side: THREE.DoubleSide
});
const bTeak = new THREE.MeshStandardMaterial({
  color: 0x8a6440,
  metalness: 0.1,
  roughness: 0.62,
  side: THREE.DoubleSide
});
const bWhite = new THREE.MeshStandardMaterial({ color: 0xf3efe4, roughness: 0.6 });
const bCream = new THREE.MeshStandardMaterial({ color: 0xe6dcc6, roughness: 0.66 });
const bGlass = new THREE.MeshStandardMaterial({
  color: 0x2b4553,
  metalness: 0.4,
  roughness: 0.18,
  side: THREE.DoubleSide
});
const bRoof = new THREE.MeshStandardMaterial({ color: 0xb93a2b, metalness: 0.12, roughness: 0.5 });
const bSteel = new THREE.MeshStandardMaterial({
  color: 0x8d949a,
  metalness: 0.62,
  roughness: 0.42
});
const bDark = new THREE.MeshStandardMaterial({ color: 0x2c3238, metalness: 0.35, roughness: 0.58 });
const bNavy = new THREE.MeshStandardMaterial({
  color: 0x233442,
  metalness: 0.2,
  roughness: 0.62,
  side: THREE.DoubleSide
});
const bWood = new THREE.MeshStandardMaterial({ color: 0x9b7448, roughness: 0.82 });

const hullShell = new THREE.Mesh(
  loftGeometry(
    [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4]
    ],
    { capBow: true, capStern: true }
  ),
  bHull
);
hullShell.castShadow = true;
hullShell.receiveShadow = true;
ship.add(hullShell);
const hullDeck = new THREE.Mesh(loftGeometry([[5, 6]]), bDeck);
hullDeck.receiveShadow = true;
ship.add(hullDeck);
ship.add(
  new THREE.Mesh(
    loftGeometry([
      [4, 5],
      [6, 0]
    ]),
    bTeak
  )
);

// Boot stripe at the waterline and a white sheer stripe just under the cap rail,
// both offset a hair outward so they hug the planking instead of z-fighting it.
function hullRibbon(yTopOf, yBottomOf, material, inflate = 1.015) {
  const positions = [];
  const indices = [];
  HULL_STATIONS.forEach((station, i) => {
    const x = station[0];
    const yTop = yTopOf(station);
    const yBottom = yBottomOf(station);
    positions.push(
      x,
      yTop,
      -hullHalfWidth(station, yTop) * inflate,
      x,
      yTop,
      hullHalfWidth(station, yTop) * inflate,
      x,
      yBottom,
      -hullHalfWidth(station, yBottom) * inflate,
      x,
      yBottom,
      hullHalfWidth(station, yBottom) * inflate
    );
  });
  for (let i = 0; i < HULL_STATIONS.length - 1; i++) {
    const a = i * 4;
    const b = (i + 1) * 4;
    indices.push(a + 1, b + 1, b + 3, a + 1, b + 3, a + 3);
    indices.push(a, a + 2, b + 2, a, b + 2, b);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  ship.add(new THREE.Mesh(geo, material));
}
hullRibbon(
  () => WATERLINE + 0.035,
  () => WATERLINE - 0.05,
  bNavy,
  1.02
);
hullRibbon(
  (s) => s[2] - 0.055,
  (s) => s[2] - 0.108,
  bWhite
);

function boatBox(w, h, d, material, x, y, z, parent = ship) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
function boatTube(rTop, rBottom, h, material, x, y, z, parent = ship, segments = 8) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, segments), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

// Wheelhouse: the floor sits just below the deck so the sloping deck never opens
// a gap under the walls. Glazing is inset into white frames with mullions, and a
// trim band runs along the sheer of the house.
const houseX = 0.05;
const houseFloor = Math.min(deckYAt(houseX - 0.39), deckYAt(houseX + 0.39)) - 0.015;
const houseHeight = 0.43;
const houseTop = houseFloor + houseHeight;
boatBox(0.78, houseHeight, 0.51, bWhite, houseX, houseFloor + houseHeight / 2, 0);
const windscreen = boatBox(0.022, 0.2, 0.43, bGlass, houseX - 0.385, houseTop - 0.085, 0);
windscreen.rotation.z = -0.34;
const windscreenFrame = boatBox(0.03, 0.24, 0.48, bWhite, houseX - 0.362, houseTop - 0.085, 0);
windscreenFrame.rotation.z = -0.34;
boatBox(0.8, 0.03, 0.53, bCream, houseX, houseTop - 0.015, 0);
for (const side of [-1, 1]) {
  for (const [wx, ww] of [
    [houseX - 0.13, 0.24],
    [houseX + 0.17, 0.2]
  ]) {
    boatBox(ww + 0.03, 0.17, 0.02, bWhite, wx, houseTop - 0.13, side * 0.256);
    boatBox(ww, 0.13, 0.014, bGlass, wx, houseTop - 0.13, side * 0.266);
    boatBox(0.016, 0.13, 0.016, bWhite, wx, houseTop - 0.13, side * 0.268);
  }
}
boatBox(0.02, 0.32, 0.24, bWhite, houseX + 0.395, houseFloor + 0.15, -0.03);
boatBox(0.02, 0.11, 0.14, bGlass, houseX + 0.405, houseFloor + 0.29, -0.03);
boatBox(0.16, 0.02, 0.26, bTeak, houseX + 0.42, houseFloor + 0.01, -0.03);
// Life ring clipped to the wheelhouse side the camera looks at most.
const lifeRing = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.022, 6, 16), bCream);
lifeRing.rotation.y = Math.PI / 2;
lifeRing.position.set(houseX + 0.24, houseTop - 0.2, 0.262);
ship.add(lifeRing);
for (let i = 0; i < 4; i++) {
  const marker = boatBox(0.02, 0.048, 0.02, bRoof, houseX + 0.24, houseTop - 0.2, 0.277);
  marker.rotation.x = (i * Math.PI) / 2 + Math.PI / 4;
}

// Roof, gear and navigation lights.
boatBox(0.86, 0.05, 0.58, bRoof, houseX, houseTop + 0.025, 0);
boatBox(0.9, 0.018, 0.62, bDark, houseX, houseTop + 0.005, 0);
for (const side of [-1, 1])
  boatBox(0.03, 0.035, 0.5, bSteel, houseX + side * 0.34, houseTop + 0.065, 0);
const radar = new THREE.Mesh(new THREE.SphereGeometry(0.105, 12, 8), bCream);
radar.scale.y = 0.6;
radar.position.set(houseX - 0.07, houseTop + 0.075, 0);
ship.add(radar);
boatTube(0.03, 0.055, 0.12, bRoof, houseX + 0.23, houseTop + 0.085, 0);
boatTube(0.006, 0.006, 0.46, bSteel, houseX - 0.26, houseTop + 0.26, 0.16, ship, 5);
const navLights = [
  [0x39d98a, houseX - 0.35, houseTop + 0.085, 0.23],
  [0xff5a4a, houseX - 0.35, houseTop + 0.085, -0.23]
];
for (const [color, x, y, z] of navLights) {
  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.022, 8, 6),
    new THREE.MeshBasicMaterial({ color })
  );
  lamp.position.set(x, y, z);
  ship.add(lamp);
}

// Foremast with a forestay, backstay and shrouds, plus the pennant that flutters.
const mastX = -0.72;
const mastBase = deckYAt(mastX);
const mastTopY = mastBase + 1.12;
boatTube(0.02, 0.03, 1.12, bWhite, mastX, mastBase + 0.56, 0, ship, 8);
const mastYard = boatTube(0.011, 0.011, 0.34, bSteel, mastX, mastTopY - 0.16, 0, ship, 6);
mastYard.rotation.x = Math.PI / 2;
const riggingMat = new THREE.LineBasicMaterial({
  color: 0xd8d5c8,
  transparent: true,
  opacity: 0.7
});
function rig(a, b) {
  ship.add(
    new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...a), new THREE.Vector3(...b)]),
      riggingMat
    )
  );
}
rig([mastX, mastTopY, 0], [-1.62, 0.24, 0]);
rig([mastX, mastTopY, 0], [1.64, 0.19, 0]);
rig([mastX, mastTopY - 0.08, 0], [-0.5, deckYAt(-0.5) + 0.03, 0.24]);
rig([mastX, mastTopY - 0.08, 0], [-0.5, deckYAt(-0.5) + 0.03, -0.24]);
const masthead = new THREE.Mesh(
  new THREE.SphereGeometry(0.025, 8, 6),
  new THREE.MeshBasicMaterial({ color: 0xfff2cf })
);
masthead.position.set(mastX, mastTopY + 0.03, 0);
ship.add(masthead);
const mastFlag = new THREE.Group();
mastFlag.position.set(mastX, mastTopY - 0.04, 0);
const flagCloth = new THREE.Mesh(
  new THREE.PlaneGeometry(0.24, 0.13),
  new THREE.MeshStandardMaterial({ color: 0xe0663c, roughness: 0.72, side: THREE.DoubleSide })
);
flagCloth.position.set(0.13, 0, 0);
mastFlag.add(flagCloth);
ship.add(mastFlag);

// Foredeck: hatch, windlass and a wire rail around the bow.
boatBox(0.3, 0.05, 0.34, bCream, -0.45, deckYAt(-0.45) + 0.025, 0);
boatBox(0.34, 0.022, 0.38, bTeak, -0.45, deckYAt(-0.45) + 0.005, 0);
boatTube(0.05, 0.05, 0.1, bSteel, -1.08, deckYAt(-1.08) + 0.05, 0, ship, 10).rotation.z =
  Math.PI / 2;
boatBox(0.05, 0.09, 0.05, bSteel, -1.08, deckYAt(-1.08) + 0.045, 0);
for (const side of [-1, 1]) {
  const stanchions = [];
  for (const x of [-1.5, -1.14, -0.78]) {
    const z = side * (deckEdgeAt(x) - 0.02);
    boatTube(0.008, 0.008, 0.12, bSteel, x, deckYAt(x) + 0.06, z, ship, 5);
    stanchions.push([x, deckYAt(x) + 0.12, z]);
  }
  rig(stanchions[0], stanchions[1]);
  rig(stanchions[1], stanchions[2]);
}

// Cargo hold: a recessed, teak-coamed bay aft of the wheelhouse. The crates the
// contract puts on board appear inside it.
const holdFront = 0.52;
const holdBack = 1.44;
const holdHalf = 0.3;
const holdFloor = (deckYAt(holdFront) + deckYAt(holdBack)) / 2 + 0.005;
boatBox(
  holdBack - holdFront,
  0.012,
  holdHalf * 2 - 0.04,
  bDark,
  (holdFront + holdBack) / 2,
  holdFloor,
  0
);
boatBox(0.035, 0.12, holdHalf * 2, bTeak, holdFront, holdFloor + 0.06, 0);
boatBox(0.035, 0.13, holdHalf * 2, bTeak, holdBack, holdFloor + 0.065, 0);
for (const side of [-1, 1])
  boatBox(
    holdBack - holdFront,
    0.12,
    0.035,
    bTeak,
    (holdFront + holdBack) / 2,
    holdFloor + 0.06,
    side * holdHalf
  );
// Derrick over the hold with the fall line hanging into it.
const derrickBase = boatTube(
  0.022,
  0.03,
  0.46,
  bSteel,
  holdFront + 0.04,
  holdFloor + 0.24,
  -holdHalf + 0.04,
  ship,
  7
);
derrickBase.rotation.z = 0.16;
const derrickBoom = boatTube(
  0.016,
  0.02,
  0.5,
  bSteel,
  holdFront + 0.34,
  holdFloor + 0.5,
  -holdHalf + 0.04,
  ship,
  7
);
derrickBoom.rotation.z = 1.18;
rig(
  [holdFront + 0.52, holdFloor + 0.62, -holdHalf + 0.04],
  [holdFront + 0.62, holdFloor + 0.2, -holdHalf + 0.06]
);

// Fenders, boot-level skeg, rudder and propeller.
for (const side of [-1, 1])
  for (const x of [-0.35, 0.35, 1.02]) {
    const fender = boatTube(
      0.045,
      0.045,
      0.15,
      bCream,
      x,
      stationAt(x)[2] - 0.12,
      side * (hullHalfWidth(stationAt(x), stationAt(x)[2]) + 0.035),
      ship,
      8
    );
    fender.rotation.x = side * 0.06;
  }
boatBox(0.26, 0.05, 0.1, bHull, 1.4, -0.235, 0);
boatTube(0.018, 0.018, 0.3, bSteel, 1.5, -0.155, 0, ship, 6).rotation.z = Math.PI / 2;
boatBox(0.02, 0.2, 0.13, bHull, 1.72, -0.19, 0);
for (let i = 0; i < 3; i++) {
  const blade = boatBox(0.012, 0.13, 0.045, bSteel, 1.63, -0.155, 0);
  blade.rotation.x = (i * Math.PI * 2) / 3;
}

// Name across the transom, drawn to a canvas so the page stays asset-free.
function namePlateTexture(label) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#12202b';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#e2d3ad';
  ctx.lineWidth = 4;
  ctx.strokeRect(3, 3, canvas.width - 6, canvas.height - 6);
  ctx.fillStyle = '#efe3c6';
  ctx.font = 'bold 30px Georgia, "Times New Roman", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, canvas.width / 2, canvas.height / 2 + 1);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}
const namePlate = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.12, 0.44), [
  new THREE.MeshStandardMaterial({ map: namePlateTexture('ISLAND RUNNER'), roughness: 0.6 }),
  bDark,
  bDark,
  bDark,
  bDark,
  bDark
]);
namePlate.position.set(1.695, 0.115, 0);
ship.add(namePlate);

const bowLight = new THREE.PointLight(0xffd08a, 1.7, 4, 2);
bowLight.position.set(-1.2, 0.3, 0);
ship.add(bowLight);
const wakeMat = new THREE.LineBasicMaterial({ color: 0xd9fbef, transparent: true, opacity: 0.65 });
const wakes = [];
for (const side of [-1, 1]) {
  const points = [];
  for (let i = 0; i < 30; i++) {
    const t = i / 29;
    points.push(
      new THREE.Vector3(
        1.5 + t * 0.98,
        -0.072 + Math.sin(t * 8 + side) * 0.006,
        side * (0.21 + t * 0.42 + Math.sin(t * 11) * 0.035)
      )
    );
  }
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), wakeMat.clone());
  ship.add(line);
  wakes.push(line);
}
const sternFoam = new THREE.Mesh(
  new THREE.TorusGeometry(0.2, 0.02, 5, 24),
  new THREE.MeshBasicMaterial({ color: 0xd2fff1, transparent: true, opacity: 0.62 })
);
sternFoam.rotation.x = Math.PI / 2;
sternFoam.position.set(1.62, -0.07, 0);
ship.add(sternFoam);
const shipTag = document.createElement('div');
shipTag.className = 'ship-tag';
shipTag.textContent = 'ISLAND RUNNER';
document.body.appendChild(shipTag);
const shipCargoCrates = new THREE.Group();
ship.add(shipCargoCrates);
for (const [x, z, color, turn] of [
  [0.68, -0.14, 0xc28b4d, 0.08],
  [1.0, 0.15, 0x5c8872, -0.12],
  [1.27, -0.12, 0xb77946, 0.05],
  [0.72, 0.16, 0xa8804a, -0.06]
]) {
  const crate = new THREE.Mesh(
    new THREE.BoxGeometry(0.32, 0.26, 0.28),
    new THREE.MeshStandardMaterial({ color, roughness: 0.84 })
  );
  crate.position.set(x, holdFloor + 0.14, z);
  crate.rotation.y = turn;
  crate.castShadow = true;
  shipCargoCrates.add(crate);
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.27, 0.29), bTeak);
  band.position.set(x, holdFloor + 0.14, z);
  band.rotation.y = turn;
  shipCargoCrates.add(band);
}
shipCargoCrates.visible = false;

// Cinder will clone Ember's terrain, crater, lava flows, and trees.
const secondVolcanoSite = { id: 'cinder', name: 'CINDER KEY', x: 72, z: -68, radius: 8 };
// Ember Isle sits at the origin; Cinder Key is the same island 99 units away.
const islandCenters = [
  { x: 0, z: 0 },
  { x: secondVolcanoSite.x, z: secondVolcanoSite.z }
];
let secondVolcano;
const cinderTag = document.createElement('div');
cinderTag.className = 'dock-tag';
cinderTag.textContent = 'CINDER KEY · ACTIVE CRATER';
document.body.appendChild(cinderTag);

// A pier runs from the shoreline out into the lake; the boat berths alongside it
// instead of on top of it. Local +x points away from the island, so the deck
// starts just off the shore and the berth sits BERTH_OFFSET out from the middle.
const PIER_DECK = { length: 8, width: 2.6, center: 2.2 };
const BERTH_OFFSET = 4.05;
function siteToWorld(site, lx, lz) {
  const c = Math.cos(site.rotation),
    s = Math.sin(site.rotation);
  return { x: site.x + c * lx + s * lz, z: site.z - s * lx + c * lz };
}
function makeDock(site) {
  const group = new THREE.Group();
  group.position.set(site.x, -0.055, site.z);
  group.rotation.y = site.rotation;
  scene.add(group);
  const deckMat = new THREE.MeshStandardMaterial({ color: 0x645344, roughness: 0.86 });
  const trimMat = new THREE.MeshStandardMaterial({
    color: 0xe48c4b,
    metalness: 0.24,
    roughness: 0.58
  });
  const cube = (w, h, d, material, x, y, z) => {
    const item = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    item.position.set(x, y, z);
    item.castShadow = true;
    item.receiveShadow = true;
    group.add(item);
    return item;
  };
  cube(PIER_DECK.length, 0.3, PIER_DECK.width, deckMat, PIER_DECK.center, 0.02, 0);
  cube(2.6, 0.18, 3.1, deckMat, 7.3, -0.1, 0);
  for (const x of [-1.5, 1.0, 3.6, 6.0, 7.8])
    for (const z of [-1.05, 1.05]) cube(0.34, 1.15, 0.34, trimMat, x, -0.5, z);
  for (let i = 0; i < 4; i++) cube(0.045, 0.035, 2.4, trimMat, -0.9 + i * 1.9, 0.2, 0);
  const marker = new THREE.Mesh(
    new THREE.TorusGeometry(2, 0.055, 6, 36),
    new THREE.MeshBasicMaterial({
      color: 0xffa05f,
      transparent: true,
      opacity: 0.88,
      depthWrite: false
    })
  );
  marker.rotation.x = Math.PI / 2;
  marker.position.set(0, 0.24, BERTH_OFFSET);
  group.add(marker);
  cube(0.8, 0.65, 0.72, trimMat, 7, 0.32, -0.85);
  cube(0.8, 0.65, 0.72, trimMat, 7, 0.32, 0.85);
  for (const x of [0.2, 4.6]) {
    const bollard = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.45, 8), trimMat);
    bollard.position.set(x, 0.4, PIER_DECK.width / 2 - 0.15);
    group.add(bollard);
  }
  const tag = document.createElement('div');
  tag.className = 'dock-tag';
  tag.textContent = `${site.name} · VOLCANO DOCK`;
  document.body.appendChild(tag);
  // Everything outside makeDock treats a dock's x/z as the berth: the spot the
  // boat parks, the radar goal marker and the delivery clock all use it.
  const berth = siteToWorld(site, 0, BERTH_OFFSET);
  return { ...site, x: berth.x, z: berth.z, group, marker, tag };
}
const dockSites = [
  { id: 'ember', name: 'EMBER ISLE', x: 8, z: 6, rotation: -0.55 },
  { id: 'cinder', name: 'CINDER KEY', x: 80, z: -62, rotation: -0.55 }
];
const docks = dockSites.map(makeDock),
  dockById = Object.fromEntries(docks.map((d) => [d.id, d]));
const safeZoneWidth = 4;
function islandClearance(x, z, cx, cz) {
  const dx = x - cx,
    dz = z - cz;
  return Math.hypot(dx, dz) - coast(Math.atan2(dz, dx));
}
function isIslandSafeZone(x, z, extra = 0) {
  return islandCenters.some((c) => islandClearance(x, z, c.x, c.z) <= safeZoneWidth + extra);
}
function addSafeZoneRing(cx, cz) {
  const points = [];
  for (let i = 0; i <= 360; i++) {
    const a = (i / 360) * Math.PI * 2,
      r = coast(a) + safeZoneWidth;
    points.push(new THREE.Vector3(cx + r * Math.cos(a), -0.04, cz + r * Math.sin(a)));
  }
  const ring = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineDashedMaterial({
      color: 0x82f5cf,
      dashSize: 0.75,
      gapSize: 0.45,
      transparent: true,
      opacity: 0.72,
      depthWrite: false
    })
  );
  ring.computeLineDistances();
  scene.add(ring);
}
for (const island of islandCenters) addSafeZoneRing(island.x, island.z);
function navigableWater(x, z, margin = 2.5) {
  if (!insideLake(x, z, margin)) return false;
  return islandCenters.every((c) => islandClearance(x, z, c.x, c.z) >= margin);
}

// Floating sea mines populate the route ahead and take 10% of hull life on impact.
const mineNodes = [];
const mineCoreMat = new THREE.MeshStandardMaterial({
  color: 0x263b43,
  metalness: 0.78,
  roughness: 0.34,
  emissive: 0x0b1718
});
const mineSpikeMat = new THREE.MeshStandardMaterial({
  color: 0x59676a,
  metalness: 0.72,
  roughness: 0.38
});
const mineTipMat = new THREE.MeshStandardMaterial({
  color: 0xea6538,
  metalness: 0.3,
  roughness: 0.35,
  emissive: 0x7a1e0b,
  emissiveIntensity: 0.65
});
function makeMine() {
  const group = new THREE.Group();
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.31, 14, 10), mineCoreMat);
  core.castShadow = true;
  group.add(core);
  const tipGeo = new THREE.ConeGeometry(0.075, 0.34, 7),
    axis = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2,
      y = i % 2 ? -0.35 : 0.35,
      flat = Math.sqrt(1 - y * y);
    const dir = new THREE.Vector3(Math.cos(a) * flat, y, Math.sin(a) * flat).normalize();
    const spike = new THREE.Mesh(tipGeo, i % 2 ? mineSpikeMat : mineTipMat);
    spike.position.copy(dir).multiplyScalar(0.34);
    spike.quaternion.setFromUnitVectors(axis, dir);
    spike.castShadow = true;
    group.add(spike);
  }
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.39, 0.025, 5, 28),
    new THREE.MeshStandardMaterial({
      color: 0xe78750,
      metalness: 0.35,
      roughness: 0.42,
      emissive: 0x48150a,
      emissiveIntensity: 0.45
    })
  );
  ring.rotation.x = Math.PI / 2;
  group.add(ring);
  const warningRing = new THREE.Mesh(
    new THREE.TorusGeometry(3.5, 0.045, 4, 48),
    new THREE.MeshBasicMaterial({
      color: 0xff6259,
      transparent: true,
      opacity: 0.35,
      depthWrite: false
    })
  );
  warningRing.rotation.x = Math.PI / 2;
  warningRing.position.y = -0.045;
  warningRing.visible = false;
  group.add(warningRing);
  scene.add(group);
  return {
    group,
    warningRing,
    phase: rand(0, Math.PI * 2),
    respawnAt: 0,
    vx: 0,
    vz: 0,
    nextTurn: 0
  };
}
function placeMine(mine) {
  const hx = -Math.cos(ship.rotation.y),
    hz = Math.sin(ship.rotation.y),
    sideX = -hz,
    sideZ = hx;
  for (let tries = 0; tries < 90; tries++) {
    let x, z;
    if (Math.random() < 0.78) {
      const ahead = rand(13, 43),
        side = rand(-30, 30);
      x = ship.position.x + hx * ahead + sideX * side;
      z = ship.position.z + hz * ahead + sideZ * side;
    } else {
      const a = rand(0, Math.PI * 2),
        r = rand(8, 55);
      x = r * Math.cos(a);
      z = r * Math.sin(a);
    }
    if (
      navigableWater(x, z, 2.4) &&
      !isIslandSafeZone(x, z, 0.6) &&
      Math.hypot(x - ship.position.x, z - ship.position.z) > 7
    ) {
      mine.group.position.set(x, -0.035, z);
      mine.group.visible = true;
      mine.phase = rand(0, Math.PI * 2);
      mine.respawnAt = 0;
      const drift = rand(0.18, 0.52),
        direction = rand(0, Math.PI * 2);
      mine.vx = Math.cos(direction) * drift;
      mine.vz = Math.sin(direction) * drift;
      mine.nextTurn = gameTime + rand(2, 5);
      return;
    }
  }
  mine.group.position.set(ship.position.x + hx * 20, -0.035, ship.position.z + hz * 20);
  mine.group.visible =
    navigableWater(mine.group.position.x, mine.group.position.z, 2.4) &&
    !isIslandSafeZone(mine.group.position.x, mine.group.position.z, 0.6);
  mine.respawnAt = mine.group.visible ? 0 : gameTime + 2;
  mine.vx = hx * 0.25;
  mine.vz = hz * 0.25;
  mine.nextTurn = gameTime + rand(2, 5);
}
let gameTime = 0;
const towerShotMeshes = [];
const flakBursts = [];
function showFlakBurst(position) {
  const group = new THREE.Group();
  group.position.copy(position);
  scene.add(group);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.42, 0.075, 6, 20),
    new THREE.MeshBasicMaterial({
      color: 0xffe6a4,
      transparent: true,
      opacity: 0.9,
      depthWrite: false
    })
  );
  group.add(ring);
  const flash = new THREE.Mesh(
    new THREE.SphereGeometry(0.25, 8, 6),
    new THREE.MeshBasicMaterial({
      color: 0xb8fff2,
      transparent: true,
      opacity: 0.95,
      depthWrite: false
    })
  );
  group.add(flash);
  flakBursts.push({ group, ring, flash, age: 0, life: 0.55 });
}
const towerMetal = new THREE.MeshStandardMaterial({
  color: 0x51636a,
  metalness: 0.58,
  roughness: 0.48
});
const towerBaseMat = new THREE.MeshStandardMaterial({ color: 0x756b58, roughness: 0.88 });
function makeBattery(x, y, z) {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  scene.add(group);
  const footing = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.74, 0.3, 10), towerBaseMat);
  footing.position.y = 0.15;
  group.add(footing);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.43, 1.3, 9), towerMetal);
  shaft.position.y = 0.9;
  shaft.castShadow = true;
  group.add(shaft);
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.38, 0.23, 10), towerMetal);
  crown.position.y = 1.66;
  group.add(crown);
  const turret = new THREE.Group();
  turret.position.y = 1.78;
  group.add(turret);
  const housing = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.36, 0.52), towerMetal);
  housing.position.y = 0.17;
  turret.add(housing);
  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.075, 0.095, 1.08, 8),
    new THREE.MeshStandardMaterial({ color: 0x273940, metalness: 0.65, roughness: 0.4 })
  );
  barrel.rotation.z = Math.PI / 2;
  barrel.position.set(0.57, 0.18, 0);
  turret.add(barrel);
  const optic = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 9, 7),
    new THREE.MeshBasicMaterial({ color: 0x8ff4df })
  );
  optic.position.set(0.05, 0.42, 0.18);
  turret.add(optic);
  return { group, turret, cooldown: rand(0.3, 2.2), phase: rand(0, Math.PI * 2) };
}
const BATTERY_LOCAL_RADIUS = 4.6;
const batteryAngles = [-2.5, -0.35, 1.75];
const batterySites = islandCenters.flatMap((island) =>
  batteryAngles.map((a) => ({
    x: island.x + Math.cos(a) * BATTERY_LOCAL_RADIUS * VOLCANO_SCALE,
    y: landHeight(BATTERY_LOCAL_RADIUS, a) * VOLCANO_SCALE,
    z: island.z + Math.sin(a) * BATTERY_LOCAL_RADIUS * VOLCANO_SCALE
  }))
);
const defenseBatteries = batterySites.map((s) => makeBattery(s.x, s.y, s.z));
const splashObjects = [];
function waterSplash(position, power = 1) {
  const group = new THREE.Group();
  group.position.set(position.x, -0.055, position.z);
  scene.add(group);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.18, 0.045, 5, 20),
    new THREE.MeshBasicMaterial({
      color: 0xa7efff,
      transparent: true,
      opacity: 0.9,
      depthWrite: false
    })
  );
  ring.rotation.x = Math.PI / 2;
  group.add(ring);
  const drops = [];
  const geo = new THREE.SphereGeometry(0.09, 7, 5);
  for (let i = 0; i < 7; i++) {
    const drop = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({
        color: i % 2 ? 0x68bdd0 : 0xe0fbff,
        transparent: true,
        opacity: 0.9,
        depthWrite: false
      })
    );
    drop.position.set(rand(-0.25, 0.25), rand(0.08, 0.35), rand(-0.25, 0.25));
    group.add(drop);
    drops.push({
      mesh: drop,
      velocity: new THREE.Vector3(rand(-2, 2) * power, rand(2, 4.4) * power, rand(-2, 2) * power)
    });
  }
  splashObjects.push({ group, ring, drops, age: 0, life: 0.82 });
}
for (let i = 0; i < 16; i++) {
  const mine = makeMine();
  mineNodes.push(mine);
  placeMine(mine);
}
let shipLife = 100,
  shipLifeMax = 100;
const upgradeLevels = { engine: 0, steering: 0, hull: 0 };
let missionEnded = false,
  missionWon = false,
  hitShake = 0,
  sinking = false,
  sinkElapsed = 0;
const lifeValue = $('#shipLife'),
  lifeFill = $('#lifeFill'),
  lifeState = $('#lifeState'),
  hitFlash = $('#hitFlash');
function refreshLifeHud() {
  const percent = Math.max(0, Math.min(100, Math.ceil((shipLife / shipLifeMax) * 100)));
  lifeValue.textContent = `${percent}%`;
  lifeFill.style.width = `${percent}%`;
  lifeFill.style.background = percent <= 30 ? '#ff5c51' : percent <= 60 ? '#ffb24a' : '#65d7bb';
  lifeState.textContent = shipLife === 0 ? 'SUNK' : 'LIFE';
}
// Every source of damage is a share of maximum hull life, so upgrading the hull
// scales all three threats together instead of quietly weakening carrier fire.
const HULL_DAMAGE = { mine: 0.1, shell: 0.1, jet: 0.01 };
const CARGO_DAMAGE = { mine: 24, shell: 16, jet: 1 };
function damageShip(source, mine = null) {
  if (isIslandSafeZone(ship.position.x, ship.position.z)) return;
  const damage = shipLifeMax * HULL_DAMAGE[source];
  shipLife = Math.max(0, shipLife - damage);
  if (damage >= 5) boatVelocity *= 0.2;
  if (!reduceMotion) hitShake = Math.min(1, hitShake + (damage >= 5 ? 0.52 : 0.08));
  refreshLifeHud();
  waterSplash(ship.position.clone(), mine ? 0.55 : damage >= 5 ? 1.15 : 0.35);
  if (mine) {
    mine.group.visible = false;
    mine.respawnAt = gameTime + 7;
  }
  hitFlash.classList.remove('active');
  void hitFlash.offsetWidth;
  hitFlash.classList.add('active');
  setTimeout(() => hitFlash.classList.remove('active'), 260);
  if (shipLife === 0 && !missionEnded) {
    boatVelocity = 0;
    missionEnded = true;
    missionWon = false;
    sinking = true;
    sinkElapsed = 0;
    boatKeys.clear();
    refreshMissionHud();
    showMissionToast('HULL BREACHED · SINKING');
  } else if (cargoOnboard && !missionEnded) {
    cargoCondition = Math.max(0, cargoCondition - CARGO_DAMAGE[source]);
    if (cargoCondition === 0) failMission('CARGO DESTROYED · RUN FAILED');
    else refreshMissionHud();
  }
}

// Two stylized U.S. Navy carriers patrol the lake and fire when the boat closes in.
const carrierHullMat = new THREE.MeshStandardMaterial({
  color: 0x344653,
  metalness: 0.48,
  roughness: 0.62
});
const flightDeckMat = new THREE.MeshStandardMaterial({
  color: 0x68777d,
  metalness: 0.24,
  roughness: 0.76
});
const carrierMarkMat = new THREE.MeshBasicMaterial({ color: 0xe5e7dc });
const carrierWindowMat = new THREE.MeshBasicMaterial({ color: 0x9ac5d1 });
const gunMat = new THREE.MeshStandardMaterial({ color: 0x26353d, metalness: 0.7, roughness: 0.4 });
function carrierPrism(plan, bottom, top, lowerScale = 0.76) {
  const positions = [],
    indices = [];
  for (const [x, z] of plan) positions.push(x * lowerScale, bottom, z * lowerScale);
  for (const [x, z] of plan) positions.push(x, top, z);
  const n = plan.length;
  for (let i = 0; i < n; i++) {
    const next = (i + 1) % n;
    indices.push(i, next, i + n, next, next + n, i + n);
  }
  const bottomCenter = positions.length / 3;
  positions.push(0, bottom, 0);
  const topCenter = positions.length / 3;
  positions.push(0, top, 0);
  for (let i = 0; i < n; i++) {
    const next = (i + 1) % n;
    indices.push(bottomCenter, next, i, topCenter, i + n, next + n);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}
function carrierHullGeometry() {
  return carrierPrism(
    [
      [-10.8, 0],
      [-8.8, -1.95],
      [6.8, -2.35],
      [9.8, -1.5],
      [10.7, 0],
      [9.8, 1.5],
      [6.8, 2.35],
      [-8.8, 1.95]
    ],
    -0.28,
    0.62,
    0.72
  );
}
function jetPlate(points, thickness, material, parent) {
  const positions = [],
    indices = [],
    n = points.length;
  for (const [x, z] of points) positions.push(x, thickness / 2, z);
  for (const [x, z] of points) positions.push(x, -thickness / 2, z);
  const topCenter = positions.length / 3;
  positions.push(
    points.reduce((s, p) => s + p[0], 0) / n,
    thickness / 2,
    points.reduce((s, p) => s + p[1], 0) / n
  );
  const bottomCenter = positions.length / 3;
  positions.push(
    points.reduce((s, p) => s + p[0], 0) / n,
    -thickness / 2,
    points.reduce((s, p) => s + p[1], 0) / n
  );
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    indices.push(topCenter, i, j, bottomCenter, j + n, i + n, i, j, i + n, j, j + n, i + n);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
function addCarrierJet(parent, x, z, heading = Math.PI) {
  const jet = new THREE.Group();
  jet.position.set(x, 1.43, z);
  jet.rotation.y = heading;
  const jetMat = new THREE.MeshStandardMaterial({
    color: 0xd1d6d2,
    metalness: 0.38,
    roughness: 0.47,
    side: THREE.DoubleSide
  });
  const darkJetMat = new THREE.MeshStandardMaterial({
    color: 0x3b515d,
    metalness: 0.3,
    roughness: 0.5
  });
  const markings = new THREE.MeshStandardMaterial({
    color: 0x5e8d9b,
    metalness: 0.18,
    roughness: 0.58
  });
  const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.17, 1.38, 10), jetMat);
  fuselage.rotation.z = Math.PI / 2;
  fuselage.position.x = 0.04;
  fuselage.castShadow = true;
  jet.add(fuselage);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.48, 10), jetMat);
  nose.rotation.z = Math.PI / 2;
  nose.position.x = -0.91;
  nose.castShadow = true;
  jet.add(nose);
  const tailCone = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.26, 9), darkJetMat);
  tailCone.rotation.z = -Math.PI / 2;
  tailCone.position.x = 0.86;
  jet.add(tailCone);
  jetPlate(
    [
      [-0.34, 0.12],
      [0.16, 0.94],
      [0.63, 0.96],
      [0.32, 0.12]
    ],
    0.075,
    jetMat,
    jet
  );
  jetPlate(
    [
      [-0.34, -0.12],
      [0.16, -0.94],
      [0.63, -0.96],
      [0.32, -0.12]
    ],
    0.075,
    jetMat,
    jet
  );
  jetPlate(
    [
      [0.46, 0.1],
      [0.7, 0.47],
      [0.99, 0.49],
      [0.82, 0.1]
    ],
    0.06,
    jetMat,
    jet
  );
  jetPlate(
    [
      [0.46, -0.1],
      [0.7, -0.47],
      [0.99, -0.49],
      [0.82, -0.1]
    ],
    0.06,
    jetMat,
    jet
  );
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.38, 0.075), jetMat);
  fin.position.set(0.61, 0.19, 0);
  fin.rotation.z = -0.22;
  jet.add(fin);
  for (const side of [-1, 1]) {
    const stabilizer = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.32, 0.055), jetMat);
    stabilizer.position.set(0.72, 0.24, side * 0.15);
    stabilizer.rotation.x = side * 0.3;
    stabilizer.rotation.z = -0.34;
    jet.add(stabilizer);
  }
  const canopy = new THREE.Mesh(
    new THREE.SphereGeometry(1, 14, 10),
    new THREE.MeshPhysicalMaterial({
      color: 0x4d7f8e,
      metalness: 0.48,
      roughness: 0.19,
      clearcoat: 0.7
    })
  );
  canopy.scale.set(0.34, 0.135, 0.115);
  canopy.position.set(-0.22, 0.145, 0);
  jet.add(canopy);
  const cockpitRim = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.035, 0.29), darkJetMat);
  cockpitRim.position.set(-0.19, 0.14, 0);
  jet.add(cockpitRim);
  for (const side of [-1, 1]) {
    const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.09, 0.11), darkJetMat);
    pylon.position.set(0.19, -0.055, side * 0.58);
    jet.add(pylon);
    const store = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.58, 8), darkJetMat);
    store.rotation.z = Math.PI / 2;
    store.position.set(0.23, -0.16, side * 0.62);
    jet.add(store);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.018, 0.075), markings);
    stripe.position.set(0.24, 0.044, side * 0.48);
    jet.add(stripe);
  }
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.2, 9), darkJetMat);
  nozzle.rotation.z = Math.PI / 2;
  nozzle.position.x = 0.81;
  jet.add(nozzle);
  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(0.11, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xffa05a })
  );
  glow.position.x = 0.94;
  glow.scale.set(0.55, 0.7, 0.7);
  jet.add(glow);
  parent.add(jet);
  return jet;
}
const carrierPatrols = [
  [
    [-91, 29],
    [-73, -13],
    [-39, -39],
    [-5, -47],
    [25, -42],
    [36, -9],
    [27, 28],
    [-18, 44],
    [-61, 36]
  ],
  [
    [27, 37],
    [56, 6],
    [93, 12],
    [108, 38],
    [97, 70],
    [76, 87],
    [44, 62]
  ]
];
function makeCarrier(index, waypoints) {
  const group = new THREE.Group();
  group.position.set(waypoints[0][0], 0, waypoints[0][1]);
  group.rotation.y = Math.atan2(
    waypoints[1][1] - waypoints[0][1],
    waypoints[0][0] - waypoints[1][0]
  );
  scene.add(group);
  const hull = new THREE.Mesh(
    carrierHullGeometry(),
    new THREE.MeshStandardMaterial({
      color: 0x344653,
      metalness: 0.48,
      roughness: 0.62,
      side: THREE.DoubleSide
    })
  );
  hull.castShadow = true;
  hull.receiveShadow = true;
  group.add(hull);
  const deckPlan = [
    [-11, 0],
    [-9, -3.2],
    [5.4, -3.55],
    [10.6, -2.45],
    [10.6, 3.35],
    [-7.6, 3.35],
    [-10, 2.55]
  ];
  const deck = new THREE.Mesh(
    carrierPrism(deckPlan, 0.82, 1.18, 0.98),
    new THREE.MeshStandardMaterial({
      color: 0x606e73,
      metalness: 0.2,
      roughness: 0.74,
      side: THREE.DoubleSide
    })
  );
  deck.castShadow = true;
  deck.receiveShadow = true;
  group.add(deck);
  const deckTop = 1.2;
  const landingRunway = new THREE.Group();
  landingRunway.position.set(-0.35, deckTop, 0.82);
  landingRunway.rotation.y = -0.25;
  group.add(landingRunway);
  const runwayBed = new THREE.Mesh(
    new THREE.BoxGeometry(14.7, 0.035, 1.55),
    new THREE.MeshStandardMaterial({ color: 0x48565b, roughness: 0.94 })
  );
  landingRunway.add(runwayBed);
  const runwayLine = new THREE.Mesh(new THREE.BoxGeometry(13.8, 0.025, 0.045), carrierMarkMat);
  runwayLine.position.y = 0.022;
  landingRunway.add(runwayLine);
  for (const edgeSide of [-1, 1]) {
    const boundary = new THREE.Mesh(new THREE.BoxGeometry(14.1, 0.022, 0.035), carrierMarkMat);
    boundary.position.set(0, 0.022, edgeSide * 0.66);
    landingRunway.add(boundary);
  }
  for (let i = 0; i < 6; i++) {
    const dash = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.026, 0.055), carrierMarkMat);
    dash.position.set(-5.6 + i * 2.05, 0.026, 0);
    landingRunway.add(dash);
  }
  for (const liftX of [-7.1, -4.4]) {
    const elevator = new THREE.Mesh(
      new THREE.BoxGeometry(2, 0.035, 1.5),
      new THREE.MeshStandardMaterial({ color: 0x535f63, metalness: 0.14, roughness: 0.88 })
    );
    elevator.position.set(liftX, deckTop + 0.025, 2.38);
    group.add(elevator);
    for (const side of [-1, 1]) {
      const marking = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.02, 0.025), carrierMarkMat);
      marking.position.set(liftX, deckTop + 0.05, 2.38 + side * 0.69);
      group.add(marking);
    }
  }
  for (const side of [-1, 1]) {
    const edge = new THREE.Mesh(new THREE.BoxGeometry(17, 0.025, 0.045), carrierMarkMat);
    edge.position.set(-0.4, deckTop, side * 3.08);
    group.add(edge);
  }
  for (const catapultZ of [-2.45, 2.45]) {
    const catapult = new THREE.Mesh(new THREE.BoxGeometry(6, 0.028, 0.055), carrierMarkMat);
    catapult.position.set(-7.35, deckTop, catapultZ);
    group.add(catapult);
  }
  const landingLine = new THREE.Mesh(new THREE.BoxGeometry(13, 0.028, 0.11), carrierMarkMat);
  landingLine.position.set(2.3, deckTop, 0.3);
  landingLine.rotation.y = 0.22;
  group.add(landingLine);
  for (let i = 0; i < 5; i++) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.026, 4.8), carrierMarkMat);
    stripe.position.set(1.7 + i * 0.47, deckTop, 0.4);
    stripe.rotation.y = -0.22;
    group.add(stripe);
  }
  for (let i = 0; i < 5; i++) {
    const hatch = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.018, 4, 12), carrierMarkMat);
    hatch.rotation.x = Math.PI / 2;
    hatch.position.set(-8 + i * 0.7, deckTop + 0.025, 2.35);
    group.add(hatch);
  }
  const islandBasePlan = [
    [-1.22, -0.65],
    [-0.98, -0.88],
    [0.98, -0.88],
    [1.22, -0.65],
    [1.22, 0.65],
    [0.98, 0.88],
    [-0.98, 0.88],
    [-1.22, 0.65]
  ];
  const islandBase = new THREE.Mesh(carrierPrism(islandBasePlan, 1.19, 1.94, 0.88), carrierHullMat);
  islandBase.position.set(5.7, 0, -1.75);
  group.add(islandBase);
  const bridgePlan = [
    [-0.76, -0.48],
    [-0.56, -0.68],
    [0.56, -0.68],
    [0.76, -0.48],
    [0.76, 0.48],
    [0.56, 0.68],
    [-0.56, 0.68],
    [-0.76, 0.48]
  ];
  const bridge = new THREE.Mesh(
    carrierPrism(bridgePlan, 1.9, 2.68, 0.82),
    new THREE.MeshStandardMaterial({ color: 0x536970, metalness: 0.2, roughness: 0.52 })
  );
  bridge.position.set(5.8, 0, -1.75);
  group.add(bridge);
  for (const side of [-1, 1]) {
    const win = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.17, 0.025), carrierWindowMat);
    win.position.set(5.8, 2.42, -1.75 + side * 0.56);
    group.add(win);
    const frontWin = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.16, 0.92), carrierWindowMat);
    frontWin.position.set(5.8 + side * 0.62, 2.42, -1.75);
    group.add(frontWin);
  }
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.08, 1.65, 7), gunMat);
  mast.position.set(6.25, 3.55, -1.75);
  group.add(mast);
  const radar = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.035, 5, 18), carrierMarkMat);
  radar.position.set(6.25, 4.25, -1.75);
  group.add(radar);
  const aftRadar = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.025, 5, 16), carrierMarkMat);
  aftRadar.position.set(4.9, 3.05, -2.2);
  group.add(aftRadar);
  addCarrierJet(group, -7, -1.55);
  addCarrierJet(group, -7, 1.35);
  addCarrierJet(group, -4, -1.55);
  addCarrierJet(group, -4, 1.35);
  addCarrierJet(group, -1, -1.55);
  addCarrierJet(group, -1, 1.35);
  addCarrierJet(group, 2, 1.65);
  const turrets = [];
  for (const [tx, tz] of [
    [-6, -2.75],
    [-6, 2.75],
    [7, 2.65]
  ]) {
    const turret = new THREE.Group();
    turret.position.set(tx, deckTop, tz);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.42, 0.24, 10), gunMat);
    base.position.y = 0.14;
    turret.add(base);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(1.22, 0.12, 0.16), gunMat);
    barrel.position.set(-0.55, 0.3, 0);
    turret.add(barrel);
    const barrel2 = barrel.clone();
    barrel2.position.z = 0.2;
    turret.add(barrel2);
    group.add(turret);
    turrets.push(turret);
  }
  // A soft twin wake makes the long hull feel weighty as it patrols.
  const wakeMat = new THREE.MeshBasicMaterial({
    color: 0x9ed8e1,
    transparent: true,
    opacity: 0.28,
    depthWrite: false
  });
  for (const side of [-1, 1]) {
    const wake = new THREE.Mesh(new THREE.BoxGeometry(7, 0.022, 0.12), wakeMat);
    wake.position.set(-14, -0.065, side * 1.12);
    group.add(wake);
  }
  const wakeCore = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.024, 0.2), wakeMat.clone());
  wakeCore.position.set(-13.4, -0.063, 0);
  group.add(wakeCore);
  const name = index === 1 ? 'USS ABRAHAM LINCOLN' : 'USS NIMITZ';
  const hullNumber = index === 1 ? 'CVN-72' : 'CVN-68';
  const tag = document.createElement('div');
  tag.className = 'carrier-tag';
  tag.textContent = `${name} · ${hullNumber}`;
  document.body.appendChild(tag);
  const escortJets = [0, 1].map((_, i) => {
    const jet = addCarrierJet(scene, 0, 0);
    jet.scale.setScalar(2.25);
    return { jet, phase: i * Math.PI, cooldown: rand(0.2, 1.1), burstRemaining: 0 };
  });
  return {
    group,
    turrets,
    tag,
    index,
    name,
    hullNumber,
    escortJets,
    patrolPath: waypoints.map(([px, pz]) => new THREE.Vector2(px, pz)),
    waypoint: 1,
    patrolSpeed: index === 1 ? 1.85 : 2.05,
    mode: 'patrol',
    pursuit: 0,
    returnIndex: 0,
    cooldown: rand(0.5, 2.2),
    shotIndex: 0,
    nextFlareAt: gameTime + 40,
    engageCooldown: 0
  };
}
const carriers = carrierPatrols.map((path, i) => makeCarrier(i + 1, path));
function placeShipAtStart() {
  const startSite = dockById[missionContracts[0]?.from || 'ember'],
    nextSite = dockById[missionContracts[0]?.to || 'cinder'];
  const dx = nextSite.x - startSite.x,
    dz = nextSite.z - startSite.z;
  ship.position.set(startSite.x, -0.025, startSite.z);
  ship.rotation.y = Math.atan2(dz, -dx);
  for (const mine of mineNodes) placeMine(mine);
}

const cargoTemplates = [
  { from: 'ember', to: 'cinder', cargo: 'Lava pump seals', reward: 1200 },
  { from: 'cinder', to: 'ember', cargo: 'Crater samples', reward: 1650 },
  { from: 'ember', to: 'cinder', cargo: 'Obsidian glass', reward: 1800 },
  { from: 'cinder', to: 'ember', cargo: 'Emergency provisions', reward: 1900 },
  { from: 'ember', to: 'cinder', cargo: 'Volcanic cores', reward: 2200 },
  { from: 'cinder', to: 'ember', cargo: 'Survey equipment', reward: 2700 }
];
let missionContracts = [],
  contractIndex = 0,
  missionPhase = 'load',
  cargoOnboard = null,
  dockHold = 0,
  contractTimer = 0,
  cargoCondition = 100;
function activeDock() {
  const job = missionContracts[Math.min(contractIndex, missionContracts.length - 1)];
  return dockById[missionPhase === 'load' ? job.from : job.to];
}
function refreshMissionHud() {
  const hud = $('#missionHud'),
    label = $('#missionText'),
    sub = $('#missionSub');
  $('#shopOpen').disabled = missionEnded || sinking;
  hud.classList.toggle('complete', missionWon);
  hud.classList.toggle('failed', missionEnded && !missionWon);
  if (missionWon) {
    label.textContent = 'CONTRACT RUN COMPLETE';
    sub.textContent = 'All six cargo deliveries made · $5,000 bonus';
    return;
  }
  if (missionEnded) {
    label.textContent = sinking ? 'VESSEL SINKING' : 'VESSEL LOST · RUN FAILED';
    sub.textContent = sinking
      ? `${Math.ceil(10 - sinkElapsed)}s until restart`
      : 'Restart and try the island run again';
    return;
  }
  const job = missionContracts[contractIndex],
    dock = activeDock();
  for (const site of docks) {
    site.marker.material.color.set(site === dock ? 0xffd879 : 0xffa05f);
    site.marker.material.opacity = site === dock ? 0.88 : 0.62;
  }
  label.textContent = `DELIVERY ${contractIndex + 1} / ${missionContracts.length} · ${missionPhase === 'load' ? 'LOAD' : 'DISCHARGE'} ${job.cargo.toUpperCase()}`;
  sub.textContent =
    missionPhase === 'load'
      ? `${dock.name} → ${dockById[job.to].name} · $${job.reward.toLocaleString('en-US')} · stop within 3.5m and hold E`
      : `${dockById[job.from].name} → ${dock.name} · ${Math.ceil(contractTimer)}s LEFT · CARGO ${cargoCondition}%`;
}
function showMissionToast(message) {
  const toast = $('#missionToast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showMissionToast.timer);
  showMissionToast.timer = setTimeout(() => toast.classList.remove('show'), 2300);
}
function failMission(message) {
  missionEnded = true;
  missionWon = false;
  boatVelocity = 0;
  setPaused(true);
  refreshMissionHud();
  showMissionToast(message);
}
function resetMissionRoute() {
  missionEnded = false;
  missionWon = false;
  contractIndex = 0;
  missionPhase = 'load';
  cargoOnboard = null;
  dockHold = 0;
  contractTimer = 0;
  cargoCondition = 100;
  shipCargoCrates.visible = false;
  const reverse = Math.random() < 0.5;
  missionContracts = reverse
    ? cargoTemplates.map((job) => ({
        from: job.to,
        to: job.from,
        cargo: job.cargo,
        reward: job.reward
      }))
    : cargoTemplates.map((job) => ({ ...job }));
  refreshMissionHud();
}
function finishMission() {
  missionEnded = true;
  missionWon = true;
  money += 5000;
  updateUpgradeHud();
  setPaused(true);
  refreshMissionHud();
  showMissionToast('ALL SIX DELIVERIES COMPLETE · +$5,000');
}
function completeDockAction() {
  const job = missionContracts[contractIndex],
    dock = activeDock();
  dockHold = 0;
  if (missionPhase === 'load') {
    cargoOnboard = job.cargo;
    missionPhase = 'deliver';
    cargoCondition = 100;
    contractTimer = Math.ceil(
      Math.hypot(dockById[job.to].x - dock.x, dockById[job.to].z - dock.z) / 3.9 + 38
    );
    shipCargoCrates.visible = true;
    showMissionToast(`CARGO LOADED · ${job.cargo.toUpperCase()}`);
  } else {
    const payout = Math.round(job.reward * (0.4 + (0.6 * cargoCondition) / 100));
    money += payout;
    updateUpgradeHud();
    cargoOnboard = null;
    shipCargoCrates.visible = false;
    contractTimer = 0;
    showMissionToast(`DELIVERED AT ${dock.name} · +$${payout.toLocaleString('en-US')}`);
    contractIndex++;
    if (contractIndex >= missionContracts.length) {
      finishMission();
      return;
    }
    missionPhase = 'load';
  }
  refreshMissionHud();
}
resetMissionRoute();
placeShipAtStart();
const carrierShots = [];
const jetShots = [];
const shotGeo = new THREE.SphereGeometry(0.2, 8, 7);
const shotMat = new THREE.MeshBasicMaterial({ color: 0xffc65d });
const shotTrailMat = new THREE.LineBasicMaterial({
  color: 0xff7141,
  transparent: true,
  opacity: 0.9
});
const jetShotGeo = new THREE.SphereGeometry(0.12, 8, 7);
const jetShotMat = new THREE.MeshBasicMaterial({ color: 0xffe4a6 });
const jetTrailMat = new THREE.LineBasicMaterial({
  color: 0xffd27b,
  transparent: true,
  opacity: 0.95
});
// Trails are two-point lines. Reusing one small buffer per trail keeps the
// render loop from allocating (and disposing) a geometry for every shot, flare
// and frame; frustumCulled is off because the cached bounds never get recomputed.
function setTrail(line, from, to) {
  const position = line.geometry.getAttribute('position');
  position.setXYZ(0, from.x, from.y, from.z);
  position.setXYZ(1, to.x, to.y, to.z);
  position.needsUpdate = true;
}
function makeTrail(from, material) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const line = new THREE.Line(geometry, material);
  line.frustumCulled = false;
  scene.add(line);
  setTrail(line, from, from);
  return line;
}
const scratchA = new THREE.Vector3();
// World-space labels project through one shared vector; every caller reads the
// result (and its .z depth test) before the next projection happens.
const tagProjection = new THREE.Vector3();
function projectTag(source, height) {
  return tagProjection.set(source.x, source.y + height, source.z).project(camera);
}

function fireCarrierShot(carrier, turret) {
  carrier.group.updateMatrixWorld(true);
  const start = turret.localToWorld(new THREE.Vector3(-1.1, 0.32, 0));
  const target = ship.position.clone().add(new THREE.Vector3(0, 0.24, 0));
  const mesh = new THREE.Mesh(shotGeo, shotMat);
  mesh.position.copy(start);
  scene.add(mesh);
  const trail = makeTrail(start, shotTrailMat.clone());
  carrierShots.push({
    mesh,
    trail,
    start: start.clone(),
    target,
    duration: Math.max(0.3, start.distanceTo(target) / 85),
    age: 0
  });
}
function fireJetShot(escort) {
  const jet = escort.jet;
  const start = jet.position
    .clone()
    .add(new THREE.Vector3(-Math.cos(jet.rotation.y) * 1.6, -0.05, Math.sin(jet.rotation.y) * 1.6));
  const target = ship.position.clone().add(new THREE.Vector3(0, 0.18, 0));
  const mesh = new THREE.Mesh(jetShotGeo, jetShotMat);
  mesh.position.copy(start);
  scene.add(mesh);
  const trail = makeTrail(start, jetTrailMat.clone());
  jetShots.push({
    mesh,
    trail,
    start,
    target,
    duration: Math.max(0.3, start.distanceTo(target) / 60),
    age: 0
  });
}

// Collectible cash and med kits float for 30 seconds, then respawn elsewhere.
const pickups = [],
  moneyTotal = $('#moneyTotal');
let money = 0,
  pickupSpawnTimer = 0;
const upgradePrices = {
  engine: [1500, 2500, 4000],
  steering: [1000, 2000, 3500],
  hull: [1500, 2500, 4000]
};
function updateCashHud() {
  moneyTotal.textContent = `$${money.toLocaleString('en-US')}`;
  $('#shopCash').textContent = `$${money.toLocaleString('en-US')}`;
}
function updateUpgradeHud() {
  for (const kind of ['engine', 'steering', 'hull']) {
    const level = upgradeLevels[kind],
      cost = upgradePrices[kind][level],
      button = document.querySelector(`[data-upgrade="${kind}"]`);
    const detail = {
      engine: 'Faster acceleration and top speed',
      steering: 'Tighter turns at speed',
      hull: 'More hull capacity'
    }[kind];
    $(`#${kind}Level`).textContent = `LEVEL ${level} / 3 · ${level >= 3 ? 'MAXED' : detail}`;
    $(`#${kind}Cost`).textContent = level >= 3 ? 'MAX' : `$${cost.toLocaleString('en-US')}`;
    button.disabled = level >= 3 || money < cost;
  }
  updateCashHud();
}
const giftGold = new THREE.MeshStandardMaterial({
  color: 0xf5bd4f,
  metalness: 0.62,
  roughness: 0.3,
  emissive: 0x613f09,
  emissiveIntensity: 0.2
});
const giftGreen = new THREE.MeshStandardMaterial({
  color: 0x66bf91,
  metalness: 0.22,
  roughness: 0.46,
  emissive: 0x124729,
  emissiveIntensity: 0.2
});
const giftWhite = new THREE.MeshStandardMaterial({ color: 0xf4ead7, roughness: 0.6 });
const giftRed = new THREE.MeshStandardMaterial({
  color: 0xd94c42,
  roughness: 0.44,
  emissive: 0x48100d,
  emissiveIntensity: 0.2
});
function makePickup() {
  const group = new THREE.Group(),
    cashGroup = new THREE.Group(),
    healthGroup = new THREE.Group();
  const cashBox = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.62, 0.72), giftGold);
  cashBox.castShadow = true;
  cashGroup.add(cashBox);
  const coin = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.065, 7, 18), giftGold);
  coin.position.y = 0.39;
  cashGroup.add(coin);
  const dollarBar = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.34, 0.05), giftGreen);
  dollarBar.position.set(0, 0.39, 0.035);
  cashGroup.add(dollarBar);
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.62, 0.72), giftWhite);
  pack.castShadow = true;
  healthGroup.add(pack);
  const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.48, 0.06), giftRed);
  crossV.position.z = 0.39;
  healthGroup.add(crossV);
  const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.17, 0.06), giftRed);
  crossH.position.z = 0.4;
  healthGroup.add(crossH);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.12, 0.74), giftGreen);
  lid.position.y = 0.34;
  healthGroup.add(lid);
  group.add(cashGroup, healthGroup);
  scene.add(group);
  const tag = document.createElement('div');
  tag.className = 'pickup-tag';
  document.body.appendChild(tag);
  return {
    group,
    cashGroup,
    healthGroup,
    tag,
    available: false,
    type: 'cash',
    expiresAt: 0,
    respawnAt: 0,
    phase: rand(0, Math.PI * 2)
  };
}
function placePickup(pickup, nearCarrier = Math.random() < 0.8, preferredCarrier = null) {
  const hx = -Math.cos(ship.rotation.y),
    hz = Math.sin(ship.rotation.y),
    sideX = -hz,
    sideZ = hx;
  const carrier = preferredCarrier || carriers[Math.floor(rand(0, carriers.length))];
  let x = 0,
    z = 0,
    placed = false;
  for (let tries = 0; tries < 120; tries++) {
    if (nearCarrier) {
      const a = rand(0, Math.PI * 2),
        d = rand(6.5, 12.5);
      x = carrier.group.position.x + Math.cos(a) * d;
      z = carrier.group.position.z + Math.sin(a) * d;
    } else {
      const ahead = rand(9, 34),
        side = rand(-27, 27);
      x = ship.position.x + hx * ahead + sideX * side;
      z = ship.position.z + hz * ahead + sideZ * side;
    }
    if (navigableWater(x, z, 2.5) && Math.hypot(x - ship.position.x, z - ship.position.z) > 6) {
      placed = true;
      break;
    }
  }
  if (!placed) {
    const a = rand(0, Math.PI * 2),
      d = nearCarrier ? 10 : 15,
      anchor = nearCarrier ? carrier.group.position : ship.position;
    x = anchor.x + Math.cos(a) * d;
    z = anchor.z + Math.sin(a) * d;
  }
  pickup.group.position.set(x, -0.02, z);
  pickup.type = Math.random() < 0.5 ? 'cash' : 'health';
  pickup.cashGroup.visible = pickup.type === 'cash';
  pickup.healthGroup.visible = pickup.type === 'health';
  pickup.tag.textContent = pickup.type === 'cash' ? '$500' : 'HEALTH +20';
  pickup.available = true;
  pickup.expiresAt = gameTime + 30;
  pickup.respawnAt = 0;
  pickup.phase = rand(0, Math.PI * 2);
  pickup.group.visible = true;
}
for (let i = 0; i < 6; i++) {
  const pickup = makePickup();
  pickups.push(pickup);
  placePickup(pickup, i < 5, carriers[i % 2]);
}

// Signal flares launch automatically every 40 seconds; they do not damage the boat.
const flares = [],
  flareGeo = new THREE.SphereGeometry(0.23, 9, 8),
  flareMat = new THREE.MeshBasicMaterial({
    color: 0xff7a3e,
    transparent: true,
    opacity: 1,
    depthWrite: false
  });
const flareTrailMat = new THREE.LineBasicMaterial({
  color: 0xff9b4e,
  transparent: true,
  opacity: 0.95
});
function launchFlare(carrier) {
  const start = carrier.group.position
    .clone()
    .add(new THREE.Vector3(rand(-3, 3), 2.5, rand(-2, 2)));
  const mesh = new THREE.Mesh(flareGeo, flareMat);
  mesh.position.copy(start);
  scene.add(mesh);
  const trail = makeTrail(start, flareTrailMat.clone());
  flares.push({
    mesh,
    trail,
    velocity: new THREE.Vector3(rand(-1.4, 1.4), rand(8, 10), rand(-1.4, 1.4)),
    age: 0,
    life: 8
  });
}

const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3f2b24, roughness: 1 });
const leafMats = [0x355b42, 0x3c6948, 0x53774b, 0x3d5541].map(
  (color) => new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true })
);
const coneGeo = new THREE.ConeGeometry(1, 1, 5),
  trunkGeo = new THREE.CylinderGeometry(0.07, 0.11, 1, 5);
for (let i = 0; i < 125; i++) {
  const a = rand(0, Math.PI * 2),
    r = rand(2.55, 4.45),
    x = r * Math.cos(a),
    z = r * Math.sin(a);
  if (
    Math.abs(Math.sin(a - 0.26)) < 0.15 ||
    Math.abs(Math.sin(a - 2.58)) < 0.13 ||
    Math.abs(Math.sin(a - 4.55)) < 0.11
  )
    continue;
  const y = landHeight(r, a),
    s = rand(0.65, 1.25),
    h = rand(0.28, 0.58) * s;
  const trunk = new THREE.Mesh(trunkGeo, trunkMat);
  trunk.scale.set(0.55, h * 0.55, 0.55);
  trunk.position.set(x, y + h * 0.28, z);
  volcano.add(trunk);
  for (let j = 0; j < 2; j++) {
    const crown = new THREE.Mesh(coneGeo, leafMats[Math.floor(rand(0, 4))]);
    crown.scale.set(h * (j ? 0.48 : 0.62), h * (j ? 0.95 : 1.0), h * (j ? 0.48 : 0.62));
    crown.position.set(x, y + h * (j ? 0.98 : 0.68), z);
    crown.castShadow = true;
    volcano.add(crown);
  }
}

secondVolcano = volcano.clone(true);
secondVolcano.position.set(secondVolcanoSite.x, 0, secondVolcanoSite.z);
scene.add(secondVolcano);
const secondFireLight = fireLight.clone();
secondFireLight.position.set(secondVolcanoSite.x, CRATER_TOP_Y + 0.45, secondVolcanoSite.z);
scene.add(secondFireLight);
for (const original of [foam, outerFoamLine]) {
  const copy = original.clone();
  copy.position.set(secondVolcanoSite.x, 0, secondVolcanoSite.z);
  scene.add(copy);
}
// Low clouds drift across both islands in permanent daylight.
const cloudMat = new THREE.MeshBasicMaterial({
  color: 0xe9f0ec,
  transparent: true,
  opacity: 0.15,
  depthWrite: false
});
const clouds = [];
for (let c = 0; c < 9; c++) {
  const group = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 9, 7), cloudMat);
    ball.scale.set(rand(1.1, 2.4), rand(0.22, 0.5), rand(0.5, 1.1));
    ball.position.set(i * 1.25, rand(-0.1, 0.1), rand(-0.25, 0.25));
    group.add(ball);
  }
  group.position.set(rand(-18, 18), rand(6, 11), rand(-17, 11));
  scene.add(group);
  clouds.push(group);
}

const sparks = [],
  smoke = [];
const sparkGeo = new THREE.IcosahedronGeometry(1, 0);
const sparkMats = [0xffd263, 0xff6e24, 0xff350e].map(
  (color) => new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false })
);
const smokeGeo = new THREE.SphereGeometry(1, 7, 6);
const smokeMat = new THREE.MeshLambertMaterial({
  color: 0x4d4650,
  transparent: true,
  opacity: 0.2,
  depthWrite: false
});
function addSpark(force = 1) {
  if (sparks.length > 240) {
    const old = sparks.shift();
    scene.remove(old.mesh);
  }
  const mesh = new THREE.Mesh(sparkGeo, sparkMats[Math.floor(rand(0, 3))].clone());
  const size = rand(0.025, 0.092) * force;
  mesh.scale.setScalar(size);
  const crater = Math.random() < 0.5 ? secondVolcanoSite : null;
  mesh.position.set(
    (crater?.x || 0) + rand(-0.5, 0.5),
    rand(CRATER_TOP_Y - 0.15, CRATER_TOP_Y + 0.25),
    (crater?.z || 0) + rand(-0.5, 0.5)
  );
  scene.add(mesh);
  const angle = rand(0, Math.PI * 2),
    push = rand(0.3, 1.95) * force;
  sparks.push({
    mesh,
    vel: v3(Math.cos(angle) * push, rand(1.8, 3.5) * force, Math.sin(angle) * push),
    life: rand(1.4, 2.4),
    max: 2.4
  });
}
function addSmoke() {
  if (smoke.length > 48) {
    const old = smoke.shift();
    scene.remove(old.mesh);
    old.mesh.material.dispose();
  }
  const mesh = new THREE.Mesh(smokeGeo, smokeMat.clone());
  const crater = Math.random() < 0.5 ? secondVolcanoSite : null;
  mesh.position.set(
    (crater?.x || 0) + rand(-0.27, 0.27),
    CRATER_TOP_Y,
    (crater?.z || 0) + rand(-0.27, 0.27)
  );
  mesh.scale.setScalar(rand(0.24, 0.41));
  scene.add(mesh);
  smoke.push({
    mesh,
    vel: v3(rand(-0.28, 0.28), rand(0.35, 0.62), rand(-0.25, 0.25)),
    life: rand(3.3, 5.2),
    max: 5.2
  });
}
function burst(count = 45) {
  for (let i = 0; i < count; i++) addSpark(rand(0.65, 1.3));
  fireLight.intensity = 37;
  secondFireLight.intensity = 37;
}

const shockwaves = [];
function pulse(x = 0, z = 0, y = LAVA_POOL_Y + 0.19) {
  const mesh = new THREE.Mesh(
    new THREE.RingGeometry(0.3, 0.34, 64),
    new THREE.MeshBasicMaterial({
      color: 0xffa647,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false
    })
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, y, z);
  scene.add(mesh);
  shockwaves.push({ mesh, life: 1 });
}

function resize() {
  const w = canvas.clientWidth,
    h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();
let drag = null;
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  drag = { x: e.clientX, y: e.clientY, moved: false };
  canvas.style.cursor = 'grabbing';
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  let dx = e.clientX - drag.x,
    dy = e.clientY - drag.y;
  if (Math.abs(dx) + Math.abs(dy) > 1) drag.moved = true;
  targetYaw -= dx * 0.006;
  targetPitch = clamp(targetPitch + dy * 0.005, -0.05, 1.05);
  drag.x = e.clientX;
  drag.y = e.clientY;
});
canvas.addEventListener('pointerup', () => {
  drag = null;
  canvas.style.cursor = 'grab';
});
canvas.addEventListener('pointercancel', () => {
  drag = null;
  canvas.style.cursor = 'grab';
});
canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    targetDistance = clamp(targetDistance + e.deltaY * 0.012, 9.5, 27);
  },
  { passive: false }
);

function setPaused(paused) {
  running = !paused;
  $('#pause').innerHTML = running ? 'Ⅱ &nbsp; Pause' : '▶ &nbsp; Resume';
  $('#status').textContent = running ? 'LIVE SIMULATION' : 'GAME PAUSED';
}
$('#pause').addEventListener('click', () => {
  if (!missionEnded) setPaused(running);
});
$('#reset').addEventListener('click', () => {
  const target = activeDock(),
    dx = target.x - ship.position.x,
    dz = target.z - ship.position.z;
  targetYaw = yaw = Math.atan2(-dx, -dz);
  targetPitch = pitch = 0.35;
  targetDistance = distance = 15.5;
});
$('#restart').addEventListener('click', restartVoyage);
let pausedBeforeShop = true;
function openUpgradeShop() {
  // The shop pauses the world, so it must stay shut once the run is over --
  // otherwise opening it would freeze the sinking countdown mid-way.
  if (missionEnded || sinking) return;
  pausedBeforeShop = running;
  setPaused(true);
  $('#upgradeModal').hidden = false;
  $('#upgradeNote').textContent = '';
  updateUpgradeHud();
}
function closeUpgradeShop() {
  const modal = $('#upgradeModal');
  if (modal.hidden) return;
  modal.hidden = true;
  if (pausedBeforeShop && !missionEnded) setPaused(false);
}
$('#shopOpen').addEventListener('click', openUpgradeShop);
$('#shopClose').addEventListener('click', closeUpgradeShop);
$('#upgradeModal').addEventListener('pointerdown', (e) => {
  if (e.target === e.currentTarget) closeUpgradeShop();
});
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeUpgradeShop();
});
for (const button of document.querySelectorAll('[data-upgrade]'))
  button.addEventListener('click', () => {
    const kind = button.dataset.upgrade,
      level = upgradeLevels[kind],
      cost = upgradePrices[kind][level];
    if (level >= 3 || money < cost) {
      $('#upgradeNote').textContent =
        level >= 3 ? 'That upgrade is already maxed.' : 'Collect more cash to buy this upgrade.';
      return;
    }
    money -= cost;
    upgradeLevels[kind]++;
    if (kind === 'hull') {
      shipLifeMax += 25;
      if (shipLife > 0) shipLife = Math.min(shipLifeMax, shipLife + 25);
      refreshLifeHud();
    }
    $('#upgradeNote').textContent = `${kind.toUpperCase()} UPGRADED · LEVEL ${upgradeLevels[kind]}`;
    updateUpgradeHud();
  });
updateUpgradeHud();

// Capture keys at the document so sailing works even when the canvas is not focused.
const boatKeys = new Set();
let boatVelocity = 0,
  throttleHold = 0,
  lastThrottle = 0;
// Physical keys keep working when a layout moves the letter keys around; the
// e.key map is the fallback for browsers that report no e.code.
const boatControlsByCode = new Map([
  ['KeyW', 'forward'],
  ['ArrowUp', 'forward'],
  ['KeyS', 'reverse'],
  ['ArrowDown', 'reverse'],
  ['KeyA', 'left'],
  ['ArrowLeft', 'left'],
  ['KeyD', 'right'],
  ['ArrowRight', 'right'],
  ['KeyE', 'interact'],
  ['Enter', 'interact']
]);
const boatControlsByKey = new Map([
  ['w', 'forward'],
  ['s', 'reverse'],
  ['a', 'left'],
  ['d', 'right'],
  ['arrowup', 'forward'],
  ['arrowdown', 'reverse'],
  ['arrowleft', 'left'],
  ['arrowright', 'right'],
  ['e', 'interact'],
  ['enter', 'interact']
]);
const typingTarget = (target) =>
  target instanceof Element && !!target.closest('input,textarea,select,[contenteditable="true"]');
const boatKeyAction = (e) =>
  boatControlsByCode.get(e.code) || boatControlsByKey.get((e.key || '').toLowerCase());
function startBoatKey(e) {
  const action = boatKeyAction(e);
  if (!action || typingTarget(e.target)) return;
  e.preventDefault();
  boatKeys.add(action);
}
function stopBoatKey(e) {
  const action = boatKeyAction(e);
  if (action) boatKeys.delete(action);
}
window.addEventListener('keydown', startBoatKey, true);
window.addEventListener('keyup', stopBoatKey, true);
window.addEventListener('blur', () => {
  boatKeys.clear();
  document.querySelectorAll('.touch-key').forEach((button) => button.classList.remove('pressed'));
});
for (const button of document.querySelectorAll('.touch-key')) {
  const action = button.dataset.control;
  const press = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (button.setPointerCapture) button.setPointerCapture(e.pointerId);
    boatKeys.add(action);
    button.classList.add('pressed');
  };
  const release = (e) => {
    e.preventDefault();
    e.stopPropagation();
    boatKeys.delete(action);
    button.classList.remove('pressed');
  };
  button.addEventListener('pointerdown', press);
  button.addEventListener('pointerup', release);
  button.addEventListener('pointercancel', release);
  button.addEventListener('lostpointercapture', release);
  button.addEventListener('contextmenu', (e) => e.preventDefault());
}
canvas.addEventListener('pointerdown', () => canvas.focus({ preventScroll: true }));
let cameraFollowX = ship.position.x,
  cameraFollowZ = ship.position.z;
function restartVoyage() {
  missionEnded = false;
  missionWon = false;
  running = true;
  sinking = false;
  sinkElapsed = 0;
  $('#sunkModal').hidden = true;
  boatKeys.clear();
  boatVelocity = 0;
  throttleHold = 0;
  lastThrottle = 0;
  shipLife = shipLifeMax;
  ship.rotation.x = ship.rotation.z = 0;
  refreshLifeHud();
  for (const shot of [...carrierShots, ...jetShots]) {
    scene.remove(shot.mesh);
    scene.remove(shot.trail);
    shot.trail.geometry.dispose();
    shot.trail.material.dispose();
  }
  carrierShots.length = 0;
  jetShots.length = 0;
  for (const flare of flares) {
    scene.remove(flare.mesh);
    scene.remove(flare.trail);
    flare.trail.geometry.dispose();
    flare.trail.material.dispose();
  }
  flares.length = 0;
  for (const splash of splashObjects) {
    scene.remove(splash.group);
    for (const child of splash.group.children) {
      child.geometry?.dispose();
      child.material?.dispose();
    }
  }
  splashObjects.length = 0;
  carriers.forEach((carrier) => {
    const path = carrier.patrolPath;
    carrier.group.position.set(path[0].x, 0, path[0].y);
    carrier.group.rotation.y = Math.atan2(path[1].y - path[0].y, path[0].x - path[1].x);
    carrier.waypoint = 1;
    carrier.mode = 'patrol';
    carrier.pursuit = 0;
    carrier.returnIndex = 0;
    carrier.engageCooldown = 0;
    carrier.nextFlareAt = gameTime + 40;
    for (const escort of carrier.escortJets) {
      escort.cooldown = rand(0.2, 1.1);
      escort.burstRemaining = 0;
    }
  });
  for (const shot of towerShotMeshes) {
    scene.remove(shot.mesh);
    shot.mesh.geometry.dispose();
    shot.mesh.material.dispose();
  }
  towerShotMeshes.length = 0;
  for (const burst of flakBursts) {
    scene.remove(burst.group);
    for (const mesh of burst.group.children) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
  }
  flakBursts.length = 0;
  resetMissionRoute();
  placeShipAtStart();
  cameraFollowX = ship.position.x;
  cameraFollowZ = ship.position.z;
  targetPitch = pitch = 0.35;
  targetDistance = distance = 15.5;
  for (let i = 0; i < pickups.length; i++) {
    pickups[i].group.visible = false;
    pickups[i].tag.style.display = 'none';
    placePickup(pickups[i], i < 5, carriers[i % 2]);
  }
  setPaused(false);
  refreshMissionHud();
  updateUpgradeHud();
  showMissionToast('CARGO RUN · LOAD AT THE ISLAND');
}
$('#restartAfterSinking').addEventListener('click', restartVoyage);
let radarTimer = 0;
const radarCanvas = $('#radar'),
  radarCtx = radarCanvas.getContext('2d');
function drawRadar() {
  const ctx = radarCtx,
    size = radarCanvas.width,
    c = size / 2,
    radius = c - 5,
    range = 80,
    scale = radius / range;
  ctx.clearRect(0, 0, size, size);
  ctx.save();
  ctx.beginPath();
  ctx.arc(c, c, radius, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = 'rgba(5,17,27,.96)';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#455d4d';
  ctx.beginPath();
  ctx.rect(0, 0, size, size);
  for (let i = 0; i <= 240; i++) {
    const a = (i / 240) * Math.PI * 2,
      r = lakeRadius(a);
    const x = c + (r * Math.cos(a) - ship.position.x) * scale;
    const y = c + (lakeCenterZ + r * Math.sin(a) - ship.position.z) * scale;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill('evenodd');
  ctx.strokeStyle = '#98b9a1';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  for (let i = 0; i <= 240; i++) {
    const a = (i / 240) * Math.PI * 2,
      r = lakeRadius(a);
    const x = c + (r * Math.cos(a) - ship.position.x) * scale;
    const y = c + (lakeCenterZ + r * Math.sin(a) - ship.position.z) * scale;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.stroke();
  for (const island of islandCenters) {
    const cx = island.x,
      cz = island.z;
    ctx.beginPath();
    for (let i = 0; i <= 96; i++) {
      const a = (i / 96) * Math.PI * 2,
        r = coast(a);
      const x = c + (cx + r * Math.cos(a) - ship.position.x) * scale;
      const y = c + (cz + r * Math.sin(a) - ship.position.z) * scale;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = '#66815f';
    ctx.fill();
    ctx.strokeStyle = '#c3d89a';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(141,190,198,.18)';
  ctx.lineWidth = 1;
  for (const unit of [20, 40, 60, 80]) {
    ctx.beginPath();
    ctx.arc(c, c, unit * scale, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(c - radius, c);
  ctx.lineTo(c + radius, c);
  ctx.moveTo(c, c - radius);
  ctx.lineTo(c, c + radius);
  ctx.stroke();
  function mapPoint(x, z, color, pointSize = 2.5, edge = false) {
    let dx = x - ship.position.x,
      dz = z - ship.position.z,
      distance = Math.hypot(dx, dz);
    if (distance > range && !edge) return null;
    if (edge && distance > range) {
      dx = (dx / distance) * range;
      dz = (dz / distance) * range;
    }
    const px = c + dx * scale,
      py = c + dz * scale;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(px, py, pointSize, 0, Math.PI * 2);
    ctx.fill();
    return { x: px, y: py, dx, dz, distance };
  }
  for (const island of islandCenters) mapPoint(island.x, island.z, '#ff8358', 3);
  for (const carrier of carriers) {
    const point = mapPoint(carrier.group.position.x, carrier.group.position.z, '#75caff', 4, true);
    if (point) {
      ctx.strokeStyle = '#d6f4ff';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(point.x, point.y - 3);
      ctx.lineTo(point.x + 3, point.y + 3);
      ctx.lineTo(point.x - 3, point.y + 3);
      ctx.closePath();
      ctx.stroke();
      ctx.fillStyle = '#d8f4ff';
      ctx.font = '7px system-ui';
      ctx.fillText(carrier.index === 1 ? '72' : '68', point.x + 4, point.y - 3);
    }
  }
  for (const mine of mineNodes)
    if (mine.group.visible) mapPoint(mine.group.position.x, mine.group.position.z, '#ff7960', 2.15);
  for (const pickup of pickups)
    if (pickup.available)
      mapPoint(
        pickup.group.position.x,
        pickup.group.position.z,
        pickup.type === 'cash' ? '#ffd46f' : '#8be0a2',
        3
      );
  for (const dock of docks) mapPoint(dock.x, dock.z, '#ff9a62', 2.3);
  {
    const goal = activeDock(),
      point = mapPoint(goal.x, goal.z, '#c9afff', 4, true);
    if (point && point.distance > range) {
      const angle = Math.atan2(point.dz, point.dx);
      ctx.save();
      ctx.translate(point.x, point.y);
      ctx.rotate(angle);
      ctx.fillStyle = '#c9afff';
      ctx.beginPath();
      ctx.moveTo(6, 0);
      ctx.lineTo(-4, -4);
      ctx.lineTo(-4, 4);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    } else if (point) {
      ctx.strokeStyle = '#c9afff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(point.x, point.y, 5, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  const headingX = -Math.cos(ship.rotation.y),
    headingZ = Math.sin(ship.rotation.y);
  ctx.strokeStyle = '#83f1d8';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(c - headingX * 3, c - headingZ * 3);
  ctx.lineTo(c + headingX * 9, c + headingZ * 9);
  ctx.stroke();
  ctx.fillStyle = '#ecfff7';
  ctx.beginPath();
  ctx.arc(c, c, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = 'rgba(180,228,229,.38)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(c, c, radius, 0, Math.PI * 2);
  ctx.stroke();
}
let smokeTimer = 0,
  sparkTimer = 0;
function nearestCarrierWaypoint(carrier) {
  let best = 0,
    bestDistance = Infinity;
  carrier.patrolPath.forEach((point, index) => {
    const d = Math.hypot(point.x - carrier.group.position.x, point.y - carrier.group.position.z);
    if (d < bestDistance) {
      bestDistance = d;
      best = index;
    }
  });
  return best;
}
function steerCarrier(carrier, target, dt, speed) {
  const dx = target.x - carrier.group.position.x,
    dz = target.y - carrier.group.position.z,
    distance = Math.hypot(dx, dz);
  if (distance < 9) return 0;
  const aim = Math.atan2(dz, -dx);
  const turn = Math.atan2(
    Math.sin(aim - carrier.group.rotation.y),
    Math.cos(aim - carrier.group.rotation.y)
  );
  carrier.group.rotation.y += clamp(turn, -0.12 * dt, 0.12 * dt);
  const step = speed * dt * (1 - (0.4 * Math.abs(turn)) / Math.PI);
  const nextX = carrier.group.position.x - Math.cos(carrier.group.rotation.y) * step;
  const nextZ = carrier.group.position.z + Math.sin(carrier.group.rotation.y) * step;
  if (navigableWater(nextX, nextZ, 13)) carrier.group.position.set(nextX, 0, nextZ);
  return Math.hypot(target.x - carrier.group.position.x, target.y - carrier.group.position.z);
}
function animate(timestamp) {
  requestAnimationFrame(animate);
  clock.update(timestamp);
  let dt = Math.min(clock.getDelta(), 0.05);
  if (!running) dt = 0;
  gameTime += dt;
  if (sinking && running) {
    sinkElapsed = Math.min(10, sinkElapsed + dt);
    $('#missionSub').textContent = `${Math.ceil(10 - sinkElapsed)}s until restart`;
    if (sinkElapsed >= 10) {
      sinking = false;
      setPaused(true);
      refreshMissionHud();
      $('#sunkModal').hidden = false;
      $('#restartAfterSinking').focus();
    }
  }
  if (running && missionPhase === 'deliver' && !missionEnded) {
    contractTimer = Math.max(0, contractTimer - dt);
    if (contractTimer === 0) failMission('DELIVERY DEADLINE MISSED · RUN FAILED');
    else if (Math.floor((contractTimer + dt) * 4) !== Math.floor(contractTimer * 4))
      refreshMissionHud();
  }
  const throttle = (boatKeys.has('forward') ? 1 : 0) - (boatKeys.has('reverse') ? 1 : 0);
  const steer = (boatKeys.has('right') ? 1 : 0) - (boatKeys.has('left') ? 1 : 0);
  if (shipLife > 0) {
    if (throttle) {
      if (throttle === lastThrottle) throttleHold += dt;
      else {
        lastThrottle = throttle;
        throttleHold = 0;
      }
    } else {
      lastThrottle = 0;
      throttleHold = Math.max(0, throttleHold - dt * 1.35);
    }
    const throttleRamp = clamp(throttleHold / 5, 0, 1);
    const loadFactor = cargoOnboard ? 0.86 : 1;
    const forwardLimit =
      (2.25 + upgradeLevels.engine * 0.7 + (4.8 + upgradeLevels.engine * 0.65) * throttleRamp) *
      loadFactor;
    const reverseLimit =
      (1.1 + upgradeLevels.engine * 0.18 + (2.7 + upgradeLevels.engine * 0.38) * throttleRamp) *
      loadFactor;
    boatVelocity = clamp(
      boatVelocity + throttle * (2.6 + upgradeLevels.engine * 0.45 + 1.0 * throttleRamp) * dt,
      -reverseLimit,
      forwardLimit
    );
    if (!throttle) boatVelocity *= Math.exp(-0.32 * dt);
    if (Math.abs(boatVelocity) < 0.018) boatVelocity = 0;
    if (steer && Math.abs(boatVelocity) > 0.045)
      ship.rotation.y -=
        steer * (1.05 + upgradeLevels.steering * 0.18) * dt * Math.sign(boatVelocity);
    if (Math.abs(boatVelocity) > 0.015) {
      const nextX = ship.position.x - Math.cos(ship.rotation.y) * boatVelocity * dt;
      const nextZ = ship.position.z + Math.sin(ship.rotation.y) * boatVelocity * dt;
      // navigableWater already follows the elliptical lake edge and both islands,
      // so the boat scrapes along the shore instead of an invisible round wall.
      if (!navigableWater(nextX, nextZ, 1.18)) {
        boatVelocity *= 0.2;
      } else {
        ship.position.x = nextX;
        ship.position.z = nextZ;
      }
    }
  }
  $('#shipSpeed').textContent = Math.abs(boatVelocity).toFixed(1);
  const sinkProgress = shipLife === 0 ? clamp(sinkElapsed / 10, 0, 1) : 0;
  const sinkEase = sinkProgress * sinkProgress * (3 - 2 * sinkProgress);
  const wobble = reduceMotion ? 0 : 1 - sinkProgress;
  ship.position.y = -0.025 + Math.sin(gameTime * 1.25) * 0.025 * wobble - 3.1 * sinkEase;
  ship.rotation.z = Math.sin(gameTime * 0.9) * 0.012 * wobble + sinkEase * 0.38;
  ship.rotation.x = Math.sin(gameTime * 0.75 + 0.8) * 0.014 * wobble - sinkEase * 0.18;
  if (running && shipLife > 0 && !missionEnded) {
    const target = activeDock(),
      gap = Math.hypot(target.x - ship.position.x, target.z - ship.position.z),
      button = $('#dockAction');
    button.classList.toggle('ready', gap < 12);
    button.setAttribute('aria-hidden', gap >= 12 ? 'true' : 'false');
    if (gap < 12) {
      if (gap > 3.5) button.textContent = `APPROACH ${target.name} · ${Math.ceil(gap)}m`;
      else if (Math.abs(boatVelocity) > 0.3) button.textContent = 'STOP THE BOAT · HOLD E';
      else if (boatKeys.has('interact')) {
        dockHold += dt;
        button.textContent = `${missionPhase === 'load' ? 'LOADING' : 'UNLOADING'} · ${Math.min(100, Math.floor((dockHold / 2.4) * 100))}%`;
        if (dockHold >= 2.4) completeDockAction();
      } else {
        dockHold = Math.max(0, dockHold - dt * 1.4);
        button.textContent = `HOLD E · ${missionPhase === 'load' ? 'LOAD CARGO' : 'DISCHARGE CARGO'}`;
      }
    } else {
      dockHold = 0;
      button.textContent = 'STOP AT THE HIGHLIGHTED DOCK';
    }
    if (gap < 3.5 && Math.abs(boatVelocity) <= 0.3 && boatKeys.has('interact'))
      button.style.setProperty('--dock-progress', `${Math.min(100, (dockHold / 2.4) * 100)}%`);
    else button.style.setProperty('--dock-progress', '0%');
  } else {
    $('#dockAction').classList.remove('ready');
    $('#dockAction').setAttribute('aria-hidden', 'true');
  }
  for (const dock of docks) {
    dock.marker.material.opacity = 0.62 + Math.sin(gameTime * 3.5 + dock.x * 0.02) * 0.24;
    dock.marker.rotation.z = gameTime * 0.23;
  }
  for (const mine of mineNodes) {
    if (mine.respawnAt && gameTime >= mine.respawnAt) placeMine(mine);
    if (!mine.group.visible) continue;
    if (gameTime >= mine.nextTurn) {
      const direction = rand(0, Math.PI * 2),
        drift = rand(0.18, 0.52);
      mine.vx = Math.cos(direction) * drift;
      mine.vz = Math.sin(direction) * drift;
      mine.nextTurn = gameTime + rand(2, 5);
    }
    const mx = mine.group.position.x + mine.vx * dt,
      mz = mine.group.position.z + mine.vz * dt;
    if (navigableWater(mx, mz, 2.4) && !isIslandSafeZone(mx, mz, 0.6))
      mine.group.position.set(mx, mine.group.position.y, mz);
    else {
      mine.vx = -mine.vx;
      mine.vz = -mine.vz;
      mine.nextTurn = gameTime + rand(0.5, 1.4);
    }
    mine.group.position.y = -0.035 + Math.sin(gameTime * 1.35 + mine.phase) * 0.09;
    mine.group.rotation.y += dt * 0.42;
    mine.group.rotation.z = Math.sin(gameTime * 0.8 + mine.phase) * 0.045;
    const mineRange = Math.hypot(
      mine.group.position.x - ship.position.x,
      mine.group.position.z - ship.position.z
    );
    mine.warningRing.visible = mineRange < 14;
    if (mine.warningRing.visible)
      mine.warningRing.material.opacity =
        0.18 + 0.2 * (0.5 + 0.5 * Math.sin(gameTime * 7 + mine.phase));
    if (running && mineRange < 1.72 && !isIslandSafeZone(ship.position.x, ship.position.z))
      damageShip('mine', mine);
    else if (mineRange > 68) placeMine(mine);
  }
  const shipSafe = isIslandSafeZone(ship.position.x, ship.position.z);
  let closestCarrierRange = Infinity,
    aircraftInRange = false;
  for (const carrier of carriers) {
    carrier.cooldown -= dt;
    carrier.engageCooldown = Math.max(0, carrier.engageCooldown - dt);
    const range = Math.hypot(
      carrier.group.position.x - ship.position.x,
      carrier.group.position.z - ship.position.z
    );
    if (shipSafe && carrier.mode === 'intercept') {
      carrier.mode = 'return';
      carrier.returnIndex = nearestCarrierWaypoint(carrier);
    }
    if (
      running &&
      !shipSafe &&
      carrier.mode === 'patrol' &&
      range < 52 &&
      carrier.engageCooldown <= 0
    ) {
      carrier.mode = 'intercept';
      carrier.pursuit = 7.5;
      carrier.engageCooldown = 27;
    }
    if (carrier.mode === 'patrol') {
      const target = carrier.patrolPath[carrier.waypoint];
      if (steerCarrier(carrier, target, dt, carrier.patrolSpeed) < 9)
        carrier.waypoint = (carrier.waypoint + 1) % carrier.patrolPath.length;
    } else if (carrier.mode === 'intercept') {
      carrier.pursuit -= dt;
      const dx = ship.position.x - carrier.group.position.x,
        dz = ship.position.z - carrier.group.position.z,
        rangeNow = Math.hypot(dx, dz) || 1;
      const standOff = 17.5,
        target = new THREE.Vector2(
          ship.position.x - (dx / rangeNow) * standOff,
          ship.position.z - (dz / rangeNow) * standOff
        );
      if (navigableWater(target.x, target.y, 13)) steerCarrier(carrier, target, dt, 2.35);
      if (carrier.pursuit <= 0 || rangeNow < 15) {
        carrier.mode = 'return';
        carrier.returnIndex = nearestCarrierWaypoint(carrier);
      }
    } else {
      const target = carrier.patrolPath[carrier.returnIndex];
      if (steerCarrier(carrier, target, dt, 2.25) < 9) {
        carrier.mode = 'patrol';
        carrier.waypoint = (carrier.returnIndex + 1) % carrier.patrolPath.length;
      }
    }
    for (const escort of carrier.escortJets) {
      const phase = gameTime * 0.32 + escort.phase + carrier.index;
      const x = carrier.group.position.x + Math.cos(phase) * 21,
        z = carrier.group.position.z + Math.sin(phase) * 16;
      const next = phase + 0.03;
      escort.jet.position.set(x, 5.8 + Math.sin(phase * 2) * 0.8, z);
      escort.jet.rotation.y = Math.atan2(
        Math.sin(next) * 16 - Math.sin(phase) * 16,
        -(Math.cos(next) * 21 - Math.cos(phase) * 21)
      );
      escort.jet.rotation.z = 0.12 * Math.sin(phase);
      escort.cooldown = Math.max(0, escort.cooldown - dt);
      const jetRange = Math.hypot(x - ship.position.x, z - ship.position.z);
      if (jetRange <= 30 && !shipSafe) {
        aircraftInRange = true;
        if (running && !missionEnded && shipLife > 0 && escort.cooldown <= 0) {
          if (escort.burstRemaining === 0) escort.burstRemaining = 4;
          fireJetShot(escort);
          escort.burstRemaining--;
          escort.cooldown = escort.burstRemaining > 0 ? 0.11 : rand(1.8, 2.4);
        }
      } else if (escort.burstRemaining) {
        escort.burstRemaining = 0;
        escort.cooldown = Math.max(escort.cooldown, 0.8);
      }
    }
    if (running && gameTime >= carrier.nextFlareAt) {
      launchFlare(carrier);
      carrier.nextFlareAt += 40;
    }
    const currentRange = Math.hypot(
      carrier.group.position.x - ship.position.x,
      carrier.group.position.z - ship.position.z
    );
    closestCarrierRange = Math.min(closestCarrierRange, currentRange);
    if (currentRange <= 43 && !shipSafe && shipLife > 0) {
      carrier.group.updateMatrixWorld(true);
      const targetLocal = carrier.group.worldToLocal(ship.position.clone());
      for (const turret of carrier.turrets)
        turret.rotation.y = Math.atan2(
          targetLocal.z - turret.position.z,
          -(targetLocal.x - turret.position.x)
        );
      if (running && carrier.cooldown <= 0) {
        fireCarrierShot(carrier, carrier.turrets[carrier.shotIndex++ % carrier.turrets.length]);
        carrier.cooldown = rand(2.4, 3.6);
      }
    }
  }
  for (const battery of defenseBatteries) {
    battery.cooldown -= dt;
    // Aircraft take priority over mines; both scans run without allocating.
    let planeTarget = null,
      planeDistance = 35;
    for (const carrier of carriers)
      for (const escort of carrier.escortJets) {
        const d = Math.hypot(
          escort.jet.position.x - battery.group.position.x,
          escort.jet.position.z - battery.group.position.z
        );
        if (d < planeDistance) {
          planeDistance = d;
          planeTarget = escort;
        }
      }
    let mineTarget = null;
    if (!planeTarget) {
      let mineDistance = 21;
      for (const mine of mineNodes) {
        if (!mine.group.visible) continue;
        const d = Math.hypot(
          mine.group.position.x - battery.group.position.x,
          mine.group.position.z - battery.group.position.z
        );
        if (d < mineDistance) {
          mineDistance = d;
          mineTarget = mine;
        }
      }
    }
    const targetPosition = planeTarget?.jet.position || mineTarget?.group.position;
    if (targetPosition) {
      const dx = targetPosition.x - battery.group.position.x,
        dz = targetPosition.z - battery.group.position.z;
      battery.turret.rotation.y = Math.atan2(-dz, dx);
      if (running && battery.cooldown <= 0) {
        battery.group.updateMatrixWorld(true);
        const start = battery.turret.localToWorld(new THREE.Vector3(0.7, 0.17, 0));
        const end = planeTarget
          ? targetPosition.clone()
          : targetPosition.clone().add(new THREE.Vector3(0, 0.15, 0));
        const beam = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([start, end]),
          new THREE.LineBasicMaterial({
            color: planeTarget ? 0xffe6a4 : 0x9ff8e8,
            transparent: true,
            opacity: 0.95,
            depthWrite: false
          })
        );
        scene.add(beam);
        towerShotMeshes.push({
          mesh: beam,
          life: planeTarget ? 0.28 : 0.18,
          maxLife: planeTarget ? 0.28 : 0.18
        });
        if (planeTarget) {
          showFlakBurst(end);
          battery.cooldown = 0.85;
        } else {
          mineTarget.group.visible = false;
          mineTarget.respawnAt = gameTime + rand(6, 10);
          battery.cooldown = 4.2;
        }
      }
    }
  }
  for (let i = towerShotMeshes.length - 1; i >= 0; i--) {
    const shot = towerShotMeshes[i];
    shot.life -= dt;
    shot.mesh.material.opacity = Math.max(0, shot.life / shot.maxLife);
    if (shot.life <= 0) {
      scene.remove(shot.mesh);
      shot.mesh.geometry.dispose();
      shot.mesh.material.dispose();
      towerShotMeshes.splice(i, 1);
    }
  }
  for (let i = flakBursts.length - 1; i >= 0; i--) {
    const burst = flakBursts[i];
    burst.age += dt;
    const t = Math.min(1, burst.age / burst.life);
    burst.ring.scale.setScalar(1 + t * 2.8);
    burst.ring.material.opacity = (1 - t) * 0.9;
    burst.flash.scale.setScalar(1 + t * 1.5);
    burst.flash.material.opacity = (1 - t) * 0.95;
    if (t >= 1) {
      scene.remove(burst.group);
      for (const mesh of burst.group.children) {
        mesh.geometry.dispose();
        mesh.material.dispose();
      }
      flakBursts.splice(i, 1);
    }
  }
  const status = $('#status');
  const hullPercent = (shipLife / shipLifeMax) * 100;
  status.textContent = sinking
    ? 'VESSEL SINKING'
    : !running
      ? missionEnded
        ? missionWon
          ? 'VOYAGE COMPLETE'
          : 'VESSEL LOST'
        : 'GAME PAUSED'
      : shipSafe
        ? 'ISLAND SAFE ZONE'
        : hullPercent <= 30
          ? 'HULL CRITICAL'
          : aircraftInRange
            ? 'AIRCRAFT ATTACK'
            : closestCarrierRange < 43
              ? 'UNDER FIRE'
              : closestCarrierRange < 52
                ? 'CARRIER ALERT'
                : 'LIVE SIMULATION';
  status.classList.toggle(
    'danger',
    running && !shipSafe && (hullPercent <= 30 || aircraftInRange || closestCarrierRange < 43)
  );
  for (let i = carrierShots.length - 1; i >= 0; i--) {
    const shot = carrierShots[i],
      previous = scratchA.copy(shot.mesh.position);
    shot.age += dt;
    const t = clamp(shot.age / shot.duration, 0, 1),
      distance = shot.start.distanceTo(shot.target);
    shot.mesh.position.lerpVectors(shot.start, shot.target, t);
    shot.mesh.position.y += Math.sin(Math.PI * t) * Math.min(3, distance * 0.055);
    setTrail(shot.trail, previous, shot.mesh.position);
    if (t >= 1 && running) {
      const hit =
        !shipSafe &&
        !missionEnded &&
        shipLife > 0 &&
        Math.hypot(ship.position.x - shot.target.x, ship.position.z - shot.target.z) < 3.8;
      waterSplash(hit ? ship.position : shot.target, hit ? 1.4 : 0.85);
      if (hit) damageShip('shell');
      scene.remove(shot.mesh);
      scene.remove(shot.trail);
      shot.trail.material.dispose();
      carrierShots.splice(i, 1);
    }
  }
  for (let i = jetShots.length - 1; i >= 0; i--) {
    const shot = jetShots[i];
    shot.age += dt;
    const t = clamp(shot.age / shot.duration, 0, 1);
    shot.mesh.position.lerpVectors(shot.start, shot.target, t);
    const travel = shot.start.distanceTo(shot.target);
    const tail = scratchA.copy(shot.start).lerp(shot.target, Math.max(0, t - 4 / travel));
    setTrail(shot.trail, tail, shot.mesh.position);
    if (t >= 1 && running) {
      if (
        !shipSafe &&
        !missionEnded &&
        shipLife > 0 &&
        Math.hypot(ship.position.x - shot.target.x, ship.position.z - shot.target.z) < 3.8
      )
        damageShip('jet');
      scene.remove(shot.mesh);
      scene.remove(shot.trail);
      shot.trail.geometry.dispose();
      shot.trail.material.dispose();
      jetShots.splice(i, 1);
    }
  }
  for (let i = flares.length - 1; i >= 0; i--) {
    const flare = flares[i],
      previous = scratchA.copy(flare.mesh.position);
    flare.age += dt;
    flare.velocity.y -= 1.85 * dt;
    flare.mesh.position.addScaledVector(flare.velocity, dt);
    setTrail(flare.trail, previous, flare.mesh.position);
    flare.mesh.material.opacity = clamp(1 - flare.age / flare.life, 0, 1);
    if (flare.age >= flare.life && running) {
      scene.remove(flare.mesh);
      scene.remove(flare.trail);
      flare.trail.material.dispose();
      flares.splice(i, 1);
    }
  }
  for (const pickup of pickups) {
    if (pickup.available) {
      if (gameTime >= pickup.expiresAt) {
        pickup.available = false;
        pickup.group.visible = false;
        pickup.tag.style.display = 'none';
        pickup.respawnAt = gameTime + rand(5, 10);
        continue;
      }
      pickup.group.position.y = -0.02 + Math.sin(gameTime * 1.8 + pickup.phase) * 0.12;
      pickup.group.rotation.y += dt * 0.55;
      if (
        running &&
        !missionEnded &&
        Math.hypot(
          pickup.group.position.x - ship.position.x,
          pickup.group.position.z - ship.position.z
        ) < 1.8
      ) {
        if (pickup.type === 'cash') {
          money += 500;
          updateUpgradeHud();
        } else {
          shipLife = Math.min(shipLifeMax, shipLife + 20);
          refreshLifeHud();
        }
        pickup.available = false;
        pickup.group.visible = false;
        pickup.tag.style.display = 'none';
        pickup.respawnAt = gameTime + rand(5, 10);
        continue;
      }
      const pickupScreen = projectTag(pickup.group.position, 0.95);
      pickup.tag.style.left = `${(pickupScreen.x * 0.5 + 0.5) * canvas.clientWidth}px`;
      pickup.tag.style.top = `${(-pickupScreen.y * 0.5 + 0.5) * canvas.clientHeight}px`;
      pickup.tag.style.display = pickupScreen.z > -1 && pickupScreen.z < 1 ? 'block' : 'none';
    } else if (gameTime >= pickup.respawnAt) placePickup(pickup);
  }
  for (let i = splashObjects.length - 1; i >= 0; i--) {
    const splash = splashObjects[i];
    splash.age += dt;
    const t = clamp(splash.age / splash.life, 0, 1);
    splash.ring.scale.setScalar(1 + t * 4);
    splash.ring.material.opacity = (1 - t) * 0.88;
    for (const drop of splash.drops) {
      drop.mesh.position.addScaledVector(drop.velocity, dt);
      drop.velocity.y -= 6.5 * dt;
      drop.mesh.material.opacity = (1 - t) * 0.9;
    }
    if (t >= 1) {
      scene.remove(splash.group);
      for (const child of splash.group.children) {
        child.geometry?.dispose();
        child.material?.dispose();
      }
      splashObjects.splice(i, 1);
    }
  }
  if (running) {
    let step = dt;
    elapsed += step;
    const wakePower = clamp(Math.abs(boatVelocity) / 9, 0, 1);
    wakes.forEach((w, i) => {
      w.material.opacity = 0.11 + wakePower * 0.48 + Math.sin(elapsed * 2.1 + i) * 0.05;
    });
    sternFoam.material.opacity = 0.16 + wakePower * 0.58 + Math.sin(elapsed * 2.4) * 0.08;
    // The pennant flutters harder the faster the boat runs.
    mastFlag.rotation.y = Math.sin(elapsed * 2.6) * (0.12 + wakePower * 0.3);
    mastFlag.rotation.z = Math.sin(elapsed * 4.1) * 0.06;
    smokeTimer += step;
    sparkTimer += step;
    if (smokeTimer > 0.16) {
      smokeTimer = 0;
      addSmoke();
    }
    if (sparkTimer > 0.028 / (0.3 + eruptionPower)) {
      sparkTimer = 0;
      addSpark(0.6 + eruptionPower * 0.5);
    }
    if (elapsed > nextBurst) {
      eruptionPower = rand(0.2, 0.98);
      burst(Math.round(rand(14, 34) + eruptionPower * rand(18, 48)));
      pulse();
      nextBurst = elapsed + rand(2.8, 8.5) / (0.45 + eruptionPower);
    }
    for (let i = sparks.length - 1; i >= 0; i--) {
      let p = sparks[i];
      p.life -= step;
      p.vel.y -= 3.1 * step;
      p.mesh.position.addScaledVector(p.vel, step);
      p.mesh.material.opacity = clamp(p.life / 0.5, 0, 1);
      p.mesh.rotation.x += step * 3;
      if (p.life <= 0 || p.mesh.position.y < -0.08) {
        scene.remove(p.mesh);
        p.mesh.material.dispose();
        sparks.splice(i, 1);
      }
    }
    for (let i = smoke.length - 1; i >= 0; i--) {
      let p = smoke[i];
      p.life -= step;
      p.mesh.position.addScaledVector(p.vel, step);
      p.vel.x += Math.sin(elapsed * 0.7 + i) * 0.004;
      p.mesh.scale.multiplyScalar(1 + step * 0.32);
      p.mesh.material.opacity = 0.21 * clamp(p.life / 1.8, 0, 1);
      if (p.life <= 0) {
        scene.remove(p.mesh);
        p.mesh.material.dispose();
        smoke.splice(i, 1);
      }
    }
    for (let i = shockwaves.length - 1; i >= 0; i--) {
      let p = shockwaves[i];
      p.life -= step * 1.3;
      p.mesh.scale.setScalar(1 + (1 - p.life) * 3);
      p.mesh.material.opacity = Math.max(0, p.life) * 0.8;
      if (p.life <= 0) {
        scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        p.mesh.material.dispose();
        shockwaves.splice(i, 1);
      }
    }
    ocean.material.uniforms.uTime.value = elapsed;
    for (const f of lavaFlows)
      f.mesh.material.opacity =
        [0.76, 0.83, 0.6][f.layer] + Math.sin(elapsed * 3.8 - f.phase + f.layer) * 0.13;
    lavaInner.material.opacity = 0.45 + Math.sin(elapsed * 4) * 0.23;
    rim.material.opacity = 0.67 + Math.sin(elapsed * 3.2) * 0.2;
    fireLight.intensity +=
      (15 + eruptionPower * 19 + Math.sin(elapsed * 6.7) * 4 - fireLight.intensity) *
      Math.min(1, dt * 4);
    secondFireLight.intensity +=
      (15 + eruptionPower * 19 + Math.sin(elapsed * 6.7 + 1) * 4 - secondFireLight.intensity) *
      Math.min(1, dt * 4);
    clouds.forEach((c, i) => {
      c.position.x += step * (0.12 + i * 0.012);
      if (c.position.x > 23) c.position.x = -23;
    });
  }
  yaw += (targetYaw - yaw) * 0.09;
  pitch += (targetPitch - pitch) * 0.09;
  distance += (targetDistance - distance) * 0.09;
  cameraFollowX += (ship.position.x - cameraFollowX) * Math.min(1, dt * 2.4);
  cameraFollowZ += (ship.position.z - cameraFollowZ) * Math.min(1, dt * 2.4);
  hitShake = Math.max(0, hitShake - dt * 2.4);
  const shake = hitShake;
  updateShadowLight(cameraFollowX, cameraFollowZ);
  camera.position.set(
    cameraFollowX +
      Math.sin(yaw) * Math.cos(pitch) * distance +
      Math.sin(gameTime * 49) * shake * 0.22,
    3.2 + Math.sin(pitch) * distance + Math.cos(gameTime * 43) * shake * 0.18,
    cameraFollowZ +
      Math.cos(yaw) * Math.cos(pitch) * distance +
      Math.cos(gameTime * 47) * shake * 0.22
  );
  camera.lookAt(cameraFollowX, 1.35, cameraFollowZ);
  renderer.render(scene, camera);
  const shipScreen = projectTag(ship.position, 1.55);
  shipTag.style.left = `${(shipScreen.x * 0.5 + 0.5) * canvas.clientWidth}px`;
  shipTag.style.top = `${(-shipScreen.y * 0.5 + 0.5) * canvas.clientHeight}px`;
  shipTag.style.display = shipScreen.z > -1 && shipScreen.z < 1 ? 'block' : 'none';
  for (const carrier of carriers) {
    const screen = projectTag(carrier.group.position, 4.2);
    carrier.tag.style.left = `${(screen.x * 0.5 + 0.5) * canvas.clientWidth}px`;
    carrier.tag.style.top = `${(-screen.y * 0.5 + 0.5) * canvas.clientHeight}px`;
    carrier.tag.style.display =
      screen.z > -1 && screen.z < 1 && Math.abs(screen.x) < 1.05 && Math.abs(screen.y) < 1.05
        ? 'block'
        : 'none';
  }
  for (const dock of docks) {
    const screen = projectTag(dock.group.position, 1.5);
    dock.tag.style.left = `${clamp((screen.x * 0.5 + 0.5) * canvas.clientWidth, 70, canvas.clientWidth - 70)}px`;
    dock.tag.style.top = `${clamp((-screen.y * 0.5 + 0.5) * canvas.clientHeight, 46, canvas.clientHeight - 40)}px`;
    dock.tag.style.display =
      screen.z > -1 && screen.z < 1 && Math.abs(screen.x) < 1.15 && Math.abs(screen.y) < 1.15
        ? 'block'
        : 'none';
  }
  const craterScreen = projectTag(secondVolcano.position, 6.6);
  cinderTag.style.left = `${clamp((craterScreen.x * 0.5 + 0.5) * canvas.clientWidth, 88, canvas.clientWidth - 88)}px`;
  cinderTag.style.top = `${clamp((-craterScreen.y * 0.5 + 0.5) * canvas.clientHeight, 45, canvas.clientHeight - 45)}px`;
  cinderTag.style.display =
    craterScreen.z > -1 &&
    craterScreen.z < 1 &&
    Math.abs(craterScreen.x) < 1 &&
    Math.abs(craterScreen.y) < 1
      ? 'block'
      : 'none';
  if (gameTime >= radarTimer) {
    drawRadar();
    radarTimer = gameTime + 0.12;
  }
}
animate();
