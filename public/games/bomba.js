// 💣 Bomba Ustası — gerçek zamanlı Bomberman
// Oyunu oda sahibinin cihazı yönetir. Sol başparmak yürür, sağdaki 💣 bomba bırakır.
// Bomba 2,4 sn sonra + şeklinde patlar; kutuları kırar, zinciri tetikler. 70. saniyeden sonra
// duvarlar spiral halinde içeri kapanır. Son kalan kazanır.
import { realtimeServer, shuffle } from './util.js';

export const KIND = 'bomba';
export const TITLE = 'Bomba Ustası';
export const EMOJI = '💣';
export const RULES = [
  'Sol başparmakla yürü, 💣 ile bomba bırak ve kaç!',
  'Kutulardan 🔥 menzil, 💣 bomba, 👟 hız çıkar.',
  'Bir süre sonra duvarlar kapanır. Son kalan kazanır!',
];
export const { realtime, PLACE_MS, init, normalize, auto, resolve, ranking, view } = realtimeServer();

export const COLS = 11, ROWS = 13;
export const FUSE = 2.4, FLAME = 0.55, SUDDEN = 70, COLLAPSE_STEP = 0.3;
const MAX_TIME = 150;
const DIRS = [[0, -1, 'U'], [0, 1, 'D'], [-1, 0, 'L'], [1, 0, 'R']];
export const idx = (r, c) => r * COLS + c;
export const rc = (i) => [Math.floor(i / COLS), i % COLS];

const SPAWNS = [[1, 1], [11, 9], [1, 9], [11, 1], [1, 5], [11, 5], [5, 1], [7, 9], [5, 9], [7, 1]];

// Spiral kapanma sırası (dıştan içe)
const SPIRAL = (() => {
  const out = [];
  let top = 1, left = 1, bottom = ROWS - 2, right = COLS - 2;
  while (top <= bottom && left <= right) {
    for (let c = left; c <= right; c++) out.push(idx(top, c));
    for (let r = top + 1; r <= bottom; r++) out.push(idx(r, right));
    if (top < bottom) for (let c = right - 1; c >= left; c--) out.push(idx(bottom, c));
    if (left < right) for (let r = bottom - 1; r > top; r--) out.push(idx(r, left));
    top++; left++; bottom--; right--;
  }
  return out;
})();

export function createSim(players) {
  const grid = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    grid.push(r === 0 || c === 0 || r === ROWS - 1 || c === COLS - 1 || (r % 2 === 0 && c % 2 === 0) ? '#' : '.');
  }
  const ps = {};
  const clear = new Set();
  players.forEach((p, i) => {
    const [r, c] = SPAWNS[i % SPAWNS.length];
    ps[p.id] = { id: p.id, bot: !!p.bot, x: c + 0.5, y: r + 0.5, dir: 'D', alive: true, range: 2, max: 1, speed: 3.2, deadAt: null, path: [], think: 0 };
    for (const [dr, dc] of [[0, 0], [0, 1], [0, -1], [1, 0], [-1, 0], [0, 2], [0, -2], [2, 0], [-2, 0]]) clear.add(idx(r + dr, c + dc));
  });
  const hidden = {};
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] !== '.' || clear.has(i) || Math.random() > 0.55) continue;
    grid[i] = 'x';
    if (Math.random() < 0.36) { const r = Math.random(); hidden[i] = r < 0.4 ? 'fire' : r < 0.75 ? 'bomb' : 'speed'; }
  }
  return { t: 0, phase: 'wait', cd: 3, grid, hidden, items: {}, ps, bombs: [], flames: [], bombSeq: 0, outs: [], collapse: 0, colT: 0, events: [], endT: null };
}
export const startCountdown = (sim) => { if (sim.phase === 'wait') { sim.phase = 'count'; sim.cd = 3; } };

const bombAt = (sim, r, c) => sim.bombs.find((b) => b.r === r && b.c === c);
function blocked(sim, r, c, p) {
  if (r < 0 || c < 0 || r >= ROWS || c >= COLS) return true;
  const ch = sim.grid[idx(r, c)];
  if (ch !== '.') return true;
  const b = bombAt(sim, r, c);
  return !!(b && !(p && b.pass.has(p.id)));
}

