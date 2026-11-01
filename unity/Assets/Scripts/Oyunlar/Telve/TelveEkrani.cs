using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json.Linq;
using PartiLigi.UI;
using UnityEngine;
using UnityEngine.UI;

namespace PartiLigi.Oyunlar.Telve
{
    /// <summary>
    /// ☕ Telve (kurallar: public/games/telve.js). Her hikâye 3 tur: Falcı kart + yorum seçer (tell), diğerleri yoruma uyan
    /// kartını atar (pick), herkes Falcı'nın kartını bulmaya çalışır (vote). Kart resimleri Resources/Telve/NNN.jpg.
    /// </summary>
    public class TelveEkrani : OyunEkrani
    {
        Text _sol, _sag, _bilgi;
        RectTransform _govde;
        string _anahtar;
        int _secili = -1;
        InputField _yorum; string _yorumMetin = "";   // kart seçince ekran yenilenir; yazılan yorum korunur
        float _oto = -1;
        static readonly Dictionary<int, Texture2D> Doku = new Dictionary<int, Texture2D>();

        public override string Baslik => "Telve";

        public override void Kur()
        {
            var ic = Ui.Dikey(B.alan, "Icerik", 20, 50); Ui.Doldur(ic);
            OyunUi.UstSerit(ic, out _sol, out _sag, out _bilgi);
            _govde = Ui.Dikey(ic, "Govde", 16, 0); Ui.Yukseklik(_govde, 0); _govde.GetComponent<LayoutElement>().flexibleHeight = 1;
        }

        public override void Durum() { }
        JObject Hamlem => B.durum["myAction"] as JObject;
        string Faz => (string)B.G?["phase"];
        string Falci => (string)B.G?["teller"];

        public override void Kare()
        {
            var simdi = B.Simdi;
            bool acilis = B.AcilisSuruyor(out _) && (string)B.Son["phase"] == "vote";
            string g = acilis ? "acilis:" + B.Son["round"] : !B.Oynaniyor ? "bitti" : simdi < B.TurBasi ? "giris:" + B.Tur : Faz + ":" + B.Tur + ":" + (Hamlem != null) + ":" + _secili;
            if (g != _anahtar) { _anahtar = g; Yenile(acilis, simdi); }
            _sol.text = $"Fal {(int?)B.G?["turn"] ?? 1}/{(int?)B.G?["turns"] ?? 1}";
            _sag.text = B.Oynaniyor && !acilis && simdi >= B.TurBasi ? OyunBaglami.Geri(B.SonSure - simdi) : "";
            _sol.transform.parent.gameObject.SetActive(B.Oynaniyor || acilis);
            Otomatik(acilis, simdi);
        }

        Text Yazi(string m, int boyut, float yuk, Color? renk = null, bool baslik = true)
        {
            var t = Ui.Yazi(_govde, m, boyut, renk ?? Ui.Beyaz, TextAnchor.MiddleCenter, baslik); Ui.Yukseklik(t, yuk); Ui.Golge(t, 3, 0.6f); return t;
        }

        static Texture2D Resim(int kart)
        {
            if (!Doku.TryGetValue(kart, out var t)) Doku[kart] = t = Resources.Load<Texture2D>("Telve/" + (kart + 1).ToString("000"));
            return t;
        }

        // Kart: resim + çerçeve (seçiliyse sarı) + altta isteğe bağlı yazı
        Button Kart(Transform ebeveyn, int kart, bool secili, string alt = null, Color? cerceve = null)
        {
            var rt = Ui.Rect("Kart" + kart, ebeveyn);
            var cer = Ui.Kart(rt.gameObject, cerceve ?? (secili ? new Color32(0xFF, 0xC8, 0x4A, 255) : new Color(1, 1, 1, 0.15f)), 3f);
            var b = rt.gameObject.AddComponent<Button>(); b.targetGraphic = cer;
            var ri = Ui.Rect("Resim", rt); Ui.Doldur(ri, 10, alt != null ? 52 : 10, 10, 10);
            var raw = ri.gameObject.AddComponent<RawImage>(); raw.texture = Resim(kart); raw.raycastTarget = false;
            if (alt != null) { var t = Ui.Yazi(rt, alt, 26, Ui.Beyaz, TextAnchor.MiddleCenter, true); t.rectTransform.anchorMin = Vector2.zero; t.rectTransform.anchorMax = new Vector2(1, 0); t.rectTransform.pivot = new Vector2(0.5f, 0); t.rectTransform.sizeDelta = new Vector2(-12, 48); t.supportRichText = true; Ui.Golge(t, 2); }
            return b;
        }

