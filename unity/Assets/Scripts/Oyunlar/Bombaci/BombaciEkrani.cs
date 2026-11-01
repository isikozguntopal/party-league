using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json.Linq;
using PartiLigi.UI;
using UnityEngine;
using UnityEngine.UI;

namespace PartiLigi.Oyunlar.Bombaci
{
    /// <summary>
    /// 🧨 Bombayı Çöz (kurallar: public/games/bombaci.js, takım oyunu). Takımlar sırayla oynar. Çözen bombayı görür
    /// (kablo, düğme, şifre kilidi), anlatıcı kılavuzu okur. Modüllere dokunma gact ile gider; 3 hata = patlama.
    /// </summary>
    public class BombaciEkrani : OyunEkrani
    {
        static readonly Dictionary<string, Color> Renk = new Dictionary<string, Color>
        {
            ["kirmizi"] = new Color32(0xE0, 0x31, 0x31, 255), ["mavi"] = new Color32(0x2F, 0x6F, 0xD1, 255), ["sari"] = new Color32(0xF2, 0xC2, 0x30, 255),
            ["beyaz"] = new Color32(0xF3, 0xF4, 0xF6, 255), ["siyah"] = new Color32(0x1F, 0x20, 0x23, 255),
        };
        static readonly Dictionary<string, string> RenkAd = new Dictionary<string, string> { ["kirmizi"] = "kırmızı", ["mavi"] = "mavi", ["sari"] = "sarı", ["beyaz"] = "beyaz", ["siyah"] = "siyah" };
        static readonly string[] KabloKural3 = { "Hiç kırmızı yoksa → 2. kabloyu kes.", "Değilse, son kablo beyazsa → son kabloyu kes.", "Değilse, birden fazla mavi varsa → son mavi kabloyu kes.", "Hiçbiri değilse → son kabloyu kes." };
        static readonly string[] KabloKural4 = { "Birden fazla kırmızı varsa ve seri no son rakamı tekse → son kırmızıyı kes.", "Değilse, son kablo sarıysa ve hiç kırmızı yoksa → 1. kabloyu kes.", "Değilse, tam olarak bir mavi varsa → 1. kabloyu kes.", "Değilse, birden fazla sarı varsa → son kabloyu kes.", "Hiçbiri değilse → 2. kabloyu kes." };
        static readonly string[] KabloKural5 = { "Son kablo siyahsa ve seri no son rakamı tekse → 4. kabloyu kes.", "Değilse, tam olarak bir kırmızı ve birden fazla sarı varsa → 1. kabloyu kes.", "Değilse, hiç siyah yoksa → 2. kabloyu kes.", "Hiçbiri değilse → 1. kabloyu kes." };
        static readonly string[] KabloKural6 = { "Hiç sarı yoksa ve seri no son rakamı tekse → 3. kabloyu kes.", "Değilse, tam olarak bir sarı ve birden fazla beyaz varsa → 4. kabloyu kes.", "Değilse, hiç kırmızı yoksa → son kabloyu kes.", "Hiçbiri değilse → 4. kabloyu kes." };
        static readonly string[] DugmeKural = { "Düğme MAVİ ve üstünde \"İPTAL\" yazıyorsa → BASILI TUT.", "Değilse, 1'den fazla pil varsa ve \"PATLAT\" yazıyorsa → BAS ve hemen BIRAK.", "Değilse, düğme BEYAZ ve \"CAR\" göstergesi yanıyorsa → BASILI TUT.", "Değilse, 2'den fazla pil varsa ve \"FRK\" göstergesi yanıyorsa → BAS ve hemen BIRAK.", "Değilse, düğme SARI ise → BASILI TUT.", "Değilse, düğme KIRMIZI ve \"TUT\" yazıyorsa → BAS ve hemen BIRAK.", "Hiçbiri değilse → BASILI TUT.", "", "Basılı tutunca yanda renkli şerit yanar:", "MAVİ şerit → sayaçta herhangi bir yerde 4 varken bırak.", "SARI şerit → sayaçta 5 varken bırak.", "Başka renk → sayaçta 1 varken bırak." };
        static readonly string[] SifreKural = { "Seri numarasındaki harfleri atla, yalnızca RAKAMLARA bak.", "Soldan ilk üç rakam kodundur. 3'ten az rakam varsa kalan haneleri 0 yaz.", "Pil sayısı 3'ten FAZLAYSA kodu tersten gir (3. rakam başa).", "Kilidin üstündeki ▲ ▼ ile her haneyi ayarla, sonra AÇ'a bas. Yanlış kod 1 hata!" };

