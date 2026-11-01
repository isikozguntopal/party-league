using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json.Linq;
using PartiLigi.UI;
using UnityEngine;
using UnityEngine.UI;

namespace PartiLigi.Oyunlar.Cizim
{
    /// <summary>Çizim araç çubuğu: 12 renk, 4 kalem kalınlığı, silgi, geri al, temizle (iki çizim oyunu ortak).</summary>
    public static class CizimArac
    {
        public static void Kur(Transform ebeveyn, CizimTuvali t)
        {
            var renkler = Ui.Yatay(ebeveyn, "Renkler", 8); Ui.Yukseklik(renkler, 64);
            var sec = new List<Image>();
            var kalemler = new List<Image>();
            (Button d, Image zemin, Text yazi) silgi = default;
            for (int i = 0; i < 12; i++)
            {
                int ii = i;
                var rt = Ui.Rect("Renk", renkler); var im = Ui.Kart(rt.gameObject, CizimTuvali.Palet[i], 4f); sec.Add(im);
                var b = rt.gameObject.AddComponent<Button>(); b.targetGraphic = im;
                b.onClick.AddListener(() => { t.renk = ii; t.silgiAcik = false; Isaretle(); });
            }
            var araclar = Ui.Yatay(ebeveyn, "Araclar", 10); Ui.Yukseklik(araclar, 90);
            string[] ad = { "İnce", "Orta", "Kalın", "Dev" };
            for (int i = 0; i < 4; i++)
            {
                int ii = i; var s = OyunUi.Secenek(araclar, ad[i], new Color(1, 1, 1, 0.14f), 90, 28); kalemler.Add(s.zemin);
                s.d.onClick.AddListener(() => { t.kalem = ii; t.silgiAcik = false; Isaretle(); });
            }
            silgi = OyunUi.Secenek(araclar, "Silgi", new Color(1, 1, 1, 0.14f), 90, 28);
            silgi.d.onClick.AddListener(() => { if (t.silgiAcik) t.silgi = t.silgi % 4 + 1; t.silgiAcik = true; Isaretle(); });
            var geri = OyunUi.Secenek(araclar, "Geri", new Color(1, 1, 1, 0.14f), 90, 28); geri.d.onClick.AddListener(t.GeriAl);
            var sil = OyunUi.Secenek(araclar, "Sil", new Color(1, 1, 1, 0.14f), 90, 28); sil.d.onClick.AddListener(t.HepsiniSil);
            void Isaretle()
            {
                for (int i = 0; i < 12; i++) sec[i].transform.localScale = !t.silgiAcik && t.renk == i ? Vector3.one * 1.18f : Vector3.one;
                for (int i = 0; i < 4; i++) kalemler[i].color = !t.silgiAcik && t.kalem == i ? (Color)Ui.Pembe : new Color(1, 1, 1, 0.14f);
                if (silgi.zemin == null) return;
                silgi.zemin.color = t.silgiAcik ? (Color)Ui.Pembe : new Color(1, 1, 1, 0.14f);
                silgi.yazi.text = t.silgiAcik ? "Silgi " + t.silgi : "Silgi";
            }
            Isaretle();
        }
    }

    /// <summary>
    /// 🎨 Kulaktan Kulağa (kurallar: public/games/cizim.js). Oyun: yaz → çiz → tahmin et … (zincirler döner).
    /// Albüm: adımlar sırayla açılır, çizimler tekrar oynatılır, +/− oy. Final: puan dökümü.
    /// İnsan çizimleri sunucudan "art" ile alınır; bot çizimleri görünümde "strokes" olarak gelir.
    /// </summary>
    public class CizimEkrani : OyunEkrani
    {
        Text _sol, _sag, _bilgi;
        RectTransform _govde;
        string _anahtar;
        CizimTuvali _tuval; InputField _girdi; string _girdiMetin = "";
        List<CizimTuvali.Darbe> _oynat; float _oynatBas; int _oynatSure;
        readonly Dictionary<string, List<CizimTuvali.Darbe>> _art = new Dictionary<string, List<CizimTuvali.Darbe>>();
        readonly HashSet<string> _isteniyor = new HashSet<string>();
        int _gonderilen = -1; float _oto = -1;

        public override string Baslik => "Kulaktan Kulağa";

