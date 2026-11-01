using System;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;

namespace PartiLigi.Oyunlar.Sapan
{
    /// <summary>
    /// Bir turun açılışını (sunucunun history girdisi) zamanın fonksiyonu olarak çözer: verilen ms anında herkes nerede,
    /// taş nerede, kim düşüyor. Durumsuzdur; açılışın ortasından katılan da aynı kareyi görür.
    /// </summary>
    public class SapanOynatici
    {
        public class Kisi { public double x, y, aci, dusus; public bool dustu; }   // dusus: 0..1 düşme ilerlemesi
        public class Kare
        {
            public readonly Dictionary<string, Kisi> kisiler = new Dictionary<string, Kisi>();
            public int atis = -1;              // oynanan atışın sırası (-1: giriş ya da kapanış)
            public string atan;                // şu an fırlatan
            public double atisYerel;           // atışın başından beri geçen ms
            public bool tasGorunur; public double tasX, tasY, tasZ;
            public bool vurdu;                 // taş birine çarptı (çarpma anından sonra true)
            public double olcek;               // platform ölçeği (kapanışta bir sonrakine küçülür)
            public double giris;               // giriş ilerlemesi 0..1
        }

        public readonly double sure, olcek, sonrakiOlcek;
        public readonly int tur;
        readonly Dictionary<string, (double x, double y, double a)> _yer = new Dictionary<string, (double, double, double)>();
        readonly List<SapanKural.AtisKaydi> _atislar;
        readonly List<double> _baslar = new List<double>(), _sureler = new List<double>(), _ucuslar = new List<double>();

        public IEnumerable<string> Kimler => _yer.Keys;
        public IReadOnlyList<SapanKural.AtisKaydi> Atislar => _atislar;

        public SapanOynatici(JObject girdi)
        {
            olcek = (double?)girdi["scale"] ?? 1;
            tur = (int?)girdi["round"] ?? 1;
            sonrakiOlcek = SapanKural.ArenaScale(tur + 1);
            foreach (var p in (JObject)girdi["placements"])
            {
                var v = (JObject)p.Value;
                _yer[p.Key] = ((double)v["x"], (double)v["y"], (double?)v["a"] ?? 0);
            }
            _atislar = AtislariOku((JArray)girdi["shots"]);
            double t = SapanKural.IntroMs;
            foreach (var s in _atislar)
            {
                var d = SapanKural.ShotPlan(s, out var fly);
                _baslar.Add(t); _sureler.Add(d); _ucuslar.Add(fly); t += d;
            }
            sure = t + SapanKural.OutroMs;
        }

        public static List<SapanKural.AtisKaydi> AtislariOku(JArray shots)
        {
            var liste = new List<SapanKural.AtisKaydi>();
            foreach (JObject s in shots)
            {
                var a = new SapanKural.AtisKaydi
                {
                    by = (string)s["by"], hit = (string)s["hit"],
                    x1 = (double)s["x1"], y1 = (double)s["y1"], x2 = (double)s["x2"], y2 = (double)s["y2"],
                };
                foreach (JObject m in (JArray)s["moves"] ?? new JArray())
                    a.moves.Add(new SapanKural.Kayma { id = (string)m["id"], fx = (double)m["fx"], fy = (double)m["fy"], tx = (double)m["tx"], ty = (double)m["ty"], fell = (bool?)m["fell"] ?? false });
                liste.Add(a);
            }
            return liste;
        }

        static double YumusakCikis(double k) => 1 - (1 - k) * (1 - k);

        /// <summary>Açılışın t. milisaniyesindeki kare.</summary>
        public Kare Hesapla(double t)
        {
            var k = new Kare { olcek = olcek, giris = Math.Min(1, Math.Max(0, t / SapanKural.IntroMs)) };
            var dususBas = new Dictionary<string, double>();
            foreach (var kv in _yer) k.kisiler[kv.Key] = new Kisi { x = kv.Value.x, y = kv.Value.y, aci = kv.Value.a };

            for (int i = 0; i < _atislar.Count; i++)
            {
                var s = _atislar[i]; double bas = _baslar[i], yerel = t - bas;
                if (yerel < 0) break;
                bool suAn = yerel < _sureler[i];
                foreach (var m in s.moves)
                {
                    if (!k.kisiler.TryGetValue(m.id, out var kisi)) continue;
                    if (yerel >= m.t1) { kisi.x = m.tx; kisi.y = m.ty; if (m.fell) dususBas[m.id] = bas + m.t1; }
                    else if (yerel >= m.t0)
                    {
                        var e = YumusakCikis((yerel - m.t0) / (m.t1 - m.t0));
                        kisi.x = m.fx + (m.tx - m.fx) * e; kisi.y = m.fy + (m.ty - m.fy) * e;
                    }
                }
                if (!suAn) continue;
                k.atis = i; k.atan = s.by; k.atisYerel = yerel;
                double fly = _ucuslar[i];
                if (yerel < fly)
                {
                    double u = yerel / fly;
                    k.tasGorunur = true;
                    k.tasX = s.x1 + (s.x2 - s.x1) * u; k.tasY = s.y1 + (s.y2 - s.y1) * u;
                    k.tasZ = SapanKural.StoneH + ((s.hit == null ? 0 : SapanKural.StoneH) - SapanKural.StoneH) * u;
                }
                else if (s.hit == null) { k.tasGorunur = true; k.tasX = s.x2; k.tasY = s.y2; k.tasZ = 0; } // ıskalayan taş yerde kalır
                else k.vurdu = true;
            }

            foreach (var kv in dususBas)
            {
                var kisi = k.kisiler[kv.Key];
                kisi.dusus = Math.Min(1, Math.Max(0, (t - kv.Value) / SapanKural.FallMs));
                kisi.dustu = kisi.dusus >= 1;
            }

            double kapanis = sure - SapanKural.OutroMs;
            if (t > kapanis) k.olcek = olcek + (sonrakiOlcek - olcek) * Math.Min(1, (t - kapanis) / (SapanKural.OutroMs * 0.8));
            return k;
        }
    }
}
