using System;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using PartiLigi.Net;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.Rendering;

namespace PartiLigi.Oyunlar.Sapan
{
    public enum SapanFaz { Giris, Yerlesme, Acilis, Bitti }

    /// <summary>
    /// Sapan Arenası 3D istemcisi. Sahne parçaları SahneKur.Olustur ile kurulur (pasif "Sapan" kökü).
    /// Ağ işi Uygulama'da; bu sınıf durumu (state) alır, yerleşme turunda dokunmayı işler ve açılışı sunucu saatine göre oynatır.
    /// Oyun koordinatı (x, y) → dünya (x·S, 0, y·S), kökün yerel uzayında.
    /// </summary>
    public class SapanOyunu : MonoBehaviour, IEtiketKaynagi
    {
        public const float S = 5f;                       // oyun birimi → dünya birimi
        const float Boy = 1.5f, TasYuk = 0.75f, YakalaR = 1.3f;

        public Transform ada;                            // sekizgen ada (x/z ölçeği = platform ölçeği)
        public GameObject tasSablon, halkaSablon;        // taş, oyuncunun ayağının altındaki renkli halka
        public ParticleSystem tozSablon;
        public LineRenderer nisan;                       // nişan çizgisi
        public Transform hedefHalka;                     // taşın düşeceği yer
        public GameObject[] sablonlar;                   // oyuncu karakter şablonları (MenuSahnesi ile ortak)
        public GameObject menuKok;                       // oyun sırasında gizlenen menü sahnesi
        public Color gokRengi = new Color(0.47f, 0.72f, 1f);

        // ---- Uygulama'nın okuduğu durum ----
        public SapanFaz Faz { get; private set; }
        public int Tur { get; private set; }
        public double KalanMs { get; private set; }      // yerleşmede süre, girişte başlangıca kalan
        public bool BenCanliyim { get; private set; }
        public bool HamleDegisti { get; private set; }   // gönderilenden sonra değiştirildi mi
        public bool Gonderildi { get; private set; }
        public int HazirSayisi { get; private set; }
        public int CanliSayisi { get; private set; }

        Func<double> _sunucuSimdi;
        JObject _durum;
        int _seq, _round;
        double _mx, _my, _ma = -Math.PI / 2, _mr = SapanKural.DefaultRange;  // benim hamlem
        double _olcek = 1;
        bool _surukluyor, _nisanliyor;
        int _parmak = -1;

        SapanOynatici _oynatici; double _oynaticiBas; string _oynaticiAnahtar;
        int _sonAtis = -1; bool _sonVurdu;
        float _sarsinti;

        class Karakter { public GameObject go; public Animation anim; public Transform halka; public Vector3 olcek; public string sonAnim; }
        readonly Dictionary<string, Karakter> _kar = new Dictionary<string, Karakter>();
        GameObject _tas;
        Camera _kam; Vector3 _kamTaban; Quaternion _kamDonus;
        // menü ayarları (geri dönerken)
        Color _eskiArka, _eskiSis; float _eskiSisYog, _eskiFov; FogMode _eskiSisMod; CameraClearFlags _eskiTemizle;
        Vector3 _eskiKamPos; Quaternion _eskiKamRot;
        AmbientMode _eskiOrtam; Color _eskiGok, _eskiUfuk, _eskiYer;
        Volume _post; float _eskiPost;