// Bir eksende hareket (köşe yardımıyla). Döner: gerçekten hareket edildi mi
function moveAxis(sim, p, dx, dy, dist) {
  const x0 = p.x, y0 = p.y;
  const free = (r, c) => !blocked(sim, r, c, p);
  if (dx) {
    const r = Math.floor(p.y), c = Math.floor(p.x), off = p.y - (r + 0.5);
    if (Math.abs(off) > 0.02) {
      if (free(r, c + dx)) { const s = Math.min(Math.abs(off), dist); p.y -= Math.sign(off) * s; dist -= s; }
      else {
        const r2 = r + Math.sign(off);
        if (Math.abs(off) > 0.18 && free(r2, c) && free(r2, c + dx)) p.y += Math.sign(off) * Math.min(dist, 1 - Math.abs(off));
        return p.x !== x0 || p.y !== y0;
      }
    } else p.y = r + 0.5;
    if (dist > 0) {
      const target = p.x + dx * dist;
      p.x = free(r, c + dx) ? target : dx > 0 ? Math.min(target, c + 0.5) : Math.max(target, c + 0.5);
    }
  } else {
    const r = Math.floor(p.y), c = Math.floor(p.x), off = p.x - (c + 0.5);
    if (Math.abs(off) > 0.02) {
      if (free(r + dy, c)) { const s = Math.min(Math.abs(off), dist); p.x -= Math.sign(off) * s; dist -= s; }
      else {
        const c2 = c + Math.sign(off);
        if (Math.abs(off) > 0.18 && free(r, c2) && free(r + dy, c2)) p.x += Math.sign(off) * Math.min(dist, 1 - Math.abs(off));
        return p.x !== x0 || p.y !== y0;
      }
    } else p.x = c + 0.5;
    if (dist > 0) {
      const target = p.y + dy * dist;
      p.y = free(r + dy, c) ? target : dy > 0 ? Math.min(target, r + 0.5) : Math.max(target, r + 0.5);
    }
  }
  return Math.abs(p.x - x0) + Math.abs(p.y - y0) > 1e-4;
}

function movePlayer(sim, p, ix, iy, dt) {
  const ax = Math.abs(ix), ay = Math.abs(iy);
  if (Math.max(ax, ay) < 0.3) return;
  const dist = p.speed * dt;
  const prim = ax >= ay ? [Math.sign(ix), 0] : [0, Math.sign(iy)];
  const sec = ax >= ay ? [0, Math.sign(iy)] : [Math.sign(ix), 0];
  p.dir = prim[0] ? (prim[0] > 0 ? 'R' : 'L') : prim[1] > 0 ? 'D' : 'U';
  if (!moveAxis(sim, p, prim[0], prim[1], dist) && Math.min(ax, ay) > 0.3) {
    if (moveAxis(sim, p, sec[0], sec[1], dist)) p.dir = sec[0] ? (sec[0] > 0 ? 'R' : 'L') : sec[1] > 0 ? 'D' : 'U';
  }
}

const cellOf = (p) => [Math.floor(p.y), Math.floor(p.x)];
const canBomb = (sim, p) => p.alive && sim.bombs.filter((b) => b.owner === p.id).length < p.max && !bombAt(sim, ...cellOf(p));

function placeBomb(sim, p) {
  if (!canBomb(sim, p)) return;
  const [r, c] = cellOf(p);
  const pass = new Set(Object.values(sim.ps).filter((q) => q.alive && Math.abs(q.x - (c + 0.5)) < 0.95 && Math.abs(q.y - (r + 0.5)) < 0.95).map((q) => q.id));
  sim.bombs.push({ id: ++sim.bombSeq, r, c, owner: p.id, t: FUSE, range: p.range, pass });
  sim.events.push({ e: 'drop', r, c });
}

export function blastCells(grid, b) {
  const cells = [idx(b.r, b.c)];
  for (const [dc, dr] of DIRS) {
    for (let k = 1; k <= b.range; k++) {
      const r = b.r + dr * k, c = b.c + dc * k;
      const ch = grid[idx(r, c)];
      if (ch === '#') break;
      cells.push(idx(r, c));
      if (ch === 'x') break;
    }
  }
  return cells;
}

