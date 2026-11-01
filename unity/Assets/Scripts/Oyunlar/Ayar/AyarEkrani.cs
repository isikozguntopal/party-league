using System.Linq;
using Newtonsoft.Json.Linq;
using PartiLigi.UI;
using UnityEngine;
using UnityEngine.UI;

namespace PartiLigi.Oyunlar.Ayar
{
    /// <summary>
    /// 🎯 Ayar (kurallar: public/games/ayar.js). İki zıt kavram arasında gizli nokta (0-100). Tek tur: anlatıcı ipucu yazar,
    /// çift tur: diğerleri iğneyi sürükler. Açılışta hedef bantları (4/3/2/1 puan) ve herkesin tahmini görünür.
    /// </summary>
    public class AyarEkrani : OyunEkrani
    {
        static readonly (int lim, int pts)[] Bantlar = { (28, 1), (18, 2), (10, 3), (4, 4) };
        static readonly Color[] BantRenk = { new Color32(0x3E, 0x8E, 0xF5, 200), new Color32(0x2E, 0xB8, 0x72, 220), new Color32(0xF5, 0xA6, 0x23, 235), new Color32(0xF2, 0x4B, 0x7A, 255) };

        Text _sol, _sag, _bilgi;
        RectTransform _govde;
        string _anahtar, _gonderilen;
        float _tahmin = 50; RectTransform _igne; Text _igneYazi;
        InputField _ipucu, _solUc, _sagUc;
        float _oto = -1;

        public override string Baslik => "Ayar";

        public override void Kur()
        {
            var ic = Ui.Dikey(B.alan, "Icerik", 22, 60); Ui.Doldur(ic);
            OyunUi.UstSerit(ic, out _sol, out _sag, out _bilgi);
            _govde = Ui.Dikey(ic, "Govde", 20, 0); Ui.Yukseklik(_govde, 0); _govde.GetComponent<LayoutElement>().flexibleHeight = 1;
        }

        public override void Durum() { }
        JObject Hamlem => B.durum["myAction"] as JObject;
        string Faz => (string)B.G?["phase"];
        string Anlatici => (string)B.G?["giver"];

        public override void Kare()
        {
            var simdi = B.Simdi;
            bool acilis = B.AcilisSuruyor(out _) && (string)B.Son["phase"] == "guess";
            string g = acilis ? "acilis:" + B.Son["round"] : !B.Oynaniyor ? "bitti" : simdi < B.TurBasi ? "giris:" + B.Tur : Faz + ":" + B.Tur + ":" + (Hamlem != null);
            if (g != _anahtar) { _anahtar = g; Yenile(acilis, simdi); }
            _sol.text = $"Anlatıcı {(int?)B.G?["turn"] ?? 1}/{(int?)B.G?["turns"] ?? 1}";
            _sag.text = B.Oynaniyor && !acilis && simdi >= B.TurBasi ? OyunBaglami.Geri(B.SonSure - simdi) : "";
            _sol.transform.parent.gameObject.SetActive(B.Oynaniyor || acilis);
            Otomatik(acilis, simdi);
        }

        Text Yazi(string m, int boyut, float yuk, Color? renk = null, bool baslik = true)
        {
            var t = Ui.Yazi(_govde, m, boyut, renk ?? Ui.Beyaz, TextAnchor.MiddleCenter, baslik); Ui.Yukseklik(t, yuk); Ui.Golge(t, 3, 0.6f); return t;
        }

