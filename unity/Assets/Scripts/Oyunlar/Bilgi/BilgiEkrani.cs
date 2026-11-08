using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json.Linq;
using PartiLigi.UI;
using UnityEngine;
using UnityEngine.UI;

namespace PartiLigi.Oyunlar.Bilgi
{
    /// <summary>
    /// 🧠 Bil Bakalım (kurallar: public/games/bilgi.js). Tur 1: kategori oylaması; 2-5: sorular; 6: sonuncu konu seçer; 7-10: sorular.
    /// Jokerler: Yarı Yarıya (iki yanlışı siler), Çift Cevap (iki şık). Doğru cevap yalnızca açılışta gelir.
    /// </summary>
    public class BilgiEkrani : OyunEkrani
    {
        static readonly (string id, string ad)[] Kategoriler =
        {
            ("dizi", "Yeşilçam & Diziler"), ("bilim", "Bilim ve Keşif"), ("tarih", "Tarih Yolculuğu"), ("insan", "İnsan ve Evrim"),
            ("kelime", "Deyimler & Kelimeler"), ("genel", "Genel Kültür"), ("spor", "Spor & Oyun"), ("cografya", "Coğrafya & Gezi"),
        };
        static string KatAd(string id) => Kategoriler.FirstOrDefault(k => k.id == id).ad ?? id;
        static readonly string[] Harf = { "A", "B", "C", "D" };

        Text _sol, _sag, _bilgi;
        RectTransform _govde;
        string _anahtar;
        int _ciftIlk = -1;                    // Çift Cevap: ilk işaretlenen şık
        string _gonderilen;                   // bu turda gönderdiğim (çift gönderimi önler)
        float _otoZaman = -1;

        public override string Baslik => "Bil Bakalım";

        public override void Kur()
        {
            var ic = Ui.Dikey(B.alan, "Icerik", 22, 60); Ui.Doldur(ic);
            OyunUi.UstSerit(ic, out _sol, out _sag, out _bilgi);
            _govde = Ui.Dikey(ic, "Govde", 18, 0); Ui.Yukseklik(_govde, 0); _govde.GetComponent<LayoutElement>().flexibleHeight = 1;
        }

        public override void Durum() { }

        string Faz => (string)B.G?["phase"] ?? "done";
        JObject Hamlem => B.durum["myAction"] as JObject;

        public override void Kare()
        {
            var simdi = B.Simdi;
            bool acilis = B.AcilisSuruyor(out _);
            string g;
            if (acilis) g = "acilis:" + B.Son["round"];
            else if (!B.Oynaniyor) g = "bitti";
            else if (simdi < B.TurBasi) g = "giris:" + B.Tur;
            else g = Faz + ":" + B.Tur + ":" + (Hamlem != null) + ":" + B.G?["hide"] + ":" + B.G?["ciftNow"] + ":" + _ciftIlk + ":" + B.G?["votes"]?.ToString(Newtonsoft.Json.Formatting.None) + ":" + B.G?["jokers"]?.ToString(Newtonsoft.Json.Formatting.None);
            if (g != _anahtar) { _anahtar = g; Yenile(acilis, simdi); }

            int qi = (int?)B.G?["qi"] ?? -1, top = (int?)B.G?["total"] ?? 8;
            _sol.text = Faz == "q" && !acilis ? $"Soru {qi + 1}/{top}" : "Bil Bakalım";
            _sag.text = B.Oynaniyor && !acilis && simdi >= B.TurBasi ? OyunBaglami.Geri(B.SonSure - simdi) : "";
            _sol.transform.parent.gameObject.SetActive(B.Oynaniyor || acilis);
            Otomatik();
        }

        void Temizle() { foreach (Transform c in _govde) Object.Destroy(c.gameObject); }

        Text Yazi(string m, int boyut, float yuk, Color? renk = null, bool baslik = true)
        {
            var t = Ui.Yazi(_govde, m, boyut, renk ?? Ui.Beyaz, TextAnchor.MiddleCenter, baslik); Ui.Yukseklik(t, yuk); Ui.Golge(t, 3, 0.6f);
            return t;
        }