        RectTransform Izgara(int adet, float hucreYuk)
        {
            var g = Ui.Rect("Izgara", _govde);
            var gl = g.gameObject.AddComponent<GridLayoutGroup>();
            gl.cellSize = new Vector2(460, hucreYuk); gl.spacing = new Vector2(20, 18); gl.childAlignment = TextAnchor.UpperCenter; gl.constraint = GridLayoutGroup.Constraint.FixedColumnCount; gl.constraintCount = 2;
            Ui.Yukseklik(g, Mathf.CeilToInt(adet / 2f) * (hucreYuk + 18));
            return g;
        }

        void Yenile(bool acilis, double simdi)
        {
            foreach (Transform c in _govde) Object.Destroy(c.gameObject);
            _yorum = null;
            if (acilis) { AcilisCiz(); return; }
            if (!B.Oynaniyor) { _bilgi.text = ""; return; }
            if (simdi < B.TurBasi)
            {
                _bilgi.text = "Falcı: " + B.Ad(Falci);
                OyunUi.Esnek(_govde);
                if (B.Tur == 1) { Yazi("Telve", 120, 170); Yazi("Falcı bir kart seçip yorumlar. Herkes yoruma uyan\nkartını atar, sonra Falcı'nın kartını bulmaya çalışır!", 36, 160, null, false); }
                else Yazi("Sıradaki fal: " + B.Ad(Falci), 60, 110);
                OyunUi.Esnek(_govde);
                return;
            }
            bool ben = Falci == B.Ben, gonderdim = Hamlem != null;
            var el = ((JArray)B.G?["hand"])?.Select(t => (int)t).ToList() ?? new List<int>();
            switch (Faz)
            {
                case "tell":
                    if (ben && !gonderdim)
                    {
                        _bilgi.text = "Falcısın! Bir kart seç ve tek satırla yorumla";
                        var iz = Izgara(el.Count, 290);
                        foreach (var k in el) { int kk = k; Kart(iz, k, _secili == k).onClick.AddListener(() => _secili = kk); }
                        _yorum = Ui.Girdi(_govde, "Yorumun (ör. ‘yolun açık görünüyor’)", 70, 40);
                        _yorum.text = _yorumMetin; _yorum.onValueChanged.AddListener(v => _yorumMetin = v);
                        var gonder = Ui.Dugme(_govde, "Falı gönder", "menu_pembe", 56);
                        gonder.onClick.AddListener(FalGonder);
                    }
                    else { _bilgi.text = ben ? "Falın gönderildi" : B.Ad(Falci) + " fal bakıyor…"; Bekle(ben ? "Arkadaşların kart atacak" : "Falcı kartını seçip yorum yazıyor"); }
                    break;
                case "pick":
                    YorumBasligi();
                    if (ben)
                    {
                        _bilgi.text = "Arkadaşların yoruma uyan kartını atıyor";
                        var mk = (int?)B.G?["myCard"]; if (mk != null) { var iz = Izgara(1, 290); Kart(iz, mk.Value, true, "senin kartın").interactable = false; }
                    }
                    else
                    {
                        _bilgi.text = gonderdim ? "Kartın atıldı, istersen değiştir" : "Yoruma en çok uyan kartını at";
                        int? attigim = (int?)Hamlem?["card"];
                        var iz = Izgara(el.Count, 290);
                        foreach (var k in el) { int kk = k; Kart(iz, k, attigim == k).onClick.AddListener(() => B.Gonder("act", new JObject { ["card"] = kk })); }
                    }
                    break;
                case "vote":
                    YorumBasligi();
                    var masa = (B.G?["table"] as JArray)?.Cast<JObject>().ToList() ?? new List<JObject>();
                    if (ben) { _bilgi.text = "Herkes senin kartını arıyor"; }
                    else _bilgi.text = Hamlem != null ? "Oyun alındı, istersen değiştir" : "Falcı'nın kartı hangisi?";
                    int? oyum = (int?)Hamlem?["card"];
                    var izg = Izgara(masa.Count, 290);
                    foreach (var x in masa)
                    {
                        int kk = (int)x["card"]; bool benim = (bool?)x["mine"] == true;
                        var b = Kart(izg, kk, oyum == kk, benim ? "senin kartın" : null);
                        b.interactable = !ben && !benim;
                        b.onClick.AddListener(() => B.Gonder("act", new JObject { ["card"] = kk }));
                    }
                    break;
            }
            OyunUi.Esnek(_govde);
        }