        // Gösterge: iki ucunda kavramlar, istenirse hedef bantları; iğneler yüzde konumla yerleşir
        RectTransform Gosterge(string sol, string sag, double? hedef)
        {
            var kap = Ui.Rect("Gosterge", _govde); Ui.Yukseklik(kap, 300);
            var bar = Ui.Rect("Bar", kap); bar.anchorMin = new Vector2(0, 0.35f); bar.anchorMax = new Vector2(1, 0.85f); bar.offsetMin = bar.offsetMax = Vector2.zero;
            Ui.Kart(bar.gameObject, new Color(0.2f, 0.15f, 0.48f, 0.92f), 1.4f);
            if (hedef != null)
                foreach (var (b, i) in Bantlar.Select((b, i) => (b, i)))
                {
                    var r = Ui.Rect("Bant", bar);
                    r.anchorMin = new Vector2(Mathf.Clamp01((float)(hedef.Value - b.lim) / 100f), 0.08f);
                    r.anchorMax = new Vector2(Mathf.Clamp01((float)(hedef.Value + b.lim) / 100f), 0.92f);
                    r.offsetMin = r.offsetMax = Vector2.zero;
                    r.gameObject.AddComponent<Image>().color = BantRenk[i];
                    if (b.pts == 4) { var t = Ui.Yazi(r, "4", 30, Ui.Beyaz, TextAnchor.MiddleCenter, true); Ui.Doldur(t.rectTransform); t.horizontalOverflow = HorizontalWrapMode.Overflow; }
                }
            var s = Ui.Yazi(kap, sol, 38, Ui.Beyaz, TextAnchor.UpperLeft, true); s.rectTransform.anchorMin = new Vector2(0, 0); s.rectTransform.anchorMax = new Vector2(0.5f, 0.32f); s.rectTransform.offsetMin = new Vector2(8, 0); s.rectTransform.offsetMax = Vector2.zero; Ui.Golge(s, 3);
            var d = Ui.Yazi(kap, sag, 38, Ui.Beyaz, TextAnchor.UpperRight, true); d.rectTransform.anchorMin = new Vector2(0.5f, 0); d.rectTransform.anchorMax = new Vector2(1, 0.32f); d.rectTransform.offsetMin = Vector2.zero; d.rectTransform.offsetMax = new Vector2(-8, 0); Ui.Golge(d, 3);
            return bar;
        }

        RectTransform Igne(RectTransform bar, float v, Color renk, string etiket)
        {
            var r = Ui.Rect("Igne", bar); r.anchorMin = r.anchorMax = new Vector2(v / 100f, 0.5f); r.pivot = new Vector2(0.5f, 0.5f); r.sizeDelta = new Vector2(16, 190);
            Ui.Kart(r.gameObject, renk, 20f).raycastTarget = false;
            if (!string.IsNullOrEmpty(etiket))
            {
                var t = Ui.Yazi(r, etiket, 28, Ui.Beyaz, TextAnchor.LowerCenter, true); t.rectTransform.anchorMin = new Vector2(0.5f, 1); t.rectTransform.anchorMax = new Vector2(0.5f, 1);
                t.rectTransform.pivot = new Vector2(0.5f, 0); t.rectTransform.sizeDelta = new Vector2(220, 40); t.horizontalOverflow = HorizontalWrapMode.Overflow; Ui.Golge(t, 2, 0.8f);
                _igneYazi = t;
            }
            return r;
        }