function explode(sim, first) {
  const queue = [first], done = new Set();
  const all = new Set(), crates = [];
  while (queue.length) {
    const b = queue.shift();
    if (done.has(b.id)) continue;
    done.add(b.id);
    for (const i of blastCells(sim.grid, b)) {
      all.add(i);
      if (sim.grid[i] === 'x') crates.push(i);
      const [r, c] = rc(i);
      const o = sim.bombs.find((x) => x.r === r && x.c === c && !done.has(x.id));
      if (o) queue.push(o);
    }
  }
  sim.bombs = sim.bombs.filter((b) => !done.has(b.id));
  for (const i of crates) {
    if (sim.grid[i] !== 'x') continue;
    sim.grid[i] = '.';
    if (sim.hidden[i]) { sim.items[i] = sim.hidden[i]; delete sim.hidden[i]; }
  }
  sim.flames.push({ cells: [...all], t: FLAME });
  sim.events.push({ e: 'boom', n: done.size, crates: crates.length });
}

function kill(sim, ids, why) {
  if (!ids.length) return;
  for (const id of ids) { const p = sim.ps[id]; p.alive = false; p.deadAt = sim.t; }
  sim.outs.push(ids);
  sim.events.push({ e: 'die', ids, why });
}

export function stepSim(sim, dt, inputs) {
  sim.events = [];
  sim.t += dt;
  if (sim.phase === 'count') {
    const before = Math.ceil(sim.cd);
    sim.cd -= dt;
    if (Math.ceil(sim.cd) !== before && sim.cd > 0) sim.events.push({ e: 'beep', n: Math.ceil(sim.cd) });
    if (sim.cd <= 0) { sim.phase = 'play'; sim.t0 = sim.t; sim.events.push({ e: 'go' }); }
    return sim.events;
  }
  if (sim.phase !== 'play' && sim.phase !== 'end') return sim.events;
  const play = sim.phase === 'play';
  // oyuncular
  for (const p of Object.values(sim.ps)) {
    if (!p.alive || !play) continue;
    const inp = p.bot ? botInput(sim, p, dt) : inputs[p.id] || {};
    movePlayer(sim, p, inp.x || 0, inp.y || 0, dt);
    if (inp.bomb) placeBomb(sim, p);
    const [r, c] = cellOf(p), i = idx(r, c);
    const item = sim.items[i];
    if (item) {
      delete sim.items[i];
      if (item === 'fire') p.range = Math.min(8, p.range + 1);
      if (item === 'bomb') p.max = Math.min(6, p.max + 1);
      if (item === 'speed') p.speed = Math.min(5.2, p.speed + 0.45);
      sim.events.push({ e: 'item', id: p.id, item });
    }
  }
  // bombanın üstünden çıkan artık geçemez
  for (const b of sim.bombs) for (const id of [...b.pass]) {
    const q = sim.ps[id];
    if (!q.alive || Math.abs(q.x - (b.c + 0.5)) >= 0.95 || Math.abs(q.y - (b.r + 0.5)) >= 0.95) b.pass.delete(id);
  }
  // fitiller ve patlamalar
  for (const b of sim.bombs) b.t -= dt;
  let b;
  while ((b = sim.bombs.find((x) => x.t <= 0))) explode(sim, b);
  for (const f of sim.flames) f.t -= dt;
  sim.flames = sim.flames.filter((f) => f.t > 0);
  const hot = new Set(sim.flames.flatMap((f) => f.cells));
  // alev değen bomba hemen patlar (zincir)
  for (const x of sim.bombs.filter((x) => hot.has(idx(x.r, x.c)))) if (sim.bombs.includes(x)) explode(sim, x);
  const hot2 = new Set(sim.flames.flatMap((f) => f.cells));
  if (play) kill(sim, Object.values(sim.ps).filter((p) => p.alive && hot2.has(idx(...cellOf(p)))).map((p) => p.id), 'boom');
  // ani ölüm: duvarlar spiral halinde kapanır
  if (play && sim.t - sim.t0 >= SUDDEN && sim.collapse < SPIRAL.length) {
    sim.colT -= dt;
    while (sim.colT <= 0 && sim.collapse < SPIRAL.length) {
      sim.colT += COLLAPSE_STEP;
      const i = SPIRAL[sim.collapse++];
      if (sim.grid[i] === '#') continue;
      sim.grid[i] = '#';
      delete sim.items[i]; delete sim.hidden[i];
      const [r, c] = rc(i);
      sim.bombs = sim.bombs.filter((x) => x.r !== r || x.c !== c);
      sim.events.push({ e: 'wall', i });
      kill(sim, Object.values(sim.ps).filter((p) => p.alive && idx(...cellOf(p)) === i).map((p) => p.id), 'wall');
    }
  }
  // bitiş
  const alive = Object.values(sim.ps).filter((p) => p.alive);
  if (play && (alive.length <= 1 || sim.t - sim.t0 > MAX_TIME)) { sim.phase = 'end'; sim.endT = sim.t; }
  if (sim.phase === 'end' && sim.t - sim.endT > 1.8) { sim.phase = 'done'; sim.events.push({ e: 'done' }); }
  return sim.events;
}

