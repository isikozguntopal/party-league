using System;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace PartiLigi.Oyunlar.Cizim
{
    /// <summary>
    /// Çizim tuvali (Kulaktan Kulağa + Ne Çizdim? ortak). PWA ile aynı çizgi biçimi (public/client/paint.js):
    /// {c: renk 0-11, w: kalınlık 0-4, p: [x,y,…] 0..1000 (y aşağı), t: [t0,t1] ms, f: 1 = dolu kapalı şekil}. Silgi = renk 11 (beyaz).
    /// Çizgiler 512×512 dokuya işlemcide çizilir; tekrar oynatma artımlıdır (her karede yalnızca yeni kısım).
    /// </summary>
    public class CizimTuvali : MonoBehaviour, IPointerDownHandler, IDragHandler, IPointerUpHandler
    {
        public static readonly Color32[] Palet = Hex("#111827", "#ef4444", "#f97316", "#facc15", "#22c55e", "#14b8a6", "#3b82f6", "#a855f7", "#ec4899", "#8b5a2b", "#9ca3af", "#ffffff");
        public static readonly float[] Kalinlik = { 6, 14, 28, 60, 110 };
        const int N = 512;
        const float K = N / 1000f;

        public class Darbe { public int c, w; public List<int> p = new List<int>(); public bool f; public int t0, t1; }

        public bool cizilebilir;                          // parmakla çizim açık mı
        public int renk, kalem = 1, silgi = 1;            // seçili renk; kalem kalınlığı 0-3; silgi boyutu 1-4
        public bool silgiAcik;
        public Action degisti;
        public int surum;                                 // her değişiklikte artar (canlı gönderim için)

        public readonly List<Darbe> darbeler = new List<Darbe>();
        Texture2D _doku; Color32[] _px; bool _kirli;
        RawImage _resim;
        Darbe _cizilen; float _basla = -1;
        // tekrar oynatma durumu
        List<Darbe> _oynatilan; int _oyDarbe, _oyNokta; double _oyVt;

        static Color32[] Hex(params string[] h)
        {
            var a = new Color32[h.Length];
            for (int i = 0; i < h.Length; i++) { ColorUtility.TryParseHtmlString(h[i], out var c); a[i] = c; }
            return a;
        }

        public static CizimTuvali Olustur(Transform ebeveyn, float boyut)
        {
            var rt = new GameObject("Tuval", typeof(RectTransform)).GetComponent<RectTransform>();
            rt.gameObject.layer = ebeveyn.gameObject.layer;
            rt.SetParent(ebeveyn, false); rt.sizeDelta = new Vector2(boyut, boyut);
            var le = rt.gameObject.AddComponent<LayoutElement>(); le.preferredHeight = le.minHeight = boyut; le.preferredWidth = boyut;
            var t = rt.gameObject.AddComponent<CizimTuvali>();
            t._resim = rt.gameObject.AddComponent<RawImage>();
            t._doku = new Texture2D(N, N, TextureFormat.RGBA32, false) { filterMode = FilterMode.Bilinear, wrapMode = TextureWrapMode.Clamp };
            t._px = new Color32[N * N];
            t._resim.texture = t._doku;
            t.Temizle();
            return t;
        }

        void OnDestroy() { if (_doku != null) Destroy(_doku); }

        public void Temizle()
        {
            var b = new Color32(255, 255, 255, 255);
            for (int i = 0; i < _px.Length; i++) _px[i] = b;
            _kirli = true;
        }

        void LateUpdate() { if (_kirli) { _doku.SetPixels32(_px); _doku.Apply(false); _kirli = false; } }

        // ---------- JSON ----------
        public static List<Darbe> Oku(JArray a)
        {
            var l = new List<Darbe>();
            if (a == null) return l;
            foreach (JObject s in a)
            {
                var f = s["f"];
                var d = new Darbe { c = (int?)s["c"] ?? 0, w = (int?)s["w"] ?? 1, f = f != null && (f.Type == JTokenType.Boolean ? (bool)f : f.Type == JTokenType.Integer && (int)f == 1) };
                foreach (var v in (JArray)s["p"]) d.p.Add((int)v);
                if (s["t"] is JArray t && t.Count == 2) { d.t0 = (int)t[0]; d.t1 = (int)t[1]; }
                l.Add(d);
            }
            return l;
        }

        public JArray Json()
        {
            var a = new JArray();
            foreach (var d in darbeler)
            {
                var o = new JObject { ["c"] = d.c, ["w"] = d.w, ["p"] = new JArray(d.p), ["t"] = new JArray(d.t0, d.t1) };
                if (d.f) o["f"] = 1;
                a.Add(o);
            }
            return a;
        }

        public static int Sure(List<Darbe> l) { int m = 0; foreach (var d in l) m = Math.Max(m, d.t1); return m; }

        // ---------- Çizim (raster) ----------
        void Daire(float cx, float cy, float r, Color32 c)
        {
            int x0 = Mathf.Max(0, (int)(cx - r)), x1 = Mathf.Min(N - 1, (int)(cx + r) + 1), y0 = Mathf.Max(0, (int)(cy - r)), y1 = Mathf.Min(N - 1, (int)(cy + r) + 1);
            float r2 = r * r;
            for (int y = y0; y <= y1; y++)
                for (int x = x0; x <= x1; x++)
                {
                    float dx = x + 0.5f - cx, dy = y + 0.5f - cy;
                    if (dx * dx + dy * dy <= r2) _px[(N - 1 - y) * N + x] = c;   // doku y yukarı; çizim y aşağı
                }
        }

        void Segment(float ax, float ay, float bx, float by, float r, Color32 c)
        {
            float d = Mathf.Sqrt((bx - ax) * (bx - ax) + (by - ay) * (by - ay));
            int adim = Mathf.Max(1, Mathf.CeilToInt(d / Mathf.Max(0.8f, r * 0.45f)));
            for (int i = 0; i <= adim; i++) { float u = (float)i / adim; Daire(ax + (bx - ax) * u, ay + (by - ay) * u, r, c); }
            _kirli = true;
        }

        // nokta aralığını çiz: [bas, son) nokta indeksleri (bas>0 ise önceki noktadan bağlanır)
        void Cizgi(Darbe d, int bas, int son)
        {
            var c = Palet[Mathf.Clamp(d.c, 0, 11)];
            float r = Mathf.Max(1f, Kalinlik[Mathf.Clamp(d.w, 0, 4)] * K / 2);
            int n = d.p.Count / 2;
            if (n == 1 && bas == 0) { Daire(d.p[0] * K, d.p[1] * K, r, c); _kirli = true; return; }
            for (int i = Mathf.Max(1, bas); i < Mathf.Min(son, n); i++)
                Segment(d.p[(i - 1) * 2] * K, d.p[(i - 1) * 2 + 1] * K, d.p[i * 2] * K, d.p[i * 2 + 1] * K, r, c);
        }

        // dolu kapalı şekil (çift-tek kuralı, tarama çizgisi)
        void Dolgu(Darbe d)
        {
            int n = d.p.Count / 2; if (n < 3) return;
            var c = Palet[Mathf.Clamp(d.c, 0, 11)];
            var kes = new List<float>();
            for (int y = 0; y < N; y++)
            {
                float sy = y + 0.5f; kes.Clear();
                for (int i = 0; i < n; i++)
                {
                    float ax = d.p[i * 2] * K, ay = d.p[i * 2 + 1] * K, bx = d.p[(i + 1) % n * 2] * K, by = d.p[(i + 1) % n * 2 + 1] * K;
                    if ((ay <= sy && by > sy) || (by <= sy && ay > sy)) kes.Add(ax + (sy - ay) / (by - ay) * (bx - ax));
                }
                kes.Sort();
                for (int k = 0; k + 1 < kes.Count; k += 2)
                    for (int x = Mathf.Max(0, Mathf.CeilToInt(kes[k] - 0.5f)); x <= Mathf.Min(N - 1, Mathf.FloorToInt(kes[k + 1] - 0.5f)); x++) _px[(N - 1 - y) * N + x] = c;
            }
            if (d.w > 0) Cizgi(new Darbe { c = d.c, w = d.w, p = new List<int>(d.p) { d.p[0], d.p[1] } }, 0, n + 1);
            _kirli = true;
        }

        void Tam(Darbe d) { if (d.f) Dolgu(d); else Cizgi(d, 0, d.p.Count / 2); }

        /// <summary>Çizimin tamamını göster.</summary>
        public void Goster(List<Darbe> l)
        {
            _oynatilan = null; Temizle();
            foreach (var d in l) Tam(d);
        }

        /// <summary>Tekrar oynatma: vt (ms) anına kadar çizilmiş kısmı göster. vt geri giderse baştan çizer.</summary>
        public void Oynat(List<Darbe> l, double vt)
        {
            if (_oynatilan != l || vt < _oyVt) { _oynatilan = l; _oyDarbe = 0; _oyNokta = 0; Temizle(); }
            _oyVt = vt;
            while (_oyDarbe < l.Count)
            {
                var d = l[_oyDarbe]; int n = d.p.Count / 2;
                if (vt < d.t0) break;
                if (d.f) { Dolgu(d); _oyDarbe++; _oyNokta = 0; continue; }
                int hedef = vt >= d.t1 ? n : Mathf.Clamp(Mathf.FloorToInt(n * (float)((vt - d.t0) / Mathf.Max(1, d.t1 - d.t0))), 1, n);
                if (hedef > _oyNokta) { Cizgi(d, _oyNokta, hedef); _oyNokta = hedef; }
                if (hedef < n) break;
                _oyDarbe++; _oyNokta = 0;
            }
        }

        // ---------- Parmakla çizim ----------
        bool Konum(PointerEventData e, out int x, out int y)
        {
            x = y = 0;
            var rt = (RectTransform)transform;
            if (!RectTransformUtility.ScreenPointToLocalPointInRectangle(rt, e.position, e.pressEventCamera, out var p)) return false;
            var r = rt.rect;
            x = Mathf.RoundToInt(Mathf.Clamp01((p.x - r.xMin) / r.width) * 1000);
            y = Mathf.RoundToInt((1 - Mathf.Clamp01((p.y - r.yMin) / r.height)) * 1000);
            return true;
        }

        int Simdi() { if (_basla < 0) _basla = Time.realtimeSinceStartup; return Mathf.RoundToInt((Time.realtimeSinceStartup - _basla) * 1000); }

        public void OnPointerDown(PointerEventData e)
        {
            if (!cizilebilir || !Konum(e, out var x, out var y)) return;
            int t = Simdi();
            _cizilen = new Darbe { c = silgiAcik ? 11 : renk, w = silgiAcik ? silgi : kalem, t0 = t, t1 = t };
            _cizilen.p.Add(x); _cizilen.p.Add(y);
            darbeler.Add(_cizilen); surum++;
            Cizgi(_cizilen, 0, 1);
        }

        public void OnDrag(PointerEventData e)
        {
            if (_cizilen == null || !Konum(e, out var x, out var y)) return;
            int n = _cizilen.p.Count / 2;
            int lx = _cizilen.p[(n - 1) * 2], ly = _cizilen.p[(n - 1) * 2 + 1];
            if ((x - lx) * (x - lx) + (y - ly) * (y - ly) < 36) return;     // 6 birimden kısa adımı atla (sunucu nokta sınırı)
            _cizilen.p.Add(x); _cizilen.p.Add(y); _cizilen.t1 = Simdi(); surum++;
            Cizgi(_cizilen, n, n + 1);
        }

        public void OnPointerUp(PointerEventData e) { if (_cizilen != null) { _cizilen = null; degisti?.Invoke(); } }

        public void GeriAl() { if (darbeler.Count == 0) return; darbeler.RemoveAt(darbeler.Count - 1); surum++; Goster(new List<Darbe>(darbeler)); degisti?.Invoke(); }
        public void HepsiniSil() { darbeler.Clear(); surum++; Temizle(); _basla = -1; degisti?.Invoke(); }
        public int NoktaSayisi { get { int n = 0; foreach (var d in darbeler) n += d.p.Count; return n; } }
    }
}
