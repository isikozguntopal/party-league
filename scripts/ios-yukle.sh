#!/bin/bash
# Unity iOS derlemesi → Xcode imza (ücretsiz Apple ID, takım J2UN2TD73C) → kabloyla bağlı iPhone'lara yükleme.
#   bash scripts/ios-yukle.sh                  # Unity derle + bağlı tüm iPhone'lara yükle
#   bash scripts/ios-yukle.sh --unitysiz       # Unity derlemesini atla (Builds/iOS hazırsa)
#   bash scripts/ios-yukle.sh --cihaz <UDID>   # yalnızca bu telefona
# Yeni telefon: kablo tak → telefonda "Bu bilgisayara güven" → Ayarlar > Gizlilik ve Güvenlik > Geliştirici Modu açık.
# İlk açılışta: Ayarlar > Genel > VPN ve Aygıt Yönetimi > geliştirici profili > Güven. Ücretsiz hesapta uygulama 7 gün sonra yeniden yüklenmeli.
set -e
cd "$(dirname "$0")/.."
export DEVELOPER_DIR=/Applications/Xcode-27.1.0.app/Contents/Developer
UNITY=1; CIHAZLAR=()
while [ $# -gt 0 ]; do
  case "$1" in
    --unitysiz) UNITY=0 ;;
    --cihaz) CIHAZLAR+=("$2"); shift ;;
  esac
  shift
done

if [ ${#CIHAZLAR[@]} -eq 0 ]; then
  # bağlı (ya da aynı ağda eşleşmiş) fiziksel iPhone'lar
  xcrun devicectl list devices --json-output /tmp/cihazlar.json > /dev/null
  while read -r u; do [ -n "$u" ] && CIHAZLAR+=("$u"); done < <(python3 -c '
import json
for x in json.load(open("/tmp/cihazlar.json"))["result"]["devices"]:
    h, c = x.get("hardwareProperties", {}), x.get("connectionProperties", {})
    if h.get("reality") == "physical" and h.get("deviceType") == "iPhone" and c.get("pairingState") == "paired" and c.get("tunnelState") != "unavailable":
        print(h.get("udid"))')
fi
[ ${#CIHAZLAR[@]} -eq 0 ] && { echo "Bağlı iPhone bulunamadı (kablo takılı ve kilidi açık mı?)"; exit 1; }
echo "Hedef telefonlar: ${CIHAZLAR[*]}"

if [ $UNITY = 1 ]; then
  echo "== Unity iOS derlemesi $(date +%T)"
  /Applications/Unity/Hub/Editor/6000.3.26f1/Unity.app/Contents/MacOS/Unity -batchmode -quit -projectPath unity -executeMethod IosDerle.Calistir -logFile /tmp/ios-unity.log
  grep "\[IosDerle\]" /tmp/ios-unity.log
fi

for CIHAZ in "${CIHAZLAR[@]}"; do
  # hedef cihazla derlemek, yeni telefonu ücretsiz hesabın imza profiline ekler (-allowProvisioningDeviceRegistration)
  echo "== Xcode derleme + imza ($CIHAZ) $(date +%T)"
  xcodebuild -project unity/Builds/iOS/Unity-iPhone.xcodeproj -scheme Unity-iPhone -destination "id=$CIHAZ" \
    DEVELOPMENT_TEAM=J2UN2TD73C CODE_SIGN_STYLE=Automatic -allowProvisioningUpdates -allowProvisioningDeviceRegistration \
    -derivedDataPath /tmp/parti-dd build > /tmp/xcode-build.log 2>&1 || { grep -E "error:" /tmp/xcode-build.log | head; exit 1; }
  grep -E "BUILD SUCCEEDED" /tmp/xcode-build.log
  APP=$(find /tmp/parti-dd/Build/Products -maxdepth 2 -name "*.app" -path "*iphoneos*" | head -1)
  echo "== Yükleme ($CIHAZ) $(date +%T)"
  xcrun devicectl device install app --device "$CIHAZ" "$APP" || { sleep 5; xcrun devicectl device install app --device "$CIHAZ" "$APP"; }
done
echo "== BİTTİ $(date +%T)"