        // ---------- Giriş / çıkış ----------
        public void Baslat(Func<double> sunucuSimdi)
        {
            _sunucuSimdi = sunucuSimdi;
            _kam = Camera.main;
            _eskiArka = _kam.backgroundColor; _eskiTemizle = _kam.clearFlags; _eskiFov = _kam.fieldOfView;
            _eskiKamPos = _kam.transform.position; _eskiKamRot = _kam.transform.rotation;
            _eskiOrtam = RenderSettings.ambientMode; _eskiGok = RenderSettings.ambientSkyColor; _eskiUfuk = RenderSettings.ambientEquatorColor; _eskiYer = RenderSettings.ambientGroundColor;
            // gündüz gökyüzü ortam ışığı (menünün mor sahne ışığı yerine)
            RenderSettings.ambientMode = AmbientMode.Trilight;
            RenderSettings.ambientSkyColor = new Color(0.78f, 0.86f, 1f); RenderSettings.ambientEquatorColor = new Color(0.72f, 0.76f, 0.84f); RenderSettings.ambientGroundColor = new Color(0.42f, 0.42f, 0.48f);
            _eskiSis = RenderSettings.fogColor; _eskiSisYog = RenderSettings.fogDensity; _eskiSisMod = RenderSettings.fogMode;
            if (menuKok != null) menuKok.SetActive(false);
            gameObject.SetActive(true);
            // menünün karanlık sahnesi için ayarlı pozlama/doygunluk gündüz arenasını soldurur → etkisini azalt
            _post = FindFirstObjectByType<Volume>(); if (_post != null) { _eskiPost = _post.weight; _post.weight = 0.35f; }

            _kam.clearFlags = CameraClearFlags.SolidColor; _kam.backgroundColor = gokRengi; _kam.fieldOfView = 55;
            RenderSettings.fogMode = FogMode.Linear; RenderSettings.fogColor = gokRengi;
            RenderSettings.fogStartDistance = 28; RenderSettings.fogEndDistance = 75;
            _kamTaban = transform.TransformPoint(new Vector3(0, 16f, -11.5f));
            _kam.transform.position = _kamTaban; _kam.transform.LookAt(transform.TransformPoint(new Vector3(0, 0, 0.6f)));
            _kamDonus = _kam.transform.rotation;
            nisan.enabled = false; hedefHalka.gameObject.SetActive(false);
            _seq = -1; _round = -1; _oynaticiAnahtar = null;
        }

        public void Bitir()
        {
            foreach (var k in _kar.Values) Destroy(k.go);
            _kar.Clear();
            if (_tas != null) Destroy(_tas);
            if (_kam != null)
            {
                _kam.backgroundColor = _eskiArka; _kam.clearFlags = _eskiTemizle; _kam.fieldOfView = _eskiFov;
                _kam.transform.SetPositionAndRotation(_eskiKamPos, _eskiKamRot);
            }
            RenderSettings.ambientMode = _eskiOrtam; RenderSettings.ambientSkyColor = _eskiGok; RenderSettings.ambientEquatorColor = _eskiUfuk; RenderSettings.ambientGroundColor = _eskiYer;
            RenderSettings.fogMode = _eskiSisMod; RenderSettings.fogColor = _eskiSis; RenderSettings.fogDensity = _eskiSisYog;
            if (_post != null) _post.weight = _eskiPost;
            gameObject.SetActive(false);
            if (menuKok != null) menuKok.SetActive(true);
        }

        /// <summary>Her yoklamada gelen oda durumu.</summary>
        public void Durum(JObject durum)
        {
            _durum = durum;
            var g = durum["g"] as JObject;
            var alive = g?["alive"] as JObject;
            BenCanliyim = alive != null && (bool?)alive[PartiApi.PlayerId] == true;
            CanliSayisi = 0; if (alive != null) foreach (var a in alive) if ((bool)a.Value) CanliSayisi++;
            HazirSayisi = (durum["ready"] as JArray)?.Count ?? 0;

            int seq = (int?)durum["seq"] ?? 0, round = (int?)durum["round"] ?? 1;
            if (seq != _seq || round != _round)
            {
                // yeni tur: hamleyi sıfırla, son açılışta durduğum yerden başla
                _seq = seq; _round = round; Tur = round;
                Gonderildi = false; HamleDegisti = false;
                _olcek = (double?)g?["scale"] ?? SapanKural.ArenaScale(round);
                var son = SonYerim();
                var p = son ?? RastgeleYer();
                var c = SapanKural.ClampInside(p.x, p.y, SapanKural.BodyR + 0.01, _olcek);
                _mx = c.x; _my = c.y; _mr = SapanKural.DefaultRange;
                _ma = Math.Atan2(-_my, -_mx); // ortaya nişan
            }

            var last = durum["last"] as JObject;
            if (last != null && (int?)last["seq"] == seq)
            {
                var anahtar = seq + "/" + last["round"];
                if (anahtar != _oynaticiAnahtar)
                {
                    _oynaticiAnahtar = anahtar; _oynatici = new SapanOynatici(last);
                    _oynaticiBas = (double)last["resolvedAt"]; _sonAtis = -1; _sonVurdu = false;
                }
            }
            else { _oynatici = null; _oynaticiAnahtar = null; }
        }

