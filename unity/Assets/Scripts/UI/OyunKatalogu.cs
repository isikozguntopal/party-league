using System;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json.Linq;
using PartiLigi.Oyunlar;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace PartiLigi.UI
{
    /// <summary>Yatay sayfa kaydırıcı: sürükle → bırakınca en yakın sayfaya (ya da hızlı kaydırmada yanındakine) yumuşakça oturur.</summary>
    public class SayfaKaydir : MonoBehaviour, IBeginDragHandler, IDragHandler, IEndDragHandler
    {
        public RectTransform icerik;
        public int sayfaSayisi;
        public int Sayfa { get; private set; }
        public Action<int> degisti;
        public Action<float> yerlestir;                      // genişlik değişince sayfaları yeniden yerleştir
        float _basX, _basZaman, _sonGen; bool _surukle;

        float Gen => Mathf.Max(1, ((RectTransform)transform).rect.width);
        public void Git(int i, bool aninda = false)
        {
            Sayfa = Mathf.Clamp(i, 0, sayfaSayisi - 1); degisti?.Invoke(Sayfa);
            if (aninda) icerik.anchoredPosition = new Vector2(-Sayfa * Gen, 0);
        }
        public void OnBeginDrag(PointerEventData e) { _surukle = true; _basX = icerik.anchoredPosition.x; _basZaman = Time.unscaledTime; }
        public void OnDrag(PointerEventData e)
        {
            RectTransformUtility.ScreenPointToLocalPointInRectangle((RectTransform)transform, e.position, e.pressEventCamera, out var p);
            RectTransformUtility.ScreenPointToLocalPointInRectangle((RectTransform)transform, e.pressPosition, e.pressEventCamera, out var p0);
            icerik.anchoredPosition = new Vector2(_basX + (p.x - p0.x), 0);
        }
        public void OnEndDrag(PointerEventData e)
        {
            _surukle = false;
            float kayma = icerik.anchoredPosition.x - _basX, hiz = kayma / Mathf.Max(0.05f, Time.unscaledTime - _basZaman);
            int hedef = Sayfa;
            if (kayma < -Gen * 0.2f || hiz < -1500) hedef++; else if (kayma > Gen * 0.2f || hiz > 1500) hedef--;
            Git(hedef);
        }
        void Update()
        {
            if (Mathf.Abs(Gen - _sonGen) > 0.5f) { _sonGen = Gen; yerlestir?.Invoke(Gen); icerik.anchoredPosition = new Vector2(-Sayfa * Gen, 0); }
            if (_surukle) return;
            var hedef = new Vector2(-Sayfa * Gen, 0);
            icerik.anchoredPosition = Vector2.Lerp(icerik.anchoredPosition, hedef, 1 - Mathf.Exp(-14f * Time.unscaledDeltaTime));
        }
    }

    /// <summary>
    /// Oyun kataloğu: kaydırdıkça oyunlar (gerçek oynanış ekran görüntüleri + kurallar), "Şimdi oyna" ile hemen başlar.
    /// Metinler: Resources/Katalog/oyunlar.json (node scripts/katalog-unity.mjs), görseller: Resources/Katalog/{kind}_{n}.jpg (scripts/katalog-gorseller.py).
    /// </summary>
    public static class OyunKatalogu
    {
        class Oyun { public string kind, ad; public List<string> kurallar; public bool takim, anlik; }

        static List<Oyun> Liste()
        {
            var l = new List<Oyun> { new Oyun { kind = "tour", ad = "Turnuva", kurallar = new List<string> { $"{OyunKayit.Sayi} oyun sırayla oynanır.", "Her oyunda 1. olan 3, 2. olan 2, 3. olan 1 puan alır.", "En çok puanı toplayan turnuvanın şampiyonu olur!" } } };
            var j = JArray.Parse(Resources.Load<TextAsset>("Katalog/oyunlar").text);
            foreach (JObject o in j)
            {
                var k = (string)o["kind"]; if (!OyunKayit.Var(k)) continue;
                l.Add(new Oyun { kind = k, ad = (string)o["ad"], kurallar = ((JArray)o["kurallar"]).Select(x => (string)x).ToList(), takim = (bool)o["takim"], anlik = (bool)o["anlik"] });
            }
            return l;
        }

        /// <param name="oyna">seçilen oyunu başlat (yalnızca oda sahibi; null ise düğme gösterilmez)</param>
        public static SayfaKaydir Ac(RectTransform ebeveyn, string seciliMod, int baslangicSayfa, Action<string> oyna, Action kapat)
        {
            var oyunlar = Liste();
            var panel = Ui.Rect("Katalog", ebeveyn); Ui.Doldur(panel);
            panel.gameObject.AddComponent<Image>().color = new Color(0.04f, 0.03f, 0.12f, 0.96f);
            var bas = Ui.Yazi(panel, "Ne oynayalım?", 64, Ui.Beyaz, TextAnchor.UpperCenter, true); Ui.Doldur(bas.rectTransform, 0, 0, 0, 110); bas.rectTransform.anchorMin = new Vector2(0, 1); bas.rectTransform.sizeDelta = new Vector2(0, 100); bas.rectTransform.pivot = new Vector2(0.5f, 1); bas.rectTransform.anchoredPosition = new Vector2(0, -100); Ui.Golge(bas, 5, 0.6f);
            // kapat
            var x = Ui.Rect("Kapat", panel); x.anchorMin = x.anchorMax = new Vector2(1, 1); x.pivot = new Vector2(1, 1); x.sizeDelta = new Vector2(110, 110); x.anchoredPosition = new Vector2(-30, -95);
            var xb = x.gameObject.AddComponent<Button>(); xb.targetGraphic = Ui.Kart(x.gameObject, new Color(1, 1, 1, 0.15f), 2f);
            var xt = Ui.Yazi(x, "X", 50, Ui.Beyaz, TextAnchor.MiddleCenter, true); Ui.Doldur(xt.rectTransform);
            xb.onClick.AddListener(() => { UnityEngine.Object.Destroy(panel.gameObject); kapat(); });

            // kaydırma alanı
            var gorunum = Ui.Rect("Gorunum", panel); Ui.Doldur(gorunum, 0, 170, 0, 220);
            gorunum.gameObject.AddComponent<Image>().color = new Color(0, 0, 0, 0.001f);
            gorunum.gameObject.AddComponent<RectMask2D>();
            var icerik = Ui.Rect("Icerik", gorunum); icerik.anchorMin = new Vector2(0, 0); icerik.anchorMax = new Vector2(0, 1); icerik.pivot = new Vector2(0, 0.5f);
            var kaydir = gorunum.gameObject.AddComponent<SayfaKaydir>(); kaydir.icerik = icerik; kaydir.sayfaSayisi = oyunlar.Count;

            // sayfalar: genişlik kaydırıcının gerçek genişliği (telefona göre değişir); ekran görüntüleri sığacak şekilde boyutlanır
            var sayfalar = new List<RectTransform>(); var cerceveler = new List<List<RectTransform>>();
            for (int i = 0; i < oyunlar.Count; i++) { var c = new List<RectTransform>(); sayfalar.Add(Sayfa(icerik, oyunlar[i], seciliMod, oyna, c)); cerceveler.Add(c); }
            kaydir.yerlestir = w =>
            {
                icerik.sizeDelta = new Vector2(w * oyunlar.Count, 0);
                for (int i = 0; i < sayfalar.Count; i++)
                {
                    var s = sayfalar[i]; s.anchorMin = new Vector2(0, 0); s.anchorMax = new Vector2(0, 1); s.pivot = new Vector2(0, 0.5f); s.sizeDelta = new Vector2(w, 0); s.anchoredPosition = new Vector2(i * w, 0);
                    int n = cerceveler[i].Count; if (n == 0) continue;
                    float ic = w - 72 - 68 - 18 * (n - 1);                          // kart kenar payları + resim aralıkları
                    float yuk = Mathf.Min(n >= 3 ? 560 : 800, (ic / n - 12) * 16f / 9f);
                    foreach (var c in cerceveler[i]) c.sizeDelta = new Vector2(yuk * 9f / 16f + 12, yuk + 12);
                    Ui.Yukseklik(cerceveler[i][0].parent.GetComponent<RectTransform>(), yuk + 20);
                }
            };

            // sayfa noktaları + oklar
            var alt = Ui.Rect("Alt", panel); alt.anchorMin = new Vector2(0, 0); alt.anchorMax = new Vector2(1, 0); alt.pivot = new Vector2(0.5f, 0); alt.sizeDelta = new Vector2(0, 150); alt.anchoredPosition = new Vector2(0, 40);
            var noktalar = new List<Image>();
            var nk = Ui.Rect("Noktalar", alt); nk.anchorMin = new Vector2(0.2f, 0); nk.anchorMax = new Vector2(0.8f, 1); nk.offsetMin = nk.offsetMax = Vector2.zero;
            var hg = nk.gameObject.AddComponent<HorizontalLayoutGroup>(); hg.childAlignment = TextAnchor.MiddleCenter; hg.spacing = 12; hg.childControlWidth = hg.childControlHeight = false; hg.childForceExpandWidth = hg.childForceExpandHeight = false;
            for (int i = 0; i < oyunlar.Count; i++) { var d = Ui.Rect("N", nk); d.sizeDelta = new Vector2(22, 22); noktalar.Add(Ui.Kart(d.gameObject, Color.white, 9f)); }
            foreach (var (yon, ax) in new[] { (-1, 0f), (1, 1f) })
            {
                var ok = Ui.Rect("Ok", alt); ok.anchorMin = ok.anchorMax = new Vector2(ax, 0.5f); ok.pivot = new Vector2(ax, 0.5f); ok.sizeDelta = new Vector2(150, 130); ok.anchoredPosition = new Vector2(yon * -30, 0);
                var b = ok.gameObject.AddComponent<Button>(); b.targetGraphic = Ui.Kart(ok.gameObject, new Color(1, 1, 1, 0.14f), 1.6f);
                var t = Ui.Yazi(ok, yon < 0 ? "‹" : "›", 80, Ui.Beyaz, TextAnchor.MiddleCenter, true); Ui.Doldur(t.rectTransform);
                b.onClick.AddListener(() => kaydir.Git(kaydir.Sayfa + yon));
            }
            kaydir.degisti = s => { for (int i = 0; i < noktalar.Count; i++) { noktalar[i].color = i == s ? (Color)Ui.Pembe : new Color(1, 1, 1, 0.3f); noktalar[i].transform.localScale = Vector3.one * (i == s ? 1.3f : 1f); } };
            int ilk = baslangicSayfa >= 0 ? baslangicSayfa : Mathf.Max(0, oyunlar.FindIndex(o => o.kind == seciliMod));
            kaydir.Git(ilk, true);
            return kaydir;
        }

        static RectTransform Sayfa(RectTransform icerik, Oyun o, string seciliMod, Action<string> oyna, List<RectTransform> cerceveler)
        {
            var s = Ui.Rect("Sayfa_" + o.kind, icerik);
            var kart = Ui.Rect("Kart", s); Ui.Doldur(kart, 36, 10, 36, 10);
            Ui.Kart(kart.gameObject, o.kind == seciliMod ? new Color32(0x3A, 0x1E, 0x5C, 245) : new Color32(0x1E, 0x18, 0x48, 245), 0.6f).raycastTarget = false;
            var ic = Ui.Dikey(kart, "Ic", 18, 34, TextAnchor.UpperCenter); Ui.Doldur(ic);

            // ekran görüntüleri (telefon kareleri)
            var resimler = new List<Texture2D>();
            for (int i = 1; i <= 3; i++) { var t = Resources.Load<Texture2D>($"Katalog/{o.kind}_{i}"); if (t != null) resimler.Add(t); }
            float yuk = resimler.Count >= 3 ? 560 : 800, gen = yuk * 9f / 16f;
            var sira = Ui.Rect("Resimler", ic); Ui.Yukseklik(sira, yuk + 20);
            var hg = sira.gameObject.AddComponent<HorizontalLayoutGroup>(); hg.childAlignment = TextAnchor.MiddleCenter; hg.spacing = 18; hg.childControlWidth = hg.childControlHeight = false; hg.childForceExpandWidth = hg.childForceExpandHeight = false;
            foreach (var t in resimler)
            {
                var cer = Ui.Rect("Cerceve", sira); cer.sizeDelta = new Vector2(gen + 12, yuk + 12); cerceveler.Add(cer);
                Ui.Kart(cer.gameObject, new Color(1, 1, 1, 0.9f), 4f).raycastTarget = false;
                var r = Ui.Rect("Resim", cer); Ui.Doldur(r, 6, 6, 6, 6);
                var raw = r.gameObject.AddComponent<RawImage>(); raw.texture = t; raw.raycastTarget = false;
            }

            var ad = Ui.Yazi(ic, o.ad, 70, Ui.Beyaz, TextAnchor.MiddleCenter, true); Ui.Yukseklik(ad, 96); Ui.Golge(ad, 5, 0.6f);
            var etiket = new List<string>();
            if (o.kind == "tour") etiket.Add("Hepsi bir arada");
            else { etiket.Add(o.takim ? "Takım oyunu" : "Herkes kendi için"); etiket.Add(o.anlik ? "Anlık aksiyon" : "Tur tabanlı"); }
            var et = Ui.Yazi(ic, string.Join("  ·  ", etiket), 34, new Color32(0xFF, 0xC8, 0x4A, 255), TextAnchor.MiddleCenter, true); Ui.Yukseklik(et, 50);
            var kural = Ui.Yazi(ic, string.Join("\n", o.kurallar.Select(k => "• " + k)), 34, new Color(1, 1, 1, 0.92f), TextAnchor.UpperLeft);
            Ui.Yukseklik(kural, 0); kural.GetComponent<LayoutElement>().flexibleHeight = 1;
            kural.resizeTextForBestFit = true; kural.resizeTextMaxSize = 36; kural.resizeTextMinSize = 22;
            if (oyna != null)
            {
                var d = Ui.Dugme(ic, "Şimdi oyna", "menu_pembe", 60);
                d.onClick.AddListener(() => oyna(o.kind));
            }
            else { var y = Ui.Yazi(ic, "Oyunu oda sahibi seçer", 34, Ui.Soluk); Ui.Yukseklik(y, 70); }
            return s;
        }
    }
}
