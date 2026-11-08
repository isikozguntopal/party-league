using System.Collections.Generic;
using UnityEngine;

namespace PartiLigi.Menu
{
    /// <summary>Ana menünün arkasındaki 3D sahneyi canlandırır (sahne SahneKur.Olustur ile kurulur).
    /// Lobi modunda kürsüler gizlenir, kamera yaklaşır ve odadaki her oyuncu sahnede kendi karakteriyle durur.</summary>
    public class MenuSahnesi : MonoBehaviour, IEtiketKaynagi
    {
        public Transform kamera, kameraHedef;
        public Transform[] balonlar;
        public Light[] spotlar;
        public Renderer[] ampuller;
        public Material ampulYanik, ampulSonuk;
        public Animation[] karakterler;
        public Animation birinci;
        public ReflectionProbe yansima;
        public GameObject menuGrubu;      // kürsüler + menü karakterleri (lobide gizlenir)
        public GameObject[] sablonlar;    // oyuncu karakteri şablonları (pasif, ölçek/malzeme hazır)
        public GameObject lobiBasamak;    // 5'ten çok oyuncuda arka sıranın durduğu basamak

        static readonly Vector3 LobiKamera = new Vector3(0, 2.3f, -8.7f), LobiHedef = new Vector3(0, 1.2f, 2.0f);
        const float SahneY = 0.3f, BoyY = 1.25f, BasamakY = 0.45f, Aralik = 1.0f;

        class Oyuncu
        {
            public GameObject go; public Animation anim; public Vector3 olcek, hedef;
            public float dogus, sonrakiHareket, gidis = -1;
        }

        Vector3[] _balonTaban;
        Quaternion[] _spotTaban;
        Vector3 _menuKamera, _menuHedef;
        float _lobiOran, _lobiHedefOran;
        float[] _sonrakiHareket;
        int _ampulAdim = -1;
        Transform _lobiKok;
        readonly Dictionary<string, Oyuncu> _oyuncular = new Dictionary<string, Oyuncu>();
        readonly List<string> _silinecek = new List<string>();

        /// <summary>Kutlama: kürsüdeki karakterler sevinerek zıplar (ana ekran videosu için).</summary>
        public bool kutlama;
        readonly Dictionary<Animation, Vector3> _kutlamaTaban = new Dictionary<Animation, Vector3>();

        static readonly string[] Hareketler = { "emote-yes", "interact-right", "interact-left", "pick-up", "emote-no" };

        void Start()
        {
            _balonTaban = new Vector3[balonlar.Length];
            for (int i = 0; i < balonlar.Length; i++) _balonTaban[i] = balonlar[i].localPosition;
            _spotTaban = new Quaternion[spotlar.Length];
            for (int i = 0; i < spotlar.Length; i++) _spotTaban[i] = spotlar[i].transform.localRotation;
            if (kamera != null) _menuKamera = kamera.position;
            if (kameraHedef != null) _menuHedef = kameraHedef.position;
            _lobiKok = new GameObject("LobiOyunculari").transform; _lobiKok.SetParent(transform, false);

            _sonrakiHareket = new float[karakterler.Length];
            for (int i = 0; i < karakterler.Length; i++)
            {
                var a = karakterler[i];
                if (a == null) continue;
                BoştaBaşla(a);
                _sonrakiHareket[i] = Time.time + 1f + Random.value * 4f;
            }
            if (birinci != null && birinci["emote-yes"] != null) birinci.Play("emote-yes");
            if (yansima != null) yansima.RenderProbe();
        }

        static void BoştaBaşla(Animation a)
        {
            if (a["idle"] == null) return;
            a.Play("idle"); a["idle"].time = Random.value * a["idle"].length;
        }

        static void RastgeleHareket(Animation a)
        {
            var h = Hareketler[Random.Range(0, Hareketler.Length)];
            if (a[h] == null) return;
            a.CrossFade(h, 0.2f);
            if (a["idle"] != null) a.CrossFadeQueued("idle", 0.25f);
        }

        // ---------- Lobi ----------
        public void LobiModu(bool acik)
        {
            _lobiHedefOran = acik ? 1 : 0;
            if (menuGrubu != null) menuGrubu.SetActive(!acik);
            if (!acik) Oyuncular(new List<string>());
            if (!acik && lobiBasamak != null) lobiBasamak.SetActive(false);
        }