        void Yenile(bool acilis, double simdi)
        {
            Temizle();
            if (acilis) { AcilisCiz(); return; }
            if (!B.Oynaniyor) { _bilgi.text = ""; return; }
            if (simdi < B.TurBasi)
            {
                _bilgi.text = B.Tur == 1 ? "Konuya oy ver, soruları hızlı cevapla!" : "Sıradaki soru geliyor…";
                OyunUi.Esnek(_govde);
                if (B.Tur == 1) { Yazi("Bil Bakalım", 110, 160); Yazi("Hızlı cevap daha çok puan!\nİki jokerin var: Yarı Yarıya ve Çift Cevap.", 40, 160, null, false); }
                else Yazi("Hazır ol!", 90, 140);
                OyunUi.Esnek(_govde);
                return;
            }
            switch (Faz)
            {
                case "vote": OylamaCiz(); break;
                case "pick": SecimCiz(); break;
                case "q": SoruCiz(); break;
            }
        }

        // ---------- Kategori oylaması ----------
        void OylamaCiz()
        {
            _bilgi.text = "Hangi konudan sorulsun? Oyunu ver!";
            var oylar = B.G?["votes"] as JObject;
            var benim = (string)Hamlem?["cat"];
            Kategori(Kategoriler.Select(k => k.id), id => oylar?.Properties().Count(p => (string)p.Value == id) ?? 0, benim, true);
            OyunUi.Esnek(_govde);
            if (benim != null) Yazi("Oyun alındı, istersen değiştir", 34, 60, Ui.Soluk, false);
        }

        void SecimCiz()
        {
            var secen = (string)B.G?["chooser"];
            if (secen == B.Ben)
            {
                _bilgi.text = "Sonuncusun! Son 4 sorunun konusunu sen seç";
                var benim = (string)Hamlem?["cat"];
                Kategori(Kategoriler.Select(k => k.id).Where(k => k != (string)B.G?["cat"]), _ => 0, benim, false);
            }
            else
            {
                _bilgi.text = "Konu seçiliyor";
                OyunUi.Esnek(_govde);
                Yazi(B.Ad(secen) + " sonuncu", 64, 110);
                Yazi("Son 4 sorunun konusunu seçiyor…", 40, 80, Ui.Soluk, false);
                OyunUi.Esnek(_govde);
            }
        }

        void Kategori(IEnumerable<string> idler, System.Func<string, int> sayi, string secili, bool oy)
        {
            var liste = idler.ToList();
            for (int i = 0; i < liste.Count; i += 2)
            {
                var satir = Ui.Yatay(_govde, "Satir", 18); Ui.Yukseklik(satir, 150);
                for (int j = i; j < Mathf.Min(i + 2, liste.Count); j++)
                {
                    var id = liste[j]; int n = sayi(id);
                    var renk = OyunUi.SikRenk[j % 4]; if (secili != null && secili != id) renk.a = 0.45f;
                    var s = OyunUi.Secenek(satir, KatAd(id) + (oy && n > 0 ? $"  ({n})" : ""), renk, 150, 36);
                    var le = s.d.gameObject.GetComponent<LayoutElement>(); le.flexibleWidth = 1;
                    s.d.onClick.AddListener(() => { if (B.BenCanliyim) B.Gonder("act", new JObject { ["cat"] = id }); });
                }
            }
        }

        // ---------- Soru ----------
        JObject Soru(int qi) { var qs = B.G?["qs"] as JArray; return qs != null && qi >= 0 && qi < qs.Count ? (JObject)qs[qi] : null; }

