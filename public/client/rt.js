// Gerçek zamanlı oyun çerçevesi (Bomba, Yarış, Kör Koşu, Halat). Oda sahibinin cihazı simülasyonu
// çalıştırır ve 15 Hz anlık görüntü yayınlar; diğerleri kumanda gönderir ve görüntüler arasında yumuşak
// geçiş yapar. WebRTC kurulamazsa (operatör ağı, NAT) oyuncu "yedek aktarım"a düşer: anlık görüntüler ve
// kumandalar sunucu üzerinden (rtSnap / rtInput + state yoklaması) ~4 Hz taşınır — biraz gecikmeli ama oynanır.
import { createNet, loadIce } from './net.js';
import { createControls } from './controls.js';

const STEP = 1 / 30;
const SNAP_MS = 66;
const CONNECT_WAIT = 12000;      // doğrudan bağlantı için hızlı yoklama süresi (arka planda bağlanmaya devam eder)
// Bağlantı kontrolü: oyun, HERKESİN telefonundan kumanda gelene (bağlandı) ve herkes öğretici/uyarıları kapatana (hazır) dek başlamaz.
const CONNECT_MAX = 16000;       // bağlanamayan (hiç kumanda göndermeyen) oyuncu için en uzun bekleme; sonra bot oynar
const READY_MAX = 35000;         // bağlanan ama öğreticiyi kapatmayan oyuncu için en uzun bekleme (öğretici kendiliğinden kapanır)
const RELAY_AFTER = 4000;        // doğrudan bağlantı bu kadar sürede kurulmadıysa sunucu aktarımı da denenir
const CLIENT_WAIT = 3500;        // oyuncu bu süre içinde görüntü alamazsa sunucu aktarımına geçer (sonradan doğrudan bağlantıya döner)
const RELAY_SNAP_MS = 240;   // oda sahibi sunucuya bu sıklıkta görüntü bırakır
const RELAY_IN_MS = 220;     // aktarılan oyuncu kumandasını bu sıklıkta bırakır
const RELAY_POLL_MS = 280;