        /// <summary>Odadaki oyuncular (sıralı). Yeni gelen zıplayarak belirir, ayrılan küçülerek kaybolur, kalanlar yeni yerine kayar.</summary>
        public void Oyuncular(IList<string> idler)
        {
            var simdi = Time.time;
            if (lobiBasamak != null) lobiBasamak.SetActive(idler.Count > 5);
            foreach (var kv in _oyuncular)
                if (!idler.Contains(kv.Key) && kv.Value.gidis < 0) kv.Value.gidis = simdi;

            for (int i = 0; i < idler.Count; i++)
            {
                var id = idler[i];
                if (!_oyuncular.TryGetValue(id, out var o) || o.gidis >= 0)
                {
                    if (o != null) Destroy(o.go);
                    o = Yeni(id);
                    if (o == null) continue;
                    _oyuncular[id] = o;
                }
                o.hedef = Yer(i, idler.Count);
                if (simdi - o.dogus < 0.05f) o.go.transform.localPosition = o.hedef;
                o.go.transform.localRotation = Quaternion.Euler(0, 180 - o.hedef.x * 6f, 0); // hafifçe ortaya dön
            }
        }

        Oyuncu Yeni(string id)
        {
            if (sablonlar == null || sablonlar.Length == 0) return null;
            var sablon = sablonlar[SablonIndeksi(id, sablonlar.Length)];
            var go = Instantiate(sablon, _lobiKok);
            go.name = "Oyuncu_" + id; go.SetActive(true);
            var o = new Oyuncu { go = go, anim = go.GetComponent<Animation>(), olcek = sablon.transform.localScale, dogus = Time.time };
            o.sonrakiHareket = Time.time + 3f + Random.value * 4f;
            go.transform.localScale = Vector3.zero;
            if (o.anim != null)
            {
                if (o.anim["emote-yes"] != null) { o.anim.Play("emote-yes"); if (o.anim["idle"] != null) o.anim.CrossFadeQueued("idle", 0.25f); }
                else BoştaBaşla(o.anim);
            }
            return o;
        }

        // Ön sırada en çok 5, arkada kalanlar (arka sıra yarım aralık kaydırılmış, aradan görünür)
        static Vector3 Yer(int i, int n)
        {
            int on = Mathf.Min(n, 5), arka = n - on;
            bool onSira = i < on; int k = onSira ? on : arka, j = onSira ? i : i - on;
            float x = (j - (k - 1) / 2f) * Aralik + (onSira ? 0 : (k == on ? Aralik / 2 : 0));
            return onSira ? new Vector3(x, SahneY, 1.3f) : new Vector3(x, SahneY + BasamakY, 2.6f);
        }

        // Kimlikten sabit karakter seçimi (string.GetHashCode süreçler arasında değişebilir → FNV-1a)
        /// <summary>"Ben" ekranında seçilen karakter (yalnızca bu cihazdaki oyuncu; -1 = seçim yok).</summary>
        public static System.Func<string, int> KarakterSecimi;
        public static int SablonIndeksi(string id, int adet) { int s = KarakterSecimi?.Invoke(id) ?? -1; return s >= 0 && s < adet ? s : Ozet(id) % adet; }

        public static int Ozet(string s)
        {
            unchecked
            {
                uint h = 2166136261;
                foreach (var c in s) { h ^= c; h *= 16777619; }
                return (int)(h & 0x7fffffff);
            }
        }

        /// <summary>İsim etiketinin dünya konumu. Arka sıra: başın üstü (ust=true); ön sıra: ayakların altı,
        /// böylece ön sıranın etiketleri arka sıradaki karakterleri örtmez.</summary>
        public bool EtiketNoktasi(string id, out Vector3 dunya, out bool ust)
        {
            dunya = default; ust = false;
            if (!_oyuncular.TryGetValue(id, out var o) || o.gidis >= 0) return false;
            ust = o.hedef.z > 2f;
            var boy = BoyY * o.go.transform.localScale.y / Mathf.Max(o.olcek.y, 1e-4f);
            dunya = o.go.transform.position + Vector3.up * (ust ? boy + 0.12f : -0.08f);
            return true;
        }

