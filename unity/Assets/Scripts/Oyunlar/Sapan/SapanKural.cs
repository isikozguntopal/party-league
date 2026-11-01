using System;
using System.Collections.Generic;

namespace PartiLigi.Oyunlar.Sapan
{
    /// <summary>
    /// Sapan Arenası kurallarının istemci kopyası (kaynak: public/games/lazer.js). Sunucu her şeyi kendisi çözer;
    /// burada yalnızca nişan önizlemesi, platform sınırı ve açılışın zaman planı için gerekenler var.
    /// Koordinatlar oyunun kendi biriminde (platform köşe yarıçapı 1). SapanTesti JS ile aynı sonucu verdiğini doğrular.
    /// </summary>
    public static class SapanKural
    {
        public const double ArenaR = 1, BodyR = 0.065, Push = 0.5, MinScale = 0.2, StoneH = 0.2;
        public const double MinRange = 0.15, MaxRange = 2.2, DefaultRange = 0.9;
        public const int IntroMs = 2200, PushMs = 520, FallMs = 800, OutroMs = 1600, PlaceMs = 30000;
        public static readonly double Apothem = Math.Cos(Math.PI / 8);

        static readonly double[][] Normals = Normaller();
        static double[][] Normaller()
        {
            var n = new double[8][];
            for (int k = 0; k < 8; k++) n[k] = new[] { Math.Cos(k * Math.PI / 4), Math.Sin(k * Math.PI / 4) };
            return n;
        }

        /// <summary>Tur başına platform ölçeği: ilk 4 turda hızlı (%100 → %44), sonra her tur -%5.</summary>
        public static double ArenaScale(int round)
        {
            int r = Math.Max(0, round - 1);
            double s = r <= 4 ? 1 - 0.14 * r : 0.44 - 0.05 * (r - 4);
            return Math.Max(MinScale, s);
        }

        public static double CleanRange(double r) => double.IsNaN(r) ? MaxRange : Math.Max(MinRange, Math.Min(MaxRange, r));

        /// <summary>Sekizgenin köşeleri (x, y).</summary>
        public static (double x, double y)[] OctagonVertices(double r = ArenaR)
        {
            var v = new (double, double)[8];
            for (int k = 0; k < 8; k++) { double a = Math.PI / 8 + k * Math.PI / 4; v[k] = (Math.Cos(a) * r, Math.Sin(a) * r); }
            return v;
        }

        /// <summary>Noktayı kenarlara en az margin uzaklıkta kalacak şekilde (ölçekli) sekizgenin içine çeker.</summary>
        public static (double x, double y) ClampInside(double x, double y, double margin = BodyR + 0.01, double scale = 1)
        {
            double lim = Apothem * scale - margin;
            for (int i = 0; i < 3; i++)
                foreach (var n in Normals)
                {
                    double d = x * n[0] + y * n[1] - lim;
                    if (d > 0) { x -= d * n[0]; y -= d * n[1]; }
                }
            return (x, y);
        }

        public static bool OnPlatform(double x, double y, double scale = 1)
        {
            foreach (var n in Normals) if (x * n[0] + y * n[1] > Apothem * scale) return false;
            return true;
        }

        public static (double x, double y, double t) WallHit(double x, double y, double a, double scale = 1)
        {
            double dx = Math.Cos(a), dy = Math.Sin(a), t = double.PositiveInfinity;
            foreach (var n in Normals)
            {
                double dn = dx * n[0] + dy * n[1];
                if (dn > 1e-9) t = Math.Min(t, (Apothem * scale - (x * n[0] + y * n[1])) / dn);
            }
            if (double.IsInfinity(t) || t < 0) t = 0;
            return (x + dx * t, y + dy * t, t);
        }

        public struct Hedef { public string id; public double x, y; }
        public struct Atis { public string hit; public double x, y; }

        /// <summary>Menzil içindeki hattaki ilk oyuncuyu bulur; yoksa taş menzilin sonunda (ya da kenarda) yere iner.</summary>
        public static Atis CastShot(double x, double y, double a, IList<Hedef> targets, double scale = 1, double range = double.PositiveInfinity)
        {
            double dx = Math.Cos(a), dy = Math.Sin(a);
            var edge = WallHit(x, y, a, scale);
            double wx, wy, wt;
            if (range < edge.t) { wx = x + dx * range; wy = y + dy * range; wt = range; } else { wx = edge.x; wy = edge.y; wt = edge.t; }
            string bestId = null; double bestT = 0;
            foreach (var tg in targets)
            {
                double vx = tg.x - x, vy = tg.y - y, proj = vx * dx + vy * dy;
                if (proj <= 0) continue;
                double perp2 = vx * vx + vy * vy - proj * proj;
                if (perp2 > BodyR * BodyR) continue;
                double th = Math.Max(0, proj - Math.Sqrt(BodyR * BodyR - perp2));
                if (th < wt + BodyR && (bestId == null || th < bestT)) { bestId = tg.id; bestT = th; }
            }
            if (bestId == null) return new Atis { hit = null, x = wx, y = wy };
            return new Atis { hit = bestId, x = x + dx * bestT, y = y + dy * bestT };
        }

        // ---------- Açılışın zaman planı (sunucunun revealMs hesabıyla birebir) ----------
        public class Kayma { public string id; public double fx, fy, tx, ty; public bool fell; public double t0, t1; }
        public class AtisKaydi { public string by, hit; public double x1, y1, x2, y2; public List<Kayma> moves = new List<Kayma>(); }

        public static double ShotDist(AtisKaydi s) => Math.Sqrt((s.x2 - s.x1) * (s.x2 - s.x1) + (s.y2 - s.y1) * (s.y2 - s.y1));
        public static double FlightMs(AtisKaydi s) => Math.Round(Math.Min(900, 220 + ShotDist(s) * 380), MidpointRounding.AwayFromZero);
        static double MoveMs(Kayma m) => Math.Max(160, PushMs * Math.Sqrt((m.tx - m.fx) * (m.tx - m.fx) + (m.ty - m.fy) * (m.ty - m.fy)) / Push);

        /// <summary>Atışın süresi (ms). Kaymaların t0/t1'ini (atış başına göre) doldurur.</summary>
        public static double ShotPlan(AtisKaydi s, out double fly)
        {
            fly = FlightMs(s);
            if (s.moves.Count == 0) return fly + 700;
            double t = fly; bool dustu = false;
            foreach (var m in s.moves) { m.t0 = t; t += MoveMs(m); m.t1 = t; dustu |= m.fell; }
            return t + (dustu ? FallMs + 450 : 600);
        }

        public static double RevealMs(IList<AtisKaydi> shots)
        {
            double t = IntroMs;
            foreach (var s in shots) t += ShotPlan(s, out _);
            return t + OutroMs;
        }
    }
}
