using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using PartiLigi.UI;
using UnityEngine;
using UnityEngine.UI;
using F = PartiLigi.Oyunlar.Basket.BasketFizik;

namespace PartiLigi.Oyunlar.Basket
{
    /// <summary>
    /// 🏀 Pota Atışı (kurallar: public/games/basket.js). Herkes kendi ekranında 45 sn atar; topu geri çek-bırak.
    /// Fizik istemcide (BasketFizik, 2D: x sağa, y yukarı). Görüntü 3D: fizik düzlemi sahnenin z=0 düzlemi, oyuncunun
    /// karakteri topu elinden atar; çember ve panya fizikteki ölçülerle birebir çizilir.
    /// </summary>
    public class BasketEkrani : OyunEkrani
    {
        enum Faz { Bekle, Hazir, Sayim, Oyun, Gonderildi, Acilis, Bitti }
        const float Boy = 1.8f, ElY = 1.15f;                       // karakter boyu; ayaktan topun merkezine yükseklik

        Text _sol, _sag, _bilgi, _orta, _skorYazi, _uyari;
        RectTransform _tablo; Button _basla;
        Sahne3D _s;
        Transform _pota, _top, _karakter, _kasa, _aski;
        Animation _anim;
        readonly List<Transform> _nokta = new List<Transform>();
        double _oyunBas = -1;
        readonly F.Top _b = new F.Top();
        readonly F.Skor _skor = new F.Skor();
        (float x, float y) _cikis;
        float _yeniTop = 0.2f, _uyariBitis, _oto;
        bool _cekiyor, _gonderildi;
        Vector2 _parmak;
        readonly System.Random _r = new System.Random();
        string _tabloAnahtar;
        Faz _faz;

        public override string Baslik => "Pota Atışı";
        public override float ZeminSaydam => 0f;

        public override void Kur()
        {
            SahneKur();
            // dokunma alanı (arayüzün en altında, düğmeler üstte kalır)
            var dok = Ui.Rect("Dokunma", B.alan); Ui.Doldur(dok);
            dok.gameObject.AddComponent<Image>().color = new Color(0, 0, 0, 0.001f);
            var alan = dok.gameObject.AddComponent<SurukleAlan>();
            alan.ekranda = p => { if (_faz == Faz.Oyun && !_b.live && Duzlem(p, out var w)) { _cekiyor = true; _parmak = w; } };
            alan.birakildi = Birak;

            var ic = Ui.Dikey(B.alan, "Icerik", 16, 40); Ui.Doldur(ic);
            OyunUi.UstSerit(ic, out _sol, out _sag, out _bilgi);
            var kap = OyunUi.Esnek(ic, "Orta");
            _skorYazi = Ui.Yazi(kap, "", 90, Ui.Beyaz, TextAnchor.UpperLeft, true); Ui.Doldur(_skorYazi.rectTransform, 30, 0, 0, 10); _skorYazi.raycastTarget = false; Ui.Golge(_skorYazi, 5);
            _uyari = Ui.Yazi(kap, "", 76, new Color32(0xFF, 0xC8, 0x4A, 255), TextAnchor.MiddleCenter, true); Ui.Doldur(_uyari.rectTransform, 0, 300, 0, 300); Ui.Golge(_uyari, 6);
            _orta = Ui.Yazi(kap, "", 180, Ui.Beyaz, TextAnchor.MiddleCenter, true); Ui.Doldur(_orta.rectTransform); Ui.Golge(_orta, 10);
            _tablo = Ui.Dikey(kap, "Tablo", 12, 20, TextAnchor.UpperCenter); Ui.Doldur(_tablo, 0, 0, 0, 40);
            foreach (var t in new[] { _skorYazi, _uyari, _orta }) t.raycastTarget = false;
            _basla = Ui.Dugme(ic, "Başla", "menu_pembe", 64);
            _basla.onClick.AddListener(Baslat);
            YeniTop();
        }

