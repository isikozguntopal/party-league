using System;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json.Linq;

namespace PartiLigi.Oyunlar.Halat
{
    /// <summary>Halat Çekme simülasyonu: public/games/halat.js createSim/stepSim/snapshot'ın birebir kopyası (aynı görüntü biçimi).</summary>
    public class HalatSim : ISim
    {
        const float MaxTime = 22, Win = 1, MaxTap = 12;
        class Oyuncu { public string id; public int team; public bool bot; public float rate, total, rhythm, lastTap, botRate; public int? last; }

        readonly Dictionary<string, Oyuncu> _ps = new Dictionary<string, Oyuncu>();
        readonly List<string>[] _teams;
        readonly Random _r = new Random();
        float _t, _cd = 3, _p, _v, _t0, _endT; bool _t0Var;
        string _phase = "wait"; int? _winner;
        JArray _events = new JArray();

        public HalatSim(JObject durum)
        {
            var g = (JObject)durum["g"];
            var botlar = new HashSet<string>(((JArray)durum["players"]).Cast<JObject>().Where(p => (bool?)p["bot"] == true).Select(p => (string)p["id"]));
            _teams = ((JArray)g["teams"]).Select(t => ((JArray)t).Select(x => (string)x).ToList()).ToArray();
            for (int ti = 0; ti < _teams.Length; ti++)
                foreach (var id in _teams[ti])
                    _ps[id] = new Oyuncu { id = id, team = ti, bot = botlar.Contains(id), botRate = 5.2f + (float)_r.NextDouble() * 2.6f };
        }

        public string Faz => _phase;
        public void GeriSayimBaslat() { if (_phase == "wait") { _phase = "count"; _cd = 3; } }
        public void BotYap(string id) { if (_ps.TryGetValue(id, out var p)) p.bot = true; }

        public JArray Adim(float dt, Dictionary<string, JObject> girdi)
        {
            _events = new JArray();
            _t += dt;
            if (_phase == "count")
            {
                int once = (int)Math.Ceiling(_cd); _cd -= dt;
                if ((int)Math.Ceiling(_cd) != once && _cd > 0) _events.Add(new JObject { ["e"] = "beep" });
                if (_cd <= 0) { _phase = "pull"; _t0 = _t; _t0Var = true; _events.Add(new JObject { ["e"] = "go" }); }
                return _events;
            }
            if (_phase == "end") { if (_t - _endT > 1.5f) { _phase = "done"; _events.Add(new JObject { ["e"] = "done" }); } return _events; }
            if (_phase != "pull") return _events;
            var force = new float[2];
            foreach (var p in _ps.Values)
            {
                int taps = 0;
                if (p.bot) taps = _r.NextDouble() < p.botRate * dt ? 1 : 0;
                else
                {
                    int total = girdi.TryGetValue(p.id, out var gi) ? (int?)gi["taps"] ?? 0 : 0;
                    if (p.last == null) p.last = total;
                    taps = Math.Max(0, Math.Min(3, total - p.last.Value));
                    p.last = total;
                }
                if (taps > 0)
                {
                    float gap = _t - p.lastTap;
                    p.rhythm = gap > 0.08f && gap < 0.3f ? Math.Min(1, p.rhythm + 0.1f) : Math.Max(0, p.rhythm - 0.2f);
                    p.lastTap = _t;
                }
                p.rate = p.rate * (float)Math.Exp(-dt * 3) + taps * 3;
                force[p.team] += Math.Min(MaxTap, p.rate) * (1 + p.rhythm * 0.3f);
            }
            int n = Math.Max(1, _teams[0].Count);
            float diff = (force[1] - force[0]) / n;
            _v += (diff * 0.036f - _v * 1.5f) * dt * 10;
            _p += _v * dt;
            float el = _t - _t0;
            if (Math.Abs(_p) >= Win || el > MaxTime)
            {
                _winner = _p > 0 ? 1 : 0;
                _phase = "end"; _endT = _t;
                _events.Add(new JObject { ["e"] = "win", ["team"] = _winner });
            }
            return _events;
        }

        public JArray Siralama() { int w = _winner ?? (_p > 0 ? 1 : 0); return new JArray(new JArray(_teams[w]), new JArray(_teams[1 - w])); }
        public JArray Bitiremeyenler() => new JArray();

        static double R3(float v) => Math.Round(v * 1000) / 1000;
        public JObject Goruntu() => new JObject
        {
            ["t"] = R3(_t), ["ph"] = _phase, ["cd"] = R3(_cd), ["p"] = R3(_p), ["w"] = _winner.HasValue ? (JToken)_winner.Value : JValue.CreateNull(),
            ["el"] = R3(_t0Var ? _t - _t0 : 0), ["r"] = new JArray(_ps.Values.Select(p => new JArray(p.id, R3(p.rate)))), ["ev"] = _events,
        };
    }
}
