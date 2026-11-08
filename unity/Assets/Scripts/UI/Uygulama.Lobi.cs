using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json.Linq;
using PartiLigi.Net;
using PartiLigi.Oyunlar;
using UnityEngine;
using UnityEngine.UI;

namespace PartiLigi.UI
{
    /// <summary>
    /// Yeni lobi: tam ekran oynanış videoları kaydırılır; oda sahibi dokunduğu oyunları sıraya ekler (#1, #2 …).
    /// Ekrana dokununca alttan panel açılır: sıra, odadakiler (+ bot), çevrimiçi oyuncular (davet et), Başla.
    /// Oyun sırası sunucuda tourGames (seçim sırası korunur), mod her zaman "tour".
    /// </summary>
    public partial class Uygulama
    {
        string _lobiKod;
        SayfaKaydir _sayfa;
        readonly List<(string kind, RectTransform sayfa, Text rozet)> _sayfalar = new List<(string, RectTransform, Text)>();
        RectTransform _video, _panel, _odadakiler, _davetListe; Text _siraYazi; Button _baslaDugme;
        bool _panelAcik;
        readonly List<string> _sira = new List<string>();          // oda sahibinin seçim sırası
        readonly HashSet<string> _davetEdilen = new HashSet<string>();

        List<string> SunucuSirasi()
        {
            var tg = (_durum["tourGames"] as JArray)?.Select(t => (string)t).ToList() ?? new List<string>();
            // oda ilk kurulunca tourGames tüm turnuvadır: bizim sıramız henüz boş sayılır
            return tg.Count > OyunKayit.Sayi || tg.Any(k => !OyunKayit.Var(k)) ? new List<string>() : tg;
        }

        void LobiCiz()
        {
            if (_ekranAdi != "lobi" || _lobiKod != _kod) LobiKur();
            LobiGuncelle();
        }

        void LobiKur()
        {
            YeniEkran("lobi").gameObject.SetActive(false);
            _zemin.color = Color.black;
            _lobiKod = _kod; _sayfalar.Clear(); _panelAcik = false; _davetEdilen.Clear();
            _sira.Clear(); _sira.AddRange(SunucuSirasi());
            var kat = Katalog();

            // kaydırılan tam ekran sayfalar
            var gorunum = Ui.Rect("Gorunum", _ekran); Ui.Doldur(gorunum, 0, 0, 0, -80);
            gorunum.gameObject.AddComponent<Image>().color = new Color(0, 0, 0, 0.001f);
            gorunum.gameObject.AddComponent<RectMask2D>();
            var icerik = Ui.Rect("Icerik", gorunum); icerik.anchorMin = new Vector2(0, 0); icerik.anchorMax = new Vector2(0, 1); icerik.pivot = new Vector2(0, 0.5f);
            _sayfa = gorunum.gameObject.AddComponent<SayfaKaydir>(); _sayfa.icerik = icerik; _sayfa.sayfaSayisi = kat.Count;
            foreach (var o in kat) _sayfalar.Add(LobiSayfasi(icerik, o.kind, o.ad, o.aciklama));
            _sayfa.yerlestir = w =>
            {
                icerik.sizeDelta = new Vector2(w * _sayfalar.Count, 0);
                for (int i = 0; i < _sayfalar.Count; i++) { var s = _sayfalar[i].sayfa; s.anchorMin = new Vector2(0, 0); s.anchorMax = new Vector2(0, 1); s.pivot = new Vector2(0, 0.5f); s.sizeDelta = new Vector2(w, 0); s.anchoredPosition = new Vector2(i * w, 0); }
            };
            // canlı video yalnızca görünen sayfada
            _video = Ui.Rect("CanliVideo", _ekran); _video.gameObject.SetActive(false);
            Klip().Goruntu(_video);
            _sayfa.degisti = i => { if (i < _sayfalar.Count) { Klip().Oynat(_sayfalar[i].kind); _video.SetParent(_sayfalar[i].sayfa.Find("Medya"), false); Ui.Doldur(_video); _video.gameObject.SetActive(true); _video.SetSiblingIndex(1); } };
            _sayfa.Git(0, true);


            PanelKur();
            CevrimiciDegisti -= DavetListesiCiz; CevrimiciDegisti += DavetListesiCiz;
        }