export function createRealtime(ctx, spec) {
  const { playerId } = ctx;
  const mod = spec.mod;
  if (ctx.online()) loadIce(ctx.call); // TURN bilgisi bağlantılar kurulmadan önce hazır olsun
  let seq = null, isHost = false, net = null, sim = null, timer = null, inTimer = null, checkMsg = '';
  const botted = new Set();
  let openedAt = 0, started = false, resultSent = false, lastSnap = 0, lastProg = 0, evBuf = [], relayEv = [], t0 = 0, acc = 0, lastTick = performance.now();
  const remoteIn = {};
  const buf = [];
  let offset = null, latest = null, connMsg = '';
  // yedek aktarım durumu
  const relay = new Set();          // oda sahibi: sunucudan kumanda alınan oyuncular
  let relayMode = false;            // izleyen: görüntüler sunucudan geliyor
  let relayN = 0, relayBusy = false, lastRelaySnap = 0, haveN = -1, lastInStr = '', lastInT = 0, inBusy = false, relayToast = false;
  const renderDelay = () => (relayMode ? 0.45 : 0.14);
  const controls = createControls(ctx.stage, spec.controls);
  controls.show(false);

  // `rdy`: bu oyuncu hazır mı (öğretici/uyarı kapalı)? Oda sahibi herkesin hazır olmasını bekler.
  const myInput = () => ({ ...spec.input(controls.read(), ctx.view()), rdy: ctx.blocking ? !ctx.blocking() : true });
  // `bomb` tek basış alanı: sayıysa (bit maskesi) bitler birleştirilir, değilse mantıksal VEYA
  const orBomb = (a, b) => (typeof a === 'number' && typeof b === 'number' ? a | b : a || b);
  const mergeIn = (from, i) => { remoteIn[from] = { ...(remoteIn[from] || {}), ...i, bomb: orBomb(remoteIn[from] && remoteIn[from].bomb, i.bomb) }; };
  const isAway = (id) => { const p = ctx.state().players.find((x) => x.id === id); return !p || p.left || p.away; };

  // Bağlanamayan oyuncu: telefonu açıksa sunucu üzerinden oynar, değilse bot
  function fallback(id) {
    if (!sim) return;
    if (ctx.online() && !isAway(id)) { if (!relay.has(id)) { relay.add(id); ctx.toast(`${ctx.pName(id)} sunucu üzerinden oynuyor`); } }
    else { relay.delete(id); spec.setBot(sim, id); }
  }

  function startHost(s) {
    const parts = s.players.filter((p) => p.inGame);
    sim = mod.createSim(parts.map((p) => ({ id: p.id, bot: p.bot })), s.g);
    const remote = ctx.online() ? parts.filter((p) => !p.bot && p.id !== playerId && !p.left).map((p) => p.id) : [];
    // Çevrimdışı moddaki insan "oyuncular" yoksa; uzaktakiler bağlanana kadar bekler
    if (!ctx.online()) parts.filter((p) => !p.bot && p.id !== playerId).forEach((p) => spec.setBot(sim, p.id));
    if (remote.length) {
      net = createNet({
        me: playerId, hostId: playerId, peers: remote,
        send: (to, data) => ctx.call({ action: 'sig', seq, to, data }).catch(() => {}),
        onMessage: (from, msg) => { if (msg.t === 'in') { mergeIn(from, msg.i); if (relay.has(from)) relay.delete(from); } },
        onChange: () => { if (started) for (const [id, st] of Object.entries(net.states())) if (st === 'failed') fallback(id); },
      });
    }
    t0 = performance.now();
    if (ctx.debug) { window.__lkNet = net; window.__lkSim = sim; } // yalnızca ?cizim test modunda
    timer = setInterval(hostTick, STEP * 1000);
  }

  function hostTick() {
    const s = ctx.state();
    if (!s || s.seq !== seq) return;
    const now = performance.now();
    if (!started && ctx.serverNow() >= s.roundStart) {
      if (!openedAt) openedAt = now; // takımlar ekranında beklenen süre bağlantı bekleme süresinden sayılmaz
      const waited = now - Math.max(t0, openedAt);
      const peers = net ? Object.keys(net.states()) : [];
      const states = net ? net.states() : {};
      const rows = [];
      let pending = 0;
      for (const id of peers) {
        if (botted.has(id)) continue;
        if (isAway(id)) { botted.add(id); relay.delete(id); spec.setBot(sim, id); ctx.toast(`${ctx.pName(id)} yok (bot oynayacak)`); continue; }
        const inp = remoteIn[id];
        // doğrudan bağlantı kurulamadıysa (ya da gecikiyorsa) sunucu aktarımı da denenir: oyuncu orada kumanda bırakır
        if (!inp && ctx.online() && (states[id] === 'failed' || waited > RELAY_AFTER)) relay.add(id);
        const connected = !!inp, ready = connected && inp.rdy !== false;
        // süre doldu ve hiç kumanda gelmedi: bu oyuncu bağlanamadı, bot oynar
        if (!connected && waited > CONNECT_MAX) { botted.add(id); relay.delete(id); spec.setBot(sim, id); ctx.toast(`${ctx.pName(id)} bağlanamadı, bot oynayacak`); continue; }
        if (!ready) pending++;
        rows.push({ id, connected, ready });
      }
      const hostBlocked = ctx.blocking ? ctx.blocking() : false;
      checkMsg = rows.length ? `📡 Bağlantı kontrolü: ${rows.map((r) => `${ctx.pName(r.id)} ${r.ready ? '✓' : r.connected ? '📖' : '…'}`).join(' · ')}${hostBlocked ? ' · sen: 📖' : ''}` : '';
      if ((!pending && !hostBlocked) || waited > READY_MAX) {
        for (const r of rows) if (!r.connected) { botted.add(r.id); relay.delete(r.id); spec.setBot(sim, r.id); ctx.toast(`${ctx.pName(r.id)} bağlanamadı, bot oynayacak`); }
        for (const r of rows) if (r.connected && relay.has(r.id)) ctx.toast(`${ctx.pName(r.id)} sunucu üzerinden oynuyor`);
        mod.startCountdown(sim);
        started = true; checkMsg = '';
      }
    }
    advance(now);
    if (net && now - lastSnap > SNAP_MS) {
      lastSnap = now;
      const snap = mod.snapshot(sim);
      snap.ev = evBuf; evBuf = [];
      net.broadcast({ t: 's', s: snap });
    } else if (!net) { evBuf = []; }
    // yedek aktarım: sunucuya görüntü bırak; uzun süredir sessiz olanları bot yap
    if (relay.size && now - lastRelaySnap > RELAY_SNAP_MS && !relayBusy) {
      lastRelaySnap = now; relayBusy = true;
      const snap = mod.snapshot(sim);
      snap.ev = relayEv; relayEv = [];
      ctx.raw({ action: 'rtSnap', seq, n: ++relayN, snap }).catch(() => {}).finally(() => { relayBusy = false; });
      for (const id of [...relay]) if (isAway(id)) { relay.delete(id); spec.setBot(sim, id); }
    } else if (!relay.size) relayEv = [];
    if (started && now - lastProg > 3000 && ctx.online()) {
      lastProg = now;
      ctx.call({ action: 'rtProgress', seq, ranking: mod.rankingOf(sim) }).catch(() => {});
    }
    if (sim.phase === 'done' && !resultSent) {
      resultSent = true;
      net && net.broadcast({ t: 'end' }, true);
      ctx.call({ action: 'rtResult', seq, ranking: mod.rankingOf(sim), dnf: mod.dnfOf ? mod.dnfOf(sim) : [] }).catch(() => { resultSent = false; });
    }
  }

  // Gerçek geçen süre kadar sabit adım at (zamanlayıcı gecikse de oyun ağır çekime girmesin).
  // Hem çizim karesinde hem zamanlayıcıda çağrılır; son iki adım saklanır ki ara kareler doldurulsun.
  let prevSt = null, curSt = null;
  function advance(now) {
    if (!sim) return;
    acc = Math.min(acc + Math.max(0, now - lastTick) / 1000, 0.5);
    lastTick = now;
    if (acc < STEP && curSt) return;
    const inputs = { ...remoteIn, [playerId]: myInput() };
    while (acc >= STEP) {
      acc -= STEP;
      const evs = mod.stepSim(sim, STEP, inputs);
      for (const id of Object.keys(remoteIn)) remoteIn[id].bomb = false;
      inputs[playerId] = { ...inputs[playerId], bomb: false };
      if (evs.length) { evBuf.push(...evs); if (relay.size) relayEv.push(...evs); spec.onEvents(evs, latest); }
      prevSt = curSt;
      curSt = mod.readSnapshot(mod.snapshot(sim));
    }
    if (!curSt) curSt = mod.readSnapshot(mod.snapshot(sim));
  }

  // İzleyen: gelen anlık görüntüyü (WebRTC ya da sunucu) kuyruğa al
  function takeSnap(raw) {
    const st = mod.readSnapshot(raw);
    // Saat farkı: en az gecikmeli paketleri izle ama yumuşak kay (ani sıçrama = takılma)
    const est = st.t - performance.now() / 1000;
    if (offset === null) offset = est;
    else if (est > offset) offset += (est - offset) * 0.08;
    else offset -= Math.min(0.0015, offset - est);
    if (buf.length && st.t <= buf[buf.length - 1].t) return;
    buf.push(st);
    while (buf.length > 40) buf.shift();
    if (st.events.length) spec.onEvents(st.events, st);
  }

  function startClient(s) {
    const hostId = s.g.simHost;
    net = createNet({
      me: playerId, hostId, peers: [hostId],
      send: (to, data) => ctx.call({ action: 'sig', seq, to, data }).catch(() => {}),
      onMessage: (from, msg) => { if (msg.t === 's') { if (relayMode) { relayMode = false; ctx.toast('Doğrudan bağlantı kuruldu'); } takeSnap(msg.s); } },
      onChange: () => { if (net.status(hostId) === 'failed') enterRelay(); },
    });
    t0 = performance.now();
    if (ctx.debug) window.__lkNet = net;
    inTimer = setInterval(() => {
      if (!net) return;
      if (!relayMode) { net.send(hostId, { t: 'in', i: myInput() }); return; }
      // yedek: kumanda değiştiyse ya da 1 sn geçtiyse sunucuya bırak
      const i = myInput(), str = JSON.stringify(i), now = performance.now();
      if (inBusy || (str === lastInStr && now - lastInT < 1000)) return;
      inBusy = true; lastInStr = str; lastInT = now;
      ctx.raw({ action: 'rtInput', seq, i }).catch(() => {}).finally(() => { inBusy = false; });
    }, 50);
  }
  function enterRelay() {
    if (relayMode || !ctx.online()) return;
    relayMode = true;
    if (!relayToast) { relayToast = true; ctx.toast('📡 Doğrudan bağlantı kurulamadı — sunucu üzerinden oynuyorsun (biraz gecikmeli)'); }
  }

  // Şu an çizilecek durum
  function current() {
    if (isHost && sim) {
      advance(performance.now());
      latest = prevSt && curSt ? spec.interp(prevSt, curSt, Math.min(1, acc / STEP)) : curSt;
      return latest;
    }
    if (!buf.length || offset === null) return latest;
    const rt = performance.now() / 1000 + offset - renderDelay();
    let a = buf[0], b = null;
    for (let i = 0; i < buf.length; i++) { if (buf[i].t <= rt) a = buf[i]; else { b = buf[i]; break; } }
    if (b && b.t > a.t) latest = spec.interp(a, b, Math.max(0, Math.min(1, (rt - a.t) / (b.t - a.t))));
    else if (buf.length >= 2) {
      // yeni paket gecikti: son iki paketten en fazla biraz ileri tahmin et
      const p = buf[buf.length - 2], q = buf[buf.length - 1];
      latest = q.t > p.t ? spec.interp(p, q, 1 + Math.min(relayMode ? 0.35 : 0.12, rt - q.t) / (q.t - p.t)) : q;
    } else latest = buf[buf.length - 1];
    return latest;
  }

  return {
    kind: spec.kind,
    realtime: true,
    always3D: !!spec.always3D,
    supports3D: !spec.views || spec.views.length > 1,
    maxDPR: 1.5, // telefonda akıcılık için çözünürlük biraz düşük

    views: spec.views,
    onState(s) {
      if (s.status === 'playing' && s.seq !== seq && s.g && s.g.simHost) {
        seq = s.seq;
        isHost = s.g.simHost === playerId;
        const me = s.players.find((p) => p.id === playerId);
        if (isHost) startHost(s);
        else if (me && me.inGame && ctx.online()) startClient(s);
      }
      if (net) net.handleSig(s.sig);
      // izleyen: bağlantı süresi doldu ve hâlâ görüntü yoksa yedek aktarıma geç
      if (net && !isHost && !relayMode && !buf.length && performance.now() - t0 > CLIENT_WAIT) enterRelay();
      const me = s.players.find((p) => p.id === playerId);
      const playing = s.status === 'playing' && !!me && me.inGame && ctx.serverNow() >= s.roundStart - 500;
      controls.show(playing && (!spec.showControls || spec.showControls(s)));
      if (spec.onState) spec.onState(s, playing);
    },
    // Yoklamaya eklenecek istek / gelen yanıt (yedek aktarım)
    pollExtra() {
      if (isHost) return relay.size ? { rt: { inputs: [...relay] } } : null;
      return relayMode ? { rt: { snap: true, have: haveN } } : null;
    },
    onRt(r) {
      if (!r) return;
      if (isHost && r.inputs) for (const [id, v] of Object.entries(r.inputs)) if (v && v.i && relay.has(id)) mergeIn(id, v.i);
      if (!isHost && r.snap && r.snap.n !== haveN) { haveN = r.snap.n; takeSnap(r.snap.snap); }
    },
    onEntry() {},
    revealTotal: () => 0,
    animating: () => false,
    wantsFastPoll() {
      if (relayMode || (isHost && relay.size)) return RELAY_POLL_MS;
      return !!net && !started && performance.now() - t0 < CONNECT_WAIT + 5000;
    },
    frame(now, dt, ph, view) {
      const st = current();
      const s = ctx.state();
      if (!isHost && net && !buf.length) {
        connMsg = relayMode ? '📡 Sunucu üzerinden bağlanılıyor…' : '📡 Oda sahibine bağlanılıyor…';
      } else connMsg = '';
      const meIn = s.players.find((p) => p.id === playerId)?.inGame;
      const banner = spec.render(st, now, dt, view, { connMsg, spectator: !meIn, isHost });
      return connMsg || (isHost && checkMsg) || banner;
    },
    hint: () => null,
    panel: () => spec.panel(latest),
    action: () => ({}),
    pointer(type, ev, target) { if (spec.pointer) spec.pointer(type, ev, target, latest); },
    hud: () => spec.hud(latest),
    ready3D: () => (spec.ready3D ? spec.ready3D() : false),
    dispose() {
      clearInterval(timer); clearInterval(inTimer);
      if (net) net.close();
      controls.destroy();
      spec.dispose && spec.dispose();
    },
  };
}