        (double x, double y)? SonYerim()
        {
            if (_oynatici == null) return null;
            var son = _oynatici.Hesapla(_oynatici.sure);
            return son.kisiler.TryGetValue(PartiApi.PlayerId, out var k) && !k.dustu ? (k.x, k.y) : ((double, double)?)null;
        }

        static (double x, double y) RastgeleYer()
        {
            var a = UnityEngine.Random.value * Math.PI * 2; var r = 0.3 + UnityEngine.Random.value * 0.35;
            return (Math.Cos(a) * r, Math.Sin(a) * r);
        }

        /// <summary>Gönderilecek hamle (act gövdesi).</summary>
        public JObject Hamle()
        {
            Gonderildi = true; HamleDegisti = false;
            return new JObject { ["seq"] = _seq, ["round"] = _round, ["x"] = _mx, ["y"] = _my, ["a"] = _ma, ["r"] = _mr };
        }

        // ---------- Kare ----------
        void Update()
        {
            if (_durum == null || _sunucuSimdi == null) return;
            double simdi = _sunucuSimdi();
            var status = (string)_durum["status"];
            double roundStart = (double?)_durum["roundStart"] ?? 0, deadline = (double?)_durum["deadline"] ?? 0;

            Tur = _round;
            if (_oynatici != null && simdi < _oynaticiBas + _oynatici.sure) { Faz = SapanFaz.Acilis; Tur = _oynatici.tur; AcilisCiz(simdi - _oynaticiBas); }
            else if (status != "playing") { Faz = SapanFaz.Bitti; BittiCiz(); }
            else if (simdi < roundStart) { Faz = SapanFaz.Giris; KalanMs = roundStart - simdi; YerlesmeCiz(false); }
            else { Faz = SapanFaz.Yerlesme; KalanMs = Math.Max(0, deadline - simdi); if (BenCanliyim) Dokunma(); YerlesmeCiz(BenCanliyim); }

            AdaOlcek(Faz == SapanFaz.Acilis ? _oynatici.Hesapla(simdi - _oynaticiBas).olcek : _olcek);
            KameraSarsinti();
        }

        void AdaOlcek(double s)
        {
            var o = ada.localScale; o.x = o.z = (float)s; ada.localScale = Vector3.Lerp(ada.localScale, o, 0.25f);
        }

        Vector3 Dunya(double x, double y, float yuk = 0) => transform.TransformPoint(new Vector3((float)x * S, yuk, (float)y * S));
        static float Yon(double a) => Mathf.Atan2((float)Math.Cos(a), (float)Math.Sin(a)) * Mathf.Rad2Deg;

        // Yerleşme: yalnızca kendi karakterim (diğerlerinin yeri gizli); nişan çizgisi + düşeceği yer
        void YerlesmeCiz(bool kontrol)
        {
            var ben = PartiApi.PlayerId;
            foreach (var id in new List<string>(_kar.Keys)) if (id != ben) KarakterGizle(id);
            if (_tas != null) _tas.SetActive(false);
            if (!BenCanliyim) { KarakterGizle(ben); nisan.enabled = false; hedefHalka.gameObject.SetActive(false); return; }
            var k = KarakterAl(ben);
            k.go.transform.position = Vector3.Lerp(k.go.transform.position, Dunya(_mx, _my), 0.5f);
            k.go.transform.rotation = Quaternion.Euler(0, Yon(_ma), 0);
            Oynat(k, _surukluyor ? "walk" : "idle");

            var hedefler = new List<SapanKural.Hedef>();
            var at = SapanKural.CastShot(_mx, _my, _ma, hedefler, _olcek, _mr);
            nisan.enabled = kontrol; hedefHalka.gameObject.SetActive(kontrol);
            nisan.positionCount = 2;
            nisan.SetPosition(0, Dunya(_mx, _my, TasYuk)); nisan.SetPosition(1, Dunya(at.x, at.y, 0.05f));
            hedefHalka.position = Dunya(at.x, at.y, 0.03f);
        }

