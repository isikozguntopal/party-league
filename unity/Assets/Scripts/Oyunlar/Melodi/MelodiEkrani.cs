using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using Newtonsoft.Json.Linq;
using PartiLigi.UI;
using UnityEngine;
using UnityEngine.Networking;
using UnityEngine.UI;

namespace PartiLigi.Oyunlar.Melodi
{
    /// <summary>
    /// 🎧 Şarkıyı Tahmin Et (kurallar: public/games/melodi.js, takım oyunu). Her tur bir şarkı: ses önce 0,5 sn, yanlış
    /// tahmin / atla ile 1,5 → 5 → 10 → 20 sn uzar. Tahmin yalnızca listeden (Resources/Melodi/sarkilar.json = sunucu POOL sırası).
    /// Ses: iTunes lookup → 30 sn önizleme (m4a/AAC) → AudioClip; aşama süresi kadar çalınır.
    /// </summary>
    public class MelodiEkrani : OyunEkrani
    {
        static readonly CultureInfo Tr = new CultureInfo("tr-TR");
        static List<(long id, string ad, string sanatci, string url)> _havuz;

        Text _sol, _sag, _bilgi, _durumYazi, _calYazi;
        RectTransform _govde, _liste;
        InputField _ara; string _araMetin = "";
        string _anahtar;
        long _klipId = -1; bool _yukleniyor; string _sesHata;
        float _oto;
        MonoBehaviour _kosucu;

        public override string Baslik => "Şarkıyı Tahmin Et";

        static List<(long id, string ad, string sanatci, string url)> Havuz()
        {
            if (_havuz != null) return _havuz;
            _havuz = new List<(long id, string ad, string sanatci, string url)>();
            var j = JArray.Parse(Resources.Load<TextAsset>("Melodi/sarkilar").text);
            foreach (JArray s in j) _havuz.Add(((long)s[0], (string)s[1], (string)s[2], (string)s[3]));
            return _havuz;
        }

        public override void Kur()
        {
            _kosucu = Object.FindFirstObjectByType<UI.Uygulama>();
            var ic = Ui.Dikey(B.alan, "Icerik", 16, 50); Ui.Doldur(ic);
            OyunUi.UstSerit(ic, out _sol, out _sag, out _bilgi);
            _govde = Ui.Dikey(ic, "Govde", 14, 0); Ui.Yukseklik(_govde, 0); _govde.GetComponent<LayoutElement>().flexibleHeight = 1;
        }

        public override void Kapat() => MelodiSes.Dur();
        bool SesHazir => MelodiSes.Hazir == 1;
        public override void Durum() { }

        JObject Takimim()
        {
            int ben = (int?)B.G?["mine"] ?? -1;
            return (B.G?["teams"] as JArray)?.Cast<JObject>().FirstOrDefault(t => (int)t["id"] == ben);
        }
        int Asama => (int?)Takimim()?["stage"] ?? 0;
        bool Bitti => (bool?)Takimim()?["done"] == true;
        static readonly int[] Sureler = { 500, 1500, 5000, 10000, 20000 };
        static readonly int[] Puanlar = { 150, 120, 90, 60, 30 };

        public override void Kare()
        {
            var simdi = B.Simdi;
            bool acilis = B.AcilisSuruyor(out _);
            long tid = (long?)B.G?["tid"] ?? -1;
            if (!acilis && B.Oynaniyor && tid > 0 && tid != _klipId && !_yukleniyor) _kosucu.StartCoroutine(SesYukle(tid, (string)B.G?["url"]));
            string g = acilis ? "acilis:" + B.Son["n"] : !B.Oynaniyor ? "bitti" : simdi < B.TurBasi ? "giris:" + B.Tur
                : $"oyun:{B.Tur}:{Asama}:{Bitti}:{(B.G?["wrong"] as JArray)?.Count}:{SesHazir}:{_sesHata}";
            if (g != _anahtar) { _anahtar = g; Yenile(acilis, simdi); }
            _sol.text = $"Şarkı {(acilis ? (int?)B.Son["n"] : (int?)B.G?["n"]) ?? 1}/{(int?)B.G?["total"] ?? 5}";
            _sag.text = B.Oynaniyor && !acilis && simdi >= B.TurBasi ? OyunBaglami.Geri(B.SonSure - simdi) : "";
            _sol.transform.parent.gameObject.SetActive(B.Oynaniyor || acilis);
            if (_yukleniyor == false && _sesHata == null && MelodiSes.Hazir == -1 && _klipId > 0) _sesHata = MelodiSes.Var ? "Ses çalınamadı" : "Ses yalnızca telefonda çalar";
            if (_calYazi != null) _calYazi.text = MelodiSes.Caliyor ? "Çalıyor…" : !SesHazir ? (_sesHata ?? "Ses yükleniyor…") : $"Çal  ({OyunBaglami.Saniye(Sureler[Mathf.Min(Asama, 4)], "0.#")} sn)";
            Otomatik(simdi);
        }