        Text _sol, _sag, _bilgi;
        RectTransform _govde;
        string _anahtar;
        int _sekme;                     // kılavuz sekmesi: 0 kablo, 1 düğme, 2 şifre
        bool _soloKilavuz;              // tek kişilik takım: kılavuzu gösteriyor mu
        BasiliDugme _dugme; bool _tutuyor; float _otoZaman = -1;
        Image _serit;

        public override string Baslik => "Bombayı Çöz";

        public override void Kur()
        {
            var ic = Ui.Dikey(B.alan, "Icerik", 18, 50); Ui.Doldur(ic);
            OyunUi.UstSerit(ic, out _sol, out _sag, out _bilgi);
            _govde = Ui.Dikey(ic, "Govde", 14, 0); Ui.Yukseklik(_govde, 0); _govde.GetComponent<LayoutElement>().flexibleHeight = 1;
        }

        public override void Durum() { }
        string Rol => (string)B.G?["role"];
        JObject Bomba => B.G?["bomb"] as JObject;
        double Bitis => (double?)B.G?["endsAt"] ?? 0;
        double Baslangic => (double?)B.G?["startsAt"] ?? 0;
        static string Sayac(double ms) { int s = Mathf.Max(0, Mathf.CeilToInt((float)(ms / 1000))); return $"{s / 60}:{s % 60:00}"; }

        JObject SiradakiTakim()
        {
            int tur = (int?)B.G?["turn"] ?? 0;
            return (B.G?["teams"] as JArray)?.Cast<JObject>().FirstOrDefault(t => (int)t["id"] == tur);
        }

        public override void Kare()
        {
            var simdi = B.Simdi;
            bool acilis = B.AcilisSuruyor(out _);
            var bomba = Bomba;
            string g = acilis ? "acilis:" + B.Son["round"] : !B.Oynaniyor ? "bitti" : simdi < Baslangic ? "rol:" + B.Tur + Rol
                : Rol + ":" + B.Tur + ":" + _sekme + ":" + _soloKilavuz + ":" + bomba?.ToString(Newtonsoft.Json.Formatting.None) + ":" + SiradakiTakim()?["status"]?.ToString(Newtonsoft.Json.Formatting.None);
            if (g != _anahtar && !_tutuyor) { _anahtar = g; Yenile(acilis, simdi); }   // basılı tutarken yeniden kurma (bırakma kaybolur)
            _sol.text = $"Takım {((int?)B.G?["turn"] ?? 0) + 1}/{(B.G?["teams"] as JArray)?.Count ?? 1}";
            _sag.text = B.Oynaniyor && !acilis && simdi >= Baslangic ? Sayac(Bitis - simdi) : "";
            _sol.transform.parent.gameObject.SetActive(B.Oynaniyor || acilis);
            if (_serit != null)
            {
                var hold = bomba?["hold"] as JObject;
                _serit.color = hold != null && Renk.TryGetValue((string)hold["strip"], out var sc) ? sc : new Color(1, 1, 1, 0.25f);
            }
            Otomatik(simdi);
        }

        Text Yazi(Transform ebeveyn, string m, int boyut, float yuk, Color? renk = null, bool baslik = true, TextAnchor hiza = TextAnchor.MiddleCenter)
        {
            var t = Ui.Yazi(ebeveyn, m, boyut, renk ?? Ui.Beyaz, hiza, baslik); Ui.Yukseklik(t, yuk); Ui.Golge(t, 3, 0.6f); return t;
        }

