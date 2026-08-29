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
  function groundY(z) {
    return -z * Math.tan(SLOPE_ANGLE);
  }

  const groundMat = new THREE.MeshStandardMaterial({ color: 0x7fae5b, roughness: 0.95 });
  const groundGeo = new THREE.PlaneGeometry(60, 2200, 1, 1);
  const ground = new THREE.Mesh(groundGeo, groundMat);
  // Rotating a flat plane about X by (-90deg + SLOPE_ANGLE) makes its surface
  // satisfy world.y = -world.z * tan(SLOPE_ANGLE), matching groundY() exactly.
  ground.rotation.x = -Math.PI / 2 + SLOPE_ANGLE;
  ground.receiveShadow = true;
  scene.add(ground);

  // A rocky path strip down the middle lanes for visual clarity
  const pathMat = new THREE.MeshStandardMaterial({ color: 0x9a8266, roughness: 1 });
  const pathGeo = new THREE.PlaneGeometry(LANE_WIDTH * 2 + 3, 2200, 1, 1);
  const path = new THREE.Mesh(pathGeo, pathMat);
  path.rotation.x = ground.rotation.x;
  path.position.copy(ground.position);
  path.position.y += 0.01;
  path.receiveShadow = true;
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

    crab.userData.legs = legs;
    crab.userData.claws = claws;
    return crab;
  }

  const crab = createCrab();
  crab.castShadow = true;
  scene.add(crab);

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
  const crevMat = new THREE.MeshStandardMaterial({ color: 0x1c1108, roughness: 1 });

  let activeObstacles = [];
  let furthestObstacleZ = -14;

  function spawnObstacle() {
    const z = furthestObstacleZ;
    furthestObstacleZ -= MIN_GAP + Math.random() * (MAX_GAP - MIN_GAP);

    const isCrevice = Math.random() < 0.28;

    if (isCrevice) {
      const geo = new THREE.PlaneGeometry(LANE_WIDTH * 3 + 1, 1.4);
      const mesh = new THREE.Mesh(geo, crevMat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(0, groundY(z) + 0.02, z);
      mesh.receiveShadow = true;
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
  const state = { mode: 'start' }; // 'start' | 'playing' | 'gameover' | 'win'
  const scoreEl = document.getElementById('score');
  const bestEl = document.getElementById('best');
  const startScreen = document.getElementById('start-screen');
  const gameoverScreen = document.getElementById('gameover-screen');
  const gameoverTitle = document.getElementById('gameover-title');
  const gameoverScore = document.getElementById('gameover-score');
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
    for (let i = 0; i < 6; i++) spawnObstacle();
    for (let i = 0; i < 14; i++) spawnScenery();

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
    for (const o of activeObstacles) {
      if (Math.abs(o.z - crab.position.z) > COLLISION_Z_RADIUS) continue;

      if (o.type === 'rock') {
        if (o.lane === currentLane) return true;
      } else if (o.type === 'crevice') {
        if (crab.userData.hop < MIN_JUMP_HOP_TO_CLEAR_CREVICE) return true;
      }
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
