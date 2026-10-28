// Oda başına bir Durable Object. game-core'un beklediği depo arayüzünü (getWithMetadata/setJSON) DO depolamasıyla sağlar.
// Tüm istekler sırayla işlenir (mutex), iyimser kilit çakışması olmaz. Eski odalar alarmla silinir.
import { handle } from '../public/game-core.js';

const IDLE_MS = 6 * 3600 * 1000; // bu kadar süre isteksiz kalan oda silinir

class DOStore {
  constructor(storage) { this.s = storage; }
  async getWithMetadata(key) {
    const e = await this.s.get(key);
    return e ? { data: JSON.parse(e.v), etag: e.etag, metadata: {} } : null;
  }
  async setJSON(key, value, opts = {}) {
    const e = await this.s.get(key);
    if (opts.onlyIfNew && e) return { modified: false };
    if (opts.onlyIfMatch && (!e || e.etag !== opts.onlyIfMatch)) return { modified: false };
    const etag = `"${((e && Number(e.etag.slice(1, -1))) || 0) + 1}"`;
    await this.s.put(key, { v: JSON.stringify(value), etag });
    return { modified: true, etag };
  }
}

export class Room {
  constructor(ctx) {
    this.ctx = ctx;
    this.store = new DOStore(ctx.storage);
    this.chain = Promise.resolve();
  }

  async fetch(req) {
    const body = await req.json();
    const run = this.chain.then(() => this.run(body));
    this.chain = run.then(() => {}, () => {});
    return run;
  }

  async run(body) {
    let status = 200, out;
    try { out = await handle(this.store, body, Date.now()); }
    catch (e) {
      if (!e.publicMessage) console.error(e);
      status = e.status || 500;
      out = { error: e.publicMessage || 'Sunucu hatası' };
    }
    if (status !== 404 && !(status === 409 && out.error === 'KOD_DOLU')) {
      await this.ctx.storage.put('lastTouch', Date.now());
      await this.ctx.storage.setAlarm(Date.now() + IDLE_MS);
    }
    return new Response(JSON.stringify(out), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
  }

  async alarm() {
    const last = (await this.ctx.storage.get('lastTouch')) || 0;
    if (Date.now() - last >= IDLE_MS) await this.ctx.storage.deleteAll();
    else await this.ctx.storage.setAlarm(last + IDLE_MS);
  }
}
