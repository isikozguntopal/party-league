using System;
using System.Collections.Generic;
using System.Globalization;
using Newtonsoft.Json.Linq;
using PartiLigi.Net;
using PartiLigi.UI;
using UnityEngine;
using UnityEngine.UI;

namespace PartiLigi.Oyunlar
{
    /// <summary>Bir oyun ekranının dış dünyayla bağı: oda durumu, sunucu saati, eylem gönderme, oyuncu bilgisi.</summary>
    public class OyunBaglami
    {
        public RectTransform alan;                    // oyunun arayüz kökü (tam ekran, üstte çentik payı)
        public JObject durum;                         // son oda durumu (Uygulama günceller)
        public Action<string, JObject> gonder;        // eylem gönder (act / gact …); hata olursa toast
        public Action<string> toast;
        public Func<string, JObject, System.Threading.Tasks.Task<JObject>> cagir;   // yanıtı gereken çağrı (ör. çizim kaydı "art")
        public bool otomatik;                         // önizleme: oyun kendiliğinden oynasın

        public double Simdi => PartiApi.SunucuSimdi;
        public string Ben => PartiApi.PlayerId;
        public string Durumu => (string)durum["status"];
        public bool Oynaniyor => Durumu == "playing";
        public int Seq => (int?)durum["seq"] ?? 0;
        public int Tur => (int?)durum["round"] ?? 1;
        public double TurBasi => (double?)durum["roundStart"] ?? 0;
        public double SonSure => (double?)durum["deadline"] ?? 0;
        public JObject G => durum["g"] as JObject;
        public bool BenHost => (string)durum["hostId"] == Ben;
        public bool Canli(string id) => (bool?)G?["alive"]?[id] == true;
        public bool BenCanliyim => Canli(Ben);

        /// <summary>Bu oyunun son çözülen turu (açılış). Başka oyundan kalmışsa null.</summary>
        public JObject Son
        {
            get
            {
                var l = durum["last"] as JObject;
                return l != null && (int?)l["seq"] == Seq ? l : null;
            }
        }
        /// <summary>Son turun açılışı şu an oynuyor mu (resolvedAt + dur).</summary>
        public bool AcilisSuruyor(out double gecen)
        {
            var l = Son; gecen = 0;
            if (l == null) return false;
            gecen = Simdi - (double)l["resolvedAt"];
            return gecen < (double)l["dur"];
        }

        public JObject Oyuncu(string id)
        {
            foreach (JObject p in (JArray)durum["players"]) if ((string)p["id"] == id) return p;
            return null;
        }
        public string Ad(string id) => id == Ben ? "Sen" : (string)Oyuncu(id)?["name"] ?? "?";
        public Color Renk(string id) => ColorUtility.TryParseHtmlString((string)Oyuncu(id)?["color"] ?? "", out var c) ? c : Color.gray;
        public IEnumerable<string> CanlilarSirali()
        {
            foreach (JObject p in (JArray)durum["players"]) { var id = (string)p["id"]; if (Canli(id)) yield return id; }
        }

        /// <summary>Eylem gövdesine seq/round ekleyip gönderir.</summary>
        public void Gonder(string action, JObject govde = null)
        {
            govde ??= new JObject();
            if (govde["seq"] == null) govde["seq"] = Seq;
            if (govde["round"] == null) govde["round"] = Tur;
            gonder(action, govde);
        }

        static readonly CultureInfo Tr = new CultureInfo("tr-TR");
        public static string Saniye(double ms, string bicim = "0.00") => (ms / 1000).ToString(bicim, Tr);
        public static string Geri(double ms) => Mathf.CeilToInt((float)(ms / 1000)).ToString();
    }

    /// <summary>Unity'deki bir oyunun ekranı. Uygulama açar, her durumda Durum(), her karede Kare() çağırır;
    /// oyun bitince (Oynaniyor değil ve SonucGosterilebilir) ortak sonuç panelini kendisi gösterir.</summary>
    public abstract class OyunEkrani
    {
        public OyunBaglami B;
        public abstract string Baslik { get; }
        public virtual IEtiketKaynagi Etiketler => null;   // 3D karakterlerin isim etiketleri
        public virtual float ZeminSaydam => 0.6f;          // 3D menü sahnesinin üstündeki koyu perde (0: sahne tam görünür)
        public abstract void Kur();
        public abstract void Durum();
        public virtual void Kare() { }
        public virtual void Kapat() { }
        public virtual bool SonucGosterilebilir => !B.AcilisSuruyor(out _);   // son turun açılışı bitmeden sonuç paneli açılmaz
    }