        IEnumerator SesYukle(long tid, string yedekUrl)
        {
            _yukleniyor = true; _sesHata = null; _klipId = tid;
            string url = null;
            using (var r = UnityWebRequest.Get($"https://itunes.apple.com/lookup?id={tid}&country=tr"))
            {
                r.timeout = 8; yield return r.SendWebRequest();
                if (r.result == UnityWebRequest.Result.Success)
                    try { url = (string)JObject.Parse(r.downloadHandler.text)["results"]?[0]?["previewUrl"]; } catch { }
            }
            if (string.IsNullOrEmpty(url)) url = string.IsNullOrEmpty(yedekUrl) ? Havuz().FirstOrDefault(s => s.id == tid).url : yedekUrl;
            if (string.IsNullOrEmpty(url)) { _sesHata = "Ses bulunamadı"; _yukleniyor = false; yield break; }
            MelodiSes.Yukle(url);                                     // iPhone'un oynatıcısı indirir ve hazırlar
            _yukleniyor = false;
        }

        void Cal() { if (SesHazir) MelodiSes.Cal(Sureler[Mathf.Min(Asama, 4)] / 1000f); }

        Text Yazi(string m, int boyut, float yuk, Color? renk = null, bool baslik = true)
        {
            var t = Ui.Yazi(_govde, m, boyut, renk ?? Ui.Beyaz, TextAnchor.MiddleCenter, baslik); Ui.Yukseklik(t, yuk); Ui.Golge(t, 3, 0.6f); return t;
        }

        void Yenile(bool acilis, double simdi)
        {
            foreach (Transform c in _govde) Object.Destroy(c.gameObject);
            _ara = null; _liste = null; _calYazi = null; _durumYazi = null;
            if (acilis) { AcilisCiz(); return; }
            if (!B.Oynaniyor) { _bilgi.text = ""; return; }
            if (simdi < B.TurBasi)
            {
                _bilgi.text = "Takımınla şarkıyı bil!";
                OyunUi.Esnek(_govde);
                if (B.Tur == 1) { Yazi("Şarkıyı\nTahmin Et", 100, 260); Yazi("Ses önce yarım saniye çalar; yanlış tahmin\nya da Atla ile uzar. Erken bilen çok puan alır!", 36, 160, null, false); }
                else Yazi("Sıradaki şarkı…", 70, 120);
                OyunUi.Esnek(_govde);
                return;
            }
            var tk = Takimim();
            if (tk == null) { _bilgi.text = "İzliyorsun"; return; }
            // aşama göstergesi
            var asama = Ui.Yatay(_govde, "Asama", 10); Ui.Yukseklik(asama, 90);
            for (int i = 0; i < 5; i++)
            {
                Color renk = i < Asama ? (Color)new Color32(0x80, 0x30, 0x40, 230) : i == Asama && !Bitti ? Ui.Pembe : new Color(1, 1, 1, 0.12f);
                var s = OyunUi.Secenek(asama, OyunBaglami.Saniye(Sureler[i], "0.#") + " sn", renk, 90, 30); s.d.interactable = false; s.zemin.color = renk;
            }
            if (Bitti)
            {
                int cozdu = (int?)tk["solved"] ?? -1;
                _bilgi.text = cozdu >= 0 ? "Bildiniz!" : "Bu şarkıyı bilemediniz";
                OyunUi.Esnek(_govde);
                Yazi(cozdu >= 0 ? $"Bildiniz! +{Puanlar[cozdu]}" : "Haklarınız bitti", 80, 140, cozdu >= 0 ? new Color32(0x6C, 0xF0, 0x9A, 255) : new Color32(0xFF, 0x8A, 0x9A, 255));
                Yazi("Diğer takımlar bekleniyor…", 40, 80, Ui.Soluk, false);
                OyunUi.Esnek(_govde);
                return;
            }
            _bilgi.text = $"Bilirsen +{Puanlar[Mathf.Min(Asama, 4)]} puan · takımın aynı hakkı paylaşır";
            var cal = OyunUi.Secenek(_govde, "", new Color32(0x3E, 0x8E, 0xF5, 255), 150, 52); _calYazi = cal.yazi;
            cal.d.onClick.AddListener(Cal);
            // yanlış tahminler
            var yanlis = (B.G?["wrong"] as JArray)?.Cast<JObject>().Select(w => (int)w["i"] < 0 ? $"{B.Ad((string)w["by"])}: atladı" : $"{B.Ad((string)w["by"])}: {Havuz()[(int)w["i"]].ad} ✗").ToList();
            if (yanlis != null && yanlis.Count > 0) Yazi(string.Join("\n", yanlis), 30, 30 + 40 * yanlis.Count, new Color32(0xFF, 0x8A, 0x9A, 255), true);
            // arama + liste
            var satir = Ui.Yatay(_govde, "Ara", 14); Ui.Yukseklik(satir, 130);
            _ara = Ui.Girdi(satir, "Şarkı ya da sanatçı ara", 40, 40); _ara.GetComponent<LayoutElement>().flexibleWidth = 3;
            _ara.text = _araMetin; _ara.onValueChanged.AddListener(v => { _araMetin = v; ListeCiz(); });
            var atla = OyunUi.Secenek(satir, "Atla", new Color(1, 1, 1, 0.16f), 130, 40); atla.d.GetComponent<LayoutElement>().flexibleWidth = 1;
            atla.d.onClick.AddListener(() => B.Gonder("gact", new JObject { ["t"] = "skip" }));
            _liste = Ui.Dikey(_govde, "Liste", 10, 0); Ui.Yukseklik(_liste, 0); _liste.GetComponent<LayoutElement>().flexibleHeight = 1;
            ListeCiz();
        }

