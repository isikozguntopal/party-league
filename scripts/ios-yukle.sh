#!/bin/bash
# Unity iOS derlemesi → Xcode imza (ücretsiz Apple ID, takım J2UN2TD73C) → iPhone'lara yükleme.
#   bash scripts/ios-yukle.sh                  # Unity derle + iki telefona (ve o an bağlı başka iPhone'lara) yükle
#   bash scripts/ios-yukle.sh --unitysiz       # Unity derlemesini atla (Builds/iOS hazırsa)
#   bash scripts/ios-yukle.sh --cihaz <UDID>   # yalnızca bu telefona
# Varsayılan: kullanıcının iki telefonu (BILINEN) HER ZAMAN hedeflenir — bağlı görünmese de denenir (kablosuz da yüklenebilir);
# yüklenemeyen telefon sonda açıkça yazılır ve betik hata koduyla biter.
# Yeni telefon: kablo tak → telefonda "Bu bilgisayara güven" → Ayarlar > Gizlilik ve Güvenlik > Geliştirici Modu açık.
# İlk açılışta: Ayarlar > Genel > VPN ve Aygıt Yönetimi > geliştirici profili > Güven. Ücretsiz hesapta uygulama 7 gün sonra yeniden yüklenmeli.
set -e
cd "$(dirname "$0")/.."
export DEVELOPER_DIR=/Applications/Xcode-27.1.0.app/Contents/Developer
BILINEN=(00008120-000A14363A13C01E 00008120-0019544A012B601E)   # iPhone Özgün, Yağmur
UNITY=1; CIHAZLAR=()
while [ $# -gt 0 ]; do
  case "$1" in
    --unitysiz) UNITY=0 ;;
    --cihaz) CIHAZLAR+=("$2"); shift ;;
  esac
  shift
done

if [ ${#CIHAZLAR[@]} -eq 0 ]; then
  CIHAZLAR=("${BILINEN[@]}")
  # o an bağlı başka fiziksel iPhone'lar da eklenir
  xcrun devicectl list devices --json-output /tmp/cihazlar.json > /dev/null
  while read -r u; do [ -n "$u" ] && [[ ! " ${CIHAZLAR[*]} " =~ " $u " ]] && CIHAZLAR+=("$u"); done < <(python3 -c '
import json
for x in json.load(open("/tmp/cihazlar.json"))["result"]["devices"]:
    h, c = x.get("hardwareProperties", {}), x.get("connectionProperties", {})
    if h.get("reality") == "physical" and h.get("deviceType") == "iPhone" and c.get("pairingState") == "paired" and c.get("tunnelState") != "unavailable":
        print(h.get("udid"))')
fi
echo "Hedef telefonlar: ${CIHAZLAR[*]}"

if [ $UNITY = 1 ]; then
  echo "== Unity iOS derlemesi $(date +%T)"
  /Applications/Unity/Hub/Editor/6000.3.26f1/Unity.app/Contents/MacOS/Unity -batchmode -quit -projectPath unity -executeMethod IosDerle.Calistir -logFile /tmp/ios-unity.log
  grep "\[IosDerle\]" /tmp/ios-unity.log
fi

set +e
BASARILI=(); BASARISIZ=()
XB=(xcodebuild -project unity/Builds/iOS/Unity-iPhone.xcodeproj -scheme Unity-iPhone DEVELOPMENT_TEAM=J2UN2TD73C CODE_SIGN_STYLE=Automatic
    -allowProvisioningUpdates -allowProvisioningDeviceRegistration -derivedDataPath /tmp/parti-dd)
# 1) bir kez, telefondan bağımsız derle (iki telefon da imza profilinde kayıtlı; telefonun açık olması gerekmez)
echo "== Xcode derleme + imza (genel) $(date +%T)"
GENEL=0
if "${XB[@]}" -destination "generic/platform=iOS" build > /tmp/xcode-build.log 2>&1; then GENEL=1; grep -E "BUILD SUCCEEDED" /tmp/xcode-build.log; else grep -E "error:" /tmp/xcode-build.log | head -3; fi
for CIHAZ in "${CIHAZLAR[@]}"; do
  # genel derleme olmadıysa (ör. yeni telefon imza profiline eklenecekse) hedef cihazla derle
  if [ $GENEL = 0 ]; then
    echo "== Xcode derleme + imza ($CIHAZ) $(date +%T)"
    if ! "${XB[@]}" -destination "id=$CIHAZ" build > /tmp/xcode-build.log 2>&1; then
      neden=$(grep -oE "needs to be unlocked|Unable to find a destination" /tmp/xcode-build.log | head -1)
      [ "$neden" = "needs to be unlocked" ] && neden="telefon kilitli" || { [ -n "$neden" ] && neden="telefon görünmüyor (kilidi açık ve aynı Wi-Fi'da mı?)" || neden="derleme/imza hatası"; }
      BASARISIZ+=("$CIHAZ ($neden)"); continue
    fi
  fi
  APP=$(find /tmp/parti-dd/Build/Products -maxdepth 2 -name "*.app" -path "*iphoneos*" | head -1)
  echo "== Yükleme ($CIHAZ) $(date +%T)"
  if xcrun devicectl device install app --device "$CIHAZ" "$APP" > /tmp/yukle-$CIHAZ.log 2>&1 || { sleep 5; xcrun devicectl device install app --device "$CIHAZ" "$APP" > /tmp/yukle-$CIHAZ.log 2>&1; }; then
    BASARILI+=("$CIHAZ")
  else
    grep -qiE "locked|unlock" /tmp/yukle-$CIHAZ.log && neden="telefon kilitli" || neden="telefona ulaşılamadı: kilidi açık ve Mac ile aynı Wi-Fi'da mı?"
    BASARISIZ+=("$CIHAZ ($neden)")
  fi
done
echo "== YÜKLENDİ: ${BASARILI[*]:-yok}"
for x in "${BASARISIZ[@]}"; do echo "== YÜKLENEMEDİ: $x"; done
echo "== BİTTİ $(date +%T)"
[ ${#BASARISIZ[@]} -eq 0 ]
