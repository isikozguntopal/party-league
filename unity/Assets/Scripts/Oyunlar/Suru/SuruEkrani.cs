using System.Linq;
using Newtonsoft.Json.Linq;
using PartiLigi.UI;
using UnityEngine;
using UnityEngine.UI;

namespace PartiLigi.Oyunlar.Suru
{
    /// <summary>
    /// 🐑 Sürü (kurallar: public/games/suru.js). Herkes aynı soruya gizlice bir şık seçer; seçtiğin şıkkı başka kaç kişi seçtiyse
    /// o kadar puan, en kalabalık şıktaysan +3. Tek başına kalan kara koyun olur (0 puan). 6 tur.
    /// </summary>
    public class SuruEkrani : OyunEkrani
    {
        static readonly string[] Harf = { "A", "B", "C", "D" };
        Text _sol, _sag, _bilgi;
        RectTransform _govde;
        string _anahtar, _gonderilen;
        float _oto = -1;

        public override string Baslik => "Sürü";

        public override void Kur()
        {
            var ic = Ui.Dikey(B.alan, "Icerik", 22, 60); Ui.Doldur(ic);
            OyunUi.UstSerit(ic, out _sol, out _sag, out _bilgi);
            _govde = Ui.Dikey(ic, "Govde", 18, 0); Ui.Yukseklik(_govde, 0); _govde.GetComponent<LayoutElement>().flexibleHeight = 1;
        }

        public override void Durum() { }
        JObject Hamlem => B.durum["myAction"] as JObject;

        public override void Kare()
        {
            var simdi = B.Simdi;
            bool acilis = B.AcilisSuruyor(out _);
            string g = acilis ? "acilis:" + B.Son["round"] : !B.Oynaniyor ? "bitti" : simdi < B.TurBasi ? "giris:" + B.Tur : "soru:" + B.Tur + ":" + Hamlem?["o"];
            if (g != _anahtar) { _anahtar = g; Yenile(acilis, simdi); }
            int tur = acilis ? (int)B.Son["round"] : B.Tur;
            _sol.text = $"Tur {tur}/{(int?)B.G?["rounds"] ?? 6}";
            _sag.text = B.Oynaniyor && !acilis && simdi >= B.TurBasi ? OyunBaglami.Geri(B.SonSure - simdi) : "";
            _sol.transform.parent.gameObject.SetActive(B.Oynaniyor || acilis);
            Otomatik(acilis, simdi);
        }

        Text Yazi(string m, int boyut, float yuk, Color? renk = null, bool baslik = true)
        {
            var t = Ui.Yazi(_govde, m, boyut, renk ?? Ui.Beyaz, TextAnchor.MiddleCenter, baslik); Ui.Yukseklik(t, yuk); Ui.Golge(t, 3, 0.6f); return t;
        }

        void SoruKarti(string metin)
        {
            var kart = Ui.Rect("Soru", _govde); Ui.Yukseklik(kart, 260);
            Ui.Kart(kart.gameObject, new Color(0.2f, 0.15f, 0.48f, 0.92f), 0.8f);
            var t = Ui.Yazi(kart, metin, 50, Ui.Beyaz, TextAnchor.MiddleCenter, true); Ui.Doldur(t.rectTransform, 40, 20, 40, 20);
            t.resizeTextForBestFit = true; t.resizeTextMaxSize = 50; t.resizeTextMinSize = 26; Ui.Golge(t, 3, 0.5f);
        }