        (string, RectTransform, Text) LobiSayfasi(RectTransform icerik, string kind, string ad, string aciklama)
        {
            var s = Ui.Rect("Sayfa_" + kind, icerik);
            var medya = Ui.Rect("Medya", s); Ui.Doldur(medya);
            var still = Ui.Rect("Kare", medya); Ui.Doldur(still);
            var raw = still.gameObject.AddComponent<RawImage>(); raw.texture = Resources.Load<Texture2D>($"Katalog/{kind}_1"); raw.raycastTarget = false;
            var f = still.gameObject.AddComponent<AspectRatioFitter>(); f.aspectMode = AspectRatioFitter.AspectMode.EnvelopeParent; f.aspectRatio = 540f / 960f;
            var perde = Ui.Rect("Perde", s); Ui.Doldur(perde); var pi = perde.gameObject.AddComponent<RawImage>(); pi.texture = Gradyan(); pi.raycastTarget = false;
            // dokununca: oda sahibi sıraya ekler/çıkarır, panel açılır
            var dok = s.gameObject.AddComponent<Image>(); dok.color = new Color(0, 0, 0, 0.001f);
            var b = s.gameObject.AddComponent<Button>(); b.transition = Selectable.Transition.None;
            b.onClick.AddListener(() => SayfayaDokun(kind));
            // yazılar (üst yarıda kalır; alt panel açılınca da görünür)
            // yazılar altta (videonun üst şeridi oyunun kendi arayüzü, onu örtmesin); kapalı panelin hemen üstünde
            var t = Ui.Yazi(s, ad, 84, new Color32(0xFF, 0xC8, 0x4A, 255), TextAnchor.LowerCenter, true);
            t.rectTransform.anchorMin = new Vector2(0, 0); t.rectTransform.anchorMax = new Vector2(1, 0); t.rectTransform.pivot = new Vector2(0.5f, 0); t.rectTransform.sizeDelta = new Vector2(-60, 110); t.rectTransform.anchoredPosition = new Vector2(0, 330); Ui.Golge(t, 6, 0.9f);
            var a = Ui.Yazi(s, aciklama + "\n<size=28><color=#9AA0C8>‹ kaydır · dokun: sıraya ekle ›</color></size>", 36, Ui.Beyaz, TextAnchor.UpperCenter);
            a.supportRichText = true;
            a.rectTransform.anchorMin = new Vector2(0, 0); a.rectTransform.anchorMax = new Vector2(1, 0); a.rectTransform.pivot = new Vector2(0.5f, 1); a.rectTransform.sizeDelta = new Vector2(-90, 190); a.rectTransform.anchoredPosition = new Vector2(0, 325); Ui.Golge(a, 3, 0.9f);
            // sıra rozeti (#n)
            var r = Ui.Rect("Rozet", s); r.anchorMin = r.anchorMax = new Vector2(1, 1); r.pivot = new Vector2(1, 1); r.sizeDelta = new Vector2(150, 150); r.anchoredPosition = new Vector2(-30, -300);
            Ui.Kart(r.gameObject, Ui.Pembe, 1.3f).raycastTarget = false;
            var rt = Ui.Yazi(r, "", 66, Ui.Beyaz, TextAnchor.MiddleCenter, true); Ui.Doldur(rt.rectTransform); Ui.Golge(rt, 4);
            r.gameObject.SetActive(false);
            return (kind, s, rt);
        }

        void SayfayaDokun(string kind)
        {
            if (BenHost)
            {
                if (_sira.Contains(kind)) _sira.Remove(kind); else _sira.Add(kind);
                var liste = new JArray(_sira);
                Calistir(async () =>
                {
                    if ((string)_durum["mode"] != "tour") await PartiApi.Eylem(_kod, "mode", new JObject { ["mode"] = "tour" });
                    if (_sira.Count > 0) { var r = await PartiApi.Eylem(_kod, "tourGames", new JObject { ["games"] = liste }); _durum = (JObject)r["state"]; }
                });
                RozetleriCiz(_sira);
                if (_sira.Contains(kind)) Efekt.Nabiz(_sayfalar.First(s => s.kind == kind).rozet.transform.parent);
            }
            PanelAc(true);
        }

        void RozetleriCiz(List<string> sira)
        {
            foreach (var (kind, _, rozet) in _sayfalar)
            {
                int i = sira.IndexOf(kind);
                rozet.transform.parent.gameObject.SetActive(i >= 0);
                rozet.text = "#" + (i + 1);
            }
            if (_siraYazi != null)
                _siraYazi.text = sira.Count == 0 ? (BenHost ? "Oynamak istediğin oyunlara dokun" : "Oda sahibi oyun seçiyor…")
                    : "Sıra:  " + string.Join("  ·  ", sira.Select((k, i) => $"#{i + 1} {Katalog().FirstOrDefault(o => o.kind == k).ad}"));
        }