        public override void Kur()
        {
            var ic = Ui.Dikey(B.alan, "Icerik", 16, 40); Ui.Doldur(ic);
            OyunUi.UstSerit(ic, out _sol, out _sag, out _bilgi);
            _govde = Ui.Dikey(ic, "Govde", 14, 0); Ui.Yukseklik(_govde, 0); _govde.GetComponent<LayoutElement>().flexibleHeight = 1;
        }

        public override void Durum() { }
        string Faz => (string)B.G?["phase"];
        string Tip => (string)B.G?["type"];
        JObject Gorev => B.G?["task"] as JObject;
        bool Gonderdim => _gonderilen == B.Tur || B.durum["myAction"] is JObject;

        // Çizim kaydını al: bot çizimi görünümde gelir, insan çizimi "art" çağrısıyla (önbellekli)
        List<CizimTuvali.Darbe> Art(JObject art)
        {
            if (art == null) return null;
            if (art["strokes"] is JArray s) return CizimTuvali.Oku(s);
            var key = (string)art["key"]; if (key == null) return null;
            if (_art.TryGetValue(key, out var l)) return l;
            if (_isteniyor.Add(key))
                B.cagir("art", new JObject { ["key"] = key }).ContinueWith(t =>
                {
                    if (t.IsCompletedSuccessfully) _art[key] = CizimTuvali.Oku(t.Result["art"] as JArray);
                    _isteniyor.Remove(key);
                }, System.Threading.Tasks.TaskScheduler.FromCurrentSynchronizationContext());
            return null;
        }

        public override void Kare()
        {
            var simdi = B.Simdi;
            int ai = (int?)B.G?["ai"] ?? -1;
            var shown = B.G?["shown"] as JArray;
            var cur = Faz == "album" && shown != null && ai >= 0 && ai < shown.Count ? (JObject)shown[ai] : null;
            bool giris = simdi < B.TurBasi && B.Tur == 1;                     // adımlar arasındaki kısa geçişte kart gösterme
            string g = !B.Oynaniyor ? "bitti" : giris ? "giris" : Faz == "game" ? $"oyun:{B.Tur}:{Gonderdim}" :
                Faz == "album" ? $"album:{ai}:{cur?["myVote"]}:{cur?["plus"]}:{cur?["minus"]}:{B.G?["mustVote"]}:{(cur?["art"] != null && Art((JObject)cur["art"]) != null)}" : "final";
            if (Faz == "game" && Tip == "guess" && !Gonderdim) g += ":" + (Art((JObject)Gorev?["art"]) != null);
            if (g != _anahtar) { _anahtar = g; Yenile(simdi, cur); }

            _sol.text = Faz == "album" ? $"Albüm {ai + 1}/{(int?)B.G?["total"] ?? 0}" : Faz == "final" ? "Sonuç" : $"Adım {B.Tur}/{(int?)B.G?["S"] ?? 0}";
            _sag.text = B.Oynaniyor && Faz == "game" && simdi >= B.TurBasi ? OyunBaglami.Geri(B.SonSure - simdi) : "";
            _sol.transform.parent.gameObject.SetActive(B.Oynaniyor);
            if (_oynat != null && _tuval != null) _tuval.Oynat(_oynat, (Time.time - _oynatBas) * 1000 * Mathf.Max(1, _oynatSure / 6000f));
            // süre bitmeden çizimi kendiliğinden gönder (emek kaybolmasın)
            if (Faz == "game" && Tip == "draw" && !Gonderdim && _tuval != null && B.SonSure - simdi < 1500 && _tuval.darbeler.Count > 0) CizimGonder();
            Otomatik(simdi);
        }

        Text Yazi(string m, int boyut, float yuk, Color? renk = null, bool baslik = true)
        {
            var t = Ui.Yazi(_govde, m, boyut, renk ?? Ui.Beyaz, TextAnchor.MiddleCenter, baslik); Ui.Yukseklik(t, yuk); Ui.Golge(t, 3, 0.6f); return t;
        }

        void Yenile(double simdi, JObject cur)
        {
            foreach (Transform c in _govde) Object.Destroy(c.gameObject);
            _tuval = null; _girdi = null; _oynat = null;
            if (!B.Oynaniyor) { _bilgi.text = ""; return; }
            if (simdi < B.TurBasi && B.Tur == 1)
            {
                _bilgi.text = "Yaz, çiz, tahmin et!";
                OyunUi.Esnek(_govde);
                Yazi("Kulaktan\nKulağa", 110, 280);
                Yazi("Bir cümle yaz. Sonra sana geleni çiz,\nsana gelen çizimi tahmin et. Sonunda albüm!", 38, 160, null, false);
                OyunUi.Esnek(_govde);
                return;
            }
            if (Faz == "game") { OyunCiz(); return; }
            if (Faz == "album") { AlbumCiz(cur); return; }
            FinalCiz();
        }