        // ---------- 3D salon ----------
        void SahneKur()
        {
            _s = new Sahne3D("PotaSalonu", new Vector3(0, 0, 700), new Color(0.07f, 0.08f, 0.18f),
                new Color(0.75f, 0.78f, 0.9f), new Color(0.55f, 0.52f, 0.55f), new Color(0.35f, 0.3f, 0.28f));
            _s.Kamera(new Vector3(3.9f, 8.0f, -17.6f), new Vector3(4.6f, 7.4f, 0), 50);
            var parke = _s.Malzeme(new Color(0.8f, 0.55f, 0.32f), 0.6f);
            _s.Kutu(PrimitiveType.Cube, "Parke", new Vector3(4.5f, -0.1f, 3), new Vector3(16, 0.2f, 12), parke);
            _s.Kutu(PrimitiveType.Cube, "Duvar", new Vector3(4.5f, 10, 6.5f), new Vector3(40, 30, 0.2f), _s.Malzeme(new Color(0.16f, 0.18f, 0.38f), 0.2f));
            _s.Kutu(PrimitiveType.Cube, "Serit", new Vector3(4.5f, 12.5f, 6.35f), new Vector3(40, 0.5f, 0.05f), _s.Malzeme(new Color(0.95f, 0.3f, 0.5f), 0.4f));
            var cizgi = _s.Malzeme(Color.white, 0.4f);
            _s.Kutu(PrimitiveType.Cube, "Cizgi", new Vector3(4.5f, 0.005f, -0.6f), new Vector3(16, 0.012f, 0.08f), cizgi);
            _s.Kutu(PrimitiveType.Cube, "Cizgi2", new Vector3(5.3f, 0.005f, 1.5f), new Vector3(0.08f, 0.012f, 4.2f), cizgi);
            foreach (var (k, g) in new[] { (new Vector3(2, 15, -4), 60f), (new Vector3(8, 15, -2), 50f) })
            {
                var l = new GameObject("Lamba", typeof(Light)).GetComponent<Light>(); l.transform.SetParent(_s.kok, false); l.transform.localPosition = k;
                l.type = LightType.Point; l.range = 30; l.intensity = g; l.color = new Color(1f, 0.95f, 0.85f);
            }

            // pota: çember (fizikteki iki topuzun arasından geçen halka), file, panya, askı
            _pota = new GameObject("Pota").transform; _pota.SetParent(_s.kok, false);
            var turuncu = _s.Malzeme(new Color(1f, 0.36f, 0.12f), 0.5f, 0.3f);
            const int parca = 20;
            for (int i = 0; i < parca; i++)
            {
                float a0 = i * Mathf.PI * 2 / parca, a1 = (i + 1) * Mathf.PI * 2 / parca;
                var p0 = new Vector3(Mathf.Cos(a0) * F.RimHalf, 0, Mathf.Sin(a0) * F.RimHalf); var p1 = new Vector3(Mathf.Cos(a1) * F.RimHalf, 0, Mathf.Sin(a1) * F.RimHalf);
                var c = _s.Kutu(PrimitiveType.Cylinder, "Cember", (p0 + p1) / 2, new Vector3(F.RimR * 1.6f, (p1 - p0).magnitude / 2 + 0.02f, F.RimR * 1.6f), turuncu, _pota);
                c.transform.localRotation = Quaternion.FromToRotation(Vector3.up, p1 - p0);
            }
            var file = _s.Malzeme(new Color(1, 1, 1, 1), 0.2f);
            for (int i = 0; i < 12; i++)
            {
                float a = i * Mathf.PI * 2 / 12;
                var ust = new Vector3(Mathf.Cos(a) * F.RimHalf * 0.95f, -0.03f, Mathf.Sin(a) * F.RimHalf * 0.95f);
                var alt = new Vector3(Mathf.Cos(a + 0.4f) * 0.42f, -0.85f, Mathf.Sin(a + 0.4f) * 0.42f);
                var ip = _s.Kutu(PrimitiveType.Cylinder, "File", (ust + alt) / 2, new Vector3(0.025f, (alt - ust).magnitude / 2, 0.025f), file, _pota);
                ip.transform.localRotation = Quaternion.FromToRotation(Vector3.up, alt - ust);
            }
            float bx = F.RimHalf + F.BoardGap + 0.05f;
            _s.Kutu(PrimitiveType.Cube, "Panya", new Vector3(bx, 0.82f, 0), new Vector3(0.1f, 2.35f, 1.9f), _s.Malzeme(new Color(0.95f, 0.97f, 1f), 0.8f), _pota);
            var kirmizi = _s.Malzeme(new Color(0.9f, 0.15f, 0.2f), 0.4f);
            foreach (var (k, o) in new[] { (new Vector3(bx - 0.06f, 0.15f, 0), new Vector3(0.02f, 0.05f, 0.75f)), (new Vector3(bx - 0.06f, 0.75f, 0), new Vector3(0.02f, 0.05f, 0.75f)), (new Vector3(bx - 0.06f, 0.45f, -0.35f), new Vector3(0.02f, 0.65f, 0.05f)), (new Vector3(bx - 0.06f, 0.45f, 0.35f), new Vector3(0.02f, 0.65f, 0.05f)) })
                _s.Kutu(PrimitiveType.Cube, "Kare", k, o, kirmizi, _pota);
            _s.Kutu(PrimitiveType.Cube, "Baglanti", new Vector3(F.RimHalf + 0.15f, 0.02f, 0), new Vector3(0.3f, 0.06f, 0.12f), turuncu, _pota);
            _aski = _s.Kutu(PrimitiveType.Cylinder, "Aski", Vector3.zero, Vector3.one, _s.Malzeme(new Color(0.3f, 0.3f, 0.35f), 0.6f, 0.8f)).transform;

            // top: turuncu küre + iki siyah dikiş (küreden biraz taşan ince diskler)
            _top = _s.Kutu(PrimitiveType.Sphere, "Top", Vector3.zero, Vector3.one * F.BallR * 2, _s.Malzeme(new Color(0.95f, 0.48f, 0.12f), 0.35f)).transform;
            var dikis = _s.Malzeme(new Color(0.08f, 0.05f, 0.04f), 0.2f);
            _s.Kutu(PrimitiveType.Cylinder, "Dikis", Vector3.zero, new Vector3(1.02f, 0.012f, 1.02f), dikis, _top);
            _s.Kutu(PrimitiveType.Cylinder, "Dikis", Vector3.zero, new Vector3(1.02f, 0.012f, 1.02f), dikis, _top).transform.localRotation = Quaternion.Euler(90, 0, 0);

            // nişan noktaları
            var beyaz = _s.Malzeme(new Color(1, 1, 1), 0.2f);
            for (int i = 0; i < 16; i++) { var n = _s.Kutu(PrimitiveType.Sphere, "Nokta", Vector3.zero, Vector3.one * 0.13f, beyaz).transform; n.gameObject.SetActive(false); _nokta.Add(n); }

            // karakter + altındaki kasa (top her seferinde farklı yükseklikten çıkar)
            _kasa = _s.Kutu(PrimitiveType.Cube, "Kasa", Vector3.zero, Vector3.one, _s.Malzeme(new Color(0.62f, 0.42f, 0.24f), 0.2f)).transform;
            var kg = _s.Karakter(B.Ben, Boy);
            if (kg != null) { _karakter = kg.transform; _karakter.localRotation = Quaternion.Euler(0, 90, 0); _anim = kg.GetComponent<Animation>(); if (_anim != null && _anim["idle"] != null) _anim.Play("idle"); }
        }

