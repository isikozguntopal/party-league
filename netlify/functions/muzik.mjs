// Ortak Şarkı için yapay zekâ müziği (ElevenLabs Music). Anahtar yalnızca sunucuda: Netlify ortam değişkeni ELEVENLABS_API_KEY.
// Akış: istemci {action:'muzik', op:'start', song} → anahtar (k) alır; üretim arka plan fonksiyonunda (music-background) yürür;
// istemci {op:'get', k} ile yoklar, hazır olunca ses (base64 mp3) gelir. Anahtar yoksa {status:'off'}: istemci yerel müziğe döner.
import { getStore } from '@netlify/blobs';
import { createHash } from 'node:crypto';

const SEC_TR = { intro: 'Intro', verse: 'Verse', chorus: 'Chorus', bridge: 'Bridge', outro: 'Outro' };
export function cleanSong(song) {
  if (!song || !Array.isArray(song.sections)) return null;
  const sections = song.sections.slice(0, 8).map((s) => ({ kind: String(s.kind || 'verse').slice(0, 12), lines: (Array.isArray(s.lines) ? s.lines : []).slice(0, 8).map((l) => String(l && l.text !== undefined ? l.text : l).replace(/[\r\n]+/g, ' ').slice(0, 120)).filter(Boolean) })).filter((s) => s.lines.length);
  if (!sections.length) return null;
  const total = sections.reduce((a, s) => a + s.lines.length, 0);
  if (total > 40) return null;
  return { title: String(song.title || 'Parti Şarkısı').slice(0, 60), tempo: Math.max(70, Math.min(170, Number(song.tempo) || 110)), minor: song.mode === 'minor', sections, total };
}
export const keyOf = (song) => createHash('sha1').update(JSON.stringify(song)).digest('hex').slice(0, 24);
export function promptOf(song) {
  const lyrics = song.sections.map((s) => `[${SEC_TR[s.kind] || 'Verse'}]\n${s.lines.join('\n')}`).join('\n\n');
  return `A catchy upbeat Turkish party pop song with clear sung vocals in Turkish, ${song.tempo} BPM, ${song.minor ? 'bittersweet minor key' : 'cheerful major key'}, strong drum beat and bass, tight rhythm, vocals perfectly in time with the beat. Sing exactly these Turkish lyrics, in this order, with no extra words:\n\n${lyrics}`;
}
export const lengthOf = (song) => Math.max(30000, Math.min(110000, song.total * 3600));

const store = () => getStore({ name: 'muzik', consistency: 'strong' });

// /api içinden: start | get
export async function handleMuzik(body, env, origin) {
  if (!env.ELEVENLABS_API_KEY) return { status: 'off' };
  const st = store();
  if (body.op === 'get') {
    const k = String(body.k || '').replace(/[^a-f0-9]/g, '').slice(0, 24);
    const meta = await st.get(k + ':meta', { type: 'json' });
    if (!meta) return { status: 'none' };
    if (meta.status !== 'ready') return { status: meta.status, error: meta.error };
    const buf = await st.get(k + ':audio', { type: 'arrayBuffer' });
    if (!buf) return { status: 'none' };
    return { status: 'ready', audio: Buffer.from(buf).toString('base64') };
  }
  const song = cleanSong(body.song);
  if (!song) return { status: 'bad' };
  const k = keyOf(song);
  const meta = await st.get(k + ':meta', { type: 'json' });
  if (meta && (meta.status === 'ready' || (meta.status === 'pending' && Date.now() - meta.at < 4 * 60 * 1000))) return { status: meta.status, k };
  await st.setJSON(k + ':meta', { status: 'pending', at: Date.now() });
  // arka plan fonksiyonunu tetikle (hemen 202 döner)
  fetch(new URL('/.netlify/functions/music-background', origin), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ k, song }) }).catch(() => {});
  return { status: 'pending', k };
}

// arka plan fonksiyonu: ElevenLabs'e istek atar, sesi depoya koyar
export async function generate(k, rawSong, env) {
  const st = store();
  const song = cleanSong(rawSong);
  try {
    const r = await fetch('https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'xi-api-key': env.ELEVENLABS_API_KEY },
      body: JSON.stringify({ prompt: promptOf(song), music_length_ms: lengthOf(song), model_id: 'music_v1' }),
    });
    if (!r.ok) throw new Error('ElevenLabs ' + r.status + ' ' + (await r.text()).slice(0, 200));
    await st.set(k + ':audio', await r.arrayBuffer());
    await st.setJSON(k + ':meta', { status: 'ready', at: Date.now() });
  } catch (e) {
    console.error(e);
    await st.setJSON(k + ':meta', { status: 'error', at: Date.now(), error: 'Müzik üretilemedi' });
  }
}
