# Oyun kataloğu ekran görüntüleri: editör önizlemelerinden (MenuGoruntu, .ekip-onizleme) seçilip küçültülür.
#   /tmp/ft/bin/python -I scripts/katalog-gorseller.py   (Pillow gerekir)
import os
from PIL import Image
KOK = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
SEC = {
    "tour": ["lobi", "tur-64"], "lazer": ["sapan-3.6", "sapan-9"], "bilgi": ["bilgi-11", "bilgi-14.5"], "keski": ["keski-11"],
    "tanir": ["tanir-12"], "basket": ["basket-11.2", "basket-20"], "bombaci": ["bombaci-14", "bombaci-24"],
    "cizim": ["cizim-6.4", "cizim-5.6", "cizim-26"], "neciz": ["neciz-15", "neciz-30"], "melodi": ["melodi-13", "melodi-17"],
    "halat": ["halat-12"], "saniye": ["saniye-10", "saniye-18"], "suru": ["suru-5.5"], "ayar": ["ayar-13"], "telve": ["telve-14", "telve-22"],
}
cikti = os.path.join(KOK, "unity", "Assets", "Resources", "Katalog")
os.makedirs(cikti, exist_ok=True)
for kind, adlar in SEC.items():
    for i, ad in enumerate(adlar):
        im = Image.open(os.path.join(KOK, ".ekip-onizleme", f"unity-{ad}.png")).convert("RGB").resize((540, 960), Image.LANCZOS)
        im.save(os.path.join(cikti, f"{kind}_{i + 1}.jpg"), quality=82)
print("tamam:", sum(len(v) for v in SEC.values()), "görsel")