        // ---------- alt panel ----------
        void PanelKur()
        {
            _panel = Ui.Rect("AltPanel", _ekran);
            _panel.anchorMin = new Vector2(0, 0); _panel.anchorMax = new Vector2(1, 0); _panel.pivot = new Vector2(0.5f, 0); _panel.sizeDelta = new Vector2(0, 900);
            Ui.Kart(_panel.gameObject, new Color32(0x14, 0x10, 0x38, 248), 0.5f);
            var tutamak = Ui.Rect("Tutamak", _panel); tutamak.anchorMin = new Vector2(0, 1); tutamak.anchorMax = new Vector2(1, 1); tutamak.pivot = new Vector2(0.5f, 1); tutamak.sizeDelta = new Vector2(0, 70); tutamak.anchoredPosition = Vector2.zero;
            var tb = tutamak.gameObject.AddComponent<Button>(); tb.targetGraphic = tutamak.gameObject.AddComponent<Image>(); tb.targetGraphic.color = new Color(0, 0, 0, 0.001f);
            tb.onClick.AddListener(() => PanelAc(!_panelAcik));
            var cubuk = Ui.Rect("Cubuk", tutamak); cubuk.anchorMin = cubuk.anchorMax = new Vector2(0.5f, 0.5f); cubuk.sizeDelta = new Vector2(140, 12);
            Ui.Kart(cubuk.gameObject, new Color(1, 1, 1, 0.4f), 10f).raycastTarget = false;

            var ic = Ui.Dikey(_panel, "Ic", 14, 0); Ui.Doldur(ic, 40, 30, 40, 76);
            _siraYazi = Ui.Yazi(ic, "", 34, new Color32(0xFF, 0xC8, 0x4A, 255), TextAnchor.MiddleLeft, true); Ui.Yukseklik(_siraYazi, 70);
            var o1 = Ui.Yazi(ic, "Odadakiler", 32, Ui.Soluk, TextAnchor.MiddleLeft, true); Ui.Yukseklik(o1, 44);
            _odadakiler = Ui.Yatay(ic, "Odadakiler", 12); Ui.Yukseklik(_odadakiler, 90);
            _odadakiler.GetComponent<HorizontalLayoutGroup>().childForceExpandWidth = false; _odadakiler.GetComponent<HorizontalLayoutGroup>().childAlignment = TextAnchor.MiddleLeft;
            var o2 = Ui.Yazi(ic, "Davet et (uygulamayı açık tutanlar)", 32, Ui.Soluk, TextAnchor.MiddleLeft, true); Ui.Yukseklik(o2, 44);
            _davetListe = Ui.Dikey(ic, "Davet", 10, 0); Ui.Yukseklik(_davetListe, 0); _davetListe.GetComponent<LayoutElement>().flexibleHeight = 1;
            var alt = Ui.Yatay(ic, "Alt", 20); Ui.Yukseklik(alt, 170);
            _baslaDugme = Ui.Dugme(alt, "Başla", "menu_pembe", 60); _baslaDugme.GetComponent<LayoutElement>().flexibleWidth = 2;
            _baslaDugme.onClick.AddListener(() => Calistir(async () =>
            {
                if (_sira.Count == 0) { Toast("Önce oyun seç: videoya dokun"); return; }
                await PartiApi.Eylem(_kod, "tourGames", new JObject { ["games"] = new JArray(_sira) });
                var r = await PartiApi.Eylem(_kod, "start"); _durum = (JObject)r["state"]; _lobiAnahtar = ""; Ciz();
            }));
            var cik = Ui.Dugme(alt, "Çık", "menu_gri", 50); cik.GetComponent<LayoutElement>().flexibleWidth = 1;
            cik.onClick.AddListener(OdadanCik);
            PanelAc(false);
        }

        void PanelAc(bool acik)
        {
            _panelAcik = acik;
            if (_panel != null) _panel.anchoredPosition = new Vector2(0, acik ? 0 : -900 + 110);   // kapalıyken yalnızca tutamak + sıra görünür
            if (acik) DavetListesiCiz();
        }