        public override void Kapat() { _s?.Birak(); }

        bool Duzlem(Vector2 ekran, out Vector2 dunya)
        {
            dunya = default;
            var isin = _s.kam.ScreenPointToRay(ekran);
            var d = new Plane(_s.kok.forward, _s.kok.position);
            if (!d.Raycast(isin, out var m)) return false;
            var y = _s.kok.InverseTransformPoint(isin.GetPoint(m)); dunya = new Vector2(y.x, y.y);
            return true;
        }

        public override void Durum() { }

        Faz FazHesapla(double simdi)
        {
            if (B.AcilisSuruyor(out _)) return Faz.Acilis;
            if (!B.Oynaniyor) return Faz.Bitti;
            if (_gonderildi || B.durum["myAction"] is JObject) return Faz.Gonderildi;
            if (simdi < B.TurBasi) return Faz.Bekle;
            if (_oyunBas < 0) return Faz.Hazir;
            if (simdi < _oyunBas) return Faz.Sayim;
            return Faz.Oyun;
        }

        void Baslat() { if (_oyunBas < 0) _oyunBas = B.Simdi + F.CountMs; }

        public override void Kare()
        {
            var simdi = B.Simdi;
            _faz = FazHesapla(simdi);
            _tablo.gameObject.SetActive(_faz == Faz.Acilis);
            _basla.gameObject.SetActive(_faz == Faz.Hazir && B.BenCanliyim);
            _sol.transform.parent.gameObject.SetActive(_faz != Faz.Bitti);
            _sol.text = "Pota Atışı"; _sag.text = ""; _orta.text = "";
            _skorYazi.text = _faz == Faz.Oyun || _faz == Faz.Sayim ? _skor.score.ToString() : "";
            float t = 0;
            switch (_faz)
            {
                case Faz.Bekle: _bilgi.text = "Topu geri çek, bırak. 45 saniye!"; _orta.text = OyunBaglami.Geri(B.TurBasi - simdi); break;
                case Faz.Hazir: _bilgi.text = "Hazır olunca Başla'ya bas"; break;
                case Faz.Sayim: _bilgi.text = "Hazır ol…"; _orta.text = OyunBaglami.Geri(_oyunBas - simdi); break;
                case Faz.Oyun:
                    t = (float)((simdi - _oyunBas) / 1000.0);
                    _sag.text = OyunBaglami.Geri(F.PlayMs - (simdi - _oyunBas));
                    _bilgi.text = _skor.streak >= 2 ? $"Kombo ×{F.Multiplier(_skor.streak)}!" : "Topu geri çek, bırak";
                    if (t * 1000 >= F.PlayMs) { Gonder(); break; }
                    Simule(t); Otomatik(t);
                    break;
                case Faz.Gonderildi: _bilgi.text = "Diğerleri atıyor…"; _orta.text = _skor.score.ToString(); break;
                case Faz.Acilis: _bilgi.text = "Sonuçlar"; TabloCiz(); break;
                default: _bilgi.text = ""; break;
            }
            Ciz(t);
            _uyari.gameObject.SetActive(Time.time < _uyariBitis);
            if (_faz == Faz.Hazir && B.otomatik) Baslat();
        }

