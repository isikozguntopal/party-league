// Gerçek zamanlı oyunlar için WebRTC ağı (yıldız yapısı: oda sahibi ↔ her oyuncu).
// Bağlantı kurulumu (offer/answer) mevcut sunucu üzerinden 'sig' mesajlarıyla yapılır; sonra veri
// doğrudan telefonlar arasında akar. İki kanal: 'u' (hızlı, kayıplı: konum/kumanda) ve 'r' (güvenli: olaylar).
// STUN her zaman var. Operatör ağlarında doğrudan bağlantı kurulamazsa TURN gerekir: sunucu `ice` eylemiyle (Cloudflare TURN)
// kısa ömürlü kimlik bilgisi verir; anahtar tanımlı değilse yalnızca STUN kalır ve bağlanamayanlar sunucu aktarımına düşer.
// (Eski ücretsiz openrelay.metered.ca TURN'u kapatıldı: adresi 192.0.2.1'e çözülüyor, bu yüzden kaldırıldı.)
const STUN = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  { urls: 'stun:stun.cloudflare.com:3478' },
];
let ICE = STUN;
let iceReady = Promise.resolve(), iceAt = 0;
// call: ctx.call. Kısa ömürlü kimlik bilgisini önceden yükler; hata olursa sessizce STUN ile devam eder.
export function loadIce(call) {
  if (!call || Date.now() - iceAt < 20 * 60 * 1000) return iceReady;
  iceAt = Date.now();
  iceReady = Promise.race([
    call({ action: 'ice' }).then((r) => {
      const list = r && Array.isArray(r.iceServers) ? r.iceServers.filter((s) => s && s.urls) : [];
      ICE = list.length ? STUN.concat(list) : STUN;
    }),
    new Promise((res) => setTimeout(res, 2500)),
  ]).catch(() => { ICE = STUN; });
  return iceReady;
}
const RETRY_MS = 5000, MAX_TRIES = 4;

function gathered(pc, ms) {
  return new Promise((res) => {
    if (pc.iceGatheringState === 'complete') return res();
    const t = setTimeout(res, ms);
    pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); res(); } });
  });
}

export function createNet({ me, hostId, peers, send, onMessage, onChange }) {
  const isHost = me === hostId;
  const conns = new Map();
  let lastSig = 0, closed = false;

  function wire(id, c) {
    const setDc = (dc) => {
      dc.onopen = () => { if (dc.label === 'u') { c.state = 'open'; onChange && onChange(); } };
      dc.onclose = () => { if (dc.label === 'u' && c.state === 'open') { c.state = 'failed'; onChange && onChange(); } };
      dc.onmessage = (e) => { try { onMessage(id, JSON.parse(e.data)); } catch {} };
      c[dc.label] = dc;
    };
    c.pc.ondatachannel = (e) => setDc(e.channel);
    c.pc.onconnectionstatechange = () => {
      if (['failed', 'closed'].includes(c.pc.connectionState) && c.state !== 'failed') { c.state = 'failed'; onChange && onChange(); }
    };
    return setDc;
  }

  async function offer(id) {
    await iceReady;
    const prev = conns.get(id);
    if (prev) try { prev.pc.close(); } catch {}
    const c = { pc: new RTCPeerConnection({ iceServers: ICE }), state: 'connecting', tries: (prev ? prev.tries : 0) + 1, t0: performance.now() };
    conns.set(id, c);
    const setDc = wire(id, c);
    setDc(c.pc.createDataChannel('u', { ordered: false, maxRetransmits: 0 }));
    setDc(c.pc.createDataChannel('r'));
    await c.pc.setLocalDescription(await c.pc.createOffer());
    await gathered(c.pc, 2000);
    if (closed) return;
    send(id, { type: 'offer', sdp: c.pc.localDescription.sdp, n: c.tries });
  }

  async function answer(from, msg) {
    await iceReady;
    const prev = conns.get(from);
    if (prev) try { prev.pc.close(); } catch {}
    const c = { pc: new RTCPeerConnection({ iceServers: ICE }), state: 'connecting', tries: msg.n, t0: performance.now() };
    conns.set(from, c);
    wire(from, c);
    await c.pc.setRemoteDescription({ type: 'offer', sdp: msg.sdp });
    await c.pc.setLocalDescription(await c.pc.createAnswer());
    await gathered(c.pc, 2000);
    if (closed) return;
    send(from, { type: 'answer', sdp: c.pc.localDescription.sdp, n: msg.n });
  }

  // Oda sahibi: zamanında bağlanamayanlar için yeniden teklif
  const timer = isHost ? setInterval(() => {
    for (const id of peers) {
      const c = conns.get(id);
      if (!c || c.state !== 'connecting' || performance.now() - c.t0 < RETRY_MS) continue;
      if (c.tries < MAX_TRIES) offer(id).catch(() => {});
      else { c.state = 'failed'; onChange && onChange(); }
    }
  }, 1000) : null;
  if (isHost) for (const id of peers) offer(id).catch(() => { const c = conns.get(id); if (c) c.state = 'failed'; });

  return {
    isHost,
    // Sunucudan gelen sinyal kutusunu işle
    handleSig(list) {
      for (const m of (list || []).slice().sort((a, b) => a.i - b.i)) {
        if (m.i <= lastSig) continue;
        lastSig = m.i;
        const msg = m.data;
        if (!msg) continue;
        if (!isHost && m.from === hostId && msg.type === 'offer') answer(m.from, msg).catch(() => {});
        if (isHost && msg.type === 'answer') {
          const c = conns.get(m.from);
          if (c && c.tries === msg.n && c.pc.signalingState === 'have-local-offer') c.pc.setRemoteDescription({ type: 'answer', sdp: msg.sdp }).catch(() => {});
        }
      }
    },
    send(id, msg, reliable = false) {
      const c = conns.get(id);
      const dc = c && c[reliable ? 'r' : 'u'];
      if (dc && dc.readyState === 'open') try { dc.send(JSON.stringify(msg)); } catch {}
    },
    broadcast(msg, reliable = false) {
      const s = JSON.stringify(msg);
      for (const c of conns.values()) {
        const dc = c[reliable ? 'r' : 'u'];
        if (dc && dc.readyState === 'open') try { dc.send(s); } catch {}
      }
    },
    status(id) { const c = conns.get(id); return c ? c.state : 'none'; },
    debug() { return [...conns.entries()].map(([id, c]) => ({ id, state: c.state, tries: c.tries, ice: c.pc.iceConnectionState, conn: c.pc.connectionState, sig: c.pc.signalingState })); },
    states() { return Object.fromEntries(peers.map((id) => [id, conns.get(id) ? conns.get(id).state : 'none'])); },
    close() {
      closed = true;
      if (timer) clearInterval(timer);
      for (const c of conns.values()) try { c.pc.close(); } catch {}
      conns.clear();
    },
  };
}