        void Yenile(bool acilis, double simdi)
        {
            foreach (Transform c in _govde) Object.Destroy(c.gameObject);
            _dugme = null; _serit = null;
            if (acilis) { AcilisCiz(); return; }
            if (!B.Oynaniyor) { _bilgi.text = ""; return; }
            var takim = SiradakiTakim();
            var adlar = takim != null ? string.Join(" & ", ((JArray)takim["members"]).Select(t => B.Ad((string)t))) : "";
            if (simdi < Baslangic)
            {
                _bilgi.text = "Sıradaki takım: " + adlar;
                OyunUi.Esnek(_govde);
                var rolAd = Rol switch { "cozen" => "Bombayı SEN görüyorsun!\nArkadaşın kılavuzu okuyacak.", "anlatici" => "Kılavuz sende!\nArkadaşına bombayı nasıl çözeceğini anlat.", "solo" => "Tek başınasın:\nhem bomba hem kılavuz sende.", "bekle" => "Sıra başka takımda.\nSonra senin takımın oynayacak.", _ => "İzliyorsun" };
                Yazi(_govde, rolAd, 54, 260, Rol == "cozen" || Rol == "anlatici" || Rol == "solo" ? new Color32(0xFF, 0xC8, 0x4A, 255) : (Color?)null);
                Yazi(_govde, OyunBaglami.Geri(Baslangic - simdi), 140, 200);
                OyunUi.Esnek(_govde);
                return;
            }
            switch (Rol)
            {
                case "cozen": _bilgi.text = "Arkadaşına bombayı anlat, onun dediğini yap"; BombaCiz(); break;
                case "anlatici": _bilgi.text = "Arkadaşına sorular sor, kılavuza göre yönlendir"; KilavuzCiz(); break;
                case "solo":
                    _bilgi.text = "Tek başınasın: kılavuza bak, bombayı çöz";
                    var sec = Ui.Yatay(_govde, "Sec", 16); Ui.Yukseklik(sec, 100);
                    var b1 = OyunUi.Secenek(sec, "Bomba", !_soloKilavuz ? (Color)Ui.Pembe : new Color(1, 1, 1, 0.14f), 100, 36); b1.d.onClick.AddListener(() => _soloKilavuz = false);
                    var b2 = OyunUi.Secenek(sec, "Kılavuz", _soloKilavuz ? (Color)Ui.Pembe : new Color(1, 1, 1, 0.14f), 100, 36); b2.d.onClick.AddListener(() => _soloKilavuz = true);
                    if (_soloKilavuz) KilavuzCiz(); else BombaCiz();
                    break;
                default:
                    _bilgi.text = "Oynayan takım: " + adlar;
                    OyunUi.Esnek(_govde);
                    if (takim != null)
                        foreach (var (s, i) in ((JArray)takim["status"]).Select((s, i) => (s, i)))
                            if (s is JObject st) Yazi(_govde, $"{B.Ad((string)takim["defusers"][i])}: {(int)st["solved"]}/3 modül · {(int)st["strikes"]} hata" + ((bool?)st["exploded"] == true ? " · BOOM!" : st["done"]?.Type == JTokenType.Integer ? " · çözdü!" : ""), 44, 90);
                    Yazi(_govde, "Konuşmaları dinle, sıran gelecek!", 36, 70, Ui.Soluk, false);
                    OyunUi.Esnek(_govde);
                    break;
            }
        }

