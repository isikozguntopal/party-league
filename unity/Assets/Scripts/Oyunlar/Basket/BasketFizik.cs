using System;
using System.Collections.Generic;

namespace PartiLigi.Oyunlar.Basket
{
    /// <summary>Pota Atışı fiziği: public/games/basket.js'in birebir kopyası (birim ≈ metre, y yukarı). Sunucu yalnızca sonucu sınırlarla doğrular.</summary>
    public static class BasketFizik
    {
        public const float W = 9, H = 16, G = 24, BallR = 0.34f, RimHalf = 0.78f, RimR = 0.09f, BoardGap = 0.28f;
        public const float MaxDrag = 3.0f, MinDrag = 0.55f, Power = 10.2f;
        public const int BasePts = 2, SwishBonus = 1, MaxMult = 5;
        public const int CountMs = 3000, PlayMs = 45000;

        public class Top { public float x, y, vx, vy, age, prevY; public bool live, touched, scored; public int bounces; }
        public class Skor { public int score, made, shots, streak, best, swishes; }

        /// <summary>Potanın t (sn, oyun başından) anındaki merkezi. basket.js ile aynı plan, ama 18. sn'deki geçiş yumuşak:
        /// JS'te salınımın hızı/genliği o an birden değişip pota sıçrıyordu; burada faz sürekli, hız ve genlik 3 sn'de kademeli artar.
        /// (Sunucu pota konumunu doğrulamaz; yalnızca istemci fiziği/görüntüsü.)</summary>
        public static (float x, float y) HoopAt(float t)
        {
            t = t * (30000f / PlayMs);
            const float x0 = 7.6f, y0 = 9.0f, gecis = 3f;
            if (t < 8) return (x0, y0);
            float k = Math.Min(1, (t - 8) / 4);
            if (t < 18) return (x0, y0 + (float)Math.Sin((t - 8) * 1.5) * 1.5f * k);
            float tau = t - 18, r = Math.Min(1, tau / gecis);
            // açısal hız 1,5 → 1,9 doğrusal artar; faz = hızın integrali (sürekli)
            float faz = 15f + (tau < gecis ? 1.5f * tau + 0.4f * tau * tau / (2 * gecis) : 1.5f * gecis + 0.4f * gecis / 2 + 1.9f * (tau - gecis));
            float genlik = 1.5f + 0.5f * r;
            float y = y0 + (float)Math.Sin(faz) * genlik;
            float x = x0 - (0.5f - 0.5f * (float)Math.Cos(tau * 1.25)) * 1.7f * r;
            return (x, y);
        }

        /// <summary>Çekiş vektörü (parmak − top): top çekişin tersine gider. Çok kısa çekişte null.</summary>
        public static (float vx, float vy)? LaunchVel(float dx, float dy)
        {
            float len = (float)Math.Sqrt(dx * dx + dy * dy);
            if (len < MinDrag) return null;
            float k = Math.Min(len, MaxDrag) / len;
            return (-dx * k * Power, -dy * k * Power);
        }

        public static (float x, float y) RandomSpawn(Random r) => (0.85f + (float)r.NextDouble() * 1.5f, 1.7f + (float)r.NextDouble() * 3.2f);

        public static void Fire(Top b, float vx, float vy, float sx, float sy)
        {
            b.x = sx; b.y = sy; b.vx = vx; b.vy = vy; b.live = true; b.touched = false; b.scored = false; b.bounces = 0; b.age = 0; b.prevY = sy;
        }

        /// <summary>Topu dt kadar ilerlet. Olaylar: rim, board, floor, score, swish, miss.</summary>
        public static List<string> StepBall(Top b, float dt, float t)
        {
            var ev = new List<string>();
            if (!b.live) return ev;
            var h = HoopAt(t); var hp = HoopAt(Math.Max(0, t - dt));
            const int SUB = 4; float d = dt / SUB;
            for (int i = 0; i < SUB && b.live; i++)
            {
                b.prevY = b.y;
                b.vy -= G * d; b.x += b.vx * d; b.y += b.vy * d; b.age += d;
                Carp(b, h.x - RimHalf, h.y, RimR, 0.62f, ev);
                Carp(b, h.x + RimHalf, h.y, RimR, 0.62f, ev);
                float bx = h.x + RimHalf + BoardGap;
                if (b.y > h.y - 0.35f && b.y < h.y + 2.0f && b.x + BallR > bx && b.vx > 0) { b.x = bx - BallR; b.vx = -b.vx * 0.5f; b.touched = true; ev.Add("board"); }
                if (!b.scored && b.vy < 0 && b.prevY >= Math.Min(h.y, hp.y) - 0.02f && b.y < h.y + 0.02f && b.prevY > b.y && Math.Abs(b.x - h.x) < RimHalf - 0.05f)
                {
                    b.scored = true; ev.Add("score"); if (!b.touched) ev.Add("swish");
                }
                if (b.y - BallR < 0) { b.y = BallR; b.vy = -b.vy * 0.45f; b.vx *= 0.8f; b.bounces++; ev.Add("floor"); if (b.bounces >= 2) { b.live = false; if (!b.scored) ev.Add("miss"); } }
                if (b.x < -1 || b.x > W + 1.5f || b.age > 5) { b.live = false; if (!b.scored) ev.Add("miss"); }
                if (b.scored && b.y < h.y - 2.2f) b.live = false;
            }
            return ev;
        }

        static void Carp(Top b, float cx, float cy, float r, float rest, List<string> ev)
        {
            float dx = b.x - cx, dy = b.y - cy, dist = (float)Math.Sqrt(dx * dx + dy * dy), min = BallR + r;
            if (dist >= min || dist == 0) return;
            float nx = dx / dist, ny = dy / dist;
            b.x = cx + nx * min; b.y = cy + ny * min;
            float vn = b.vx * nx + b.vy * ny;
            if (vn < 0) { b.vx -= (1 + rest) * vn * nx; b.vy -= (1 + rest) * vn * ny; }
            b.touched = true; ev.Add("rim");
        }

        public static int Multiplier(int streak) => Math.Min(MaxMult, Math.Max(1, streak));
        public static int AwardMake(Skor s, bool swish)
        {
            s.streak++; s.made++; s.best = Math.Max(s.best, s.streak); if (swish) s.swishes++;
            int pts = (BasePts + (swish ? SwishBonus : 0)) * Multiplier(s.streak);
            s.score += pts; return pts;
        }
        public static void AwardMiss(Skor s) => s.streak = 0;
    }
}