        void LobiGuncelle()
        {
            if (_durum == null || _panel == null) return;
            var sira = BenHost ? _sira : SunucuSirasi();
            RozetleriCiz(sira);
            _baslaDugme.gameObject.SetActive(BenHost);
            // odadakiler
            foreach (Transform c in _odadakiler) Destroy(c.gameObject);
            foreach (JObject p in (JArray)_durum["players"])
            {
                if ((bool?)p["left"] == true) continue;
                var id = (string)p["id"]; bool bot = (bool?)p["bot"] == true;
                var cip = Ui.Rect("Oyuncu", _odadakiler); var le = cip.gameObject.AddComponent<LayoutElement>(); le.preferredHeight = 84; le.preferredWidth = 220;
                Ui.Kart(cip.gameObject, Renk((string)p["color"]), 2.4f);
                var t = Ui.Yazi(cip, id == PartiApi.PlayerId ? "Sen" : (string)p["name"], 32, Ui.Beyaz, TextAnchor.MiddleCenter, true); Ui.Doldur(t.rectTransform, 10, 0, bot && BenHost ? 60 : 10, 0);
                t.resizeTextForBestFit = true; t.resizeTextMaxSize = 32; t.resizeTextMinSize = 18;
                if (bot && BenHost)
                {
                    var x = Ui.Rect("Sil", cip); x.anchorMin = x.anchorMax = new Vector2(1, 0.5f); x.pivot = new Vector2(1, 0.5f); x.sizeDelta = new Vector2(56, 56); x.anchoredPosition = new Vector2(-10, 0);
                    var xb = x.gameObject.AddComponent<Button>(); xb.targetGraphic = Ui.Kart(x.gameObject, new Color(0, 0, 0, 0.3f), 4f);
                    var xt = Ui.Yazi(x, "X", 28, Ui.Beyaz, TextAnchor.MiddleCenter, true); Ui.Doldur(xt.rectTransform);
                    xb.onClick.AddListener(() => Calistir(async () => { var r = await PartiApi.Eylem(_kod, "removeBot", new JObject { ["botId"] = id }); _durum = (JObject)r["state"]; _lobiAnahtar = ""; Ciz(); }));
                }
            }
            if (BenHost)
            {
                var bot = Ui.Rect("Bot", _odadakiler); var le = bot.gameObject.AddComponent<LayoutElement>(); le.preferredHeight = 84; le.preferredWidth = 150;
                var bb = bot.gameObject.AddComponent<Button>(); bb.targetGraphic = Ui.Kart(bot.gameObject, new Color(1, 1, 1, 0.16f), 2.4f);
                var bt = Ui.Yazi(bot, "+ Bot", 34, Ui.Beyaz, TextAnchor.MiddleCenter, true); Ui.Doldur(bt.rectTransform);
                bb.onClick.AddListener(() => Calistir(async () => { var r = await PartiApi.Eylem(_kod, "addBot"); _durum = (JObject)r["state"]; _lobiAnahtar = ""; Ciz(); }));
            }
            DavetListesiCiz();
        }

        void DavetListesiCiz()
        {
            if (_davetListe == null || _durum == null) return;
            foreach (Transform c in _davetListe) Destroy(c.gameObject);
            var odada = new HashSet<string>(((JArray)_durum["players"]).Select(p => (string)p["id"]));
            var kisiler = _cevrimici.Cast<JObject>().Where(o => !odada.Contains((string)o["id"])).Take(5).ToList();
            if (kisiler.Count == 0) { var y = Ui.Yazi(_davetListe, "Şu an uygulamayı açık tutan başka kimse yok", 30, Ui.Soluk); Ui.Yukseklik(y, 60); return; }
            foreach (var o in kisiler)
            {
                var id = (string)o["id"]; bool davetli = _davetEdilen.Contains(id);
                var satir = Ui.Rect("Kisi", _davetListe); Ui.Yukseklik(satir, 90);
                Ui.Kart(satir.gameObject, new Color(1, 1, 1, 0.08f), 2.3f);
                var nerede = o["code"]?.Type == JTokenType.String ? (o["game"]?.Type == JTokenType.String ? "oyunda" : "bir odada") : "menüde";
                var t = Ui.Yazi(satir, $"{(string)o["n"]}  <size=26><color=#9AA0C8>{nerede}</color></size>", 36, Ui.Beyaz, TextAnchor.MiddleLeft, true); t.supportRichText = true; Ui.Doldur(t.rectTransform, 26, 0, 260, 0);
                var d = Ui.Rect("Davet", satir); d.anchorMin = d.anchorMax = new Vector2(1, 0.5f); d.pivot = new Vector2(1, 0.5f); d.sizeDelta = new Vector2(230, 70); d.anchoredPosition = new Vector2(-12, 0);
                var db = d.gameObject.AddComponent<Button>(); db.targetGraphic = Ui.Kart(d.gameObject, davetli ? new Color32(0x2E, 0xB8, 0x72, 255) : Ui.Pembe, 2.6f);
                var dt = Ui.Yazi(d, davetli ? "Davet edildi ✓" : "Davet et", 28, Ui.Beyaz, TextAnchor.MiddleCenter, true); Ui.Doldur(dt.rectTransform);
                db.interactable = !davetli;
                db.onClick.AddListener(() => Calistir(async () =>
                {
                    await PartiApi.Cagir(new JObject { ["action"] = "invite", ["to"] = id, ["code"] = _kod, ["game"] = _sira.FirstOrDefault() });
                    _davetEdilen.Add(id); DavetListesiCiz();
                }));
            }
        }
    }
}