export function rankingOf(sim) {
  const out = new Set(sim.outs.flat());
  const alive = Object.keys(sim.ps).filter((id) => !out.has(id));
  const groups = alive.length ? [alive] : [];
  for (let i = sim.outs.length - 1; i >= 0; i--) groups.push(sim.outs[i]);
  return groups;
}

// ---------- Bot ----------
// Her hücrenin ne zaman alev alacağı (Infinity = güvenli)
function dangerMap(sim, extra) {
  const d = new Float32Array(ROWS * COLS).fill(Infinity);
  for (const f of sim.flames) for (const i of f.cells) d[i] = 0;
  const bombs = extra ? [...sim.bombs, extra] : sim.bombs;
  const t = bombs.map((b) => b.t);
  for (let it = 0; it < 3; it++) bombs.forEach((b, k) => {
    for (const i of blastCells(sim.grid, b)) {
      d[i] = Math.min(d[i], t[k]);
      bombs.forEach((o, j) => { if (j !== k && idx(o.r, o.c) === i && t[j] > t[k]) t[j] = t[k]; });
    }
  });
  return d;
}
function bfs(sim, p, start, extraBlock) {
  const prev = new Map([[start, -1]]), dist = new Map([[start, 0]]), order = [start];
  for (let q = 0; q < order.length; q++) {
    const i = order[q], [r, c] = rc(i);
    for (const [dc, dr] of DIRS) {
      const j = idx(r + dr, c + dc);
      if (prev.has(j) || blocked(sim, r + dr, c + dc, p) || (extraBlock && extraBlock(j))) continue;
      prev.set(j, i); dist.set(j, dist.get(i) + 1); order.push(j);
    }
  }
  return { prev, dist, order };
}
const pathTo = (prev, goal) => { const out = []; for (let i = goal; prev.get(i) !== -1; i = prev.get(i)) out.unshift(i); return out; };

