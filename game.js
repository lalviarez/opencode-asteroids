'use strict';

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const W = 800;
const H = 600;

// ── Input ─────────────────────────────────────────────────────────────────────
const keys = {};
const justPressed = {};

window.addEventListener('keydown', e => {
  justPressed[e.code] = !keys[e.code];
  keys[e.code] = true;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code))
    e.preventDefault();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });

function pressed(code) {
  const val = justPressed[code];
  justPressed[code] = false;
  return val;
}

// ── Utils ─────────────────────────────────────────────────────────────────────
const wrap  = (v, max) => ((v % max) + max) % max;
const dist  = (a, b)   => Math.hypot(a.x - b.x, a.y - b.y);
const rand  = (min, max) => min + Math.random() * (max - min);
const randInt = (min, max) => Math.floor(rand(min, max + 1));

// ── Skins ─────────────────────────────────────────────────────────────────────
// Cada skin define silueta (verts), color del trazo y color de la llama.
// Las narices se mantienen entre 17 y 23 px para que el spawn de balas
// (NOSE = 21 en Ship.tryShoot) siga coincidiendo visualmente.
const SKINS = [
  { name: 'CLÁSICA', color: '#fff', flame: 'rgba(255, 130, 0, 0.85)',
    verts: [[20, 0], [-12, -9], [-7, 0], [-12, 9]] },
  { name: 'DARDO', color: '#0ff', flame: 'rgba(255, 255, 255, 0.85)',
    verts: [[22, 0], [-10, -6], [-5, 0], [-10, 6]] },
  { name: 'CAZA', color: '#4f4', flame: 'rgba(120, 255, 120, 0.85)',
    verts: [[20, 0], [-14, -10], [-6, -3], [-9, 0], [-6, 3], [-14, 10]] },
  { name: 'CUÑA', color: '#f6f', flame: 'rgba(255, 100, 255, 0.85)',
    verts: [[23, 0], [-13, -13], [-5, 0], [-13, 13]] },
  { name: 'COHETE', color: '#fd5', flame: 'rgba(255, 220, 80, 0.9)',
    verts: [[17, 0], [-7, -5], [-14, -12], [-8, -3], [-8, 3], [-14, 12], [-7, 5]] },
];

const SKIN_KEY = 'asteroids-skin';  // clave de localStorage

function loadSkin() {
  try {
    const i = Number(localStorage.getItem(SKIN_KEY));
    return Number.isInteger(i) && i >= 0 && i < SKINS.length ? i : 0;
  } catch { return 0; }  // file:// puede bloquear localStorage
}

function saveSkin() {
  try { localStorage.setItem(SKIN_KEY, String(skinIndex)); } catch {}
}

let skinIndex = loadSkin();
let skinToast = 0;  // segundos restantes del aviso "SKIN: ..." en el HUD

// ── Bullet ────────────────────────────────────────────────────────────────────
class Bullet {
  constructor(x, y, angle, color = '#fff') {
    this.x = x;
    this.y = y;
    const SPEED = 520;
    this.vx = Math.cos(angle) * SPEED;
    this.vy = Math.sin(angle) * SPEED;
    this.ttl  = 1.1;
    this.radius = 2;
    this.color = color;
    this.dead = false;
  }

  update(dt) {
    this.x = wrap(this.x + this.vx * dt, W);
    this.y = wrap(this.y + this.vy * dt, H);
    this.ttl -= dt;
    if (this.ttl <= 0) this.dead = true;
  }

