using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json.Linq;
using PartiLigi.UI;
using UnityEngine;
using UnityEngine.UI;

namespace PartiLigi.Oyunlar.Tanir
{
    /// <summary>
    /// 🧩 Ne Kadar Tanıyorsun? (kurallar: public/games/tanir.js, takım oyunu). Tur 1: herkes kendisi hakkında 5 soru (profil).
    /// Sonra her takım için: "team" turu (takım arkadaşlarının cevaplarını tahmin et) + "review" turu (birlikte incele, oda sahibi Sonraki der).
    /// Sorular tek tek sorulur; skor oyun sonunda açıklanır.
    /// </summary>
    public class TanirEkrani : OyunEkrani
    {
        Text _sol, _sag, _bilgi;
        RectTransform _govde;
        string _anahtar;
        int _adim;                                        // profil: soru sırası; takım: (arkadaş × soru) sırası
        readonly List<int> _cevaplar = new List<int>();
        readonly Dictionary<string, int[]> _tahmin = new Dictionary<string, int[]>();
        int _gonderilen = -1;
        float _oto = -1;

        public override string Baslik => "Ne Kadar Tanıyorsun?";

        public override void Kur()
        {
            var ic = Ui.Dikey(B.alan, "Icerik", 20, 60); Ui.Doldur(ic);
            OyunUi.UstSerit(ic, out _sol, out _sag, out _bilgi);
            _govde = Ui.Dikey(ic, "Govde", 16, 0); Ui.Yukseklik(_govde, 0); _govde.GetComponent<LayoutElement>().flexibleHeight = 1;
        }

        public override void Durum() { }
        string Faz => (string)B.G?["phase"];
        JArray Sorular => B.G?["qs"] as JArray;
        List<string> Arkadaslar => ((JArray)B.G?["mates"])?.Select(t => (string)t).ToList() ?? new List<string>();
        bool Gonderdim => _gonderilen == B.Tur || B.durum["myAction"] is JObject;

        public override void Kare()
        {
            var simdi = B.Simdi;
            string g = !B.Oynaniyor ? "bitti" : simdi < B.TurBasi ? "giris:" + B.Tur : Faz + ":" + B.Tur + ":" + _adim + ":" + Gonderdim + ":" + B.G?["mine"];
            if (g != _anahtar) { _anahtar = g; Yenile(simdi); }
            _sol.text = Faz == "profile" ? "Seni tanıyalım" : $"Takım {((int?)B.G?["teamIdx"] ?? 0) + 1}/{(int?)B.G?["teamCount"] ?? 1}";
            _sag.text = B.Oynaniyor && simdi >= B.TurBasi && Faz != "review" ? OyunBaglami.Geri(B.SonSure - simdi) : "";
            _sol.transform.parent.gameObject.SetActive(B.Oynaniyor);
            Otomatik(simdi);
        }

        Text Yazi(string m, int boyut, float yuk, Color? renk = null, bool baslik = true, TextAnchor hiza = TextAnchor.MiddleCenter)
        {
            var t = Ui.Yazi(_govde, m, boyut, renk ?? Ui.Beyaz, hiza, baslik); Ui.Yukseklik(t, yuk); Ui.Golge(t, 3, 0.6f); return t;
        }

        void Yenile(double simdi)
        {
            foreach (Transform c in _govde) Object.Destroy(c.gameObject);
            if (!B.Oynaniyor) { _bilgi.text = ""; return; }
            if (simdi < B.TurBasi)
            {
                _bilgi.text = "Takım arkadaşını ne kadar tanıyorsun?";
                OyunUi.Esnek(_govde);
                Yazi("Ne Kadar\nTanıyorsun?", 96, 260);
                Yazi("Önce kendin hakkında 5 soruyu cevapla.\nSonra arkadaşlarının cevaplarını tahmin et!", 38, 160, null, false);
                OyunUi.Esnek(_govde);
                return;
            }
            switch (Faz)
            {
                case "profile": ProfilCiz(); break;
                case "team": TakimCiz(); break;
                case "review": _incelemeBekle = Time.time + 6f; IncelemeCiz(); break;
            }
        }

