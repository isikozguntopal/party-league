// 🎼 Tarayıcıda üretilen şarkı müziği (Web Audio): davul + bas + akor + arpej, bölüme göre (giriş/kıta/nakarat/köprü/bitiş) yoğunluk değişir.
// Dış ses dosyası ya da ücretli hizmet yok. Şarkının tempo / anahtar / mod / akor dizisi / ritim stili oyun sunucusundan gelir (games/sarki.js),
// bu yüzden odadaki herkes aynı şarkıyı duyar. `lead()` ezgi notaları için: söz okunurken kelime başına bir nota çalınır (şarkı söyleme hissi).
const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
const PROGS = {
  major: [[[0, 'M'], [7, 'M'], [9, 'm'], [5, 'M']], [[0, 'M'], [9, 'm'], [5, 'M'], [7, 'M']], [[0, 'M'], [5, 'M'], [9, 'm'], [7, 'M']]],
  minor: [[[0, 'm'], [8, 'M'], [3, 'M'], [10, 'M']], [[0, 'm'], [5, 'm'], [10, 'M'], [3, 'M']], [[0, 'm'], [10, 'M'], [8, 'M'], [7, 'M']]],
};
export const SCALES = { major: [0, 2, 4, 7, 9, 12, 14, 16], minor: [0, 3, 5, 7, 10, 12, 15, 17] };
const CHORD = { M: [0, 4, 7], m: [0, 3, 7] };
// bölüm türü → hangi katmanlar çalar
const LEVEL = {
  intro: { kick: 0, hat: 1, bass: 0, pad: 1, arp: 1, clap: 0 },
  verse: { kick: 1, hat: 1, bass: 1, pad: 1, arp: 0, clap: 0 },
  chorus: { kick: 2, hat: 2, bass: 1, pad: 1, arp: 1, clap: 1 },
  bridge: { kick: 0, hat: 0, bass: 0, pad: 1, arp: 1, clap: 0 },
  outro: { kick: 0, hat: 0, bass: 1, pad: 1, arp: 0, clap: 0 },
};
// ritim stilleri (16'lık adımlar): [kick adımları, snare adımları]
const GROOVES = [
  { kick: [0, 4, 8, 12], snare: [4, 12], bass: [0, 3, 6, 8, 11, 14] },       // dans (4/4)
  { kick: [0, 6, 8, 11], snare: [4, 12], bass: [0, 6, 8, 10, 14] },          // pop
  { kick: [0, 7, 10], snare: [4, 12], bass: [0, 7, 10, 12] },                // sallanan
];

