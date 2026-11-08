#!/bin/bash
# Katalog + ana ekran için tüm oynanış kliplerini kaydeder (npm run dev açık olmalı). Aralıklar oyunların en hareketli anları.
cd "$(dirname "$0")/.."
while read -r ad ekran bas sure; do
  [ -z "$ad" ] && continue
  echo "== $ad ($bas+$sure sn) $(date +%T)"
  bash scripts/klip-kaydet.sh "$ad" "$ekran" "$bas" "$sure" 2>&1 | tail -1
done <<'LISTE'
podyum podyum 1 7
lazer oyun:lazer 5 8
bilgi oyun:bilgi 9.5 7
keski oyun:keski 3.5 8
tanir oyun:tanir 9 6
basket oyun:basket 14 8
bombaci oyun:bombaci 9 7
cizim oyun:cizim 17 9
neciz oyun:neciz 10 9
melodi oyun:melodi 6 7
halat oyun:halat 6 8
saniye oyun:saniye 8 9
suru oyun:suru 4 7
ayar oyun:ayar 10 7
telve oyun:telve 10 8
LISTE
echo "== BİTTİ $(date +%T)"; ls -la unity/Assets/StreamingAssets/Klipler/