        void Yenile(bool acilis, double simdi)
        {
            foreach (Transform c in _govde) Object.Destroy(c.gameObject);
            _igne = null; _ipucu = _solUc = _sagUc = null;
            if (acilis) { AcilisCiz(); return; }
            if (!B.Oynaniyor) { _bilgi.text = ""; return; }
            var eksen = B.G?["axis"] as JArray;
            string sol = (string)eksen?[0], sag = (string)eksen?[1];
            if (simdi < B.TurBasi)
            {
                _bilgi.text = "Anlatıcı: " + B.Ad(Anlatici);
                OyunUi.Esnek(_govde);
                if (B.Tur == 1) { Yazi("Ayar", 120, 170); Yazi("Anlatıcı gizli noktaya tek ipucu yazar,\ndiğerleri iğneyi çevirir. Yakın olan puan alır!", 38, 160, null, false); }
                Yazi(sol + "  –  " + sag, 48, 90, new Color32(0xFF, 0xC8, 0x4A, 255));
                OyunUi.Esnek(_govde);
                return;
            }
            bool ben = Anlatici == B.Ben, gonderdim = Hamlem != null;
            if (Faz == "clue")
            {
                if (ben && !gonderdim)
                {
                    _bilgi.text = "Gizli noktayı ipucuyla anlat (uçları değiştirebilirsin)";
                    var bar = Gosterge("", "", (double?)B.G?["target"]);
                    var uclar = Ui.Yatay(_govde, "Uclar", 16); Ui.Yukseklik(uclar, 120);
                    _solUc = Ui.Girdi(uclar, sol, 22, 38); _solUc.text = sol;
                    _sagUc = Ui.Girdi(uclar, sag, 22, 38); _sagUc.text = sag;
                    _ipucu = Ui.Girdi(_govde, "İpucun (ör. ‘biraz soğuk’)", 60, 44);
                    var gonder = Ui.Dugme(_govde, "Gönder", "menu_pembe", 60);
                    gonder.onClick.AddListener(() => IpucuGonder(_ipucu.text, _solUc.text, _sagUc.text));
                }
                else
                {
                    _bilgi.text = ben ? "İpucun gönderildi" : B.Ad(Anlatici) + " ipucu yazıyor…";
                    OyunUi.Esnek(_govde);
                    Gosterge(sol, sag, ben ? (double?)B.G?["target"] : null);
                    Yazi(ben ? "Arkadaşların birazdan tahmin edecek" : "Bekle, ipucu geliyor…", 40, 80, Ui.Soluk, false);
                    OyunUi.Esnek(_govde);
                }
                return;
            }
            // tahmin
            Yazi("“" + (string)B.G?["clue"] + "”", 64, 150, new Color32(0xFF, 0xC8, 0x4A, 255));
            Yazi("— " + B.Ad(Anlatici), 34, 50, Ui.Soluk, false);
            var g = Gosterge(sol, sag, ben ? (double?)B.G?["target"] : null);
            if (ben)
            {
                _bilgi.text = "Arkadaşların tahmin ediyor";
                Yazi($"{((JArray)B.durum["ready"])?.Count ?? 0} kişi tahmin etti", 36, 70, Ui.Soluk, false);
            }
            else
            {
                if (gonderdim) _tahmin = (float?)Hamlem["v"] ?? _tahmin;
                _bilgi.text = gonderdim ? "Tahminin alındı, istersen değiştir" : "İğneyi sürükle, sonra onayla";
                _igne = Igne(g, _tahmin, Ui.Pembe, "");
                var alan = g.gameObject.AddComponent<SurukleAlan>();
                alan.degisti = p => { _tahmin = p.x * 100; _igne.anchorMin = _igne.anchorMax = new Vector2(p.x, 0.5f); };
                var onay = Ui.Dugme(_govde, gonderdim ? "Güncelle" : "Tahmin et", "menu_pembe", 60);
                onay.onClick.AddListener(() => B.Gonder("act", new JObject { ["v"] = System.Math.Round(_tahmin, 1) }));
            }
            OyunUi.Esnek(_govde);
        }

        void IpucuGonder(string ipucu, string sol, string sag)
        {
            if ((ipucu ?? "").Trim().Length < 2) { B.toast("İpucun çok kısa"); return; }
            B.Gonder("act", new JObject { ["clue"] = ipucu.Trim(), ["left"] = sol, ["right"] = sag });
        }

        void AcilisCiz()
        {
            var son = B.Son; var eksen = (JArray)son["axis"]; double hedef = (double)son["target"];
            _bilgi.text = "Gizli nokta açıldı!";
            Yazi("“" + (string)son["clue"] + "”", 56, 120, new Color32(0xFF, 0xC8, 0x4A, 255));
            var bar = Gosterge((string)eksen[0], (string)eksen[1], hedef);
            foreach (JObject r in (JArray)son["rows"])
                if (r["v"]?.Type != JTokenType.Null) Igne(bar, (float)r["v"], B.Renk((string)r["id"]), B.Ad((string)r["id"]));
            foreach (JObject r in ((JArray)son["rows"]).OrderByDescending(r => (int)r["pts"]))
                OyunUi.OyuncuSatiri(_govde, B, (string)r["id"], r["v"]?.Type == JTokenType.Null ? "tahmin yok" : "+" + (int)r["pts"], null, 84);
            OyunUi.OyuncuSatiri(_govde, B, (string)son["giver"], "anlatıcı +" + (int)son["giverPts"], new Color32(0xFF, 0xB8, 0x30, 200), 84);
            OyunUi.Esnek(_govde);
        }

        void Otomatik(bool acilis, double simdi)
        {
            if (!B.otomatik || acilis || !B.Oynaniyor || simdi < B.TurBasi || Hamlem != null || !B.BenCanliyim) { _oto = -1; return; }
            if (_oto < 0) { _oto = Time.time + 2f; return; }
            if (Time.time < _oto) return;
            _oto = Time.time + 3f;
            if (Faz == "clue" && Anlatici == B.Ben) IpucuGonder("biraz ortada", (string)B.G["axis"][0], (string)B.G["axis"][1]);
            else if (Faz == "guess" && Anlatici != B.Ben) B.Gonder("act", new JObject { ["v"] = Random.Range(10, 90) });
        }
    }
}
