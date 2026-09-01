// Crab Climb — a basic 3D obstacle game built with three.js.
// A crab scrambles up a sloped mountain lane-runner style: dodge boulders,
// leap crevices, and reach the summit before you fall.

(() => {
  'use strict';

  // ---------- Tunable constants ----------
  const LANE_WIDTH = 3;
  const LANES_X = [-LANE_WIDTH, 0, LANE_WIDTH];
  const SLOPE_ANGLE = 0.30; // radians, steepness of the mountain

  const GRAVITY = 34;
  const JUMP_SPEED = 12;
  const MIN_JUMP_HOP_TO_CLEAR_CREVICE = 0.9;

  const BASE_SPEED = 9;      // units/sec climbed at start
  const MAX_SPEED = 21;
  const SPEED_RAMP_DISTANCE = 320; // distance over which speed ramps to max

  const SPAWN_AHEAD = 70;    // spawn obstacles this far ahead of the crab
  const DESPAWN_BEHIND = 6;  // remove obstacles once this far behind the crab
  const MIN_GAP = 9;
  const MAX_GAP = 16;

  const SCENERY_SPAWN_AHEAD = 90;
  const SCENERY_MIN_GAP = 4;
  const SCENERY_MAX_GAP = 9;

  const COLLISION_Z_RADIUS = 0.85;
  const WIN_DISTANCE = 420;

  const LANE_SWITCH_SPEED = 14; // how fast the crab slides between lanes

  // Terrain undulates in "stairs up, then slide down" cycles layered on the
  // overall upward climb, instead of one flat unbroken slope.
  const STAIR_PERIOD = 55;      // distance (m) per climb+slide cycle
  const STAIR_AMPLITUDE = 3.2;  // extra height (m) gained/lost per cycle
  const STAIR_CLIMB_FRACTION = 0.35; // portion of the cycle spent climbing (rest is sliding)

  const COLLECTIBLE_MIN_GAP = 5;
  const COLLECTIBLE_MAX_GAP = 8;
  const COLLECT_Z_RADIUS = 0.9;

  const JOKE_INTERVAL = 100; // a dad joke checkpoint every N meters climbed

  const PIE_MIN_GAP = 60;   // min distance (m) before the next pie appears
  const PIE_MAX_GAP = 110;  // max distance (m) before the next pie appears
  const PIE_FIRST_Z = -40;
  const INVINCIBLE_DURATION = 30; // seconds

  // ---------- Renderer / scene / camera ----------
  const canvas = document.getElementById('game-canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const skyColor = 0x8ec9f0;
  scene.background = new THREE.Color(skyColor);
  scene.fog = new THREE.Fog(skyColor, 35, 110);

  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 500);
  const CAMERA_OFFSET = new THREE.Vector3(0, 4.6, 8.2);
  const CAMERA_LOOK_OFFSET = new THREE.Vector3(0, 1.4, -6);

  function resize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener('resize', resize);
  resize();

  // ---------- Lighting ----------
  const ambient = new THREE.AmbientLight(0xbfd9ff, 0.55);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xfff2d0, 1.05);
  sun.position.set(-20, 40, 15);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -25;
  sun.shadow.camera.right = 25;
  sun.shadow.camera.top = 25;
  sun.shadow.camera.bottom = -25;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 100;
  scene.add(sun);
  scene.add(sun.target);

  // ---------- Ground / mountain slope ----------
  // Smoothstep, used to ease each climb/slide segment in and out.
  function smooth01(t) {
    return t * t * (3 - 2 * t);
  }

  // Overall height is a steady climb with repeating "stairs up, then slide
  // down" bumps layered on top — net progress per cycle stays positive
  // because the base slope keeps rising underneath the oscillation.
  function groundY(z) {
    const climbed = Math.max(0, -z);
    const base = climbed * Math.tan(SLOPE_ANGLE);
    const cyclePos = climbed % STAIR_PERIOD;
    const climbLen = STAIR_PERIOD * STAIR_CLIMB_FRACTION;
    const slideLen = STAIR_PERIOD - climbLen;
    let bump;
    if (cyclePos <= climbLen) {
      bump = smooth01(cyclePos / climbLen) * STAIR_AMPLITUDE;
    } else {
      bump = (1 - smooth01((cyclePos - climbLen) / slideLen)) * STAIR_AMPLITUDE;
    }
    return base + bump;
  }

  // Builds a ribbon mesh whose surface follows groundY(z) exactly, instead of
  // a flat plane, so the stairs/slide undulation actually reads in 3D.
  function buildTerrainStrip(halfWidth, zFrom, zTo, segments, yOffset, material) {
    const positions = [];
    const indices = [];
    const span = zFrom - zTo;
    for (let i = 0; i <= segments; i++) {
      const z = zFrom - (span * i) / segments;
      const y = groundY(z) + yOffset;
      positions.push(-halfWidth, y, z, halfWidth, y, z);
    }
    for (let i = 0; i < segments; i++) {
      const a = i * 2, b = i * 2 + 1, c = (i + 1) * 2, d = (i + 1) * 2 + 1;
      indices.push(a, c, b, b, c, d);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, material);
    mesh.receiveShadow = true;
    return mesh;
  }

  const TERRAIN_Z_FROM = 40;
  const TERRAIN_Z_TO = -(WIN_DISTANCE + 150);
  const TERRAIN_SEGMENTS = 450;

  const groundMat = new THREE.MeshStandardMaterial({ color: 0x7fae5b, roughness: 0.95 });
  const ground = buildTerrainStrip(30, TERRAIN_Z_FROM, TERRAIN_Z_TO, TERRAIN_SEGMENTS, 0, groundMat);
  scene.add(ground);

  // A rocky path strip down the middle lanes for visual clarity
  const pathMat = new THREE.MeshStandardMaterial({ color: 0x9a8266, roughness: 1 });
  const path = buildTerrainStrip(LANE_WIDTH + 1.5, TERRAIN_Z_FROM, TERRAIN_Z_TO, TERRAIN_SEGMENTS, 0.01, pathMat);
  scene.add(path);

  // ---------- Crab model ----------
  function createCrab() {
    const crab = new THREE.Group();

    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xd9531e, roughness: 0.55 });
    const underMat = new THREE.MeshStandardMaterial({ color: 0xf2c9a0, roughness: 0.7 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x2a1810, roughness: 0.6 });
    const eyeWhiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const pupilMat = new THREE.MeshStandardMaterial({ color: 0x111111 });

    const body = new THREE.Mesh(new THREE.SphereGeometry(0.9, 16, 12), bodyMat);
    body.scale.set(1, 0.55, 0.8);
    body.position.y = 0.55;
    body.castShadow = true;
    crab.add(body);

    const under = new THREE.Mesh(new THREE.SphereGeometry(0.85, 16, 12), underMat);
    under.scale.set(0.95, 0.35, 0.75);
    under.position.y = 0.32;
    crab.add(under);

    [-0.28, 0.28].forEach((xOff) => {
      const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.35, 8), bodyMat);
      stalk.position.set(xOff, 1.0, 0.55);
      stalk.rotation.x = -0.5;
      crab.add(stalk);

      const eyeWhite = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), eyeWhiteMat);
      eyeWhite.position.set(xOff, 1.2, 0.7);
      crab.add(eyeWhite);

      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), pupilMat);
      pupil.position.set(xOff, 1.2, 0.78);
      crab.add(pupil);
    });

    const claws = [];
    [-1, 1].forEach((side) => {
      const armGroup = new THREE.Group();
      armGroup.position.set(side * 0.85, 0.62, 0.45);

      const upperArm = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.55, 8), bodyMat);
      upperArm.rotation.z = side * 1.1;
      armGroup.add(upperArm);

      const claw = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), bodyMat);
      claw.scale.set(1.3, 0.7, 0.9);
      claw.position.set(side * 0.45, -0.05, 0.28);
      armGroup.add(claw);

      crab.add(armGroup);
      claws.push(armGroup);
    });

    const legs = [];
    for (let i = 0; i < 3; i++) {
      [-1, 1].forEach((side) => {
        const legGroup = new THREE.Group();
        legGroup.position.set(side * 0.7, 0.55, 0.5 - i * 0.42);

        const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.075, 0.55, 6), darkMat);
        upper.rotation.z = side * 0.95;
        upper.position.x = side * 0.2;
        legGroup.add(upper);

        crab.add(legGroup);
        legs.push({ group: legGroup, side, index: i });
      });
    }

    const hatSlot = new THREE.Group();
    hatSlot.position.set(0, 1.05, -0.1);
    crab.add(hatSlot);

    crab.userData.legs = legs;
    crab.userData.claws = claws;
    crab.userData.hatSlot = hatSlot;
    return crab;
  }

  const crab = createCrab();
  crab.castShadow = true;
  scene.add(crab);

  // ---------- Silly hats (checkpoint rewards) ----------
  function buildPartyHat() {
    const g = new THREE.Group();
    const coneMat = new THREE.MeshStandardMaterial({ color: 0xff4fa3, roughness: 0.5 });
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.55, 10), coneMat);
    cone.position.y = 0.275;
    cone.castShadow = true;
    g.add(cone);
    const bandMat = new THREE.MeshStandardMaterial({ color: 0xffd23f, roughness: 0.5 });
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.035, 8, 16), bandMat);
    band.rotation.x = Math.PI / 2;
    band.position.y = 0.02;
    g.add(band);
    const pom = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }));
    pom.position.y = 0.56;
    g.add(pom);
    return g;
  }

  function buildPropellerCap() {
    const g = new THREE.Group();
    const capMat = new THREE.MeshStandardMaterial({ color: 0x3a7bd5, roughness: 0.6 });
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), capMat);
    cap.position.y = 0.02;
    g.add(cap);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.16, 6), new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.5, metalness: 0.4 }));
    stem.position.y = 0.38;
    g.add(stem);
    const propGroup = new THREE.Group();
    propGroup.position.y = 0.46;
    const bladeMat = new THREE.MeshStandardMaterial({ color: 0xffd23f, roughness: 0.4 });
    const blade1 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, 0.09), bladeMat);
    propGroup.add(blade1);
    const blade2 = blade1.clone();
    blade2.rotation.y = Math.PI / 2;
    propGroup.add(blade2);
    g.add(propGroup);
    g.userData.propeller = propGroup;
    return g;
  }

  function buildPirateHat() {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.6 });
    const brim = new THREE.Mesh(new THREE.SphereGeometry(0.4, 14, 10), mat);
    brim.scale.set(1, 0.35, 0.62);
    brim.position.y = 0.06;
    g.add(brim);
    const crest = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 10), mat);
    crest.scale.set(0.55, 0.5, 1);
    crest.position.set(0, 0.22, 0);
    g.add(crest);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshStandardMaterial({ color: 0xf2f2f2 }));
    skull.position.set(0, 0.15, 0.28);
    g.add(skull);
    const feather = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.4, 6), new THREE.MeshStandardMaterial({ color: 0xd9531e, roughness: 0.5 }));
    feather.position.set(-0.32, 0.28, -0.05);
    feather.rotation.z = 0.6;
    g.add(feather);
    return g;
  }

  function buildWizardHat() {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x4b2e83, roughness: 0.55 });
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.04, 16), mat);
    brim.position.y = 0.02;
    g.add(brim);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.75, 12), mat);
    cone.position.y = 0.42;
    g.add(cone);
    const starMat = new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0x654a00, roughness: 0.4 });
    for (let i = 0; i < 3; i++) {
      const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.045, 0), starMat);
      const h = 0.2 + i * 0.18;
      const ang = i * 2.1;
      const r = 0.14 * (1 - h / 0.75);
      star.position.set(Math.cos(ang) * r, h, Math.sin(ang) * r);
      g.add(star);
    }
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), starMat);
    tip.position.y = 0.8;
    g.add(tip);
    return g;
  }

  function buildSombrero() {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0xe8a33d, roughness: 0.6 });
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.03, 20), mat);
    brim.position.y = 0.02;
    g.add(brim);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.03, 8, 20), new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.5 }));
    band.rotation.x = Math.PI / 2;
    band.position.y = 0.18;
    g.add(band);
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.32, 16), mat);
    crown.position.y = 0.2;
    g.add(crown);
    return g;
  }

  function buildCrownHat() {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0xffd23f, roughness: 0.3, metalness: 0.6 });
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.32, 0.16, 16), mat);
    band.position.y = 0.08;
    g.add(band);
    const gemMat = new THREE.MeshStandardMaterial({ color: 0xd63447, roughness: 0.2, metalness: 0.3 });
    const spikeCount = 6;
    for (let i = 0; i < spikeCount; i++) {
      const ang = (i / spikeCount) * Math.PI * 2;
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.22, 6), mat);
      spike.position.set(Math.cos(ang) * 0.29, 0.16 + 0.11, Math.sin(ang) * 0.29);
      g.add(spike);
      if (i % 2 === 0) {
        const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.035, 0), gemMat);
        gem.position.set(Math.cos(ang) * 0.3, 0.12, Math.sin(ang) * 0.3);
        g.add(gem);
      }
    }
    return g;
  }

  // Each tier unlocks once enough shells have been collected (not just by
  // climbing far enough) — hats are earned, not handed out for free.
  const HAT_TIERS = [
    { need: 5, name: 'Party Hat', build: buildPartyHat },
    { need: 10, name: 'Propeller Cap', build: buildPropellerCap },
    { need: 16, name: 'Pirate Hat', build: buildPirateHat },
    { need: 24, name: 'Wizard Hat', build: buildWizardHat },
    { need: 34, name: 'Sombrero', build: buildSombrero },
    { need: 46, name: 'Champion Crown', build: buildCrownHat },
  ];

  let currentHatTier = -1;
  let currentHatMesh = null;
  let hatPopStart = 0;
  const hatToastEl = document.getElementById('hat-toast');
  let hatToastTimeout = null;

  function showHatToast(text) {
    hatToastEl.textContent = text;
    hatToastEl.classList.add('show');
    clearTimeout(hatToastTimeout);
    hatToastTimeout = setTimeout(() => hatToastEl.classList.remove('show'), 2200);
  }

  function unlockHat(index) {
    currentHatTier = index;
    if (currentHatMesh) crab.userData.hatSlot.remove(currentHatMesh);
    currentHatMesh = HAT_TIERS[index].build();
    crab.userData.hatSlot.add(currentHatMesh);
    hatPopStart = clock.elapsedTime;
    showHatToast(`🎉 New hat: ${HAT_TIERS[index].name}!`);
  }

  function resetHats() {
    currentHatTier = -1;
    if (currentHatMesh) {
      crab.userData.hatSlot.remove(currentHatMesh);
      currentHatMesh = null;
    }
    clearTimeout(hatToastTimeout);
    hatToastEl.classList.remove('show');
  }

  function checkHatUnlocks(shellsCollected) {
    while (currentHatTier + 1 < HAT_TIERS.length && shellsCollected >= HAT_TIERS[currentHatTier + 1].need) {
      unlockHat(currentHatTier + 1);
    }
  }

  // ---------- Summit flag ----------
  const flagGroup = new THREE.Group();
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x8a8a8a, roughness: 0.4, metalness: 0.3 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 4, 8), poleMat);
  pole.position.y = 2;
  flagGroup.add(pole);
  const flagMat = new THREE.MeshStandardMaterial({ color: 0xffd23f, roughness: 0.6, side: THREE.DoubleSide });
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.9), flagMat);
  flag.position.set(0.75, 3.4, 0);
  flagGroup.add(flag);
  flagGroup.position.set(0, groundY(-WIN_DISTANCE), -WIN_DISTANCE);
  flagGroup.castShadow = true;
  scene.add(flagGroup);

  // ---------- Obstacles ----------
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x6b6459, roughness: 0.9 });

  const CREVICE_WIDTH = LANE_WIDTH * 3 + 1;
  const CREVICE_DEPTH = 1.4;   // z-length of the gap
  const CREVICE_PIT = 1.5;     // how far down the pit walls drop
  const crevFloorMat = new THREE.MeshStandardMaterial({ color: 0x120b06, roughness: 1 });
  const crevWallMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 0.95, side: THREE.DoubleSide });
  const crevRimMat = new THREE.MeshStandardMaterial({ color: 0x5c4a35, roughness: 0.9 });

  // A real sunken pit — floor, two side walls, and jagged broken rim rocks —
  // instead of a flat dark decal painted on the ground.
  function buildCrevice(z) {
    const g = new THREE.Group();

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(CREVICE_WIDTH, CREVICE_DEPTH), crevFloorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -CREVICE_PIT;
    floor.receiveShadow = true;
    g.add(floor);

    [CREVICE_DEPTH / 2, -CREVICE_DEPTH / 2].forEach((zOff) => {
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(CREVICE_WIDTH, CREVICE_PIT), crevWallMat);
      wall.position.set(0, -CREVICE_PIT / 2, zOff);
      wall.receiveShadow = true;
      g.add(wall);
    });

    for (let i = 0; i < 10; i++) {
      const rock = new THREE.Mesh(rockGeo, crevRimMat);
      const s = 0.14 + Math.random() * 0.22;
      rock.scale.setScalar(s);
      const side = i % 2 === 0 ? -1 : 1;
      rock.position.set(
        (Math.random() - 0.5) * CREVICE_WIDTH,
        s * 0.35,
        side * (CREVICE_DEPTH / 2 + Math.random() * 0.35)
      );
      rock.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      rock.castShadow = true;
      g.add(rock);
    }

    g.position.set(0, groundY(z), z);
    return g;
  }

  let activeObstacles = [];
  let furthestObstacleZ = -14;

  function spawnObstacle() {
    const z = furthestObstacleZ;
    furthestObstacleZ -= MIN_GAP + Math.random() * (MAX_GAP - MIN_GAP);

    const isCrevice = Math.random() < 0.28;

    if (isCrevice) {
      const mesh = buildCrevice(z);
      scene.add(mesh);
      activeObstacles.push({ mesh, z, lane: null, type: 'crevice' });
    } else {
      const lane = Math.floor(Math.random() * 3);
      const mesh = new THREE.Mesh(rockGeo, rockMat);
      mesh.scale.setScalar(0.7 + Math.random() * 0.5);
      mesh.position.set(LANES_X[lane], groundY(z) + 0.7, z);
      mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
      activeObstacles.push({ mesh, z, lane, type: 'rock' });
    }
  }

  function resetObstacles() {
    activeObstacles.forEach((o) => scene.remove(o.mesh));
    activeObstacles = [];
    furthestObstacleZ = -14;
  }

  // ---------- Decorative scenery (non-colliding) ----------
  const pineMat = new THREE.MeshStandardMaterial({ color: 0x2e5e3a, roughness: 0.9 });
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3323, roughness: 0.9 });
  const decoRockMat = new THREE.MeshStandardMaterial({ color: 0x8a8377, roughness: 0.95 });

  let sceneryItems = [];
  let furthestSceneryZ = -10;

  function spawnScenery() {
    const z = furthestSceneryZ;
    furthestSceneryZ -= SCENERY_MIN_GAP + Math.random() * (SCENERY_MAX_GAP - SCENERY_MIN_GAP);

    const side = Math.random() < 0.5 ? -1 : 1;
    const x = side * (LANE_WIDTH * 2 + 2 + Math.random() * 6);
    const group = new THREE.Group();

    if (Math.random() < 0.6) {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 1, 6), trunkMat);
      trunk.position.y = 0.5;
      group.add(trunk);
      const foliage = new THREE.Mesh(new THREE.ConeGeometry(0.7, 2, 8), pineMat);
      foliage.position.y = 1.6;
      foliage.castShadow = true;
      group.add(foliage);
    } else {
      const rock = new THREE.Mesh(rockGeo, decoRockMat);
      const s = 0.4 + Math.random() * 0.6;
      rock.scale.setScalar(s);
      rock.position.y = s * 0.5;
      rock.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
      rock.castShadow = true;
      group.add(rock);
    }

    group.position.set(x, groundY(z), z);
    scene.add(group);
    sceneryItems.push({ group, z });
  }

  function resetScenery() {
    sceneryItems.forEach((s) => scene.remove(s.group));
    sceneryItems = [];
    furthestSceneryZ = -10;
  }

  // ---------- Collectible shells (earn the hats) ----------
  const shellMat = new THREE.MeshStandardMaterial({
    color: 0xffe3b0,
    emissive: 0x7a4a00,
    emissiveIntensity: 0.35,
    roughness: 0.3,
    metalness: 0.15,
  });
  const shellGeo = new THREE.OctahedronGeometry(0.26, 0);

  let activeShells = [];
  let furthestShellZ = -8;
  let shellsCollected = 0;

  function spawnShell() {
    const z = furthestShellZ;
    furthestShellZ -= COLLECTIBLE_MIN_GAP + Math.random() * (COLLECTIBLE_MAX_GAP - COLLECTIBLE_MIN_GAP);

    const lane = Math.floor(Math.random() * 3);
    const mesh = new THREE.Mesh(shellGeo, shellMat);
    mesh.position.set(LANES_X[lane], groundY(z) + 0.55, z);
    mesh.castShadow = true;
    scene.add(mesh);
    activeShells.push({ mesh, z, lane });
  }

  function resetShells() {
    activeShells.forEach((s) => scene.remove(s.mesh));
    activeShells = [];
    furthestShellZ = -8;
    shellsCollected = 0;
  }

  function collectShellsNearCrab() {
    activeShells = activeShells.filter((s) => {
      if (s.lane !== currentLane) return true;
      if (Math.abs(s.z - crab.position.z) > COLLECT_Z_RADIUS) return true;
      scene.remove(s.mesh);
      shellsCollected += 1;
      checkHatUnlocks(shellsCollected);
      return false;
    });
  }

  // ---------- Pie powerup (30s giant-hat invincibility) ----------
  function buildPie() {
    const g = new THREE.Group();
    const crust = new THREE.Mesh(
      new THREE.CylinderGeometry(0.32, 0.34, 0.14, 16),
      new THREE.MeshStandardMaterial({ color: 0xd9a441, roughness: 0.6 })
    );
    g.add(crust);
    const filling = new THREE.Mesh(
      new THREE.CylinderGeometry(0.27, 0.27, 0.05, 16),
      new THREE.MeshStandardMaterial({ color: 0xb5432a, roughness: 0.5 })
    );
    filling.position.y = 0.09;
    g.add(filling);
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(0.33, 0.045, 8, 20),
      new THREE.MeshStandardMaterial({ color: 0xe8c07a, roughness: 0.6 })
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.02;
    g.add(rim);
    g.castShadow = true;
    return g;
  }

  // The invincibility hat is just the party hat, blown up huge.
  function buildGiantHat() {
    const g = buildPartyHat();
    g.scale.setScalar(2.4);
    return g;
  }

  const invincibleBadgeEl = document.getElementById('invincible-badge');
  const pieSplatEl = document.getElementById('pie-splat');

  let activePie = null; // { mesh, z, lane }
  let nextPieZ = PIE_FIRST_Z;
  let pieDue = true;
  let invincible = false;
  let invincibleEndTime = 0;
  let giantHatMesh = null;

  function trySpawnPie() {
    if (activePie || !pieDue) return;
    if (nextPieZ < crab.position.z - SPAWN_AHEAD) return;
    const lane = Math.floor(Math.random() * 3);
    const mesh = buildPie();
    mesh.position.set(LANES_X[lane], groundY(nextPieZ) + 0.5, nextPieZ);
    scene.add(mesh);
    activePie = { mesh, z: nextPieZ, lane };
    pieDue = false;
  }

  function scheduleNextPie() {
    nextPieZ = crab.position.z - (PIE_MIN_GAP + Math.random() * (PIE_MAX_GAP - PIE_MIN_GAP));
    pieDue = true;
  }

  function resetPie() {
    if (activePie) scene.remove(activePie.mesh);
    activePie = null;
    nextPieZ = PIE_FIRST_Z;
    pieDue = true;
  }

  function activateInvincibility() {
    invincible = true;
    invincibleEndTime = clock.elapsedTime + INVINCIBLE_DURATION;
    if (currentHatMesh) currentHatMesh.visible = false;
    if (!giantHatMesh) giantHatMesh = buildGiantHat();
    if (!giantHatMesh.parent) crab.userData.hatSlot.add(giantHatMesh);
    showHatToast('🥧 PIE POWER! Invincible for 30s!');
    invincibleBadgeEl.classList.remove('hidden');
  }

  function endInvincibility() {
    invincible = false;
    if (giantHatMesh) crab.userData.hatSlot.remove(giantHatMesh);
    if (currentHatMesh) currentHatMesh.visible = true;
    invincibleBadgeEl.classList.add('hidden');
    pieSplatEl.classList.remove('splat');
    void pieSplatEl.offsetWidth; // restart the splat animation
    pieSplatEl.classList.add('splat');
  }

  function resetInvincibility() {
    invincible = false;
    if (giantHatMesh && giantHatMesh.parent) crab.userData.hatSlot.remove(giantHatMesh);
    if (currentHatMesh) currentHatMesh.visible = true;
    invincibleBadgeEl.classList.add('hidden');
    pieSplatEl.classList.remove('splat');
  }

  function updatePie(dt) {
    while (activePie && activePie.z > crab.position.z + DESPAWN_BEHIND) {
      scene.remove(activePie.mesh);
      activePie = null;
      scheduleNextPie();
    }
    trySpawnPie();

    if (activePie) {
      activePie.mesh.rotation.y += dt * 1.6;
      if (activePie.lane === currentLane && Math.abs(activePie.z - crab.position.z) <= COLLECT_Z_RADIUS) {
        scene.remove(activePie.mesh);
        activePie = null;
        scheduleNextPie();
        activateInvincibility();
      }
    }

    if (invincible) {
      const remaining = invincibleEndTime - clock.elapsedTime;
      if (remaining <= 0) {
        endInvincibility();
      } else {
        invincibleBadgeEl.textContent = `🥧 Invincible: ${Math.ceil(remaining)}s`;
        if (giantHatMesh) {
          giantHatMesh.scale.setScalar(2.4 + Math.sin(clock.elapsedTime * 6) * 0.15);
        }
      }
    }
  }

  // ---------- Dad joke checkpoints ----------
  // Every JOKE_INTERVAL meters, the climb pauses for a groan-worthy dad joke.
  // Guess the punchline right and Dad gets an eye-roll; guess wrong and the
  // joke just... trails off.
  const DAD_JOKES = [
    { setup: 'Why did the crab never share his snacks?', correct: "Because he's shellfish.", wrong: "Because he's a-claw-ful at sharing." },
    { setup: 'What do you call a crab that plays baseball?', correct: 'A pinch hitter.', wrong: 'A sandy slugger.' },
    { setup: 'Why did the crab blush?', correct: 'Because the seaweed.', wrong: 'Because he pinched himself.' },
    { setup: "What's a crab's favorite day of the week?", correct: 'Fry-day.', wrong: 'Sun-day, obviously.' },
    { setup: 'Why was the crab such a good drummer?', correct: 'Because he always had the right snap.', wrong: 'Because he never missed a beat-le.' },
    { setup: 'What did the ocean say to the crab?', correct: 'Nothing, it just waved.', wrong: 'Nothing, it just shore did.' },
    { setup: 'Why did the crab stay home from the party?', correct: 'He was feeling a little crabby.', wrong: 'He forgot his shell-phone charger.' },
    { setup: "What's a crab's favorite kind of music?", correct: 'Anything with a good snap track.', wrong: 'Heavy metal — he’s got the claws for it.' },
  ];

  const jokeScreen = document.getElementById('joke-screen');
  const jokeSetupEl = document.getElementById('joke-setup');
  const jokeReactionEl = document.getElementById('joke-reaction');
  const jokeOptButtons = [document.getElementById('joke-opt-0'), document.getElementById('joke-opt-1')];

  let lastJokeTier = 0;
  let jokeResumeTimeout = null;

  function shufflePair(a, b) {
    return Math.random() < 0.5 ? [a, b] : [b, a];
  }

  function triggerJoke(index) {
    state.mode = 'joke';
    const joke = DAD_JOKES[((index % DAD_JOKES.length) + DAD_JOKES.length) % DAD_JOKES.length];
    jokeSetupEl.textContent = joke.setup;
    const options = shufflePair(joke.correct, joke.wrong);
    jokeReactionEl.textContent = '';
    jokeReactionEl.className = 'joke-reaction';
    jokeOptButtons.forEach((btn, i) => {
      btn.textContent = options[i];
      btn.disabled = false;
      btn.onclick = () => answerJoke(options[i] === joke.correct);
    });
    jokeScreen.classList.remove('hidden');
  }

  function answerJoke(correct) {
    jokeOptButtons.forEach((btn) => { btn.disabled = true; });
    if (correct) {
      jokeReactionEl.textContent = '🙄 Dad!';
      jokeReactionEl.className = 'joke-reaction correct';
    } else {
      jokeReactionEl.innerHTML = '… <span class="nevermind">nevermind.</span>';
      jokeReactionEl.className = 'joke-reaction wrong';
    }
    clearTimeout(jokeResumeTimeout);
    jokeResumeTimeout = setTimeout(() => {
      jokeScreen.classList.add('hidden');
      if (state.mode === 'joke') state.mode = 'playing';
    }, 1600);
  }

  function resetJokes() {
    lastJokeTier = 0;
    clearTimeout(jokeResumeTimeout);
    jokeScreen.classList.add('hidden');
  }

  // ---------- Input ----------
  const keys = { left: false, right: false, jump: false };
  let currentLane = 1; // index into LANES_X
  let laneChangeQueued = 0;

  function requestLaneChange(dir) {
    const target = currentLane + dir;
    if (target >= 0 && target <= 2) {
      currentLane = target;
    }
  }

  function requestJump() {
    if (state.mode !== 'playing') return;
    if (crab.userData.hop <= 0.001 && crab.userData.vy <= 0) {
      crab.userData.vy = JUMP_SPEED;
    }
  }

  window.addEventListener('keydown', (e) => {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
      if (!keys.left) requestLaneChange(-1);
      keys.left = true;
    } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
      if (!keys.right) requestLaneChange(1);
      keys.right = true;
    } else if (e.code === 'ArrowUp' || e.code === 'KeyW' || e.code === 'Space') {
      e.preventDefault();
      requestJump();
    } else if (e.code === 'Enter') {
      if (state.mode === 'start') startGame();
      else if (state.mode === 'gameover' || state.mode === 'win') startGame();
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = false;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = false;
  });

  document.getElementById('btn-left').addEventListener('touchstart', (e) => { e.preventDefault(); requestLaneChange(-1); });
  document.getElementById('btn-right').addEventListener('touchstart', (e) => { e.preventDefault(); requestLaneChange(1); });
  document.getElementById('btn-jump').addEventListener('touchstart', (e) => { e.preventDefault(); requestJump(); });
  document.getElementById('btn-left').addEventListener('click', () => requestLaneChange(-1));
  document.getElementById('btn-right').addEventListener('click', () => requestLaneChange(1));
  document.getElementById('btn-jump').addEventListener('click', () => requestJump());

  // ---------- Game state ----------
  const state = { mode: 'start' }; // 'start' | 'playing' | 'joke' | 'gameover' | 'win'
  const scoreEl = document.getElementById('score');
  const shellsEl = document.getElementById('shells');
  const bestEl = document.getElementById('best');
  const startScreen = document.getElementById('start-screen');
  const gameoverScreen = document.getElementById('gameover-screen');
  const gameoverTitle = document.getElementById('gameover-title');
  const gameoverScore = document.getElementById('gameover-score');
  const gameoverHats = document.getElementById('gameover-hats');
  const gameoverBest = document.getElementById('gameover-best');

  const BEST_KEY = 'crabClimb.bestHeight';
  function getBest() {
    return Number(localStorage.getItem(BEST_KEY) || 0);
  }
  function setBest(v) {
    localStorage.setItem(BEST_KEY, String(v));
  }
  bestEl.textContent = `Best: ${getBest()}m`;

  function startGame() {
    crab.position.set(LANES_X[1], groundY(0), 0);
    crab.userData.hop = 0;
    crab.userData.vy = 0;
    currentLane = 1;
    speed = BASE_SPEED;
    distance = 0;

    resetObstacles();
    resetScenery();
    resetShells();
    resetHats();
    resetJokes();
    resetPie();
    resetInvincibility();
    for (let i = 0; i < 6; i++) spawnObstacle();
    for (let i = 0; i < 14; i++) spawnScenery();
    for (let i = 0; i < 5; i++) spawnShell();

    shellsEl.textContent = `🐚 0`;
    startScreen.classList.add('hidden');
    gameoverScreen.classList.add('hidden');
    state.mode = 'playing';
  }

  function endGame(won) {
    state.mode = won ? 'win' : 'gameover';
    const heightM = Math.floor(distance);
    const best = getBest();
    const isNewBest = heightM > best;
    if (isNewBest) setBest(heightM);

    gameoverTitle.textContent = won ? '🏔️ Summit Reached!' : 'You Fell!';
    gameoverScore.textContent = won
      ? `You climbed all ${heightM}m to the top!`
      : `Height reached: ${heightM}m`;
    gameoverHats.textContent = `Hats earned: ${currentHatTier + 1}/${HAT_TIERS.length} · Shells: ${shellsCollected}`;
    gameoverBest.textContent = isNewBest ? 'New best height!' : `Best: ${Math.max(best, heightM)}m`;
    gameoverScreen.classList.remove('hidden');
    bestEl.textContent = `Best: ${Math.max(best, heightM)}m`;
  }

  document.getElementById('start-btn').addEventListener('click', startGame);
  document.getElementById('restart-btn').addEventListener('click', startGame);

  // ---------- Main loop ----------
  let speed = BASE_SPEED;
  let distance = 0;
  const clock = new THREE.Clock();

  crab.userData.hop = 0;
  crab.userData.vy = 0;
  crab.position.set(LANES_X[1], groundY(0), 0);

  function checkCollisions() {
    let destroyedAny = false;
    for (const o of activeObstacles) {
      if (Math.abs(o.z - crab.position.z) > COLLISION_Z_RADIUS) continue;

      if (o.type === 'rock' && o.lane === currentLane) {
        if (invincible) {
          scene.remove(o.mesh);
          o.destroyed = true;
          destroyedAny = true;
        } else {
          return true;
        }
      } else if (o.type === 'crevice' && crab.userData.hop < MIN_JUMP_HOP_TO_CLEAR_CREVICE) {
        if (!invincible) return true;
      }
    }
    if (destroyedAny) {
      activeObstacles = activeObstacles.filter((o) => !o.destroyed);
    }
    return false;
  }

  function update(dt) {
    if (state.mode !== 'playing') return;

    // Difficulty ramp
    const t = Math.min(distance / SPEED_RAMP_DISTANCE, 1);
    speed = BASE_SPEED + (MAX_SPEED - BASE_SPEED) * t;

    // Forward climb
    crab.position.z -= speed * dt;
    distance = -crab.position.z;

    // Dad joke checkpoint — pause the climb and quiz the player
    const jokeTier = Math.floor(distance / JOKE_INTERVAL);
    if (jokeTier > lastJokeTier) {
      lastJokeTier = jokeTier;
      triggerJoke(jokeTier - 1);
      return;
    }

    // Lane sliding
    const targetX = LANES_X[currentLane];
    const dx = targetX - crab.position.x;
    const step = LANE_SWITCH_SPEED * dt;
    if (Math.abs(dx) <= step) crab.position.x = targetX;
    else crab.position.x += Math.sign(dx) * step;

    // Jump physics
    crab.userData.vy -= GRAVITY * dt;
    crab.userData.hop += crab.userData.vy * dt;
    if (crab.userData.hop <= 0) {
      crab.userData.hop = 0;
      crab.userData.vy = 0;
    }
    crab.position.y = groundY(crab.position.z) + crab.userData.hop;

    // Leg / claw scuttle animation
    const walkPhase = clock.elapsedTime * (8 + speed * 0.5);
    crab.userData.legs.forEach((leg) => {
      const dirSign = leg.index % 2 === 0 ? 1 : -1;
      leg.group.rotation.x = Math.sin(walkPhase + leg.index * 1.4) * 0.45 * dirSign;
    });
    crab.userData.claws.forEach((claw, i) => {
      claw.rotation.x = Math.sin(walkPhase * 0.6 + i) * 0.08;
    });
    crab.rotation.z = Math.sin(walkPhase * 0.5) * 0.03;

    // Hat pop-in animation + propeller spin for the checkpoint reward hats
    if (currentHatMesh) {
      const age = clock.elapsedTime - hatPopStart;
      currentHatMesh.scale.setScalar(Math.min(1, age / 0.3));
      if (currentHatMesh.userData.propeller) {
        currentHatMesh.userData.propeller.rotation.y += dt * 16;
      }
    }

    // Spawn ahead / despawn behind — obstacles
    while (furthestObstacleZ > crab.position.z - SPAWN_AHEAD) spawnObstacle();
    activeObstacles = activeObstacles.filter((o) => {
      if (o.z > crab.position.z + DESPAWN_BEHIND) {
        scene.remove(o.mesh);
        return false;
      }
      return true;
    });

    // Spawn ahead / despawn behind — scenery
    while (furthestSceneryZ > crab.position.z - SCENERY_SPAWN_AHEAD) spawnScenery();
    sceneryItems = sceneryItems.filter((s) => {
      if (s.z > crab.position.z + DESPAWN_BEHIND) {
        scene.remove(s.group);
        return false;
      }
      return true;
    });

    // Spawn ahead / despawn behind — collectible shells
    while (furthestShellZ > crab.position.z - SPAWN_AHEAD) spawnShell();
    activeShells = activeShells.filter((s) => {
      if (s.z > crab.position.z + DESPAWN_BEHIND) {
        scene.remove(s.mesh);
        return false;
      }
      return true;
    });
    collectShellsNearCrab();
    activeShells.forEach((s) => { s.mesh.rotation.y += dt * 2.2; });
    shellsEl.textContent = `🐚 ${shellsCollected}`;

    // Pie powerup — spawn/despawn/collect + invincibility countdown
    updatePie(dt);

    // Camera follow
    camera.position.set(
      crab.position.x + CAMERA_OFFSET.x,
      crab.position.y + CAMERA_OFFSET.y,
      crab.position.z + CAMERA_OFFSET.z
    );
    const lookTarget = new THREE.Vector3(
      crab.position.x + CAMERA_LOOK_OFFSET.x,
      crab.position.y + CAMERA_LOOK_OFFSET.y,
      crab.position.z + CAMERA_LOOK_OFFSET.z
    );
    camera.lookAt(lookTarget);

    sun.position.set(crab.position.x - 20, crab.position.y + 40, crab.position.z + 15);
    sun.target.position.copy(crab.position);

    // Score
    scoreEl.textContent = `Height: ${Math.floor(distance)}m`;

    // Win / lose checks
    if (distance >= WIN_DISTANCE) {
      endGame(true);
      return;
    }
    if (checkCollisions()) {
      endGame(false);
    }
  }

  function render() {
    renderer.render(scene, camera);
  }

  function loop() {
    const dt = Math.min(clock.getDelta(), 0.05);
    update(dt);
    render();
    requestAnimationFrame(loop);
  }

  // Idle camera framing before the game starts
  camera.position.set(LANES_X[1] + CAMERA_OFFSET.x, groundY(0) + CAMERA_OFFSET.y, CAMERA_OFFSET.z);
  camera.lookAt(new THREE.Vector3(LANES_X[1], groundY(0) + 1.4, -6));

  requestAnimationFrame(loop);
})();