        void YeniTop() { _cikis = F.RandomSpawn(_r); _b.x = _cikis.x; _b.y = _cikis.y; }

        void Simule(float t)
        {
            float dt = Mathf.Min(Time.deltaTime, 0.05f);
            if (!_b.live) { _yeniTop -= dt; return; }
            foreach (var e in F.StepBall(_b, dt, t))
            {
                if (e == "score") { bool temiz = !_b.touched; int p = F.AwardMake(_skor, temiz); Uyari((temiz ? "Temiz! " : "") + "+" + p + (_skor.streak >= 2 ? $"  ×{F.Multiplier(_skor.streak)}" : "")); }
                if (e == "miss") F.AwardMiss(_skor);
            }
            if (!_b.live) { _yeniTop = 0.45f; YeniTop(); }
        }

        bool TopHazir => !_b.live && _yeniTop <= 0;

        void Birak()
        {
            if (!_cekiyor || _faz != Faz.Oyun || !TopHazir) { _cekiyor = false; return; }
            _cekiyor = false;
            var v = F.LaunchVel(_parmak.x - _cikis.x, _parmak.y - _cikis.y);
            if (v == null) return;
            Firlat(v.Value.vx, v.Value.vy);
        }

        void Firlat(float vx, float vy)
        {
            F.Fire(_b, vx, vy, _cikis.x, _cikis.y); _skor.shots++;
            if (_anim != null && _anim["attack-melee-right"] != null) { _anim.CrossFade("attack-melee-right", 0.05f); if (_anim["idle"] != null) _anim.CrossFadeQueued("idle", 0.2f); }
        }

