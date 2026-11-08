#!/bin/bash
# Oynanış klibi kaydeder: editörde oyunu yerel sunucuyla oynatır, [bas, bas+sure] aralığını 540×960 / 15 fps kaydeder, mp4'e çevirir.
#   npm run dev   (ayrı terminalde, localhost:8888)
#   bash scripts/klip-kaydet.sh <ad> <ekran> <bas_sn> <sure_sn>     ör: bash scripts/klip-kaydet.sh basket oyun:basket 9 7
# Çıktı: unity/Assets/StreamingAssets/Klipler/<ad>.mp4
set -e
cd "$(dirname "$0")/.."
AD=$1; EKRAN=$2; BAS=$3; SURE=$4
KL=/tmp/klip-$AD; rm -rf "$KL"
PARTI_SUNUCU=http://localhost:8888 /Applications/Unity/Hub/Editor/6000.3.26f1/Unity.app/Contents/MacOS/Unity -batchmode -projectPath unity \
  -executeMethod MenuGoruntu.Cek -kayit "$KL" -bas "$BAS" -sure "$SURE" -fps 15 -ekran "$EKRAN" -logFile /tmp/klip-$AD.log
grep "\[MenuGoruntu\]" /tmp/klip-$AD.log
mkdir -p unity/Assets/StreamingAssets/Klipler
FF=${FFMPEG:-$HOME/.local/bin/ffmpeg}
"$FF" -y -loglevel error -framerate 15 -i "$KL/%04d.jpg" -c:v libx264 -profile:v main -pix_fmt yuv420p -crf 30 -preset slow -movflags +faststart \
  "unity/Assets/StreamingAssets/Klipler/$AD.mp4"
ls -la "unity/Assets/StreamingAssets/Klipler/$AD.mp4"