  draw() {
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ── Asteroid ──────────────────────────────────────────────────────────────────
const RADII  = [0, 16, 30, 50];   // por tamaño 1, 2, 3
const SPEEDS = [0, 85, 55, 32];   // velocidad base por tamaño
const POINTS = [0, 100, 50, 20];  // puntos por tamaño

class Asteroid {
  constructor(x, y, size = 3) {
    this.x    = x;
    this.y    = y;
    this.size = size;
    this.radius = RADII[size];
    this.dead = false;

    const angle = rand(0, Math.PI * 2);
    const speed = SPEEDS[size] + rand(-15, 15);
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.rotSpeed = rand(-1.2, 1.2);
    this.rot = rand(0, Math.PI * 2);

    // Polígono irregular
    const n = randInt(8, 13);
    this.verts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = this.radius * rand(0.6, 1.0);
      this.verts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
  }

  update(dt) {
    this.x   = wrap(this.x + this.vx * dt, W);
    this.y   = wrap(this.y + this.vy * dt, H);
    this.rot += this.rotSpeed * dt;
  }

  split() {
    if (this.size <= 1) return [];
    return [
      new Asteroid(this.x, this.y, this.size - 1),
      new Asteroid(this.x, this.y, this.size - 1),
    ];
  }

  draw() {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rot);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth   = 1.5;
    ctx.lineJoin    = 'round';
    ctx.beginPath();
    ctx.moveTo(this.verts[0][0], this.verts[0][1]);
    for (let i = 1; i < this.verts.length; i++)
      ctx.lineTo(this.verts[i][0], this.verts[i][1]);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }
}

// ── Estrella fugaz ────────────────────────────────────────────────────────────
const STAR_POINTS = 200;  // puntos bonus por destruirla

class ShootingStar {
  constructor() {
    // Nace lejos de la nave para no aparecer encima de ella
    let x, y;
    do {
      x = rand(0, W);
      y = rand(0, H);
    } while (Math.hypot(x - ship.x, y - ship.y) < 180);
    this.x = x;
    this.y = y;

    // Mucho más rápida que cualquier asteroide
    const angle = rand(0, Math.PI * 2);
    const speed = rand(300, 380);
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;

    this.radius     = 18;
    this.ttl        = 7;
    this.rotSpeed   = rand(-2, 2);
    this.rot        = rand(0, Math.PI * 2);
    this.trailTimer = 0;
    this.dead       = false;

    // Estrella de 5 puntas: 10 vértices alternando radio exterior e interior
    const R_OUT = 18;
    const R_IN  = 7.5;
    this.verts = [];
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 === 0 ? R_OUT : R_IN;
      this.verts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
  }

  update(dt) {
    this.x   = wrap(this.x + this.vx * dt, W);
    this.y   = wrap(this.y + this.vy * dt, H);
    this.rot += this.rotSpeed * dt;

    // Estela de partículas azuladas
    this.trailTimer -= dt;
    if (this.trailTimer <= 0) {
      this.trailTimer = 0.04;
      particles.push(new Particle(this.x, this.y, '#7df'));
    }

    this.ttl -= dt;
    if (this.ttl <= 0) this.dead = true;
  }

  draw() {
    // Parpadeo cuando está por expirar
    if (this.ttl < 2 && Math.floor(this.ttl * 8) % 2 === 0) return;

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rot);
    ctx.strokeStyle = '#7df';
    ctx.lineWidth   = 1.5;
    ctx.lineJoin    = 'round';
    ctx.beginPath();
    ctx.moveTo(this.verts[0][0], this.verts[0][1]);
    for (let i = 1; i < this.verts.length; i++)
      ctx.lineTo(this.verts[i][0], this.verts[i][1]);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }
}

// ── Ship ──────────────────────────────────────────────────────────────────────
const BURST_DELAY     = 0.06;  // s entre balas de la ráfaga del triple disparo
const SHIELD_TIME     = 3;   // segundos de escudo activo
const SHIELD_COOLDOWN = 8;   // segundos de recarga tras expirar
const SHIELD_RADIUS   = 30;  // radio del círculo del escudo

class Ship {
  constructor() { this.reset(); }

  reset() {
    this.x      = W / 2;
    this.y      = H / 2;
    this.angle  = -Math.PI / 2;
    this.vx     = 0;
    this.vy     = 0;
    this.radius = 12;
    this.thrusting      = false;
    this.invincible     = 3;
    this.shootCooldown  = 0;
    this.speedBoost     = 0;
    this.tripleShot     = 0;
    this.burstQueue     = 0;  // balas pendientes de la ráfaga
    this.burstTimer     = 0;  // cuenta atrás para la siguiente bala de la ráfaga
    this.shieldTime     = 0;
    this.shieldCooldown = 0;
    this.dead           = false;
  }