        // ---------- Bomba ----------
        void BombaCiz()
        {
            var b = Bomba; if (b == null) return;
            int hata = (int?)b["strikes"] ?? 0;
            if ((bool?)b["exploded"] == true) { OyunUi.Esnek(_govde); Yazi(_govde, "BOOM!", 180, 260, new Color32(0xFF, 0x5A, 0x2A, 255)); Yazi(_govde, "Bomba patladı", 44, 80, Ui.Soluk, false); OyunUi.Esnek(_govde); return; }
            if (b["done"]?.Type == JTokenType.Integer) { OyunUi.Esnek(_govde); Yazi(_govde, "Çözüldü!", 130, 220, new Color32(0x6C, 0xF0, 0x9A, 255)); Yazi(_govde, "Süre: " + OyunBaglami.Saniye((double)b["done"] - 6000, "0.0") + " sn", 44, 80, Ui.Soluk, false); OyunUi.Esnek(_govde); return; }

            // kasa bilgisi: seri no, piller, göstergeler, hata
            var bilgi = Ui.Rect("Kasa", _govde); Ui.Yukseklik(bilgi, 150);
            Ui.Kart(bilgi.gameObject, new Color(0.15f, 0.15f, 0.17f, 0.95f), 1.5f);
            var gost = string.Join("  ", ((JArray)b["indicators"]).Select(i => ((bool)i["lit"] ? "<color=#FFE066>●</color>" : "<color=#777777>○</color>") + (string)i["name"]));
            var kasa = Ui.Yazi(bilgi, $"SERİ: <color=#FFE066>{(string)b["serial"]}</color>    PİL: {(int)b["batteries"]}\n{gost}    HATA: <color=#FF6060>{new string('X', hata)}</color><color=#555555>{new string('X', 3 - hata)}</color>", 38, Ui.Beyaz, TextAnchor.MiddleLeft, true);
            Ui.Doldur(kasa.rectTransform, 30, 8, 20, 8); kasa.supportRichText = true;

            KabloModulu(b); DugmeModulu(b); SifreModulu(b);
            OyunUi.Esnek(_govde);
        }

        RectTransform Modul(string ad, bool bitti, float yuk)
        {
            var m = Ui.Rect(ad, _govde); Ui.Yukseklik(m, yuk);
            Ui.Kart(m.gameObject, bitti ? new Color32(0x1E, 0x4D, 0x34, 240) : new Color32(0x2A, 0x2A, 0x30, 240), 200f / yuk + 0.3f);
            var led = Ui.Rect("Led", m); led.anchorMin = led.anchorMax = new Vector2(1, 1); led.pivot = new Vector2(1, 1); led.sizeDelta = new Vector2(34, 34); led.anchoredPosition = new Vector2(-18, -14);
            Ui.Kart(led.gameObject, bitti ? new Color32(0x6C, 0xF0, 0x9A, 255) : new Color32(0x55, 0x22, 0x22, 255), 4f).raycastTarget = false;
            return m;
        }

        void KabloModulu(JObject b)
        {
            bool bitti = (bool)b["wireDone"];
            var kablolar = (JArray)b["wires"]; var kesik = ((JArray)b["cut"]).Select(t => (int)t).ToList();
            var m = Modul("Kablolar", bitti, 70 + kablolar.Count * 62);
            var ic = Ui.Dikey(m, "Ic", 10, 0); Ui.Doldur(ic, 30, 20, 70, 20);
            for (int i = 0; i < kablolar.Count; i++)
            {
                int ii = i; var renk = Renk[(string)kablolar[i]]; bool k = kesik.Contains(i);
                var s = OyunUi.Secenek(ic, k ? "kesildi" : $"{i + 1}", k ? new Color(renk.r, renk.g, renk.b, 0.25f) : renk, 52, 28);
                s.yazi.color = (string)kablolar[i] == "beyaz" || (string)kablolar[i] == "sari" ? Color.black : Ui.Beyaz;
                s.d.interactable = !bitti && !k;
                s.d.onClick.AddListener(() => B.Gonder("gact", new JObject { ["m"] = "wire", ["i"] = ii }));
            }
        }