        void Girdi(string ipucu, string gonderYazi, System.Action<string> gonder)
        {
            _girdi = Ui.Girdi(_govde, ipucu, 80, 42); _girdi.text = _girdiMetin;
            _girdi.onValueChanged.AddListener(v => _girdiMetin = v);
            var d = Ui.Dugme(_govde, gonderYazi, "menu_pembe", 56);
            d.onClick.AddListener(() => { var t = (_girdi.text ?? "").Trim(); if (t.Length == 0) { B.toast("Bir şey yaz"); return; } gonder(t); });
        }

        void OyunCiz()
        {
            if (Gonderdim) { _bilgi.text = "Gönderildi"; OyunUi.Esnek(_govde); Yazi("Diğerleri bekleniyor…", 50, 120, Ui.Soluk, false); OyunUi.Esnek(_govde); return; }
            var gorev = Gorev;
            switch (Tip)
            {
                case "write":
                    _bilgi.text = "Komik bir cümle yaz, başkası çizecek";
                    OyunUi.Esnek(_govde);
                    Girdi("ör. ‘Kedi uzayda pizza yiyor’", "Gönder", t => { _gonderilen = B.Tur; _girdiMetin = ""; B.Gonder("act", new JObject { ["text"] = t }); });
                    OyunUi.Esnek(_govde);
                    break;
                case "draw":
                    _bilgi.text = "Bunu çiz:";
                    Yazi("“" + (string)gorev?["text"] + "”", 48, 90, new Color32(0xFF, 0xC8, 0x4A, 255));
                    _tuval = CizimTuvali.Olustur(_govde, 940); _tuval.cizilebilir = true;
                    CizimArac.Kur(_govde, _tuval);
                    var bitti = Ui.Dugme(_govde, "Bitti", "menu_pembe", 56); bitti.onClick.AddListener(CizimGonder);
                    break;
                case "guess":
                    _bilgi.text = "Bu çizim ne anlatıyor?";
                    _tuval = CizimTuvali.Olustur(_govde, 860);
                    var l = Art((JObject)gorev?["art"]);
                    if (l != null) _tuval.Goster(l); else if (gorev?["art"]?.Type != JTokenType.Object) Yazi("(boş çizim)", 34, 50, Ui.Soluk, false);
                    Girdi("Tahminin", "Gönder", t => { _gonderilen = B.Tur; _girdiMetin = ""; B.Gonder("act", new JObject { ["text"] = t }); });
                    break;
            }
        }

        void CizimGonder()
        {
            if (Gonderdim || _tuval == null) return;
            _gonderilen = B.Tur;
            B.Gonder("act", new JObject { ["strokes"] = _tuval.Json() });
        }