        void YorumBasligi()
        {
            Yazi("“" + (string)B.G?["clue"] + "”", 56, 120, new Color32(0xFF, 0xC8, 0x4A, 255));
            Yazi("— " + B.Ad(Falci), 32, 46, Ui.Soluk, false);
        }

        void Bekle(string alt)
        {
            OyunUi.Esnek(_govde);
            Yazi(alt, 42, 90, Ui.Soluk, false);
        }

        void FalGonder()
        {
            if (_secili < 0) { B.toast("Önce bir kart seç"); return; }
            var y = (_yorum?.text ?? "").Trim();
            if (y.Length < 2) { B.toast("Yorumun çok kısa"); return; }
            B.Gonder("act", new JObject { ["card"] = _secili, ["clue"] = y });
            _secili = -1; _yorumMetin = "";
        }

        void AcilisCiz()
        {
            var son = B.Son; string falci = (string)son["teller"]; int dogru = (int)son["card"];
            var oylar = (JObject)son["votes"]; var kazanc = (JObject)son["gains"];
            bool hic = (bool?)son["none"] == true, hepsi = (bool?)son["all"] == true;
            _bilgi.text = hic ? "Kimse bulamadı! Falcı puan alamadı" : hepsi ? "Herkes buldu! Falcı puan alamadı" : "Falcı'nın kartı açıldı";
            Yazi("“" + (string)son["clue"] + "”", 48, 90, new Color32(0xFF, 0xC8, 0x4A, 255));
            var masa = ((JArray)son["table"]).Cast<JObject>().ToList();
            var iz = Izgara(masa.Count, 300);
            foreach (var x in masa)
            {
                int k = (int)x["card"]; string sahip = (string)x["owner"];
                var oyVeren = oylar.Properties().Where(p => (int?)p.Value == k).Select(p => B.Ad(p.Name)).ToList();
                var alt = (sahip == falci ? "<color=#FFC84A>Falcı</color> " : B.Ad(sahip) + " ") + (oyVeren.Count > 0 ? "· " + string.Join(", ", oyVeren) : "");
                Kart(iz, k, sahip == falci, alt, sahip == falci ? (Color?)new Color32(0xFF, 0xC8, 0x4A, 255) : null).interactable = false;
            }
            var puan = kazanc.Properties().Where(p => (int)p.Value > 0).OrderByDescending(p => (int)p.Value).Select(p => $"{B.Ad(p.Name)} +{(int)p.Value}");
            Yazi(string.Join("   ", puan), 32, 60, Ui.Beyaz, false);
            OyunUi.Esnek(_govde);
        }

        void Otomatik(bool acilis, double simdi)
        {
            if (!B.otomatik || acilis || !B.Oynaniyor || simdi < B.TurBasi || Hamlem != null || !B.BenCanliyim) { _oto = -1; return; }
            if (_oto < 0) { _oto = Time.time + 2f; return; }
            if (Time.time < _oto) return;
            _oto = Time.time + 3f;
            var el = ((JArray)B.G?["hand"])?.Select(t => (int)t).ToList();
            if (Faz == "tell" && Falci == B.Ben && el?.Count > 0) B.Gonder("act", new JObject { ["card"] = el[0], ["clue"] = "yakında bir yolculuk var" });
            else if (Faz == "pick" && Falci != B.Ben && el?.Count > 0) B.Gonder("act", new JObject { ["card"] = el[Random.Range(0, el.Count)] });
            else if (Faz == "vote" && Falci != B.Ben)
            {
                var secenek = ((JArray)B.G["table"]).Cast<JObject>().Where(x => (bool?)x["mine"] != true).ToList();
                if (secenek.Count > 0) B.Gonder("act", new JObject { ["card"] = (int)secenek[Random.Range(0, secenek.Count)]["card"] });
            }
        }
    }
}
