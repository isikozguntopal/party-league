# Unity ana menü görsellerini üretir (Pillow + fontTools gerekir):
#   python3 -m venv /tmp/ft && /tmp/ft/bin/pip install pillow fonttools
#   /tmp/ft/bin/python -I scripts/menu-gorselleri.py <DynaPuff[wdth,wght].ttf yolu>
# Font: https://github.com/google/fonts/tree/main/ofl/dynapuff (OFL 1.1)
import os, sys, random
from PIL import Image, ImageDraw, ImageFilter
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

KOK = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "unity", "Assets")
UI = os.path.join(KOK, "Resources", "UI")
DOKU = os.path.join(KOK, "Menu", "Doku")
os.makedirs(UI, exist_ok=True); os.makedirs(DOKU, exist_ok=True)

# 1) DynaPuff değişken fontundan sabit Bold kopya (Unity'nin eski Text'i değişken eksenleri okumaz)
if len(sys.argv) > 1:
    f = instantiateVariableFont(TTFont(sys.argv[1]), {"wght": 700, "wdth": 100})
    f.save(os.path.join(UI, "DynaPuff-Bold.ttf"))

# 2) Hap biçimli, alt kenarı koyu (derinlikli) ve üstü parlak düğmeler — 9 dilimli (bkz. UiSpriteAyari.cs)
W, H, R, DER = 512, 200, 80, 22
def dugme(ad, renk):
    s = 2  # yumuşak kenar için 2x çizip küçült
    im = Image.new("RGBA", (W * s, H * s), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    koyu = tuple(int(c * 0.62) for c in renk)
    d.rounded_rectangle([0, DER * s, W * s - 1, H * s - 1], R * s, fill=koyu + (255,))
    d.rounded_rectangle([0, 0, W * s - 1, (H - DER) * s - 1], R * s, fill=renk + (255,))
    # üst yarıda yumuşak parlama
    p = Image.new("RGBA", im.size, (0, 0, 0, 0)); pd = ImageDraw.Draw(p)
    pd.rounded_rectangle([14 * s, 10 * s, W * s - 14 * s, int((H - DER) * 0.48) * s], (R - 18) * s, fill=(255, 255, 255, 70))
    im = Image.alpha_composite(im, p)
    im.resize((W, H), Image.LANCZOS).save(os.path.join(UI, ad + ".png"))

dugme("menu_pembe", (255, 77, 128))
dugme("menu_mavi", (70, 150, 255))
dugme("menu_sari", (255, 186, 48))
dugme("menu_gri", (120, 128, 160))

# 3) Yarı saydam yuvarlak giriş kutusu (beyaz; renk/saydamlık Unity'de verilir)
s = 2
im = Image.new("RGBA", (W * s, H * s), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
d.rounded_rectangle([0, 0, W * s - 1, H * s - 1], R * s, fill=(255, 255, 255, 255))
d.rounded_rectangle([8 * s, 8 * s, W * s - 8 * s, H * s - 8 * s], (R - 8) * s, fill=(255, 255, 255, 200))
im.resize((W, H), Image.LANCZOS).save(os.path.join(UI, "menu_girdi.png"))

# 4) Sahne zemini: koyu cilalı tahta (1024x1024, döşenebilir)
random.seed(7)
N = 1024; im = Image.new("RGB", (N, N)); d = ImageDraw.Draw(im)
tahta = 128
for i in range(N // tahta):
    taban = random.randint(-10, 10)
    for x in range(i * tahta, (i + 1) * tahta):
        for y in range(0, N, 4):
            v = taban + int(8 * ((x * 13 + y // 37 * 7) % 11) / 11)
            d.line([(x, y), (x, y + 3)], fill=(46 + v, 30 + v // 2, 52 + v))
    d.line([(i * tahta, 0), (i * tahta, N)], fill=(18, 12, 24), width=3)
    kes = random.randint(0, N)
    d.line([(i * tahta, kes), ((i + 1) * tahta, kes)], fill=(18, 12, 24), width=3)
im = im.filter(ImageFilter.GaussianBlur(0.8))
im.save(os.path.join(DOKU, "zemin_tahta.png"))
print("tamam:", UI, DOKU)