export function createBand(song, AC) {
  const ac = new AC();
  const master = ac.createGain(); master.gain.value = 0.55;
  const comp = ac.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 6;
  master.connect(comp); comp.connect(ac.destination);
  // ortak gürültü tamponu (snare, tef, alkış)
  const nb = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate), nd = nb.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

  const prog = (PROGS[song.mode] || PROGS.major)[song.prog % 3];
  const groove = GROOVES[song.groove % 3];
  const tonic = 45 + (song.key || 0);                  // A2'den başlayan anahtar
  const stepDur = 60 / song.tempo / 4;
  let kind = 'intro', step = 0, nextT = 0, timer = null, started = 0, lvl = LEVEL.intro, gain = 1;

  const env = (g, t, a, d, v) => { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); };
  const osc = (type, f, t, dur, v, dest, a = 0.01) => {
    const o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.value = f;
    env(g, t, a, dur, v); o.connect(g); g.connect(dest || master); o.start(t); o.stop(t + a + dur + 0.05);
    return o;
  };
  const noise = (t, dur, v, hp, lp) => {
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = nb; f.type = hp ? 'highpass' : 'bandpass'; f.frequency.value = hp || lp || 1800; env(g, t, 0.002, dur, v);
    s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dur + 0.05);
  };
  const kick = (t, v = 0.9) => { const o = ac.createOscillator(), g = ac.createGain(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12); env(g, t, 0.002, 0.22, v); o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.3); };
  const snare = (t, v = 0.5) => { noise(t, 0.16, v, 0, 1900); osc('triangle', 190, t, 0.1, v * 0.5); };
  const clap = (t) => { for (let k = 0; k < 3; k++) noise(t + k * 0.011, 0.07, 0.22, 0, 1300); };
  const hat = (t, open) => noise(t, open ? 0.12 : 0.035, open ? 0.14 : 0.1, 7500);

  function chordAt(bar) { return prog[bar % prog.length]; }
  function play(st, t) {
    const bar = Math.floor(st / 16), s = st % 16, [root, q] = chordAt(bar);
    const L = lvl;
    if (L.kick && groove.kick.includes(s) && (L.kick === 2 || s === 0 || s === 8)) kick(t, 0.85 * gain);
    if (L.kick && groove.snare.includes(s) && L.kick === 2) snare(t, 0.4 * gain);
    if (L.kick === 1 && groove.snare.includes(s)) snare(t, 0.26 * gain);
    if (L.clap && groove.snare.includes(s)) clap(t);
    if (L.hat && s % 2 === 0) hat(t, L.hat === 2 && s % 4 === 2);
    if (L.hat === 2 && s % 4 === 3) hat(t, false);
    if (L.bass && groove.bass.includes(s)) {
      const f = midi(tonic + root + (s >= 8 && s % 2 ? 12 : 0)), o = ac.createOscillator(), lp = ac.createBiquadFilter(), g = ac.createGain();
      o.type = 'sawtooth'; o.frequency.value = f; lp.type = 'lowpass'; lp.frequency.value = 420;
      env(g, t, 0.01, stepDur * 2.4, 0.3 * gain); o.connect(lp); lp.connect(g); g.connect(master); o.start(t); o.stop(t + stepDur * 2.8);
    }
    if (L.pad && s === 0) {
      for (const iv of CHORD[q]) for (const det of [-7, 7]) {
        const o = ac.createOscillator(), lp = ac.createBiquadFilter(), g = ac.createGain();
        o.type = 'sawtooth'; o.frequency.value = midi(tonic + 24 + root + iv); o.detune.value = det; lp.type = 'lowpass'; lp.frequency.value = 1100;
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.035 * gain, t + 0.08); g.gain.setValueAtTime(0.035 * gain, t + stepDur * 14); g.gain.linearRampToValueAtTime(0.0001, t + stepDur * 16);
        o.connect(lp); lp.connect(g); g.connect(master); o.start(t); o.stop(t + stepDur * 16 + 0.05);
      }
    }
    if (L.arp && s % 2 === 0) {
      const tones = CHORD[q], iv = tones[(s / 2 + (bar % 2)) % 3] + (s % 8 === 6 ? 12 : 0);
      osc(kind === 'chorus' ? 'square' : 'triangle', midi(tonic + 36 + root + iv), t, stepDur * 1.6, (kind === 'chorus' ? 0.05 : 0.07) * gain);
    }
  }
  function sched() {
    while (nextT < ac.currentTime + 0.14) { play(step, nextT); nextT += stepDur; step++; }
  }

  return {
    ac,
    start() {
      if (ac.resume) ac.resume();
      started = ac.currentTime + 0.08; nextT = started; step = 0;
      sched(); timer = setInterval(sched, 25);
    },
    setKind(k) { kind = LEVEL[k] ? k : 'verse'; lvl = LEVEL[kind]; },
    setGain(v) { gain = v; },
    // Ezgi notası: scaleIndex = gam basamağı (0–7), t = ac zamanı
    lead(idx, t, dur, v = 0.16) {
      const sc = SCALES[song.mode] || SCALES.major, [root] = chordAt(Math.floor(step / 16));
      const semi = sc[Math.max(0, Math.min(sc.length - 1, idx))];
      const f = midi(tonic + 36 + semi);
      const o1 = osc('triangle', f, t, Math.max(0.08, dur), v, null, 0.02);
      osc('sine', f * 2, t, Math.max(0.08, dur) * 0.8, v * 0.35, null, 0.02);
      return o1;
    },
    // bir sonraki vuruşa (çeyrek nota) kaç ms var
    msToBeat() { const beat = stepDur * 4, n = (ac.currentTime - started) / beat; return Math.max(0, (Math.ceil(n) - n) * beat * 1000); },
    msToBar() { const bar = stepDur * 16, n = (ac.currentTime - started) / bar; return Math.max(0, (Math.ceil(n) - n) * bar * 1000); },
    stepDur,
    stop() { clearInterval(timer); timer = null; try { master.gain.setTargetAtTime(0, ac.currentTime, 0.05); setTimeout(() => { try { ac.close(); } catch (e) { /* kapalı */ } }, 400); } catch (e) { /* kapalı */ } },
  };
}

// Dize için ezgi: kelime başına bir gam basamağı. Aynı metin/aynı tohum her zaman aynı ezgiyi verir (nakarat tekrarında aynı tını).
export function melodyFor(seed, n, kind) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  const next = () => { h = (Math.imul(h, 1664525) + 1013904223) >>> 0; return h / 4294967296; };
  const out = []; let cur = kind === 'chorus' ? 4 : 2 + Math.floor(next() * 3);
  for (let i = 0; i < n; i++) {
    const r = next();
    cur += r < 0.35 ? 1 : r < 0.7 ? -1 : r < 0.85 ? 2 : -2;
    cur = Math.max(0, Math.min(7, cur));
    if (i === n - 1) cur = [0, 2, 4][Math.floor(next() * 3)] + (kind === 'chorus' ? 0 : 0); // cümle sonu kalkışa/çözüme iner
    out.push(cur);
  }
  return out;
}
