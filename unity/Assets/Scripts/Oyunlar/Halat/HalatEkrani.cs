using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json.Linq;
using PartiLigi.UI;
using UnityEngine;
using UnityEngine.UI;

namespace PartiLigi.Oyunlar.Halat
{
    /// <summary>
    /// 🪢 Halat Çekme (kurallar: public/games/halat.js, gerçek zamanlı, iki takım). ÇEK'e ne kadar hızlı basarsan takımın o kadar güçlü çeker;
    /// bayrağı kendi tarafına geçiren kazanır. 3D: halat ekranın derinliğine uzanır (mavi önde, kırmızı arkada).
    /// </summary>
    public class HalatEkrani : GercekZamanliEkran
    {
        const float Olcek = 2.2f;                                   // p = ±1 (kazanma) → dünyada ±2,2 birim
        static readonly Color[] TakimRenk = { new Color32(0x3E, 0x8E, 0xF5, 255), new Color32(0xF2, 0x4B, 0x7A, 255) };
        static readonly string[] TakimAd = { "Mavi takım", "Kırmızı takım" };

        Sahne3D _s;
        Transform _halat, _bayrak;
        readonly Dictionary<string, (Transform t, Animation a, int takim, int sira, string anim)> _k = new Dictionary<string, (Transform, Animation, int, int, string)>();
        Text _sol, _sag, _bilgi, _orta, _uyari;
        int _taps; float _uyariBitis, _oto;

        public override string Baslik => "Halat Çekme";
        public override float ZeminSaydam => 0f;

        protected override ISim SimKur(JObject durum) => new HalatSim(durum);
        protected override JObject Girdim() => new JObject { ["taps"] = _taps };

        List<string>[] Takimlar => ((JArray)B.G?["teams"])?.Select(t => ((JArray)t).Select(x => (string)x).ToList()).ToArray();
        int Takimim { get { var t = Takimlar; return t == null ? -1 : t[0].Contains(B.Ben) ? 0 : t[1].Contains(B.Ben) ? 1 : -1; } }

        public override void Kur()
        {
            _s = new Sahne3D("HalatSahasi", new Vector3(0, 0, 900), new Color(0.55f, 0.78f, 1f),
                new Color(0.8f, 0.88f, 1f), new Color(0.65f, 0.7f, 0.65f), new Color(0.35f, 0.4f, 0.3f));
            _s.Kamera(new Vector3(0, 4.6f, -10.5f), new Vector3(0, 0.6f, 1.2f), 50);
            _s.Kutu(PrimitiveType.Cube, "Cim", new Vector3(0, -0.1f, 0), new Vector3(14, 0.2f, 22), _s.Malzeme(new Color(0.38f, 0.72f, 0.35f), 0.1f));
            _s.Kutu(PrimitiveType.Cube, "Orta", new Vector3(0, 0.01f, 0), new Vector3(6, 0.02f, 0.12f), _s.Malzeme(Color.white, 0.2f));
            for (int i = 0; i < 2; i++)
                _s.Kutu(PrimitiveType.Cube, "Cizgi" + i, new Vector3(0, 0.012f, i == 0 ? -Olcek : Olcek), new Vector3(6, 0.02f, 0.18f), _s.Malzeme(TakimRenk[i], 0.3f));
            _halat = _s.Kutu(PrimitiveType.Cylinder, "Halat", new Vector3(0, 0.95f, 0), new Vector3(0.09f, 7.5f, 0.09f), _s.Malzeme(new Color(0.78f, 0.62f, 0.38f), 0.2f)).transform;
            _halat.localRotation = Quaternion.Euler(90, 0, 0);
            _bayrak = new GameObject("Bayrak").transform; _bayrak.SetParent(_s.kok, false);
            _s.Kutu(PrimitiveType.Cylinder, "Direk", new Vector3(0, 1.6f, 0), new Vector3(0.05f, 0.65f, 0.05f), _s.Malzeme(new Color(0.9f, 0.9f, 0.9f), 0.5f), _bayrak);
            _s.Kutu(PrimitiveType.Cube, "Bez", new Vector3(0.42f, 2.05f, 0), new Vector3(0.8f, 0.5f, 0.04f), _s.Malzeme(new Color(1f, 0.85f, 0.2f), 0.3f), _bayrak);

            var t = Takimlar;
            if (t != null)
                for (int ti = 0; ti < 2; ti++)
                    for (int i = 0; i < t[ti].Count; i++)
                    {
                        var go = _s.Karakter(t[ti][i], 1.5f); if (go == null) continue;
                        var a = go.GetComponent<Animation>();
                        _k[t[ti][i]] = (go.transform, a, ti, i, null);
                    }

            var ic = Ui.Dikey(B.alan, "Icerik", 16, 40); Ui.Doldur(ic);
            OyunUi.UstSerit(ic, out _sol, out _sag, out _bilgi);
            var orta = OyunUi.Esnek(ic, "Orta");
            _orta = Ui.Yazi(orta, "", 200, Ui.Beyaz, TextAnchor.MiddleCenter, true); Ui.Doldur(_orta.rectTransform); Ui.Golge(_orta, 10);
            _uyari = Ui.Yazi(orta, "", 90, new Color32(0xFF, 0xC8, 0x4A, 255), TextAnchor.UpperCenter, true); Ui.Doldur(_uyari.rectTransform, 0, 0, 0, 40); Ui.Golge(_uyari, 6);
            // ÇEK düğmesi: basınca sayar (bırakmayı beklemez)
            var cek = Ui.Rect("Cek", ic); Ui.Yukseklik(cek, 300);
            var im = Ui.Kart(cek.gameObject, Takimim >= 0 ? TakimRenk[Takimim] : Color.gray, 0.9f);
            var yazi = Ui.Yazi(cek, "ÇEK!", 120, Ui.Beyaz, TextAnchor.MiddleCenter, true); Ui.Doldur(yazi.rectTransform); Ui.Golge(yazi, 8);
            var bd = cek.gameObject.AddComponent<BasiliDugme>();
            bd.basildi = () => { _taps++; cek.localScale = Vector3.one * 0.95f; };
            bd.birakildi = () => cek.localScale = Vector3.one;
        }

