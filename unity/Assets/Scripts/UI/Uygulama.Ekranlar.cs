using System;
using System.Collections;
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
    /// Yeni ana ekran (tam ekran oynanış videosu + Başlat / Ben / Ayarlar), Ben ve Ayarlar ekranları,
    /// çevrimiçi oyuncular + davetler (hello ≈ 4 sn). Oda kodu kullanıcıya gösterilmez: Başlat odayı kendisi kurar, arkadaşlar davetle gelir.
    /// </summary>
    public partial class Uygulama
    {
        public const string KarakterAnahtar = "pl.karakter", SesAnahtar = "pl.ses", BotAnahtar = "pl.botZorluk";
        KlipOynatici _klip;
        JArray _cevrimici = new JArray();
        readonly HashSet<string> _davetler = new HashSet<string>();     // gösterilen/kapatılan davetler (kod)
        RectTransform _davetKart;
        Coroutine _anaDongu;

        // ---------- Katalog metinleri ----------
        static List<(string kind, string ad, string aciklama)> _katalog;
        public static List<(string kind, string ad, string aciklama)> Katalog()
        {
            if (_katalog != null) return _katalog;
            _katalog = new List<(string, string, string)>();
            foreach (JObject o in JArray.Parse(Resources.Load<TextAsset>("Katalog/oyunlar").text))
                if (OyunKayit.Var((string)o["kind"])) _katalog.Add(((string)o["kind"], (string)o["ad"], (string)((JArray)o["kurallar"])[0]));
            return _katalog;
        }

        string AdYaDefault()
        {
            var ad = PlayerPrefs.GetString(AdAnahtar, "");
            if (string.IsNullOrWhiteSpace(ad)) { ad = "Oyuncu" + UnityEngine.Random.Range(100, 999); PlayerPrefs.SetString(AdAnahtar, ad); PlayerPrefs.Save(); }
            return ad;
        }

        KlipOynatici Klip() => _klip != null ? _klip : (_klip = KlipOynatici.Olustur(transform));

        // ---------- Ana ekran ----------
        void AnaEkran()
        {
            _yokla = false; _kod = null; _durum = null;
            YeniEkran("menu").gameObject.SetActive(false);
            var z = Color.black; _zemin.color = z;
            var kok = Ui.Rect("AnaEkran", _ekran); Ui.Doldur(kok, 0, 0, 0, -80);   // video çentiğin arkasına da taşsın
            Klip().Goruntu(kok);
            // okunurluk için alttan ve üstten koyulaşan perde
            var perde = Ui.Rect("Perde", kok); Ui.Doldur(perde);
            var pi = perde.gameObject.AddComponent<RawImage>(); pi.texture = Gradyan(); pi.raycastTarget = false;

            var ic = Ui.Dikey(kok, "Icerik", 22, 60); Ui.Doldur(ic, 0, 40, 0, 150);
            var baslik = Ui.Yazi(ic, "PARTİ LİGİ", 150, Ui.Beyaz, TextAnchor.MiddleCenter, true, "Baslik");
            baslik.horizontalOverflow = HorizontalWrapMode.Overflow; baslik.resizeTextForBestFit = true; baslik.resizeTextMaxSize = 150; baslik.resizeTextMinSize = 60;
            var dis = baslik.gameObject.AddComponent<Outline>(); dis.effectColor = new Color32(0xC2, 0x1E, 0x5A, 255); dis.effectDistance = new Vector2(5, -5);
            Ui.Golge(baslik, 14, 0.6f); Ui.Yukseklik(baslik, 190);
            OyunUi.Esnek(ic);
            // dönen oyun yazısı
            var oyunAd = Ui.Yazi(ic, "", 72, new Color32(0xFF, 0xC8, 0x4A, 255), TextAnchor.MiddleCenter, true); Ui.Yukseklik(oyunAd, 100); Ui.Golge(oyunAd, 6, 0.8f);
            var oyunAc = Ui.Yazi(ic, "", 38, Ui.Beyaz, TextAnchor.UpperCenter); Ui.Yukseklik(oyunAc, 120); Ui.Golge(oyunAc, 4, 0.9f);
            var basla = Ui.Dugme(ic, "Başlat", "menu_pembe", 76); Ui.Yukseklik(basla, 200);
            basla.onClick.AddListener(() => Calistir(async () =>
            {
                var r = await PartiApi.OdaKur(AdYaDefault());
                LobiyeGir(r);
            }));
            var satir = Ui.Yatay(ic, "AltSatir", 26); Ui.Yukseklik(satir, 170);
            Ui.Dugme(satir, "Ben", "menu_mavi", 54).onClick.AddListener(BenEkrani);
            Ui.Dugme(satir, "Ayarlar", "menu_gri", 54).onClick.AddListener(AyarlarEkrani);

            if (_anaDongu != null) StopCoroutine(_anaDongu);
            _anaDongu = StartCoroutine(AnaVideoDongusu(oyunAd, oyunAc));
        }

        // podyum → oyunlar; her 5 sn bir klip ve açıklama
        IEnumerator AnaVideoDongusu(Text ad, Text aciklama)
        {
            var sira = new List<(string kind, string ad, string aciklama)> { ("podyum", "Kazanan kürsüye çıkar!", "14 parti oyunu, arkadaşlarınla ya da botlarla. Her oyunun birincisi puan toplar.") };
            sira.AddRange(Katalog());
            int i = 0;
            while (ad != null && _ekranAdi == "menu")
            {
                var o = sira[i % sira.Count]; i++;
                Klip().Oynat(o.kind);
                ad.text = o.ad; aciklama.text = o.aciklama;
                for (float t = 0; t < 0.35f && ad != null; t += Time.deltaTime) { SetAlfa(ad, aciklama, t / 0.35f); yield return null; }
                yield return new WaitForSeconds(4.3f);
                for (float t = 0; t < 0.35f && ad != null; t += Time.deltaTime) { SetAlfa(ad, aciklama, 1 - t / 0.35f); yield return null; }
            }
        }
        static void SetAlfa(Text a, Text b, float k) { if (a == null) return; var c = a.color; c.a = k; a.color = c; c = b.color; c.a = k; b.color = c; }

        static Texture2D _gradyan;
        static Texture2D Gradyan()
        {
            if (_gradyan != null) return _gradyan;
            _gradyan = new Texture2D(1, 64) { wrapMode = TextureWrapMode.Clamp };
            for (int y = 0; y < 64; y++) { float v = y / 63f; float a = v < 0.5f ? Mathf.Lerp(0.85f, 0.05f, v / 0.5f) : Mathf.Lerp(0.05f, 0.55f, (v - 0.5f) / 0.5f); _gradyan.SetPixel(0, y, new Color(0.03f, 0.02f, 0.1f, a)); }
            _gradyan.Apply();
            return _gradyan;
        }

        // ---------- Ben: ad + karakter ----------
        void BenEkrani()
        {
            var ic = YeniEkran("ben");
            var z = Ui.Lacivert; z.a = 0.3f; _zemin.color = z;
            var geri = Ui.Dugme(ic, "‹ Geri", "menu_gri", 44); Ui.Yukseklik(geri, 120); geri.onClick.AddListener(AnaMenu);
            var b = Ui.Yazi(ic, "Ben", 96, Ui.Beyaz, TextAnchor.MiddleCenter, true); Ui.Yukseklik(b, 130); Ui.Golge(b, 8, 0.6f);
            var ad = Ui.Girdi(ic, "Adın", 14); ad.text = AdYaDefault();
            ad.onEndEdit.AddListener(v => { PlayerPrefs.SetString(AdAnahtar, string.IsNullOrWhiteSpace(v) ? AdYaDefault() : v.Trim()); PlayerPrefs.Save(); });
            OyunUi.Esnek(ic);
            var k = Ui.Yazi(ic, "Karakterin", 44, new Color32(0xFF, 0xC8, 0x4A, 255), TextAnchor.MiddleCenter, true); Ui.Yukseklik(k, 70);
            var secim = Ui.Yatay(ic, "Secim", 24); Ui.Yukseklik(secim, 170);
            int sablon = _sahne != null && _sahne.sablonlar != null ? _sahne.sablonlar.Length : 18;
            void Goster() { if (_sahne != null) { _sahne.LobiModu(true); _sahne.Oyuncular(new List<string>()); _sahne.Oyuncular(new List<string> { PartiApi.PlayerId }); } }
            Ui.Dugme(secim, "‹", "menu_mavi", 80).onClick.AddListener(() => { Kaydir(-1, sablon); Goster(); });
            Ui.Dugme(secim, "›", "menu_mavi", 80).onClick.AddListener(() => { Kaydir(1, sablon); Goster(); });
            Goster();
        }

        static void Kaydir(int yon, int adet)
        {
            int i = PlayerPrefs.GetInt(KarakterAnahtar, -1);
            if (i < 0) i = Menu.MenuSahnesi.Ozet(PartiApi.PlayerId) % adet;
            PlayerPrefs.SetInt(KarakterAnahtar, ((i + yon) % adet + adet) % adet); PlayerPrefs.Save();
        }

        // ---------- Ayarlar: ses + bot zorluğu ----------
        void AyarlarEkrani()
        {
            var ic = YeniEkran("ayarlar");
            var geri = Ui.Dugme(ic, "‹ Geri", "menu_gri", 44); Ui.Yukseklik(geri, 120); geri.onClick.AddListener(AnaMenu);
            var b = Ui.Yazi(ic, "Ayarlar", 96, Ui.Beyaz, TextAnchor.MiddleCenter, true); Ui.Yukseklik(b, 130); Ui.Golge(b, 8, 0.6f);
            // ses
            var sl = Ui.Yazi(ic, "Ses", 46, new Color32(0xFF, 0xC8, 0x4A, 255), TextAnchor.MiddleLeft, true); Ui.Yukseklik(sl, 70);
            var ses = Ui.Yatay(ic, "Ses", 18); Ui.Yukseklik(ses, 130);
            string[] sesAd = { "Kapalı", "Kısık", "Normal", "Yüksek" }; float[] sesDeger = { 0, 0.35f, 0.75f, 1 };
            var sesDug = new List<(Button d, Image zemin, Text yazi)>();
            var botDug = new List<(Button d, Image zemin, Text yazi)>();
            for (int i = 0; i < 4; i++) { int ii = i; var s = OyunUi.Secenek(ses, sesAd[i], new Color(1, 1, 1, 0.14f), 130, 38); sesDug.Add(s); s.d.onClick.AddListener(() => { PlayerPrefs.SetFloat(SesAnahtar, sesDeger[ii]); PlayerPrefs.Save(); SesUygula(); Isaretle(); }); }
            // bot zorluğu
            var bl = Ui.Yazi(ic, "Bot zorluğu", 46, new Color32(0xFF, 0xC8, 0x4A, 255), TextAnchor.MiddleLeft, true); Ui.Yukseklik(bl, 70);
            var bot = Ui.Yatay(ic, "Bot", 18); Ui.Yukseklik(bot, 130);
            string[] botAd = { "Kolay", "Orta", "Zor" };
            for (int i = 0; i < 3; i++) { int ii = i; var s = OyunUi.Secenek(bot, botAd[i], new Color(1, 1, 1, 0.14f), 130, 38); botDug.Add(s); s.d.onClick.AddListener(() => { PlayerPrefs.SetInt(BotAnahtar, ii); PlayerPrefs.Save(); Isaretle(); }); }
            var not = Ui.Yazi(ic, "Bot zorluğu senin kurduğun odalarda geçerli.", 32, Ui.Soluk); Ui.Yukseklik(not, 60);
            OyunUi.Esnek(ic);
            void Isaretle()
            {
                float v = PlayerPrefs.GetFloat(SesAnahtar, 0.75f); int bz = PlayerPrefs.GetInt(BotAnahtar, 1);
                for (int i = 0; i < 4; i++) sesDug[i].zemin.color = Mathf.Approximately(v, sesDeger[i]) ? (Color)Ui.Pembe : new Color(1, 1, 1, 0.14f);
                for (int i = 0; i < 3; i++) botDug[i].zemin.color = bz == i ? (Color)Ui.Pembe : new Color(1, 1, 1, 0.14f);
            }
            Isaretle();
        }

        public static void SesUygula() => AudioListener.volume = PlayerPrefs.GetFloat(SesAnahtar, 0.75f);

        // ---------- Çevrimiçi + davetler ----------
        IEnumerator MerhabaDongusu()
        {
            while (true)
            {
                Merhaba();
                yield return new WaitForSecondsRealtime(4f);
            }
        }

        async void Merhaba()
        {
            try
            {
                var r = await PartiApi.Cagir(new JObject { ["action"] = "hello", ["name"] = AdYaDefault(), ["code"] = _kod, ["game"] = (string)_durum?["kind"] });
                _cevrimici = r["online"] as JArray ?? new JArray();
                foreach (JObject d in (JArray)r["invites"] ?? new JArray())
                {
                    var kod = (string)d["code"];
                    if (kod == _kod || !_davetler.Add(kod)) continue;
                    DavetGoster((string)d["n"], kod, (string)d["game"]);
                    break;
                }
                CevrimiciDegisti?.Invoke();
            }
            catch { /* çevrimdışı: bir sonrakinde */ }
        }
        public event Action CevrimiciDegisti;
        public JArray Cevrimici => _cevrimici;

        void DavetGoster(string kim, string kod, string oyun)
        {
            if (_davetKart != null) Destroy(_davetKart.gameObject);
            var k = Ui.Rect("Davet", _kok); _davetKart = k;
            k.anchorMin = new Vector2(0.5f, 1); k.anchorMax = new Vector2(0.5f, 1); k.pivot = new Vector2(0.5f, 1); k.sizeDelta = new Vector2(960, 300); k.anchoredPosition = new Vector2(0, -110);
            Ui.Kart(k.gameObject, new Color32(0x2A, 0x1E, 0x5C, 250), 1.2f);
            var oyunAd = Katalog().FirstOrDefault(o => o.kind == oyun).ad;
            var t = Ui.Yazi(k, $"<b>{kim}</b> seni{(oyunAd != null ? " " + oyunAd + " için" : "")} oyuna çağırıyor!", 40, Ui.Beyaz, TextAnchor.MiddleCenter, true);
            t.supportRichText = true; Ui.Doldur(t.rectTransform, 30, 130, 30, 20);
            var satir = Ui.Yatay(k, "Dugmeler", 20); Ui.Doldur(satir, 30, 20, 30, 170);
            Ui.Dugme(satir, "Katıl", "menu_pembe", 50).onClick.AddListener(() => Calistir(async () =>
            {
                Destroy(k.gameObject);
                if (_kod != null) { _yokla = false; try { await PartiApi.Eylem(_kod, "leave"); } catch { } }
                try { await PartiApi.Cagir(new JObject { ["action"] = "inviteAck", ["code"] = kod }); } catch { }
                var r = await PartiApi.OdayaKatil(kod, AdYaDefault());
                LobiyeGir(r);
            }));
            Ui.Dugme(satir, "Hayır", "menu_gri", 50).onClick.AddListener(() =>
            {
                Destroy(k.gameObject);
                Calistir(async () => { await PartiApi.Cagir(new JObject { ["action"] = "inviteAck", ["code"] = kod }); });
            });
            k.SetAsLastSibling();
        }
    }
}