    /// <summary>Unity'de oynanabilen oyunlar (turnuva sırasıyla). Lobi turnuvayı yalnızca bunlarla başlatır.</summary>
    public static class OyunKayit
    {
        static readonly (string kind, string ad, Func<OyunEkrani> yap)[] Liste =
        {
            ("lazer", "Sapan Arenası", () => new Sapan.SapanEkrani()),
            ("bilgi", "Bil Bakalım", () => new Bilgi.BilgiEkrani()),
            ("keski", "Keski Düellosu", () => new Keski.KeskiEkrani()),
            ("tanir", "Ne Kadar Tanıyorsun?", () => new Tanir.TanirEkrani()),
            ("basket", "Pota Atışı", () => new Basket.BasketEkrani()),
            ("bombaci", "Bombayı Çöz", () => new Bombaci.BombaciEkrani()),
            ("cizim", "Kulaktan Kulağa", () => new Cizim.CizimEkrani()),
            ("neciz", "Ne Çizdim?", () => new Neciz.NecizEkrani()),
            ("melodi", "Şarkıyı Tahmin Et", () => new Melodi.MelodiEkrani()),
            ("saniye", "Kayıp Saniye", () => new Saniye.SaniyeEkrani()),
            ("suru", "Sürü", () => new Suru.SuruEkrani()),
            ("ayar", "Ayar", () => new Ayar.AyarEkrani()),
            ("telve", "Telve", () => new Telve.TelveEkrani()),
        };
        public static string Ad(string kind) { foreach (var o in Liste) if (o.kind == kind) return o.ad; return null; }
        public static IEnumerable<(string kind, string ad)> Hepsi() { foreach (var o in Liste) yield return (o.kind, o.ad); }
        public static bool Var(string kind) { foreach (var o in Liste) if (o.kind == kind) return true; return false; }
        public static OyunEkrani Olustur(string kind) { foreach (var o in Liste) if (o.kind == kind) return o.yap(); return null; }
        public static JArray Turlar() { var a = new JArray(); foreach (var o in Liste) a.Add(o.kind); return a; }
        public static int Sayi => Liste.Length;
    }

    /// <summary>Oyun ekranlarının ortak arayüz parçaları.</summary>
    public static class OyunUi
    {
        /// <summary>Üst şerit: solda başlık (Tur…), sağda büyük sayaç, altta ipucu satırı.</summary>
        public static RectTransform UstSerit(Transform ebeveyn, out Text sol, out Text sag, out Text bilgi)
        {
            var ust = Ui.Rect("Ust", ebeveyn); Ui.Yukseklik(ust, 200);
            Ui.Kart(ust.gameObject, new Color(0.08f, 0.06f, 0.22f, 0.72f), 1.2f);
            sol = Ui.Yazi(ust, "", 54, Ui.Beyaz, TextAnchor.UpperLeft, true); Ui.Doldur(sol.rectTransform, 44, 90, 300, 26); Ui.Golge(sol, 3);
            sag = Ui.Yazi(ust, "", 64, new Color32(0xFF, 0xC8, 0x4A, 255), TextAnchor.UpperRight, true); Ui.Doldur(sag.rectTransform, 300, 90, 44, 22); Ui.Golge(sag, 3);
            bilgi = Ui.Yazi(ust, "", 34, new Color(1, 1, 1, 0.9f), TextAnchor.LowerLeft); Ui.Doldur(bilgi.rectTransform, 44, 24, 44, 110);
            return ust;
        }

        public static RectTransform Esnek(Transform ebeveyn, string ad = "Esnek")
        {
            var r = Ui.Rect(ad, ebeveyn); Ui.Yukseklik(r, 0); r.GetComponent<LayoutElement>().flexibleHeight = 1; return r;
        }

        /// <summary>Renkli seçenek düğmesi (şık, kategori…): yuvarlak kart + ortada yazı. Rengi sonradan değiştirilebilir.</summary>
        public static (Button d, Image zemin, Text yazi) Secenek(Transform ebeveyn, string metin, Color renk, float yuk = 150, int boyut = 40)
        {
            var rt = Ui.Rect("Secenek", ebeveyn); Ui.Yukseklik(rt, yuk);
            var im = Ui.Kart(rt.gameObject, renk, Mathf.Max(1.2f, 200f / yuk + 0.05f));
            var b = rt.gameObject.AddComponent<Button>(); b.targetGraphic = im;
            var cs = b.colors; cs.pressedColor = new Color(0.8f, 0.8f, 0.8f); cs.disabledColor = new Color(1, 1, 1, 0.55f); b.colors = cs;
            var t = Ui.Yazi(rt, metin, boyut, Ui.Beyaz, TextAnchor.MiddleCenter, true); Ui.Doldur(t.rectTransform, 24, 8, 24, 8);
            t.resizeTextForBestFit = true; t.resizeTextMaxSize = boyut; t.resizeTextMinSize = 22; Ui.Golge(t, 3, 0.5f);
            return (b, im, t);
        }

        public static readonly Color[] SikRenk = { new Color32(0xF2, 0x4B, 0x7A, 255), new Color32(0x3E, 0x8E, 0xF5, 255), new Color32(0xF5, 0xA6, 0x23, 255), new Color32(0x2E, 0xB8, 0x72, 255) };

        /// <summary>Oyuncu satırı: renkli rozet + ad + sağda değer.</summary>
        public static RectTransform OyuncuSatiri(Transform ebeveyn, OyunBaglami b, string id, string sag, Color? zemin = null, float yuk = 96)
        {
            var satir = Ui.Rect("Satir_" + id, ebeveyn); Ui.Yukseklik(satir, yuk);
            Ui.Kart(satir.gameObject, zemin ?? new Color(1, 1, 1, 0.1f), 200f / yuk + 0.05f);
            var roz = Ui.Rect("Rozet", satir); roz.anchorMin = roz.anchorMax = new Vector2(0, 0.5f); roz.pivot = new Vector2(0, 0.5f);
            roz.sizeDelta = new Vector2(yuk - 26, yuk - 26); roz.anchoredPosition = new Vector2(16, 0);
            Ui.Kart(roz.gameObject, b.Renk(id), 200f / (yuk - 26) + 0.1f);
            var ad = Ui.Yazi(satir, b.Ad(id), 40, Ui.Beyaz, TextAnchor.MiddleLeft); Ui.Doldur(ad.rectTransform, yuk + 6, 0, 260, 0);
            var d = Ui.Yazi(satir, sag, 40, Ui.Beyaz, TextAnchor.MiddleRight, true); Ui.Doldur(d.rectTransform, 0, 0, 28, 0);
            return satir;
        }
    }
}