        // Tek soru + 4 şık; seçince sıradakine geçer
        void SoruSor(string ust, string soru, JArray secenek, System.Action<int> secildi, int? onceki)
        {
            Yazi(ust, 36, 56, new Color32(0xFF, 0xC8, 0x4A, 255), true);
            var kart = Ui.Rect("Soru", _govde); Ui.Yukseklik(kart, 240);
            Ui.Kart(kart.gameObject, new Color(0.2f, 0.15f, 0.48f, 0.92f), 0.9f);
            var t = Ui.Yazi(kart, soru, 48, Ui.Beyaz, TextAnchor.MiddleCenter, true); Ui.Doldur(t.rectTransform, 40, 20, 40, 20);
            t.resizeTextForBestFit = true; t.resizeTextMaxSize = 48; t.resizeTextMinSize = 26; Ui.Golge(t, 3, 0.5f);
            for (int k = 0; k < secenek.Count; k++)
            {
                int kk = k; var renk = OyunUi.SikRenk[k % 4]; if (onceki != null && onceki != k) renk.a = 0.45f;
                var s = OyunUi.Secenek(_govde, (string)secenek[k], renk, 140, 42);
                s.d.onClick.AddListener(() => secildi(kk));
            }
            if (_adim > 0)
            {
                var geri = Ui.Dugme(_govde, "‹ Önceki", "menu_gri", 40); Ui.Yukseklik(geri, 120);
                geri.onClick.AddListener(() => _adim--);
            }
        }

        void ProfilCiz()
        {
            var qs = Sorular; int n = qs.Count;
            if (Gonderdim) { _bilgi.text = "Cevapların alındı"; Bekle("Herkes kendini anlatıyor…"); return; }
            if (!B.BenCanliyim) { _bilgi.text = "İzliyorsun"; Bekle("Oyuncular kendini anlatıyor…"); return; }
            _bilgi.text = "Kendin için dürüstçe cevapla";
            while (_cevaplar.Count < n) _cevaplar.Add(-1);
            var q = (JObject)qs[_adim];
            SoruSor($"Soru {_adim + 1}/{n}", (string)q["q"], (JArray)q["o"], k =>
            {
                _cevaplar[_adim] = k;
                if (_adim < n - 1) { _adim++; return; }
                _gonderilen = B.Tur; _adim = 0;
                B.Gonder("act", new JObject { ["a"] = new JArray(_cevaplar) });
            }, _cevaplar[_adim] >= 0 ? _cevaplar[_adim] : (int?)null);
            OyunUi.Esnek(_govde);
        }

        void TakimCiz()
        {
            var takim = ((JArray)B.G?["team"])?.Select(t => (string)t).ToList() ?? new List<string>();
            if ((bool?)B.G?["mine"] != true)
            {
                _bilgi.text = "Sıra başka takımda";
                Bekle(string.Join(" & ", takim.Select(B.Ad)) + "\nbirbirini tahmin ediyor…");
                return;
            }
            if (Gonderdim) { _bilgi.text = "Tahminlerin alındı"; Bekle("Takım arkadaşın bekleniyor…"); return; }
            var arkadas = Arkadaslar; var qs = Sorular; int n = qs.Count;
            foreach (var m in arkadas) if (!_tahmin.ContainsKey(m)) _tahmin[m] = Enumerable.Repeat(-1, n).ToArray();
            int ai = _adim / n, qi = _adim % n; var kim = arkadas[ai];
            _bilgi.text = $"{B.Ad(kim)} bu soruya ne cevap verdi?";
            var q = (JObject)qs[qi];
            SoruSor($"{B.Ad(kim)} · {qi + 1}/{n}", (string)q["q"], (JArray)q["o"], k =>
            {
                _tahmin[kim][qi] = k;
                if (_adim < arkadas.Count * n - 1) { _adim++; return; }
                _gonderilen = B.Tur; _adim = 0;
                var g = new JObject(); foreach (var m in arkadas) g[m] = new JArray(_tahmin[m]);
                B.Gonder("act", new JObject { ["g"] = g });
                _tahmin.Clear();
            }, _tahmin[kim][qi] >= 0 ? _tahmin[kim][qi] : (int?)null);
            OyunUi.Esnek(_govde);
        }

        void Bekle(string m)
        {
            OyunUi.Esnek(_govde);
            Yazi(m, 46, 200, Ui.Soluk, false);
            OyunUi.Esnek(_govde);
        }

