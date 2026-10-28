using UnityEngine;
using UnityEngine.UI;

namespace PartiLigi.UI
{
    /// <summary>Kodla uGUI kurmak için küçük yardımcılar (referans çözünürlük 1080x1920, dikey).</summary>
    public static class Ui
    {
        public static readonly Color Lacivert = new Color32(0x14, 0x1B, 0x3D, 255);
        public static readonly Color LacivertAcik = new Color32(0x22, 0x2C, 0x5C, 255);
        public static readonly Color Pembe = new Color32(0xF4, 0x3F, 0x6B, 255);
        public static readonly Color Beyaz = Color.white;
        public static readonly Color Soluk = new Color(1, 1, 1, 0.65f);

        static Font _govde, _baslik;
        public static Font Govde
        {
            get
            {
                if (_govde == null)
                {
                    // Türkçe karakterler için sistem yazı tipi; olmazsa Unity'nin yerleşik yazı tipi
                    _govde = Font.CreateDynamicFontFromOSFont(new[] { "Helvetica Neue", "Helvetica", "Arial" }, 48);
                    if (_govde == null) _govde = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
                }
                return _govde;
            }
        }
        public static Font Baslik => _baslik != null ? _baslik : (_baslik = Resources.Load<Font>("UI/KenneyFuture"));

        public static Sprite Btn(string renk) => Resources.Load<Sprite>("UI/btn_" + renk);

        public static RectTransform Rect(string ad, Transform ebeveyn)
        {
            var go = new GameObject(ad, typeof(RectTransform));
            var rt = (RectTransform)go.transform;
            rt.SetParent(ebeveyn, false);
            return rt;
        }

        public static void Doldur(RectTransform rt, float sol = 0, float alt = 0, float sag = 0, float ust = 0)
        {
            rt.anchorMin = Vector2.zero; rt.anchorMax = Vector2.one;
            rt.offsetMin = new Vector2(sol, alt); rt.offsetMax = new Vector2(-sag, -ust);
        }

        public static Image Arkaplan(Transform ebeveyn, Color renk, string ad = "Arka")
        {
            var rt = Rect(ad, ebeveyn); Doldur(rt);
            var im = rt.gameObject.AddComponent<Image>(); im.color = renk;
            return im;
        }

        public static Text Yazi(Transform ebeveyn, string metin, int boyut, Color renk, TextAnchor hiza = TextAnchor.MiddleCenter, bool baslik = false, string ad = "Yazi")
        {
            var rt = Rect(ad, ebeveyn);
            var t = rt.gameObject.AddComponent<Text>();
            t.font = baslik ? Baslik : Govde;
            t.text = metin; t.fontSize = boyut; t.color = renk; t.alignment = hiza;
            t.horizontalOverflow = HorizontalWrapMode.Wrap; t.verticalOverflow = VerticalWrapMode.Overflow;
            t.raycastTarget = false;
            return t;
        }

        public static Button Dugme(Transform ebeveyn, string metin, string renk, int boyut = 52)
        {
            var rt = Rect("Dugme_" + metin, ebeveyn);
            var im = rt.gameObject.AddComponent<Image>();
            im.sprite = Btn(renk); im.type = Image.Type.Sliced; im.pixelsPerUnitMultiplier = 0.35f;
            var b = rt.gameObject.AddComponent<Button>(); b.targetGraphic = im;
            var cs = b.colors; cs.pressedColor = new Color(0.8f, 0.8f, 0.8f); b.colors = cs;
            var y = Yazi(rt, metin, boyut, Beyaz); Doldur(y.rectTransform);
            var le = rt.gameObject.AddComponent<LayoutElement>(); le.preferredHeight = 170; le.minHeight = 170;
            return b;
        }

        public static InputField Girdi(Transform ebeveyn, string ipucu, int sinir, int boyut = 52)
        {
            var rt = Rect("Girdi_" + ipucu, ebeveyn);
            var im = rt.gameObject.AddComponent<Image>(); im.color = new Color(1, 1, 1, 0.12f);
            var le = rt.gameObject.AddComponent<LayoutElement>(); le.preferredHeight = 150; le.minHeight = 150;
            var ip = Yazi(rt, ipucu, boyut, Soluk, TextAnchor.MiddleCenter, false, "Ipucu"); Doldur(ip.rectTransform, 20, 0, 20, 0);
            var tx = Yazi(rt, "", boyut, Beyaz, TextAnchor.MiddleCenter, false, "Metin"); Doldur(tx.rectTransform, 20, 0, 20, 0);
            tx.supportRichText = false;
            var f = rt.gameObject.AddComponent<InputField>();
            f.targetGraphic = im; f.textComponent = tx; f.placeholder = ip; f.characterLimit = sinir;
            return f;
        }

        public static RectTransform Dikey(Transform ebeveyn, string ad, float aralik, int ic = 0, TextAnchor hiza = TextAnchor.UpperCenter)
        {
            var rt = Rect(ad, ebeveyn);
            var v = rt.gameObject.AddComponent<VerticalLayoutGroup>();
            v.spacing = aralik; v.padding = new RectOffset(ic, ic, ic, ic); v.childAlignment = hiza;
            v.childControlWidth = true; v.childControlHeight = true; v.childForceExpandWidth = true; v.childForceExpandHeight = false;
            return rt;
        }

        public static void Yukseklik(Component c, float h)
        {
            var le = c.GetComponent<LayoutElement>() ?? c.gameObject.AddComponent<LayoutElement>();
            le.preferredHeight = h; le.minHeight = h;
        }
    }
}