        void DugmeModulu(JObject b)
        {
            bool bitti = (bool)b["btnDone"];
            var m = Modul("Dugme", bitti, 230);
            var d = b["button"]; var renk = Renk[(string)d["color"]];
            var rt = Ui.Rect("Buton", m); rt.anchorMin = rt.anchorMax = new Vector2(0.4f, 0.5f); rt.sizeDelta = new Vector2(190, 190);
            var im = Ui.Kart(rt.gameObject, renk, 0.9f);   // düşük çarpan = tam daire
            var t = Ui.Yazi(rt, (string)d["label"], 40, (string)d["color"] == "beyaz" || (string)d["color"] == "sari" ? Color.black : Ui.Beyaz, TextAnchor.MiddleCenter, true); Ui.Doldur(t.rectTransform);
            // şerit (basılı tutunca sunucu renk verir)
            var hold = b["hold"] as JObject;
            var sr = Ui.Rect("Serit", m); sr.anchorMin = new Vector2(0.72f, 0.15f); sr.anchorMax = new Vector2(0.8f, 0.85f); sr.offsetMin = sr.offsetMax = Vector2.zero;
            _serit = Ui.Kart(sr.gameObject, hold != null && Renk.TryGetValue((string)hold["strip"], out var sc) ? sc : new Color(1, 1, 1, 0.3f), 8f);
            if (bitti) return;
            _dugme = rt.gameObject.AddComponent<BasiliDugme>();
            _dugme.basildi = () => _tutuyor = true;
            _dugme.birakildi = () =>
            {
                _tutuyor = false;
                if (b["hold"]?.Type == JTokenType.Object || Time.time - _dugme.basmaAni > 0.45f)
                    B.Gonder("gact", new JObject { ["m"] = "btn", ["a"] = "release", ["timer"] = Sayac(Bitis - B.Simdi) });
                else B.Gonder("gact", new JObject { ["m"] = "btn", ["a"] = "press" });
            };
        }

        public void TutmaKontrol()
        {
            // 0,45 sn basılı kalınca "hold" gönder (şerit rengi için)
            if (_dugme != null && _dugme.basili && !_tutmaGitti && Time.time - _dugme.basmaAni > 0.45f) { _tutmaGitti = true; B.Gonder("gact", new JObject { ["m"] = "btn", ["a"] = "hold" }); }
            if (_dugme == null || !_dugme.basili) _tutmaGitti = false;
        }
        bool _tutmaGitti;

        void SifreModulu(JObject b)
        {
            bool bitti = (bool)b["keyDone"];
            var m = Modul("Sifre", bitti, 250);
            var hane = (JArray)b["digits"];
            var satir = Ui.Yatay(m, "Haneler", 20); Ui.Doldur(satir, 40, 30, 300, 30);
            for (int i = 0; i < 3; i++)
            {
                int ii = i;
                var kol = Ui.Dikey(satir, "Kol", 4, 0, TextAnchor.MiddleCenter);
                var y = OyunUi.Secenek(kol, "▲", new Color(1, 1, 1, 0.15f), 56, 30); y.d.interactable = !bitti; y.d.onClick.AddListener(() => B.Gonder("gact", new JObject { ["m"] = "lock", ["i"] = ii, ["d"] = 1 }));
                var r = Ui.Yazi(kol, ((int)hane[i]).ToString(), 64, new Color32(0xFF, 0xE0, 0x66, 255), TextAnchor.MiddleCenter, true); Ui.Yukseklik(r, 70);
                var a = OyunUi.Secenek(kol, "▼", new Color(1, 1, 1, 0.15f), 56, 30); a.d.interactable = !bitti; a.d.onClick.AddListener(() => B.Gonder("gact", new JObject { ["m"] = "lock", ["i"] = ii, ["d"] = -1 }));
            }
            var ac = Ui.Rect("Ac", m); ac.anchorMin = new Vector2(1, 0.5f); ac.anchorMax = new Vector2(1, 0.5f); ac.pivot = new Vector2(1, 0.5f); ac.sizeDelta = new Vector2(220, 140); ac.anchoredPosition = new Vector2(-40, -10);
            var acB = OyunUi.Secenek(ac, "AÇ", Ui.Pembe, 140, 48); Ui.Doldur((RectTransform)acB.d.transform); acB.d.interactable = !bitti;
            acB.d.onClick.AddListener(() => B.Gonder("gact", new JObject { ["m"] = "open" }));
        }