        // İnceleme: her soru için gerçek cevaplar ve tahminler (✓ / ✗), oda sahibi devam ettirir
        void IncelemeCiz()
        {
            var r = B.G?["review"] as JObject; if (r == null) return;
            var takim = ((JArray)r["team"]).Select(t => (string)t).ToList();
            int dogru = ((JObject)r["correct"]).Properties().Sum(p => (int)p.Value), sorulan = (int?)r["asked"] ?? 0;
            _bilgi.text = $"{string.Join(" & ", takim.Select(B.Ad))}: {dogru}/{sorulan * takim.Count} doğru tahmin";
            foreach (JObject satir in (JArray)r["rows"])
            {
                var o = (JArray)satir["o"]; var gercek = (JObject)satir["truth"]; var tahminler = (JObject)satir["guesses"];
                var metin = $"<b>{(string)satir["q"]}</b>";
                foreach (var hedef in takim)
                {
                    var g = gercek[hedef]?.Type == JTokenType.Integer ? (string)o[(int)gercek[hedef]] : "—";
                    var parca = new List<string>();
                    foreach (var tahminci in takim.Where(x => x != hedef))
                    {
                        var v = tahminler[tahminci]?[hedef];
                        bool ok = v?.Type == JTokenType.Integer && gercek[hedef]?.Type == JTokenType.Integer && (int)v == (int)gercek[hedef];
                        parca.Add($"{B.Ad(tahminci)}: {(v?.Type == JTokenType.Integer ? (string)o[(int)v] : "—")} {(ok ? "<color=#6CF09A>✓</color>" : "<color=#FF8A9A>✗</color>")}");
                    }
                    metin += $"\n{B.Ad(hedef)}: <color=#FFC84A>{g}</color>   ({string.Join(", ", parca)})";
                }
                var kart = Ui.Rect("Satir", _govde); Ui.Yukseklik(kart, 60 + 46 * takim.Count);
                Ui.Kart(kart.gameObject, new Color(1, 1, 1, 0.1f), 1.6f);
                var t = Ui.Yazi(kart, metin, 30, Ui.Beyaz, TextAnchor.MiddleLeft, true); Ui.Doldur(t.rectTransform, 26, 8, 20, 8); t.supportRichText = true; // ✓ ✗ DynaPuff'ta var
                t.resizeTextForBestFit = true; t.resizeTextMaxSize = 30; t.resizeTextMinSize = 18;
            }
            OyunUi.Esnek(_govde);
            if (B.BenHost)
            {
                var d = Ui.Dugme(_govde, (bool?)B.G?["isLast"] == true ? "Sonuçları göster" : "Sonraki takım", "menu_pembe", 56);
                d.onClick.AddListener(() => B.Gonder("gact", new JObject { ["t"] = "next" }));
            }
            else Yazi("Oda sahibi devam ettirecek", 34, 60, Ui.Soluk, false);
        }

        void Otomatik(double simdi)
        {
            if (!B.otomatik || !B.Oynaniyor || simdi < B.TurBasi) { _oto = -1; return; }
            if (_oto < 0) { _oto = Time.time + 1.2f; return; }
            if (Time.time < _oto) return;
            _oto = Time.time + 1.2f;
            var qs = Sorular; if (qs == null) return;
            if (Faz == "profile" && !Gonderdim && B.BenCanliyim)
            {
                _gonderilen = B.Tur;
                B.Gonder("act", new JObject { ["a"] = new JArray(Enumerable.Range(0, qs.Count).Select(_ => Random.Range(0, 4))) });
            }
            else if (Faz == "team" && (bool?)B.G?["mine"] == true && !Gonderdim)
            {
                _gonderilen = B.Tur;
                var g = new JObject(); foreach (var m in Arkadaslar) g[m] = new JArray(Enumerable.Range(0, qs.Count).Select(_ => Random.Range(0, 4)));
                B.Gonder("act", new JObject { ["g"] = g });
            }
            else if (Faz == "review" && B.BenHost && Time.time > _incelemeBekle) { _incelemeBekle = Time.time + 6f; B.Gonder("gact", new JObject { ["t"] = "next" }); }
        }
        float _incelemeBekle;
    }
}