        // Dokunma: karakterin yakınından başlayan sürükleme = yürü; başka yere dokunma = o yöne nişan, uzaklık = menzil
        void Dokunma()
        {
            bool basildi, basili; Vector2 ekran; int parmak;
            if (Input.touchCount > 0)
            {
                var t = Input.GetTouch(0); parmak = t.fingerId; ekran = t.position;
                basildi = t.phase == TouchPhase.Began; basili = t.phase != TouchPhase.Ended && t.phase != TouchPhase.Canceled;
            }
            else { parmak = -1; ekran = Input.mousePosition; basildi = Input.GetMouseButtonDown(0); basili = Input.GetMouseButton(0); }

            if (!basili) { _surukluyor = _nisanliyor = false; return; }
            if (!YereDegdi(ekran, out var x, out var y)) return;
            if (basildi)
            {
                if (EventSystem.current != null && EventSystem.current.IsPointerOverGameObject(parmak)) return; // düğmeye basıldı
                _parmak = parmak;
                bool yakin = Math.Sqrt((x - _mx) * (x - _mx) + (y - _my) * (y - _my)) * S < YakalaR;
                _surukluyor = yakin; _nisanliyor = !yakin;
            }
            if (parmak != _parmak) return;
            if (_surukluyor)
            {
                var c = SapanKural.ClampInside(x, y, SapanKural.BodyR + 0.01, _olcek);
                if (Math.Abs(c.x - _mx) + Math.Abs(c.y - _my) > 1e-4) { _mx = c.x; _my = c.y; HamleDegisti |= Gonderildi; }
            }
            else if (_nisanliyor)
            {
                double dx = x - _mx, dy = y - _my, d = Math.Sqrt(dx * dx + dy * dy);
                if (d > 0.03) { _ma = Math.Atan2(dy, dx); _mr = SapanKural.CleanRange(d); HamleDegisti |= Gonderildi; }
            }
        }

        bool YereDegdi(Vector2 ekran, out double x, out double y)
        {
            x = y = 0;
            var isin = _kam.ScreenPointToRay(ekran);
            var duzlem = new Plane(transform.up, transform.position);
            if (!duzlem.Raycast(isin, out var mesafe)) return false;
            var yerel = transform.InverseTransformPoint(isin.GetPoint(mesafe));
            x = yerel.x / S; y = yerel.z / S;
            return true;
        }

        // Açılış: herkes yerinde, sırayla fırlatır; taş uçar, çarpınca itme zinciri ve düşüş
        void AcilisCiz(double t)
        {
            nisan.enabled = false; hedefHalka.gameObject.SetActive(false);
            var kare = _oynatici.Hesapla(t);
            foreach (var kv in kare.kisiler)
            {
                var kisi = kv.Value;
                if (kisi.dustu) { KarakterGizle(kv.Key); continue; }
                var k = KarakterAl(kv.Key);
                var tr = k.go.transform;
                float dus = (float)kisi.dusus;
                tr.position = Dunya(kisi.x, kisi.y, -dus * dus * 9f);
                tr.rotation = Quaternion.Euler(dus * 70f, Yon(kisi.aci), 0);
                // giriş: herkes sırayla beliriyor
                float g = Mathf.Clamp01((float)kare.giris * 1.6f);
                tr.localScale = k.olcek * (1 + 2.2f * Mathf.Pow(g - 1, 3) + 1.2f * Mathf.Pow(g - 1, 2));
                if (k.halka != null) k.halka.gameObject.SetActive(dus <= 0);
                if (kv.Key == kare.atan && kare.atisYerel < 500) Oynat(k, "attack-melee-right");
                else if (dus > 0) Oynat(k, "emote-no");
                else if (k.sonAnim == "attack-melee-right" || k.sonAnim == null || k.sonAnim == "walk") Oynat(k, "idle", 0.3f);
            }
            // taş
            if (kare.tasGorunur)
            {
                if (_tas == null) _tas = Instantiate(tasSablon, transform);
                _tas.SetActive(true);
                _tas.transform.position = Dunya(kare.tasX, kare.tasY, (float)(kare.tasZ / SapanKural.StoneH) * TasYuk + 0.1f);
            }
            else if (_tas != null) _tas.SetActive(false);
            // çarpma anı: toz + sarsıntı
            if (kare.atis != _sonAtis) { _sonAtis = kare.atis; _sonVurdu = false; }
            if (kare.vurdu && !_sonVurdu && kare.atis >= 0)
            {
                _sonVurdu = true;
                var s = _oynatici.Atislar[kare.atis];
                var toz = Instantiate(tozSablon, transform); toz.transform.position = Dunya(s.x2, s.y2, TasYuk);
                toz.gameObject.SetActive(true); toz.Play(); Destroy(toz.gameObject, 2f);
                _sarsinti = 0.35f;
            }
        }