  update(dt) {
    const spawned = [];
    if (this.dead) return spawned;
    if (this.invincible     > 0) this.invincible     -= dt;
    if (this.shootCooldown  > 0) this.shootCooldown  -= dt;
    if (this.speedBoost     > 0) this.speedBoost     -= dt;
    if (this.tripleShot     > 0) this.tripleShot     -= dt;
    if (this.shieldTime     > 0) this.shieldTime     -= dt;
    if (this.shieldCooldown > 0) this.shieldCooldown -= dt;

    // Ráfaga del triple disparo: balas pendientes salen con delay entre sí
    if (this.burstQueue > 0) {
      this.burstTimer -= dt;
      if (this.burstTimer <= 0) {
        this.burstQueue--;
        this.burstTimer = BURST_DELAY;
        spawned.push(this.fireBullet());
      }
    }

    const ROT   = 3.5;   // rad/s
    const THRUST = 260;  // px/s²
    const DRAG   = 0.987;

    if (keys['ArrowLeft'])  this.angle -= ROT * dt;
    if (keys['ArrowRight']) this.angle += ROT * dt;

    this.thrusting = !!keys['ArrowUp'];
    if (this.thrusting) {
      // Empuje duplicado mientras dura el power-up de velocidad
      const boost = this.speedBoost > 0 ? 2 : 1;
      this.vx += Math.cos(this.angle) * THRUST * boost * dt;
      this.vy += Math.sin(this.angle) * THRUST * boost * dt;
    }

    this.vx *= DRAG;
    this.vy *= DRAG;
    this.x = wrap(this.x + this.vx * dt, W);
    this.y = wrap(this.y + this.vy * dt, H);

    return spawned;
  }

  fireBullet() {
    const NOSE = 21;
    // Las balas acompañan el color del skin activo (amarillas con triple disparo)
    const color = this.tripleShot > 0 ? '#ff0' : SKINS[skinIndex].color;
    return new Bullet(
      this.x + Math.cos(this.angle) * NOSE,
      this.y + Math.sin(this.angle) * NOSE,
      this.angle,
      color
    );
  }

  tryShoot() {
    if (this.shootCooldown > 0 || this.dead) return [];
    this.shootCooldown = 0.2;
    const bullet = this.fireBullet();
    // Triple disparo: la 1ª bala sale ya; las otras 2 se programan en ráfaga
    if (this.tripleShot > 0) {
      this.burstQueue = 2;
      this.burstTimer = BURST_DELAY;
    }
    return [bullet];
  }

  tryShield() {
    // Solo si terminó la recarga; el ciclo completo es duración + recarga
    if (this.shieldCooldown > 0 || this.dead) return;
    this.shieldTime     = SHIELD_TIME;
    this.shieldCooldown = SHIELD_TIME + SHIELD_COOLDOWN;
  }