        void AlbumCiz(JObject cur)
        {
            if (cur == null) return;
            int n = (int)cur["n"], k = (int)cur["k"]; string by = (string)cur["by"];
            if ((string)cur["type"] == "text")
            {
                _bilgi.text = k == 0 ? "Zincirin ilk cümlesi" : "Tahmin";
                OyunUi.Esnek(_govde);
                Yazi(k == 0 ? B.Ad(by) + " yazdı:" : B.Ad(by) + " tahmin etti:", 40, 70, Ui.Soluk, false);
                Yazi("“" + (string)cur["text"] + "”", 66, 260, new Color32(0xFF, 0xC8, 0x4A, 255));
                if (k > 0 && cur["pts"] != null) Yazi((int)cur["pts"] > 0 ? $"İlk cümleye yakın! +{(int)cur["pts"]}" : (bool?)cur["self"] == true ? "Kendi zinciri" : "Uzak kaldı", 40, 70, (int)cur["pts"] > 0 ? new Color32(0x6C, 0xF0, 0x9A, 255) : (Color?)Ui.Soluk);
            }
            else
            {
                bool benim = by == B.Ben;
                _bilgi.text = benim ? "Bu senin çizimin" : (bool?)B.G?["mustVote"] == true ? "Oy ver, albüm devam etsin" : "Ressam gizli";
                _tuval = CizimTuvali.Olustur(_govde, 900);
                var l = Art((JObject)cur["art"]);
                if (l != null) { _oynat = l; _oynatBas = Time.time; _oynatSure = CizimTuvali.Sure(l); }
                else Yazi(cur["art"]?.Type == JTokenType.Object ? "Çizim yükleniyor…" : "(boş çizim)", 34, 50, Ui.Soluk, false);
                var oy = Ui.Yatay(_govde, "Oy", 20); Ui.Yukseklik(oy, 120);
                int benimOy = (int?)cur["myVote"] ?? 0;
                var art = OyunUi.Secenek(oy, $"+   {(int?)cur["plus"] ?? 0}", benimOy > 0 ? new Color32(0x2E, 0xB8, 0x72, 255) : new Color(1, 1, 1, 0.14f), 120, 48);
                var eks = OyunUi.Secenek(oy, $"−   {(int?)cur["minus"] ?? 0}", benimOy < 0 ? new Color32(0xE0, 0x31, 0x31, 255) : new Color(1, 1, 1, 0.14f), 120, 48);
                art.d.interactable = eks.d.interactable = !benim;
                art.d.onClick.AddListener(() => B.Gonder("gact", new JObject { ["vote"] = n, ["v"] = 1 }));
                eks.d.onClick.AddListener(() => B.Gonder("gact", new JObject { ["vote"] = n, ["v"] = -1 }));
                int bekleyen = (int?)B.G?["waiting"] ?? 0;
                if (bekleyen > 0) Yazi($"{bekleyen} kişinin oyu bekleniyor", 32, 50, Ui.Soluk, false);
            }
            OyunUi.Esnek(_govde);
            if (B.BenHost) { var s = Ui.Dugme(_govde, "Sonraki", "menu_mavi", 50); Ui.Yukseklik(s, 130); s.onClick.AddListener(() => B.Gonder("gact", new JObject { ["next"] = true })); }
        }

        void FinalCiz()
        {
            _bilgi.text = "Puanlar: çizim oyları + tahmin yakınlığı";
            OyunUi.Esnek(_govde);
            foreach (JObject r in (JArray)B.G?["board"] ?? new JArray())
                OyunUi.OyuncuSatiri(_govde, B, (string)r["id"], $"{(int)r["total"]}  (oy {(int)r["votes"]}, tahmin {(int)r["sim"]})", null, 96);
            OyunUi.Esnek(_govde);
            if (B.BenHost) { var s = Ui.Dugme(_govde, "Bitir", "menu_mavi", 50); Ui.Yukseklik(s, 130); s.onClick.AddListener(() => B.Gonder("gact", new JObject { ["next"] = true })); }
        }

        // Önizleme: yaz / karala / tahmin et; albümde oy ver ve ilerlet
        void Otomatik(double simdi)
        {
            if (!B.otomatik || !B.Oynaniyor || simdi < B.TurBasi) return;
            if (Time.time < _oto) return;
            _oto = Time.time + 1.6f;
            if (Faz == "game" && !Gonderdim)
            {
                if (Tip == "draw" && _tuval != null)
                {
                    // önizleme karalaması: bir daire + çizgi
                    var d = new CizimTuvali.Darbe { c = 6, w = 2, t0 = 0, t1 = 900 };
                    for (int i = 0; i <= 24; i++) { float a = i / 24f * Mathf.PI * 2; d.p.Add(500 + (int)(Mathf.Cos(a) * 250)); d.p.Add(450 + (int)(Mathf.Sin(a) * 250)); }
                    _tuval.darbeler.Add(d); _tuval.Goster(_tuval.darbeler); CizimGonder();
                }
                else if (Tip != "draw") { _gonderilen = B.Tur; B.Gonder("act", new JObject { ["text"] = Tip == "write" ? "kedi uzayda pizza yiyor" : "bir daire" }); }
            }
            else if (Faz == "album" || Faz == "final")
            {
                var shown = B.G?["shown"] as JArray; int ai = (int?)B.G?["ai"] ?? -1;
                var cur = shown != null && ai >= 0 && ai < shown.Count ? (JObject)shown[ai] : null;
                if (cur != null && (string)cur["type"] == "draw" && (string)cur["by"] != B.Ben && ((int?)cur["myVote"] ?? 0) == 0) B.Gonder("gact", new JObject { ["vote"] = (int)cur["n"], ["v"] = 1 });
                else if (B.BenHost) { _oto = Time.time + 2.5f; B.Gonder("gact", new JObject { ["next"] = true }); }
            }
        }
    }
}