        void SoruCiz()
        {
            int qi = (int?)B.G?["qi"] ?? 0;
            var q = Soru(qi); if (q == null) return;
            var hamle = Hamlem;
            bool cevapladim = hamle != null, cift = (bool?)B.G?["ciftNow"] == true;
            var gizli = (B.G?["hide"] as JArray)?.Select(t => (int)t).ToList() ?? new List<int>();
            _bilgi.text = !B.BenCanliyim ? "İzliyorsun" : cevapladim ? "Cevabın alındı, diğerleri bekleniyor" : cift ? "Çift Cevap: iki şık seç" : "Doğru şıkkı seç, hızlı olan çok puan alır";
            SoruKarti((string)q["q"]);
            var sec = (JArray)q["o"];
            for (int k = 0; k < 4; k++)
            {
                int kk = k;
                var renk = OyunUi.SikRenk[k];
                bool benimki = cevapladim && ((int?)hamle["a"] == k || (int?)hamle["a2"] == k) || _ciftIlk == k;
                if ((cevapladim || _ciftIlk >= 0) && !benimki) renk.a = 0.4f;
                var s = OyunUi.Secenek(_govde, Harf[k] + ")  " + (string)sec[k], renk, 140, 40);
                s.yazi.alignment = TextAnchor.MiddleLeft;
                if (gizli.Contains(k)) { s.yazi.text = ""; s.zemin.color = new Color(1, 1, 1, 0.08f); s.d.interactable = false; continue; }
                s.d.interactable = B.BenCanliyim && !cevapladim;
                s.d.onClick.AddListener(() => Cevap(kk, cift));
            }
            // jokerler
            var jk = B.G?["jokers"] as JObject;
            if (B.BenCanliyim && !cevapladim && jk != null && ((bool?)jk["yari"] == true || (bool?)jk["cift"] == true))
            {
                var satir = Ui.Yatay(_govde, "Jokerler", 18); Ui.Yukseklik(satir, 110);
                Joker(satir, "Yarı Yarıya", "yari", (bool?)jk["yari"] == true && gizli.Count == 0 && !cift);
                Joker(satir, "Çift Cevap", "cift", (bool?)jk["cift"] == true && !cift && gizli.Count == 0);
            }
            OyunUi.Esnek(_govde);
        }

        void SoruKarti(string metin)
        {
            var kart = Ui.Rect("Soru", _govde); Ui.Yukseklik(kart, 300);
            Ui.Kart(kart.gameObject, new Color(0.2f, 0.15f, 0.48f, 0.92f), 0.8f);
            var t = Ui.Yazi(kart, metin, 46, Ui.Beyaz, TextAnchor.MiddleCenter); Ui.Doldur(t.rectTransform, 40, 20, 40, 20);
            t.resizeTextForBestFit = true; t.resizeTextMaxSize = 46; t.resizeTextMinSize = 26; Ui.Golge(t, 3, 0.5f);
        }

        void Joker(Transform satir, string ad, string tur, bool etkin)
        {
            var s = OyunUi.Secenek(satir, ad, etkin ? new Color(1, 1, 1, 0.2f) : new Color(1, 1, 1, 0.06f), 110, 34);
            s.d.gameObject.GetComponent<LayoutElement>().flexibleWidth = 1;
            s.d.interactable = etkin;
            s.d.onClick.AddListener(() => { _ciftIlk = -1; B.Gonder("gact", new JObject { [tur] = true }); });
        }

        void Cevap(int k, bool cift)
        {
            if (!B.BenCanliyim || Hamlem != null) return;
            var anahtar = B.Seq + "/" + B.Tur;
            if (cift && _ciftIlk < 0) { _ciftIlk = k; return; }       // ilk şık işaretlendi, ikincisi bekleniyor
            if (cift && _ciftIlk == k) { _ciftIlk = -1; return; }     // aynı şıkka tekrar: işareti kaldır
            if (_gonderilen == anahtar) return;
            _gonderilen = anahtar;
            var govde = cift ? new JObject { ["a"] = _ciftIlk, ["a2"] = k } : new JObject { ["a"] = k };
            _ciftIlk = -1;
            B.Gonder("act", govde);
        }

