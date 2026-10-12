// 🪢 Halat Çekme — iki eşit takım, gerçek zamanlı
// Butona ne kadar hızlı basarsan takımın o kadar güçlü çeker. Halatın ortasındaki bayrağı kendi
// tarafına geçiren takım kazanır. Takımlar eşit değilse geçici bot eklenir.
import { realtimeServer, twoTeams } from './util.js';

export const KIND = 'halat';
export const TITLE = 'Halat Çekme';
export const EMOJI = '🪢';
export const RULES = [
  'İki eşit takım! ÇEK butonuna olabildiğince hızlı bas.',
  'Bayrağı kendi tarafına geçiren takım kazanır.',
  'Ritim tutturan daha güçlü çeker. Hadi!',
];
const base = realtimeServer();
export const { realtime, PLACE_MS, normalize, auto, resolve, ranking } = base;
const MAX_TIME = 30, WIN = 1, MAX_TAP = 12;

export function init(ids, env) {
  const [A, B] = twoTeams(env || { players: ids.map((id) => ({ id, bot: false })), addBot: () => ({ id: 'x', bot: true }) });
  return { alive: Object.fromEntries([...A, ...B].map((id) => [id, true])), outs: [], teams: [A, B] };
}
export const view = (d) => ({ ...base.view(d), teams: d.g.teams });

export function createSim(players, g) {
  const bots = new Set(players.filter((p) => p.bot).map((p) => p.id));
  const ps = {};
  g.teams.forEach((m, ti) => m.forEach((id) => { ps[id] = { id, team: ti, bot: bots.has(id), rate: 0, last: null, total: 0, rhythm: 0, lastTap: 0, botRate: 5.2 + Math.random() * 2.6 }; }));
  return { t: 0, phase: 'wait', cd: 3, p: 0, v: 0, ps, teams: g.teams, events: [], winner: null };
}
export const startCountdown = (sim) => { if (sim.phase === 'wait') { sim.phase = 'count'; sim.cd = 3; } };

export function stepSim(sim, dt, inputs) {
  sim.events = [];
  sim.t += dt;
  if (sim.phase === 'count') {
    const before = Math.ceil(sim.cd); sim.cd -= dt;
    if (Math.ceil(sim.cd) !== before && sim.cd > 0) sim.events.push({ e: 'beep' });
    if (sim.cd <= 0) { sim.phase = 'pull'; sim.t0 = sim.t; sim.events.push({ e: 'go' }); }
    return sim.events;
  }
  if (sim.phase === 'end') { if (sim.t - sim.endT > 1.5) { sim.phase = 'done'; sim.events.push({ e: 'done' }); } return sim.events; }
  if (sim.phase !== 'pull') return sim.events;
  const force = [0, 0];
  for (const p of Object.values(sim.ps)) {
    let taps = 0;
    if (p.bot) { taps = Math.random() < p.botRate * dt ? 1 : 0; }
    else {
      const total = (inputs[p.id] && inputs[p.id].taps) || 0;
      if (p.last === null) p.last = total;
      taps = Math.max(0, Math.min(3, total - p.last));
      p.last = total;
    }
    // ritim: düzenli aralıklı basışlar biraz daha güçlü
    if (taps) {
      const gap = sim.t - p.lastTap;
      p.rhythm = gap > 0.08 && gap < 0.3 ? Math.min(1, p.rhythm + 0.1) : Math.max(0, p.rhythm - 0.2);
      p.lastTap = sim.t;
    }
    p.rate = p.rate * Math.exp(-dt * 3) + taps * 3;
    force[p.team] += Math.min(MAX_TAP, p.rate) * (1 + p.rhythm * 0.3);
  }
  const n = Math.max(1, sim.teams[0].length);
  const diff = (force[1] - force[0]) / n; // pozitif: B (sağ) kazanıyor
  sim.v += (diff * 0.022 - sim.v * 1.5) * dt * 10;
  sim.p += sim.v * dt;
  const el = sim.t - sim.t0;
  if (Math.abs(sim.p) >= WIN || el > MAX_TIME) {
    sim.winner = sim.p > 0 ? 1 : 0;
    sim.phase = 'end'; sim.endT = sim.t;
    sim.events.push({ e: 'win', team: sim.winner });
  }
  return sim.events;
}

export const rankingOf = (sim) => { const w = sim.winner ?? (sim.p > 0 ? 1 : 0); return [sim.teams[w], sim.teams[1 - w]]; };

const r3 = (v) => Math.round(v * 1000) / 1000;
export function snapshot(sim) {
  return { t: r3(sim.t), ph: sim.phase, cd: r3(sim.cd), p: r3(sim.p), w: sim.winner, el: r3(sim.t0 ? sim.t - sim.t0 : 0), r: Object.values(sim.ps).map((p) => [p.id, r3(p.rate)]), ev: sim.events };
}
export function readSnapshot(s) {
  return { t: s.t, phase: s.ph, cd: s.cd, p: s.p, winner: s.w, el: s.el, rates: Object.fromEntries(s.r), events: s.ev || [] };
}
