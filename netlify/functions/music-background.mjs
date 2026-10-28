// Arka plan fonksiyonu (adı "-background" ile biter: 15 dakikaya kadar çalışabilir)
import { generate } from './muzik.mjs';
export default async (req) => {
  try { const { k, song } = await req.json(); if (k && song && process.env.ELEVENLABS_API_KEY) await generate(String(k).replace(/[^a-f0-9]/g, '').slice(0, 24), song, process.env); } catch (e) { console.error(e); }
};