        void Ciz(float t)
        {
            var h = F.HoopAt(t);
            _pota.localPosition = new Vector3(h.x, h.y, 0);
            float tavan = 17f, ustY = h.y + 2.0f;
            _aski.localPosition = new Vector3(h.x + F.RimHalf + F.BoardGap + 0.05f, (ustY + tavan) / 2, 0); _aski.localScale = new Vector3(0.08f, (tavan - ustY) / 2, 0.08f);

            // top: uçuyorsa fizikteki yerde ve döner; değilse karakterin elinde
            bool elde = !_b.live;
            float bx = elde ? _cikis.x : _b.x, by = elde ? _cikis.y : _b.y;
            _top.gameObject.SetActive(!elde || _yeniTop <= 0 || _faz != Faz.Oyun);
            _top.localPosition = new Vector3(bx, by, 0);
            if (!elde) _top.Rotate(0, 0, -_b.vx * Time.deltaTime * 120f / Mathf.PI, Space.Self);

            // karakter: topun hemen solunda, kasanın üstünde
            float ayak = Mathf.Max(0, _cikis.y - ElY);
            var kasaY = Mathf.Lerp(_kasa.localScale.y, Mathf.Max(0.01f, ayak), 0.2f);
            _kasa.localScale = new Vector3(1.1f, kasaY, 1.1f); _kasa.localPosition = new Vector3(_cikis.x - 0.45f, kasaY / 2, 0.15f);
            if (_karakter != null) _karakter.localPosition = new Vector3(_cikis.x - 0.45f, kasaY, 0.15f);

            var v = _cekiyor ? F.LaunchVel(_parmak.x - _cikis.x, _parmak.y - _cikis.y) : null;
            for (int i = 0; i < _nokta.Count; i++)
            {
                bool gor = v != null; _nokta[i].gameObject.SetActive(gor);
                if (!gor) continue;
                float tt = (i + 1) * 0.05f;
                _nokta[i].localPosition = new Vector3(_cikis.x + v.Value.vx * tt, _cikis.y + v.Value.vy * tt - 0.5f * F.G * tt * tt, 0);
            }
        }

        void Uyari(string m) { _uyari.text = m; _uyariBitis = Time.time + 1f; }

        void Gonder()
        {
            if (_gonderildi) return;
            _gonderildi = true;
            B.Gonder("act", new JObject { ["score"] = _skor.score, ["made"] = _skor.made, ["shots"] = _skor.shots, ["best"] = _skor.best });
        }

        void TabloCiz()
        {
            var anahtar = B.Son["round"]?.ToString();
            if (_tabloAnahtar == anahtar) return;
            _tabloAnahtar = anahtar;
            foreach (Transform c in _tablo) Object.Destroy(c.gameObject);
            int i = 0;
            foreach (JObject r in (JArray)B.Son["rows"])
                OyunUi.OyuncuSatiri(_tablo, B, (string)r["id"], $"{(int)r["score"]} puan · {(int)r["made"]}/{(int)r["shots"]} · en iyi ×{(int)r["best"]}", i++ == 0 ? (Color?)new Color32(0xFF, 0xB8, 0x30, 230) : null, 100);
        }

        // Önizleme: potaya kabaca nişan alıp at
        void Otomatik(float t)
        {
            if (!B.otomatik || !TopHazir || Time.time < _oto) return;
            _oto = Time.time + 1.1f;
            var h = F.HoopAt(t + 0.55f);
            float vt = 0.55f, vx = (h.x - _cikis.x) / vt, vy = (h.y + 0.6f - _cikis.y) / vt + 0.5f * F.G * vt;
            Firlat(vx * Random.Range(0.95f, 1.04f), vy);
        }
    }
}