        static string Sade(string s) => (s ?? "").ToLower(Tr).Replace('ç', 'c').Replace('ğ', 'g').Replace('ı', 'i').Replace('ö', 'o').Replace('ş', 's').Replace('ü', 'u');

        void ListeCiz()
        {
            if (_liste == null) return;
            foreach (Transform c in _liste) Object.Destroy(c.gameObject);
            var q = Sade(_araMetin).Trim();
            if (q.Length < 2) { var t = Ui.Yazi(_liste, "En az 2 harf yaz", 32, Ui.Soluk); Ui.Yukseklik(t, 60); return; }
            var yanlis = new HashSet<int>((B.G?["wrong"] as JArray)?.Cast<JObject>().Select(w => (int)w["i"]) ?? new int[0]);
            var h = Havuz();
            var bulunan = Enumerable.Range(0, h.Count).Where(i => !yanlis.Contains(i) && (Sade(h[i].ad).Contains(q) || Sade(h[i].sanatci).Contains(q))).Take(6);
            foreach (var i in bulunan)
            {
                int ii = i;
                var s = OyunUi.Secenek(_liste, $"{h[i].ad}  <size=26>· {h[i].sanatci}</size>", new Color(1, 1, 1, 0.12f), 100, 36);
                s.yazi.supportRichText = true; s.yazi.alignment = TextAnchor.MiddleLeft;
                s.d.onClick.AddListener(() => { _araMetin = ""; B.Gonder("gact", new JObject { ["t"] = "guess", ["i"] = ii }); });
            }
        }

        void AcilisCiz()
        {
            var son = B.Son; var sarki = (JObject)son["song"];
            _bilgi.text = "Şarkı buydu";
            OyunUi.Esnek(_govde);
            Yazi((string)sarki["t"], 80, 130, new Color32(0xFF, 0xC8, 0x4A, 255));
            Yazi((string)sarki["a"], 44, 70, Ui.Soluk, false);
            foreach (JObject r in (JArray)son["rows"])
            {
                var adlar = string.Join(" & ", ((JArray)r["members"]).Select(m => B.Ad((string)m)));
                int cozdu = (int)r["solved"];
                var satir = Ui.Rect("Satir", _govde); Ui.Yukseklik(satir, 90);
                Ui.Kart(satir.gameObject, cozdu >= 0 ? (Color)new Color32(0x2E, 0xB8, 0x72, 200) : new Color(1, 1, 1, 0.1f), 2.3f);
                var t = Ui.Yazi(satir, $"{adlar}   " + (cozdu >= 0 ? $"{OyunBaglami.Saniye(Sureler[cozdu], "0.#")} sn'de bildi · +{(int)r["pts"]}" : "bilemedi"), 36, Ui.Beyaz, TextAnchor.MiddleLeft, true);
                Ui.Doldur(t.rectTransform, 30, 0, 20, 0);
            }
            OyunUi.Esnek(_govde);
            // açılışta şarkıdan biraz dinlet
            if (SesHazir && !MelodiSes.Caliyor) MelodiSes.Cal(6f);
        }

        // Önizleme: bir kez çal, sonra yanlış tahmin, sonra doğrusu (havuzdaki tid'den)
        void Otomatik(double simdi)
        {
            if (!B.otomatik || !B.Oynaniyor || simdi < B.TurBasi || B.AcilisSuruyor(out _) || Bitti || Takimim() == null || Time.time < _oto) return;
            _oto = Time.time + 2.5f;
            if (SesHazir && !MelodiSes.Caliyor && Asama == 0) Cal();
            long tid = (long?)B.G?["tid"] ?? -1;
            int dogru = Havuz().FindIndex(s => s.id == tid);
            B.Gonder("gact", Asama < 1 ? new JObject { ["t"] = "skip" } : new JObject { ["t"] = "guess", ["i"] = dogru });
        }
    }
}