        // ---------- Kılavuz ----------
        void KilavuzCiz()
        {
            var sek = Ui.Yatay(_govde, "Sekmeler", 12); Ui.Yukseklik(sek, 100);
            string[] adlar = { "Kablolar", "Düğme", "Şifre" };
            for (int i = 0; i < 3; i++) { int ii = i; var s = OyunUi.Secenek(sek, adlar[i], _sekme == i ? (Color)Ui.Pembe : new Color(1, 1, 1, 0.14f), 100, 36); s.d.onClick.AddListener(() => _sekme = ii); }
            string metin = _sekme switch
            {
                0 => "<b>Kaç kablo var? Ona göre:</b>\n\n<color=#FFC84A>3 kablo</color>\n" + Liste(KabloKural3) + "\n<color=#FFC84A>4 kablo</color>\n" + Liste(KabloKural4) + "\n<color=#FFC84A>5 kablo</color>\n" + Liste(KabloKural5) + "\n<color=#FFC84A>6 kablo</color>\n" + Liste(KabloKural6),
                1 => "<b>Düğmenin rengi ve yazısı:</b>\n\n" + Liste(DugmeKural),
                _ => "<b>Şifre kilidi (3 hane):</b>\n\n" + Liste(SifreKural),
            };
            var kart = Ui.Rect("Kilavuz", _govde); Ui.Yukseklik(kart, 0); kart.GetComponent<LayoutElement>().flexibleHeight = 1;
            Ui.Kart(kart.gameObject, new Color32(0xF4, 0xEC, 0xD8, 245), 0.8f);
            var t = Ui.Yazi(kart, metin, 30, new Color32(0x2A, 0x22, 0x18, 255), TextAnchor.UpperLeft); Ui.Doldur(t.rectTransform, 34, 24, 34, 24);
            t.supportRichText = true; t.resizeTextForBestFit = true; t.resizeTextMaxSize = 34; t.resizeTextMinSize = 18;
        }
        static string Liste(IEnumerable<string> l) => string.Join("\n", l.Select(x => x == "" ? "" : "• " + x)) + "\n";

        // ---------- Açılış ----------
        void AcilisCiz()
        {
            var son = B.Son; var sonuc = (JObject)son["results"];
            _bilgi.text = "Takımın sonucu";
            OyunUi.Esnek(_govde);
            var sure = sonuc.Properties().Select(p => p.Value).FirstOrDefault(v => v.Type == JTokenType.Integer || v.Type == JTokenType.Float);
            Yazi(_govde, sure != null ? "Çözüldü!" : "BOOM!", 120, 180, sure != null ? new Color32(0x6C, 0xF0, 0x9A, 255) : new Color32(0xFF, 0x5A, 0x2A, 255));
            foreach (var p in sonuc.Properties())
                OyunUi.OyuncuSatiri(_govde, B, p.Name, p.Value.Type == JTokenType.Null ? "patladı" : OyunBaglami.Saniye((double)p.Value - 6000, "0.0") + " sn", null, 90);
            OyunUi.Esnek(_govde);
        }

        // Önizleme: bombayı kurallara göre çöz (kılavuz mantığı istemcide yok; kablo/kilit sırayla denenir)
        void Otomatik(double simdi)
        {
            TutmaKontrol();
            if (!B.otomatik || !B.Oynaniyor || simdi < Baslangic || (Rol != "cozen" && Rol != "solo")) return;
            var b = Bomba; if (b == null || (bool?)b["exploded"] == true || b["done"]?.Type == JTokenType.Integer) return;
            if (Time.time < _otoZaman) return;
            _otoZaman = Time.time + 1.5f;
            if (!(bool)b["wireDone"]) { var kesik = ((JArray)b["cut"]).Select(t => (int)t).ToList(); int i = Enumerable.Range(0, ((JArray)b["wires"]).Count).First(x => !kesik.Contains(x)); B.Gonder("gact", new JObject { ["m"] = "wire", ["i"] = i }); }
        }
    }
}