        public override void Kapat() => _s?.Birak();
        public override void Durum() { }

        protected override void Olay(JObject e)
        {
            switch ((string)e["e"])
            {
                case "go": Uyari("ÇEK!"); break;
                case "win": int w = (int?)e["team"] ?? 0; Uyari(TakimAd[w] + " kazandı!"); break;
            }
        }
        void Uyari(string m) { _uyari.text = m; _uyariBitis = Time.time + 1.6f; }

        protected override void Ciz(JObject a, JObject b, float k)
        {
            string faz = (string)b["ph"];
            float p = L(a, b, "p", k);
            float kayma = p * Olcek;
            _halat.localPosition = new Vector3(0, 0.95f, kayma);
            _bayrak.localPosition = new Vector3(0, 0, kayma);
            var hiz = ((JArray)b["r"])?.ToDictionary(x => (string)x[0], x => (float)x[1]) ?? new Dictionary<string, float>();
            int? kazanan = b["w"]?.Type == JTokenType.Integer ? (int?)b["w"] : null;
            foreach (var kv in _k.ToList())
            {
                var (tr, an, ti, sira, son) = kv.Value;
                float yon = ti == 0 ? -1 : 1;                       // mavi önde (−z), kırmızı arkada (+z)
                float z = kayma + yon * (1.4f + sira * 1.15f);
                float x = (sira % 2 == 0 ? 0.22f : -0.22f);
                tr.localPosition = new Vector3(x, 0, z);
                float yaslan = Mathf.Clamp(hiz.TryGetValue(kv.Key, out var r) ? r : 0, 0, 12) / 12f;
                tr.localRotation = Quaternion.Euler(0, ti == 0 ? 0 : 180, 0) * Quaternion.Euler(-(8 + 18 * yaslan), 0, 0);   // halata dönük, geriye yaslanmış
                string anim = kazanan == null ? (faz == "pull" ? "holding-both" : "idle") : kazanan == ti ? "emote-yes" : "emote-no";
                if (an != null && anim != son && an[anim] != null) { an.CrossFade(anim, 0.2f); if (anim.StartsWith("emote")) an[anim].wrapMode = WrapMode.Loop; _k[kv.Key] = (tr, an, ti, sira, anim); }
            }
            // arayüz
            int ben = Takimim;
            _sol.text = ben >= 0 ? TakimAd[ben] : "İzliyorsun";
            _sol.color = ben >= 0 ? TakimRenk[ben] : Ui.Beyaz;
            _sag.text = faz == "pull" ? OyunBaglami.Geri(Mathf.Max(0, 22 - ((float?)b["el"] ?? 0)) * 1000) : "";
            _bilgi.text = !string.IsNullOrEmpty(Mesaj) ? Mesaj : faz == "pull" ? $"Hızlı bas! {_taps} çekiş" : faz == "count" || faz == "wait" ? "Bayrağı kendi tarafına çek!" : "";
            _orta.text = faz == "count" ? Mathf.CeilToInt((float?)b["cd"] ?? 0).ToString() : "";
            _uyari.gameObject.SetActive(Time.time < _uyariBitis);
            // önizleme: hızlı bas
            if (B.otomatik && faz == "pull" && Time.time > _oto) { _oto = Time.time + 0.13f; _taps++; }
        }
    }
}