  draw() {
    if (this.dead) return;
    // Parpadeo durante invencibilidad de reaparición
    if (this.invincible > 0 && Math.floor(this.invincible * 8) % 2 === 0) return;

    const skin = SKINS[skinIndex];

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    ctx.strokeStyle = skin.color;
    ctx.lineWidth   = 1.5;
    ctx.lineJoin    = 'round';

    // Silueta según el skin activo
    ctx.beginPath();
    ctx.moveTo(skin.verts[0][0], skin.verts[0][1]);
    for (let i = 1; i < skin.verts.length; i++)
      ctx.lineTo(skin.verts[i][0], skin.verts[i][1]);
    ctx.closePath();
    ctx.stroke();

    // Llama del propulsor (cian con el power-up de velocidad activo)
    if (this.thrusting && Math.random() > 0.35) {
      ctx.beginPath();
      ctx.moveTo(-8, -4);
      ctx.lineTo(-8 - rand(6, 14), 0);
      ctx.lineTo(-8,  4);
      ctx.strokeStyle = this.speedBoost > 0
        ? 'rgba(0, 255, 255, 0.9)'
        : skin.flame;
      ctx.stroke();
    }

    ctx.restore();

    // Escudo: anillo cian pulsante, parpadea cuando está por expirar
    if (this.shieldTime > 0) {
      const blink = this.shieldTime < 1 && Math.floor(this.shieldTime * 8) % 2 === 0;
      if (!blink) {
        const pulse = 1 + Math.sin(this.shieldTime * 6) * 0.06;
        ctx.strokeStyle = '#0ff';
        ctx.lineWidth   = 1.5;
        ctx.beginPath();
        ctx.arc(this.x, this.y, SHIELD_RADIUS * pulse, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }
}

// ── Partículas (explosión) ────────────────────────────────────────────────────
class Particle {
  constructor(x, y, color = '#fff') {
    this.x  = x;
    this.y  = y;
    const angle = rand(0, Math.PI * 2);
    const speed = rand(30, 130);
    this.vx   = Math.cos(angle) * speed;
    this.vy   = Math.sin(angle) * speed;
    this.life = rand(0.4, 1.1);
    this.ttl  = this.life;
    this.color = color;
    this.dead = false;
  }

  update(dt) {
    this.x  += this.vx * dt;
    this.y  += this.vy * dt;
    this.ttl -= dt;
    if (this.ttl <= 0) this.dead = true;
  }

  draw() {
    const alpha = this.ttl / this.life;
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    ctx.lineTo(this.x - this.vx * 0.05, this.y - this.vy * 0.05);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

// ── Power-up (Velocidad) ──────────────────────────────────────────────────────
class PowerUp {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    const angle = rand(0, Math.PI * 2);
    const speed = rand(30, 50);
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.radius = 13;
    this.ttl  = 10;
    this.dead = false;
  }

  update(dt) {
    this.x = wrap(this.x + this.vx * dt, W);
    this.y = wrap(this.y + this.vy * dt, H);
    this.ttl -= dt;
    if (this.ttl <= 0) this.dead = true;
  }

  draw() {
    // Parpadeo cuando está por expirar
    if (this.ttl < 3 && Math.floor(this.ttl * 8) % 2 === 0) return;

    ctx.save();
    ctx.translate(this.x, this.y);

    // Círculo pulsante
    const pulse = 1 + Math.sin(this.ttl * 6) * 0.08;
    ctx.strokeStyle = '#0ff';
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, this.radius * pulse, 0, Math.PI * 2);
    ctx.stroke();

    // Rayo: símbolo de velocidad
    ctx.beginPath();
    ctx.moveTo( 3, -7);
    ctx.lineTo(-4,  2);
    ctx.lineTo(-1,  2);
    ctx.lineTo(-3,  7);
    ctx.lineTo( 4, -2);
    ctx.lineTo( 1, -2);
    ctx.closePath();
    ctx.fillStyle = '#0ff';
    ctx.fill();

    ctx.restore();
  }
}

// ── Estado del juego ──────────────────────────────────────────────────────────
let ship, bullets, asteroids, particles, powerUps, shootingStars;
let starTimer;  // cuenta atrás para la próxima estrella fugaz
let score, lives, level;
let state;      // 'playing' | 'dead' | 'gameover'
let deadTimer;

function spawnAsteroids(count) {
  const SAFE_DIST = 130;
  for (let i = 0; i < count; i++) {
    let x, y;
    do {
      x = rand(0, W);
      y = rand(0, H);
    } while (Math.hypot(x - W / 2, y - H / 2) < SAFE_DIST);
    asteroids.push(new Asteroid(x, y, 3));
  }
}

function initGame() {
  ship          = new Ship();
  bullets   = [];
  asteroids = [];
  particles = [];
  powerUps = [];
  shootingStars = [];
  starTimer = rand(4, 8);
  score  = 0;
  lives  = 3;
  level  = 1;
  state  = 'playing';
  spawnAsteroids(4);
}

function nextLevel() {
  level++;
  bullets   = [];
  particles = [];
  powerUps = [];
  shootingStars = [];
  starTimer = rand(4, 8);
  ship.reset();
  spawnAsteroids(3 + level);
}

function explode(x, y, count = 8, color = '#fff') {
  for (let i = 0; i < count; i++) particles.push(new Particle(x, y, color));
}

function killShip() {
  explode(ship.x, ship.y, 14);
  ship.dead = true;
  lives--;
  if (lives <= 0) {
    state = 'gameover';
  } else {
    state     = 'dead';
    deadTimer = 2;
  }
}

// ── Update ────────────────────────────────────────────────────────────────────
function update(dt) {
  // Rotar skin con C (válido en cualquier estado; pressed se consume una vez por frame)
  if (skinToast > 0) skinToast -= dt;
  if (pressed('KeyC')) {
    skinIndex = (skinIndex + 1) % SKINS.length;
    saveSkin();
    skinToast = 1.5;
  }

  // Descarta pulsaciones de escudo pendientes mientras no se juega
  if (state !== 'playing') justPressed['KeyS'] = false;

  if (state === 'gameover') {
    if (pressed('Space')) initGame();
    particles.forEach(p => p.update(dt));
    particles = particles.filter(p => !p.dead);
    return;
  }

  if (state === 'dead') {
    deadTimer -= dt;
    particles.forEach(p => p.update(dt));
    particles = particles.filter(p => !p.dead);
    asteroids.forEach(a => a.update(dt));
    shootingStars.forEach(s => s.update(dt));
    shootingStars = shootingStars.filter(s => !s.dead);
    powerUps.forEach(p => p.update(dt));
    powerUps = powerUps.filter(p => !p.dead);
    if (deadTimer <= 0) { state = 'playing'; ship.reset(); }
    return;
  }

  // Disparar
  if (pressed('Space')) {
    bullets.push(...ship.tryShoot());
  }

  // Activar escudo (S)
  if (pressed('KeyS')) ship.tryShield();

  // Aparición periódica de estrellas fugaces (máx. 2 en pantalla)
  starTimer -= dt;
  if (starTimer <= 0) {
    starTimer = rand(6, 12);
    if (shootingStars.length < 2) shootingStars.push(new ShootingStar());
  }

  bullets.push(...ship.update(dt));
  bullets.forEach(b => b.update(dt));
  asteroids.forEach(a => a.update(dt));
  shootingStars.forEach(s => s.update(dt));
  particles.forEach(p => p.update(dt));
  powerUps.forEach(p => p.update(dt));

  bullets        = bullets.filter(b => !b.dead);
  particles      = particles.filter(p => !p.dead);
  powerUps       = powerUps.filter(p => !p.dead);
  shootingStars  = shootingStars.filter(s => !s.dead);

  // Bala vs asteroide
  const newAsteroids = [];
  for (const b of bullets) {
    for (const a of asteroids) {
      if (!a.dead && !b.dead && dist(b, a) < a.radius) {
        b.dead = true;
        a.dead = true;
        score += POINTS[a.size];
        explode(a.x, a.y, a.size * 5);
        newAsteroids.push(...a.split());
        // Probabilidad de que el asteroide suelte un power-up de velocidad
        if (Math.random() < 0.12 && powerUps.length < 2)
          powerUps.push(new PowerUp(a.x, a.y));
      }
    }
  }
  asteroids = asteroids.filter(a => !a.dead).concat(newAsteroids);
  bullets   = bullets.filter(b => !b.dead);

  // Bala vs estrella fugaz: no se divide, otorga puntos bonus y triple disparo
  for (const b of bullets) {
    for (const s of shootingStars) {
      if (!s.dead && !b.dead && dist(b, s) < s.radius) {
        b.dead = true;
        s.dead = true;
        score += STAR_POINTS;
        ship.tripleShot = 5;  // recolectar otra estrella reinicia el timer
        explode(s.x, s.y, 12, '#7df');
      }
    }
  }
  shootingStars = shootingStars.filter(s => !s.dead);
  bullets       = bullets.filter(b => !b.dead);

  // Escudo vs asteroide: lo destruye y divide, sin dar puntos
  const shielded = !ship.dead && ship.shieldTime > 0;
  if (shielded) {
    const fragments = [];
    for (const a of asteroids) {
      if (!a.dead && dist(ship, a) < SHIELD_RADIUS + a.radius) {
        a.dead = true;
        explode(a.x, a.y, a.size * 5, '#0ff');
        fragments.push(...a.split());
      }
    }
    asteroids = asteroids.filter(a => !a.dead).concat(fragments);
  }

  // Nave vs asteroide (letal salvo con el escudo activo)
  if (!shielded && ship.invincible <= 0) {
    for (const a of asteroids) {
      if (dist(ship, a) < ship.radius + a.radius * 0.82) {
        killShip();
        break;
      }
    }
  }

  // Nave vs estrella fugaz (el escudo no la bloquea; respeta la invencibilidad)
  if (!ship.dead && ship.invincible <= 0) {
    for (const s of shootingStars) {
      if (dist(ship, s) < ship.radius + s.radius * 0.82) {
        killShip();
        break;
      }
    }
  }

  // Nave vs power-up: velocidad x2 durante 5 s (recolectar reinicia el timer)
  if (!ship.dead) {
    for (const p of powerUps) {
      if (dist(ship, p) < ship.radius + p.radius) {
        p.dead = true;
        ship.speedBoost = 5;
        explode(p.x, p.y, 10, '#0ff');
        break;
      }
    }
    powerUps = powerUps.filter(p => !p.dead);
  }

  // Nivel completado
  if (asteroids.length === 0) nextLevel();
}

// ── Draw ──────────────────────────────────────────────────────────────────────
function drawLifeIcon(x, y) {
  const skin  = SKINS[skinIndex];
  const SCALE = 0.45;  // miniatura del polígono del skin
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-Math.PI / 2);
  ctx.scale(SCALE, SCALE);
  ctx.strokeStyle = skin.color;
  ctx.lineWidth   = 1.2 / SCALE;  // compensar la escala para mantener el grosor
  ctx.lineJoin    = 'round';
  ctx.beginPath();
  ctx.moveTo(skin.verts[0][0], skin.verts[0][1]);
  for (let i = 1; i < skin.verts.length; i++)
    ctx.lineTo(skin.verts[i][0], skin.verts[i][1]);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

function drawPowerBar(y, label, remaining, max, color) {
  const barW = 160;
  const barH = 6;
  const x = W / 2 - barW / 2;

  ctx.textAlign = 'center';
  ctx.font      = '11px monospace';
  ctx.fillStyle = color;
  ctx.fillText(label, W / 2, y - 6);

  ctx.strokeStyle = color;
  ctx.lineWidth   = 1;
  ctx.strokeRect(x, y, barW, barH);

  ctx.fillRect(x + 1, y + 1, (barW - 2) * (remaining / max), barH - 2);
}

function drawHUD() {
  ctx.fillStyle = '#fff';
  ctx.font = '15px monospace';

  ctx.textAlign = 'left';
  ctx.fillText(`SCORE  ${score}`, 14, 26);

  ctx.textAlign = 'center';
  ctx.fillText(`NIVEL ${level}`, W / 2, 26);

  for (let i = 0; i < lives; i++)
    drawLifeIcon(W - 16 - i * 22, 18);

  // Aviso temporal del skin activo tras rotar con C
  if (skinToast > 0) {
    ctx.textAlign   = 'center';
    ctx.font        = '13px monospace';
    ctx.fillStyle   = SKINS[skinIndex].color;
    ctx.globalAlpha = Math.min(1, skinToast / 0.4);  // desvanecimiento final
    ctx.fillText(`SKIN: ${SKINS[skinIndex].name}`, W / 2, 48);
    ctx.globalAlpha = 1;
  }

  // Barras de power-ups y escudo, apiladas desde abajo
  if (!ship.dead) {
    let y = H - 24;
    if (ship.tripleShot > 0) {
      drawPowerBar(y, `TRIPLE ${ship.tripleShot.toFixed(1)}s`, ship.tripleShot, 5, '#ff0');
      y -= 18;
    }
    if (ship.speedBoost > 0) {
      drawPowerBar(y, `VELOCIDAD ${ship.speedBoost.toFixed(1)}s`, ship.speedBoost, 5, '#0ff');
      y -= 18;
    }
    // Escudo: drena en cian mientras dura; en recarga se llena en cian tenue
    if (ship.shieldTime > 0) {
      drawPowerBar(y, `ESCUDO ${ship.shieldTime.toFixed(1)}s`, ship.shieldTime, SHIELD_TIME, '#0ff');
    } else if (ship.shieldCooldown > 0) {
      const cycle = SHIELD_TIME + SHIELD_COOLDOWN;
      drawPowerBar(y, 'ESCUDO RECARGANDO', cycle - ship.shieldCooldown, cycle, 'rgba(0, 255, 255, 0.45)');
    }
  }
}

function drawOverlay(title, sub) {
  ctx.textAlign   = 'center';
  ctx.fillStyle   = '#fff';
  ctx.font        = 'bold 46px monospace';
  ctx.fillText(title, W / 2, H / 2 - 18);
  ctx.font        = '18px monospace';
  ctx.fillStyle   = 'rgba(255,255,255,0.65)';
  ctx.fillText(sub, W / 2, H / 2 + 22);
}

function draw() {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  particles.forEach(p => p.draw());
  asteroids.forEach(a => a.draw());
  shootingStars.forEach(s => s.draw());
  powerUps.forEach(p => p.draw());
  bullets.forEach(b => b.draw());
  ship.draw();

  drawHUD();

  if (state === 'gameover')
    drawOverlay('GAME OVER', `PUNTAJE: ${score}   —   ESPACIO PARA REINICIAR`);
}

// ── Loop principal ────────────────────────────────────────────────────────────
let lastTime = null;

function loop(ts) {
  const dt = lastTime === null ? 0 : Math.min((ts - lastTime) / 1000, 0.05);
  lastTime = ts;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

initGame();
requestAnimationFrame(loop);