        // Oyun bitti: ayakta kalanlar sevinir
        void BittiCiz()
        {
            nisan.enabled = false; hedefHalka.gameObject.SetActive(false);
            if (_tas != null) _tas.SetActive(false);
            var alive = _durum["g"]?["alive"] as JObject;
            foreach (var kv in _kar)
            {
                bool canli = alive != null && (bool?)alive[kv.Key] == true;
                kv.Value.go.SetActive(canli);
                if (canli && !kv.Value.anim.isPlaying) Oynat(kv.Value, "emote-yes", 0.2f, true);
            }
        }

        void KameraSarsinti()
        {
            _sarsinti = Mathf.Max(0, _sarsinti - Time.deltaTime);
            var t = Time.time;
            var salin = new Vector3(Mathf.Sin(t * 0.3f) * 0.3f, Mathf.Sin(t * 0.4f) * 0.1f, 0);
            var sars = UnityEngine.Random.insideUnitSphere * (_sarsinti * 0.6f);
            // ada küçüldükçe kamera yaklaşır (karakterler küçülmesin)
            var merkez = transform.TransformPoint(new Vector3(0, 0, 0.6f));
            float yakin = 0.4f + 0.6f * Mathf.Max(0.35f, ada.localScale.x);
            _kam.transform.SetPositionAndRotation(merkez + (_kamTaban - merkez) * yakin + salin + sars, _kamDonus);
        }

        // ---------- Karakterler ----------
        Karakter KarakterAl(string id)
        {
            if (_kar.TryGetValue(id, out var k)) { k.go.SetActive(true); return k; }
            var sablon = sablonlar[Menu.MenuSahnesi.SablonIndeksi(id, sablonlar.Length)];
            var go = Instantiate(sablon, transform); go.SetActive(true); go.name = "Sapan_" + id;
            var olcek = sablon.transform.localScale * (Boy / 1.25f);
            go.transform.localScale = olcek;
            k = new Karakter { go = go, anim = go.GetComponent<Animation>(), olcek = olcek };
            var halka = Instantiate(halkaSablon, go.transform); halka.SetActive(true);
            halka.transform.localPosition = new Vector3(0, 0.02f / olcek.y, 0);
            halka.transform.localScale = new Vector3(halka.transform.localScale.x / olcek.x, halka.transform.localScale.y / olcek.y, halka.transform.localScale.z / olcek.z);
            var renk = OyuncuRengi(id);
            var mpb = new MaterialPropertyBlock(); mpb.SetColor("_BaseColor", renk);
            halka.GetComponent<Renderer>().SetPropertyBlock(mpb);
            k.halka = halka.transform;
            _kar[id] = k;
            Oynat(k, "idle");
            return k;
        }

        void KarakterGizle(string id) { if (_kar.TryGetValue(id, out var k)) k.go.SetActive(false); }

        static void Oynat(Karakter k, string ad, float gecis = 0.15f, bool zorla = false)
        {
            if (k.anim == null || k.anim[ad] == null || (!zorla && k.sonAnim == ad)) return;
            k.anim.CrossFade(ad, gecis); k.sonAnim = ad;
        }

        Color OyuncuRengi(string id)
        {
            foreach (JObject p in (JArray)_durum["players"])
                if ((string)p["id"] == id && ColorUtility.TryParseHtmlString((string)p["color"], out var c)) return c;
            return Color.white;
        }

        // MenuSahnesi ile aynı seçim: lobideki karakter oyunda da aynı
        static int Ozet(string s) { unchecked { uint h = 2166136261; foreach (var c in s) { h ^= c; h *= 16777619; } return (int)(h & 0x7fffffff); } }

        public bool EtiketNoktasi(string id, out Vector3 dunya, out bool ust)
        {
            dunya = default; ust = true;
            if (!_kar.TryGetValue(id, out var k) || !k.go.activeInHierarchy) return false;
            if (k.go.transform.position.y < transform.position.y - 0.5f) return false; // düşüyor
            dunya = k.go.transform.position + Vector3.up * (Boy + 0.15f);
            return true;
        }
    }
}
