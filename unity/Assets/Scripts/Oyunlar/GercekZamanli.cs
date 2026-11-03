using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace PartiLigi.Oyunlar
{
    /// <summary>Gerçek zamanlı oyunun simülasyonu (C# kopyası; JS'teki createSim/stepSim/snapshot ile aynı davranış ve aynı görüntü biçimi).</summary>
    public interface ISim
    {
        void GeriSayimBaslat();
        /// <returns>bu adımın olayları (JS "events")</returns>
        JArray Adim(float dt, Dictionary<string, JObject> girdiler);
        string Faz { get; }                     // "done" olunca sonuç gönderilir
        JArray Siralama();                      // rankingOf
        JArray Bitiremeyenler();                // dnfOf (yoksa boş)
        JObject Goruntu();                      // snapshot (JS biçimi; PWA istemcileri de okur)
        void BotYap(string id);
    }

    /// <summary>
    /// Gerçek zamanlı oyun çerçevesi (public/client/rt.js'in sunucu aktarımı yolu). Oda sahibi (g.simHost) simülasyonu 30 Hz çalıştırır,
    /// görüntüyü rtSnap ile sunucuya bırakır, kumandaları state {rt:{inputs}} ile alır; diğerleri rtInput gönderir, state {rt:{snap}} ile görüntü alır.
    /// PWA'daki oyuncular da aynı yolu (WebRTC kurulamayınca) kullandığından karışık odalar çalışır.
    /// </summary>
    public abstract class GercekZamanliEkran : OyunEkrani
    {
        const float Adim = 1f / 30f, GorSure = 0.14f, GirSure = 0.12f, KumandaBekle = 16f;
        protected ISim sim;                                  // yalnızca oda sahibinde
        protected bool Host => (string)B.G?["simHost"] == B.Ben;
        protected string Mesaj = "";                         // bağlantı kontrolü yazısı

        readonly Dictionary<string, JObject> _uzakGirdi = new Dictionary<string, JObject>();
        readonly HashSet<string> _botlanan = new HashSet<string>();
        bool _basladi, _sonucGitti, _istek;
        float _birikim, _sonGor, _sonGir, _sonCek, _sonIlerleme, _acilis = -1;
        int _gorNo, _sahip = -1;
        JArray _olayTampon = new JArray();
        string _sonGirdi = "";
        // izleyen: alınan görüntüler (sim zamanı t ile) + yerel saat ofseti
        readonly List<JObject> _tampon = new List<JObject>();
        double _ofset = double.NaN;

        protected abstract ISim SimKur(JObject durum);
        protected abstract JObject Girdim();                 // bu oyuncunun kumandası (JS spec.input)
        /// <summary>Çiz: iki görüntü ve aralarındaki oran (oda sahibinde a = b, k = 1).</summary>
        protected abstract void Ciz(JObject a, JObject b, float k);
        protected virtual void Olay(JObject e) { }           // görüntüyle gelen olay (ses, efekt)
        protected virtual void GirdiBirlestir(string id, JObject yeni) => _uzakGirdi[id] = yeni;

        IEnumerable<string> Uzaktakiler() => ((JArray)B.durum["players"]).Cast<JObject>()
            .Where(p => (bool?)p["inGame"] == true && (bool?)p["bot"] != true && (string)p["id"] != B.Ben && (bool?)p["left"] != true).Select(p => (string)p["id"]);

        public override void Kare()
        {
            if (!B.Oynaniyor) { CizSon(); return; }
            if (Host) HostKare(); else IzleyenKare();
        }

        // ---------- oda sahibi ----------
        void HostKare()
        {
            if (sim == null || _sahip != B.Seq) { sim = SimKur(B.durum); _sahip = B.Seq; _basladi = false; _sonucGitti = false; _uzakGirdi.Clear(); _botlanan.Clear(); _acilis = -1; }
            var uzak = Uzaktakiler().ToList();
            if (!_basladi && B.Simdi >= B.TurBasi)
            {
                if (_acilis < 0) _acilis = Time.time;
                float bekledi = Time.time - _acilis;
                int bekleyen = 0; var satir = new List<string>();
                foreach (var id in uzak)
                {
                    if (_botlanan.Contains(id)) continue;
                    bool bagli = _uzakGirdi.ContainsKey(id);
                    if (!bagli && bekledi > KumandaBekle) { _botlanan.Add(id); sim.BotYap(id); B.toast(B.Ad(id) + " bağlanamadı, bot oynayacak"); continue; }
                    if (!bagli) bekleyen++;
                    satir.Add(B.Ad(id) + (bagli ? " ✓" : " …"));
                }
                Mesaj = satir.Count > 0 ? "Bağlantı kontrolü: " + string.Join(" · ", satir) : "";
                if (bekleyen == 0) { sim.GeriSayimBaslat(); _basladi = true; Mesaj = ""; }
            }
            // sabit adım
            _birikim = Mathf.Min(_birikim + Time.deltaTime, 0.5f);
            var girdi = new Dictionary<string, JObject>(_uzakGirdi) { [B.Ben] = Girdim() };
            while (_birikim >= Adim)
            {
                _birikim -= Adim;
                foreach (var e in sim.Adim(Adim, girdi)) { _olayTampon.Add(e); if (e is JObject o) Olay(o); }
            }
            var g = sim.Goruntu();
            Ciz(g, g, 1);
            // ağ: görüntü bırak + kumandaları çek (aynı anda tek istek)
            if (!_istek && Time.time - _sonGor > GorSure && uzak.Count > 0)
            {
                _sonGor = Time.time; _istek = true;
                var snap = (JObject)g.DeepClone(); snap["ev"] = _olayTampon; _olayTampon = new JArray();
                HostAg(snap, uzak);
            }
            else if (uzak.Count == 0) _olayTampon = new JArray();
            if (_basladi && Time.time - _sonIlerleme > 3f) { _sonIlerleme = Time.time; B.cagir("rtProgress", new JObject { ["seq"] = B.Seq, ["ranking"] = sim.Siralama() }); }
            if (sim.Faz == "done" && !_sonucGitti)
            {
                _sonucGitti = true;
                SonucGonder();
            }
        }

        // ---------- izleyen ----------
        void IzleyenKare()
        {
            Mesaj = _tampon.Count == 0 ? "Oda sahibine bağlanılıyor…" : "";
            // kumanda gönder (değiştiyse ya da yarım saniyede bir)
            var gi = Girdim(); gi["rdy"] = true;
            var s = gi.ToString(Newtonsoft.Json.Formatting.None);
            if (Time.time - _sonGir > GirSure && (s != _sonGirdi || Time.time - _sonGir > 0.5f) && B.BenCanliyim)
            {
                _sonGir = Time.time; _sonGirdi = s;
                B.cagir("rtInput", new JObject { ["seq"] = B.Seq, ["i"] = gi });
            }
            // görüntü çek
            if (!_istek && Time.time - _sonCek > GorSure)
            {
                _sonCek = Time.time; _istek = true;
                GoruntuCek();
            }
            CizAra();
        }

        // ağ işleri (async void: Unity ana iş parçacığında devam eder)
        async void HostAg(JObject snap, List<string> uzak)
        {
            try
            {
                await B.cagir("rtSnap", new JObject { ["seq"] = B.Seq, ["n"] = ++_gorNo, ["snap"] = snap });
                var r = await B.cagir("state", new JObject { ["rt"] = new JObject { ["inputs"] = new JArray(uzak) } });
                if (r["rt"]?["inputs"] is JObject girdiler)
                    foreach (var p in girdiler.Properties()) if (p.Value["i"] is JObject i) GirdiBirlestir(p.Name, i);
            }
            catch { /* geçici ağ hatası: bir sonrakinde tekrar */ }
            finally { _istek = false; }
        }

        async void SonucGonder()
        {
            try { await B.cagir("rtResult", new JObject { ["seq"] = B.Seq, ["ranking"] = sim.Siralama(), ["dnf"] = sim.Bitiremeyenler() }); }
            catch { _sonucGitti = false; }
        }

        async void GoruntuCek()
        {
            try
            {
                var r = await B.cagir("state", new JObject { ["rt"] = new JObject { ["snap"] = true, ["have"] = _gorNo } });
                if (r["rt"]?["snap"] is JObject s)
                {
                    _gorNo = (int?)s["n"] ?? _gorNo;
                    if (s["snap"] is JObject snap) Al(snap);
                }
            }
            catch { }
            finally { _istek = false; }
        }

        void Al(JObject snap)
        {
            double t = (double?)snap["t"] ?? 0;
            if (_tampon.Count > 0 && t <= (double)_tampon[_tampon.Count - 1]["t"]) return;
            if (snap["ev"] is JArray ev) foreach (var e in ev) if (e is JObject o) Olay(o);
            _tampon.Add(snap);
            if (_tampon.Count > 12) _tampon.RemoveAt(0);
            double hedef = t - Time.timeAsDouble;                       // sim zamanı − yerel zaman
            _ofset = double.IsNaN(_ofset) ? hedef : _ofset + (hedef - _ofset) * 0.1;
        }

        // görüntüler arası yumuşak geçiş: gecikmeli (aktarım) sim zamanında çiz
        void CizAra()
        {
            if (_tampon.Count == 0) return;
            double gt = Time.timeAsDouble + _ofset - 0.45;
            int i = _tampon.FindLastIndex(x => (double)x["t"] <= gt);
            if (i < 0) { Ciz(_tampon[0], _tampon[0], 1); return; }
            if (i >= _tampon.Count - 1) { Ciz(_tampon[i], _tampon[i], 1); return; }
            double ta = (double)_tampon[i]["t"], tb = (double)_tampon[i + 1]["t"];
            Ciz(_tampon[i], _tampon[i + 1], (float)((gt - ta) / System.Math.Max(1e-3, tb - ta)));
        }

        void CizSon()
        {
            if (sim != null) { var g = sim.Goruntu(); Ciz(g, g, 1); }
            else if (_tampon.Count > 0) { var g = _tampon[_tampon.Count - 1]; Ciz(g, g, 1); }
        }

        protected static float L(JObject a, JObject b, string k, float t) => Mathf.Lerp((float?)a[k] ?? 0, (float?)b[k] ?? 0, t);
    }
}