export function botInput(sim, p, dt) {
  p.think -= dt;
  const cur = idx(...cellOf(p));
  let wantBomb = false;
  if (p.think <= 0) {
    p.think = 0.12 + Math.random() * 0.08;
    const danger = dangerMap(sim);
    const tps = 1 / p.speed;
    const safeRoute = (path, d) => path.every((i, k) => { const at = (k + 1) * tps; return d[i] === Infinity || at < d[i] - 0.25 || at > d[i] + FLAME + 0.1; });
    const late = sim.t - (sim.t0 || 0) > SUDDEN - 6;
    const doomed = new Set(late ? SPIRAL.slice(sim.collapse, sim.collapse + 14) : []);
    const B = bfs(sim, p, cur, (j) => danger[j] === 0);
    if (danger[cur] !== Infinity || doomed.has(cur)) {
      // tehlikedeyim: en yakın güvenli hücreye kaç
      const goal = B.order.find((i) => danger[i] === Infinity && !doomed.has(i) && safeRoute(pathTo(B.prev, i), danger));
      p.path = goal !== undefined ? pathTo(B.prev, goal) : [];
    } else {
      const [r, c] = cellOf(p);
      const crateNear = DIRS.some(([dc, dr]) => sim.grid[idx(r + dr, c + dc)] === 'x');
      const mine = { r, c, t: FUSE, range: p.range };
      const cross = new Set(blastCells(sim.grid, mine));
      const enemyNear = Object.values(sim.ps).some((q) => q.alive && q.id !== p.id && cross.has(idx(...cellOf(q))));
      if (canBomb(sim, p) && (crateNear || enemyNear) && Math.random() < 0.6) {
        const d2 = dangerMap(sim, mine);
        const B2 = bfs(sim, p, cur, (j) => d2[j] === 0);
        const goal = B2.order.find((i) => d2[i] === Infinity && !doomed.has(i) && B2.dist.get(i) * tps < FUSE - 0.4 && safeRoute(pathTo(B2.prev, i), d2));
        if (goal !== undefined) { wantBomb = true; p.path = pathTo(B2.prev, goal); }
      }
      if (!wantBomb && !p.path.length) {
        // hedef: güçlendirici > kutu yanı > rakip
        const enemies = Object.values(sim.ps).filter((q) => q.alive && q.id !== p.id).map((q) => idx(...cellOf(q)));
        const score = (i) => {
          if (danger[i] !== Infinity || doomed.has(i)) return -1;
          const [rr, cc] = rc(i);
          let s = sim.items[i] ? 10 : 0;
          if (DIRS.some(([dc, dr]) => sim.grid[idx(rr + dr, cc + dc)] === 'x')) s += 3;
          for (const e of enemies) { const [er, ec] = rc(e); if (Math.abs(er - rr) + Math.abs(ec - cc) <= 2) s += 2; }
          if (late) s -= (Math.abs(rr - ROWS / 2) + Math.abs(cc - COLS / 2)) * 0.6;
          return s - B.dist.get(i) * 0.35 + Math.random();
        };
        let best = null, bs = -Infinity;
        for (const i of B.order.slice(0, 60)) { const s = score(i); if (s > bs) { bs = s; best = i; } }
        p.path = best !== null && best !== cur && safeRoute(pathTo(B.prev, best), danger) ? pathTo(B.prev, best).slice(0, 4) : [];
      }
    }
  }
  // yolu takip et
  while (p.path.length && p.path[0] === cur && Math.hypot(p.x - (rc(cur)[1] + 0.5), p.y - (rc(cur)[0] + 0.5)) < 0.1) p.path.shift();
  let x = 0, y = 0;
  if (p.path.length) {
    const [tr, tc] = rc(p.path[0]);
    const dx = tc + 0.5 - p.x, dy = tr + 0.5 - p.y;
    if (Math.abs(dx) < 0.06 && Math.abs(dy) < 0.06) p.path.shift();
    else if (Math.abs(dx) > Math.abs(dy)) x = Math.sign(dx); else y = Math.sign(dy);
  }
  return { x, y, bomb: wantBomb };
}

// ---------- Ağ: anlık görüntü ----------
const r2 = (v) => Math.round(v * 100) / 100;
export function snapshot(sim) {
  return {
    t: r2(sim.t), ph: sim.phase, cd: r2(sim.cd), el: r2(sim.t0 ? sim.t - sim.t0 : 0),
    g: sim.grid.join(''),
    p: Object.values(sim.ps).map((p) => [p.id, r2(p.x), r2(p.y), p.dir, p.alive ? 1 : 0, p.range, p.max, r2(p.speed)]),
    b: sim.bombs.map((b) => [b.id, b.r, b.c, r2(b.t), b.range]),
    f: sim.flames.map((f) => [r2(f.t), ...f.cells]),
    it: Object.entries(sim.items).map(([i, k]) => [+i, k]),
    ev: sim.events,
  };
}
export function readSnapshot(s) {
  const ps = {};
  for (const [id, x, y, dir, alive, range, max, speed] of s.p) ps[id] = { id, x, y, dir, alive: !!alive, range, max, speed };
  return {
    t: s.t, phase: s.ph, cd: s.cd, el: s.el, grid: s.g, ps,
    bombs: s.b.map(([id, r, c, t, range]) => ({ id, r, c, t, range })),
    flames: s.f.map(([t, ...cells]) => ({ t, cells })),
    items: Object.fromEntries(s.it), events: s.ev || [],
  };
}
