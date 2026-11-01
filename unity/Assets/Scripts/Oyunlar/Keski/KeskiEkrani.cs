using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json.Linq;
using PartiLigi.UI;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace PartiLigi.Oyunlar.Keski
{
    /// <summary>
    /// 🗿 Keski Düellosu (kurallar: public/games/keski.js). 3×3×3 taş küpün eksik parçalı hali gösterilir (ezberle),
    /// sonra kendi küpünü dokunarak yontarsın (sürükle = döndür, dokun = kır). Aynısını yapamayan elenir.
    /// Küp, menü sahnesinin kamerasına bağlı olarak önde süzülür. İndeks: x + y·3 + z·9 (y yukarı).
    /// </summary>
    public class KeskiEkrani : OyunEkrani
    {
        const int N = 3, Merkez = 13;
        Text _sol, _sag, _bilgi, _alt;
        Button _ana, _geri; Text _anaYazi;
        RectTransform _tablo;
        Transform _kok, _kup;
        readonly GameObject[] _parca = new GameObject[27];
        readonly List<int> _kirdim = new List<int>();
        Material _tas, _tasKoyu;
        string _anahtar; int _gonderilenTur = -1, _okTur = -1;
        Vector2 _basla; bool _surukle; Vector2 _donus = new Vector2(-25, 35);
        float _oto = -1;

        public override string Baslik => "Keski Düellosu";
        public override float ZeminSaydam => 0.25f;

        public override void Kur()
        {
            var ic = Ui.Dikey(B.alan, "Icerik", 20, 60); Ui.Doldur(ic);
            OyunUi.UstSerit(ic, out _sol, out _sag, out _bilgi);
            OyunUi.Esnek(ic, "KupAlani");
            _tablo = Ui.Dikey(ic, "Tablo", 10, 0); Ui.Yukseklik(_tablo, 0);
            _alt = Ui.Yazi(ic, "", 40, Ui.Beyaz, TextAnchor.MiddleCenter, true); Ui.Yukseklik(_alt, 70); Ui.Golge(_alt, 3, 0.8f);
            var satir = Ui.Yatay(ic, "Dugmeler", 24); Ui.Yukseklik(satir, 170);
            _geri = Ui.Dugme(satir, "Geri al", "menu_gri", 50); _geri.GetComponent<LayoutElement>().flexibleWidth = 0.6f;
            _ana = Ui.Dugme(satir, "Bitti", "menu_pembe", 60); _ana.GetComponent<LayoutElement>().flexibleWidth = 1;
            _anaYazi = _ana.GetComponentInChildren<Text>();
            _geri.onClick.AddListener(() => { if (_kirdim.Count > 0) { var i = _kirdim[_kirdim.Count - 1]; _kirdim.RemoveAt(_kirdim.Count - 1); _parca[i].SetActive(true); } });
            _ana.onClick.AddListener(AnaDugme);
            KupKur();
        }

        void KupKur()
        {
            var kam = Camera.main;
            _kok = new GameObject("KeskiKup").transform; _kok.SetParent(kam.transform, false); _kok.localPosition = new Vector3(0, 0.25f, 11f); _kok.localScale = Vector3.one * 0.8f;
            _kup = new GameObject("Kup").transform; _kup.SetParent(_kok, false);
            // menünün mor sahne ışığında taş kararır: küpün kendi sıcak ışıkları
            foreach (var (konum, guc) in new[] { (new Vector3(-3, 4, -4), 18f), (new Vector3(4, -1, -3), 8f) })
            {
                var l = new GameObject("KupIsik", typeof(Light)).GetComponent<Light>(); l.transform.SetParent(_kok, false); l.transform.localPosition = konum;
                l.type = LightType.Point; l.range = 14; l.intensity = guc; l.color = new Color(1f, 0.95f, 0.85f);
            }
            var sh = Shader.Find("Universal Render Pipeline/Lit");
            _tas = new Material(sh); _tas.SetColor("_BaseColor", new Color(0.95f, 0.9f, 0.82f)); _tas.SetFloat("_Smoothness", 0.15f);
            _tasKoyu = new Material(sh); _tasKoyu.SetColor("_BaseColor", new Color(0.82f, 0.74f, 0.64f)); _tasKoyu.SetFloat("_Smoothness", 0.1f);
            for (int i = 0; i < 27; i++)
            {
                if (i == Merkez) continue;
                int x = i % N, y = i / N % N, z = i / (N * N);
                var c = GameObject.CreatePrimitive(PrimitiveType.Cube); c.name = "Parca" + i;
                c.transform.SetParent(_kup, false); c.transform.localPosition = new Vector3(x - 1, y - 1, z - 1) * 1.02f; c.transform.localScale = Vector3.one * 0.96f;
                c.GetComponent<Renderer>().sharedMaterial = (x + y + z) % 2 == 0 ? _tas : _tasKoyu;
                _parca[i] = c;
            }
        }

        public override void Kapat()
        {
            if (_kok != null) Object.Destroy(_kok.gameObject);
            if (_tas != null) { Object.Destroy(_tas); Object.Destroy(_tasKoyu); }
        }

        public override void Durum() { }
        JArray Hedef => B.G?["target"] as JArray;
        double GosterimSonu => (double?)B.G?["showEnd"] ?? 0;

        void Goster(IEnumerable<int> eksik)
        {
            var e = new HashSet<int>(eksik);
            for (int i = 0; i < 27; i++) if (_parca[i] != null) _parca[i].SetActive(!e.Contains(i));
        }

        void AnaDugme()
        {
            var simdi = B.Simdi;
            if (B.Tur == 1 && simdi < GosterimSonu && _okTur != B.Tur) { _okTur = B.Tur; B.Gonder("gact", new JObject { ["t"] = "ok" }); return; }
            if (simdi >= GosterimSonu - 500 && B.BenCanliyim)
            {
                _gonderilenTur = B.Tur;
                B.Gonder("act", new JObject { ["removed"] = new JArray(_kirdim.OrderBy(i => i)) });
            }
        }

        public override void Kare()
        {
            var simdi = B.Simdi;
            bool acilis = B.AcilisSuruyor(out _);
            bool gosterim = B.Oynaniyor && !acilis && simdi < GosterimSonu;
            bool yontma = B.Oynaniyor && !acilis && simdi >= GosterimSonu;
            string g = acilis ? "acilis:" + B.Son["round"] : !B.Oynaniyor ? "bitti" : gosterim ? "goster:" + B.Tur + ":" + (Hedef != null) : "yont:" + B.Tur;
            if (g != _anahtar)
            {
                _anahtar = g;
                foreach (Transform c in _tablo) Object.Destroy(c.gameObject); Ui.Yukseklik(_tablo, 0);
                if (acilis) AcilisCiz();
                else if (gosterim) Goster(Hedef?.Select(t => (int)t) ?? Enumerable.Empty<int>());
                else if (yontma) { _kirdim.Clear(); Goster(new int[0]); }
                _kok.gameObject.SetActive(B.Oynaniyor || acilis);
            }
            int adet = (int?)B.G?["count"] ?? 0;
            _sol.text = "Tur " + (acilis ? (int)B.Son["round"] : B.Tur);
            _sol.transform.parent.gameObject.SetActive(B.Oynaniyor || acilis);
            bool gonderdim = _gonderilenTur == B.Tur;
            if (gosterim)
            {
                bool bekleme = simdi < B.TurBasi || Hedef == null;
                _sag.text = OyunBaglami.Geri((bekleme ? B.TurBasi : GosterimSonu) - simdi);
                _bilgi.text = bekleme ? "Hazır ol, küp birazdan görünecek" : $"Ezberle! {adet} parça eksik";
                bool ok = B.Tur == 1 && !bekleme && B.BenCanliyim && _okTur != B.Tur;
                _ana.gameObject.SetActive(ok); _geri.gameObject.SetActive(false); _anaYazi.text = "Ezberledim";
                var oklar = (B.G?["ok"] as JArray)?.Count ?? 0; var gerek = (B.G?["need"] as JArray)?.Count ?? 0;
                _alt.text = B.Tur == 1 && _okTur == B.Tur ? $"Bekleniyor… {oklar}/{gerek}" : "";
                _kup.localRotation = Quaternion.Euler(_donus.x, _donus.y + Time.time * 25f, 0);
            }
            else if (yontma)
            {
                _sag.text = OyunBaglami.Geri(B.SonSure - simdi);
                _bilgi.text = B.BenCanliyim ? "Aynısını yont: dokun = kır, sürükle = döndür" : "Elendin, izliyorsun";
                _ana.gameObject.SetActive(B.BenCanliyim); _geri.gameObject.SetActive(B.BenCanliyim && !gonderdim && _kirdim.Count > 0);
                _anaYazi.text = gonderdim ? "Gönderildi ✓" : "Bitti";
                _alt.text = $"{_kirdim.Count}/{adet} parça kırdın";
                if (B.BenCanliyim && !gonderdim) Dokunma();
                _kup.localRotation = Quaternion.Euler(_donus.x, _donus.y, 0);
            }
            else
            {
                _sag.text = ""; _ana.gameObject.SetActive(false); _geri.gameObject.SetActive(false);
                _alt.text = ""; _bilgi.text = acilis ? "Hedef küp ve sonuçlar" : "";
                _kup.localRotation = Quaternion.Euler(_donus.x, _donus.y + Time.time * 25f, 0);
            }
            Otomatik(gosterim, yontma, gonderdim);
        }

        // Sürükle = döndür, kısa dokunuş = parçayı kır
        void Dokunma()
        {
            bool bas = Input.GetMouseButtonDown(0), basili = Input.GetMouseButton(0), birak = Input.GetMouseButtonUp(0);
            Vector2 p = Input.mousePosition;
            if (bas)
            {
                if (EventSystem.current != null && (EventSystem.current.IsPointerOverGameObject() || (Input.touchCount > 0 && EventSystem.current.IsPointerOverGameObject(Input.GetTouch(0).fingerId)))) { _surukle = false; _basla = new Vector2(-9999, 0); return; }
                _basla = p; _surukle = false;
            }
            if (_basla.x < -9000) return;
            if (basili && (p - _basla).magnitude > 18) _surukle = true;
            if (basili && _surukle)
            {
                var d = (Vector2)Input.mousePosition - _onceki; _donus += new Vector2(-d.y * 0.35f, -d.x * 0.35f);
                _donus.x = Mathf.Clamp(_donus.x, -80, 80);
            }
            if (birak && !_surukle)
            {
                if (Physics.Raycast(Camera.main.ScreenPointToRay(p), out var hit, 50f))
                {
                    int i = System.Array.IndexOf(_parca, hit.collider.gameObject);
                    if (i >= 0) { _parca[i].SetActive(false); _kirdim.Add(i); }
                }
            }
            _onceki = Input.mousePosition;
        }
        Vector2 _onceki;

        void AcilisCiz()
        {
            var son = B.Son;
            Goster(((JArray)son["target"]).Select(t => (int)t));
            var sonuc = (JObject)son["results"];
            foreach (var p in sonuc.Properties().OrderByDescending(p => (bool)p.Value["ok"]))
                OyunUi.OyuncuSatiri(_tablo, B, p.Name, (bool)p.Value["ok"] ? "Başardı" : "Elendi", (bool)p.Value["ok"] ? (Color?)new Color32(0x2E, 0xB8, 0x72, 220) : new Color32(0x80, 0x30, 0x40, 220), 78);
            Ui.Yukseklik(_tablo, sonuc.Count * 88);
        }

        // Önizleme: ezberledim de, hedefi doğru kır
        void Otomatik(bool gosterim, bool yontma, bool gonderdim)
        {
            if (!B.otomatik || !B.BenCanliyim) return;
            if (gosterim && B.Tur == 1 && Hedef != null && _okTur != B.Tur) { if (_oto < 0) _oto = Time.time + 2f; else if (Time.time > _oto) { _oto = -1; _hedefHafiza = Hedef.Select(t => (int)t).ToList(); AnaDugme(); } }
            if (gosterim && Hedef != null) _hedefHafiza = Hedef.Select(t => (int)t).ToList();
            if (yontma && !gonderdim && _hedefHafiza != null)
            {
                if (_oto < 0) _oto = Time.time + 1.5f;
                else if (Time.time > _oto) { _oto = -1; foreach (var i in _hedefHafiza) if (!_kirdim.Contains(i)) { _kirdim.Add(i); _parca[i].SetActive(false); } AnaDugme(); }
            }
        }
        List<int> _hedefHafiza;
    }
}