        void Yenile(bool acilis, double simdi)
        {
            foreach (Transform c in _govde) Object.Destroy(c.gameObject);
            if (acilis) { AcilisCiz(); return; }
            if (!B.Oynaniyor) { _bilgi.text = ""; return; }
            if (simdi < B.TurBasi)
            {
                _bilgi.text = "Kalabalıkla aynı şeyi seç!";
                OyunUi.Esnek(_govde);
                if (B.Tur == 1) { Yazi("Sürü", 120, 170); Yazi("Seçtiğin şıkkı başka kaç kişi seçtiyse o kadar puan.\nEn kalabalık şıktaysan +3. Tek kalan kara koyun olur!", 38, 200, null, false); }
                else Yazi("Sıradaki soru…", 80, 130);
                OyunUi.Esnek(_govde);
                return;
            }
            var hamle = Hamlem; int? benim = (int?)hamle?["o"];
            _bilgi.text = !B.BenCanliyim ? "İzliyorsun" : benim != null ? "Seçimin alındı, istersen değiştir" : "Sence çoğunluk hangisini seçer?";
            SoruKarti((string)B.G["q"]);
            var sec = (JArray)B.G["opts"];
            for (int k = 0; k < sec.Count; k++)
            {
                int kk = k; var renk = OyunUi.SikRenk[k % 4]; if (benim != null && benim != k) renk.a = 0.4f;
                var s = OyunUi.Secenek(_govde, Harf[k] + ")  " + (string)sec[k], renk, 150, 42);
                s.yazi.alignment = TextAnchor.MiddleLeft;
                s.d.interactable = B.BenCanliyim;
                s.d.onClick.AddListener(() => B.Gonder("act", new JObject { ["o"] = kk }));
            }
            OyunUi.Esnek(_govde);
            if (benim != null) Yazi($"{((JArray)B.durum["ready"])?.Count ?? 0}/{B.CanlilarSirali().Count()} kişi seçti", 34, 60, Ui.Soluk, false);
        }

        void AcilisCiz()
        {
            var son = B.Son;
            var gruplar = (JArray)son["groups"]; var surü = ((JArray)son["herd"]).Select(t => (int)t).ToList();
            var kara = ((JArray)son["black"]).Select(t => (string)t).ToList();
            var kazanc = (JObject)son["gains"];
            _bilgi.text = kara.Count > 0 ? "Kara koyun: " + string.Join(", ", kara.Select(B.Ad)) : "Kara koyun yok!";
            SoruKarti((string)son["q"]);
            var sec = (JArray)son["opts"];
            for (int k = 0; k < sec.Count; k++)
            {
                var kimler = ((JArray)gruplar[k]).Select(t => (string)t).ToList();
                bool suru = surü.Contains(k);
                var renk = suru ? new Color32(0xFF, 0xB8, 0x30, 235) : kimler.Count == 1 ? new Color32(0x30, 0x2A, 0x3C, 235) : new Color32(0x50, 0x48, 0x78, 210);
                var adlar = kimler.Count > 0 ? "\n<size=28>" + string.Join(", ", kimler.Select(B.Ad)) + "</size>" : "";
                var s = OyunUi.Secenek(_govde, $"{Harf[k]})  {(string)sec[k]}  ({kimler.Count}){adlar}", renk, 140, 38);
                s.yazi.alignment = TextAnchor.MiddleLeft; s.yazi.supportRichText = true; s.d.interactable = false; s.zemin.color = renk;
            }
            int benim = (int?)kazanc[B.Ben] ?? 0;
            if (kazanc[B.Ben] != null)
                Yazi(kara.Contains(B.Ben) ? "Kara koyun oldun: 0 puan" : benim > 0 ? "+" + benim + " puan" : "Seçim yapmadın", 54, 80,
                    benim > 0 ? new Color32(0x6C, 0xF0, 0x9A, 255) : new Color32(0xFF, 0x8A, 0x9A, 255));
            var puan = ((JObject)son["score"]).Properties().OrderByDescending(p => (int)p.Value).Take(3);
            Yazi(string.Join("   ", puan.Select((p, i) => $"{i + 1}. {B.Ad(p.Name)} {(int)p.Value}")), 32, 60, Ui.Soluk, false);
            OyunUi.Esnek(_govde);
        }

        void Otomatik(bool acilis, double simdi)
        {
            if (!B.otomatik || acilis || !B.Oynaniyor || simdi < B.TurBasi || Hamlem != null || !B.BenCanliyim) { _oto = -1; return; }
            if (_oto < 0) { _oto = Time.time + 2f; return; }
            if (Time.time < _oto) return;
            _oto = Time.time + 3f;
            B.Gonder("act", new JObject { ["o"] = Random.Range(0, 4) });
        }
    }
}