        // ---------- Açılış ----------
        void AcilisCiz()
        {
            var son = B.Son; var faz = (string)son["phase"];
            if (faz == "vote")
            {
                _bilgi.text = "Oylar sayıldı";
                OyunUi.Esnek(_govde);
                Yazi("Konu", 44, 70, Ui.Soluk, false);
                Yazi(KatAd((string)son["winner"]), 84, 130, new Color32(0xFF, 0xC8, 0x4A, 255));
                OyunUi.Esnek(_govde);
                return;
            }
            if (faz == "pick")
            {
                _bilgi.text = "Son 4 sorunun konusu";
                OyunUi.Esnek(_govde);
                Yazi(B.Ad((string)son["chooser"]) + " seçti", 44, 70, Ui.Soluk, false);
                Yazi(KatAd((string)son["cat"]), 84, 130, new Color32(0xFF, 0xC8, 0x4A, 255));
                OyunUi.Esnek(_govde);
                return;
            }
            int qi = (int)son["qi"], dogru = (int)son["c"];
            var q = Soru(qi); var cevaplar = (JObject)son["answers"];
            int bildi = (int?)son["nCorrect"] ?? 0, kisi = (int?)son["nAlive"] ?? 0;
            _bilgi.text = $"{kisi} kişiden {bildi} kişi bildi" + ((double?)son["mult"] > 1 ? $" · puan ×{OyunBaglami.Saniye((double)son["mult"] * 1000, "0.##")}" : "");
            if (q != null) SoruKarti((string)q["q"]);
            var benimHamle = cevaplar[B.Ben] as JObject;
            int benimSik = (int?)benimHamle?["a"] ?? -1, benimSik2 = (int?)benimHamle?["a2"] ?? -1;
            RectTransform dogruRt = null, benimRt = null;
            for (int k = 0; k < 4; k++)
            {
                var kimler = cevaplar.Properties().Where(p => (int?)p.Value["a"] == k || (int?)p.Value["a2"] == k).Select(p => B.Ad(p.Name)).ToList();
                var renk = k == dogru ? new Color32(0x2E, 0xB8, 0x72, 255) : new Color32(0x50, 0x48, 0x78, 200);
                var s = OyunUi.Secenek(_govde, Harf[k] + ")  " + (string)q?["o"]?[k] + (kimler.Count > 0 ? "\n<size=28>" + string.Join(", ", kimler) + "</size>" : ""), renk, 130, 38);
                s.yazi.alignment = TextAnchor.MiddleLeft; s.yazi.supportRichText = true; s.d.interactable = false;
                if (k != dogru && (k == benimSik || k == benimSik2)) renk = new Color32(0xE0, 0x31, 0x31, 235);   // benim yanlışım kırmızı
                s.zemin.color = renk;
                if (k == dogru) dogruRt = (RectTransform)s.d.transform;
                if (k == benimSik) benimRt = (RectTransform)s.d.transform;
            }
            // efekt: bildiysem tik + konfeti, bilemediysem çarpı + sallanma
            if (benimHamle != null && benimSik >= 0)
            {
                bool bildim = ((int?)benimHamle["pts"] ?? 0) > 0;
                Efekt.Isaret(B.alan, new Vector2(0, 120), bildim, 460);
                if (bildim) { Efekt.Konfeti(B.alan, new Vector2(0, 0), 90); if (dogruRt != null) Efekt.Nabiz(dogruRt); }
                else if (benimRt != null) Efekt.Salla(benimRt);
            }
            var benim = cevaplar[B.Ben] as JObject;
            if (benim != null)
            {
                int pts = (int?)benim["pts"] ?? 0;
                Yazi(pts > 0 ? "+" + pts + " puan" : (int?)benim["a"] < 0 ? "Cevap vermedin" : "Bilemedin", 54, 80, pts > 0 ? new Color32(0x6C, 0xF0, 0x9A, 255) : new Color32(0xFF, 0x8A, 0x9A, 255));
            }
            // sıralama
            var puanlar = ((JObject)son["scores"]).Properties().OrderByDescending(p => (int)p.Value).Take(3).ToList();
            Yazi(string.Join("   ", puanlar.Select((p, i) => $"{i + 1}. {B.Ad(p.Name)} {(int)p.Value}")), 32, 60, Ui.Soluk, false);
            OyunUi.Esnek(_govde);
        }

        // Önizleme: oy ver, rastgele cevapla
        void Otomatik()
        {
            if (!B.otomatik || !B.BenCanliyim || !B.Oynaniyor || B.AcilisSuruyor(out _) || B.Simdi < B.TurBasi || Hamlem != null) { _otoZaman = -1; return; }
            if (_otoZaman < 0) { _otoZaman = Time.time + 2f; return; }
            if (Time.time < _otoZaman) return;
            _otoZaman = Time.time + 3f;
            if (Faz == "vote") B.Gonder("act", new JObject { ["cat"] = Kategoriler[Random.Range(0, 8)].id });
            else if (Faz == "pick" && (string)B.G?["chooser"] == B.Ben) B.Gonder("act", new JObject { ["cat"] = Kategoriler.First(k => k.id != (string)B.G?["cat"]).id });
            else if (Faz == "q") Cevap(Random.Range(0, 4), false);
        }
    }
}