        void Update()
        {
            float t = Time.time;
            for (int i = 0; i < balonlar.Length; i++)
            {
                var b = balonlar[i];
                b.localPosition = _balonTaban[i] + new Vector3(Mathf.Sin(t * 0.5f + i * 1.7f) * 0.05f, Mathf.Sin(t * 0.8f + i) * 0.12f, 0);
                b.localRotation = Quaternion.Euler(Mathf.Sin(t * 0.6f + i) * 6f, 0, Mathf.Cos(t * 0.7f + i * 2f) * 6f);
            }
            for (int i = 0; i < spotlar.Length; i++)
                spotlar[i].transform.localRotation = _spotTaban[i] * Quaternion.Euler(Mathf.Sin(t * 0.55f + i * 2.1f) * 10f, Mathf.Cos(t * 0.4f + i * 1.3f) * 14f, 0);

            int adim = (int)(t * 4f);
            if (adim != _ampulAdim && ampuller.Length > 0)
            {
                _ampulAdim = adim;
                for (int i = 0; i < ampuller.Length; i++) ampuller[i].sharedMaterial = (i + adim) % 3 == 0 ? ampulSonuk : ampulYanik;
            }

            if (menuGrubu == null || menuGrubu.activeSelf)
                for (int i = 0; i < karakterler.Length; i++)
                {
                    var a = karakterler[i];
                    if (a == null || a == birinci || t < _sonrakiHareket[i]) continue;
                    RastgeleHareket(a);
                    _sonrakiHareket[i] = t + 3f + Random.value * 4f;
                }

            LobiOyunculariniGuncelle(t);
            if (kutlama)
                for (int i = 0; i < karakterler.Length; i++)
                {
                    var a = karakterler[i]; if (a == null) continue;
                    if (!_kutlamaTaban.ContainsKey(a)) { _kutlamaTaban[a] = a.transform.localPosition; if (a["emote-yes"] != null) { a["emote-yes"].wrapMode = WrapMode.Loop; a.CrossFade("emote-yes", 0.2f); } }
                    float zip = Mathf.Abs(Mathf.Sin(t * 5.2f + i * 1.3f)) * (i == 0 ? 0.7f : 0.45f);
                    a.transform.localPosition = _kutlamaTaban[a] + Vector3.up * zip;
                }

            _lobiOran = Mathf.MoveTowards(_lobiOran, _lobiHedefOran, Time.deltaTime * 1.6f);
            float s = Mathf.SmoothStep(0, 1, _lobiOran);
            if (kameraHedef != null) kameraHedef.position = Vector3.Lerp(_menuHedef, LobiHedef, s);
            if (kamera != null)
            {
                var taban = Vector3.Lerp(_menuKamera, LobiKamera, s);
                kamera.position = taban + new Vector3(Mathf.Sin(t * 0.18f) * 0.35f, Mathf.Sin(t * 0.25f) * 0.08f, 0);
                if (kameraHedef != null) kamera.LookAt(kameraHedef);
            }
        }

        void LobiOyunculariniGuncelle(float t)
        {
            _silinecek.Clear();
            foreach (var kv in _oyuncular)
            {
                var o = kv.Value; var tr = o.go.transform;
                if (o.gidis >= 0)
                {
                    float g = (t - o.gidis) / 0.25f;
                    tr.localScale = o.olcek * Mathf.Max(0, 1 - g);
                    if (g >= 1) { Destroy(o.go); _silinecek.Add(kv.Key); }
                    continue;
                }
                // belirme: aşağı düşerek ve hafif taşarak büyü (easeOutBack)
                float d = Mathf.Clamp01((t - o.dogus) / 0.45f);
                float e = 1 + 2.2f * Mathf.Pow(d - 1, 3) + 1.2f * Mathf.Pow(d - 1, 2);
                tr.localScale = o.olcek * e;
                var p = Vector3.Lerp(tr.localPosition, o.hedef, 1 - Mathf.Exp(-Time.deltaTime * 8f));
                p.y = o.hedef.y + (1 - d) * (1 - d) * 1.2f;
                tr.localPosition = p;
                if (o.anim != null && t > o.sonrakiHareket) { RastgeleHareket(o.anim); o.sonrakiHareket = t + 4f + Random.value * 5f; }
            }
            foreach (var id in _silinecek) _oyuncular.Remove(id);
        }
    }
}
