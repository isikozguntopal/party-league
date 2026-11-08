using PartiLigi.Menu;
using UnityEngine;
using UnityEngine.Rendering;

namespace PartiLigi.Oyunlar
{
    /// <summary>
    /// Bir oyunun kendi 3D sahnesi için ana kamerayı ve ışık ortamını devralır; menü sahnesini gizler.
    /// Birak() her şeyi eski haline getirir. Sahne kökü uzakta kurulur (menü sisinde kaybolsun diye).
    /// </summary>
    public class Sahne3D
    {
        public readonly Camera kam;
        public readonly Transform kok;
        readonly GameObject _menu;
        readonly Vector3 _pos; readonly Quaternion _rot; readonly float _fov; readonly Color _arka; readonly CameraClearFlags _temizle;
        readonly AmbientMode _ortam; readonly Color _gok, _ufuk, _yer, _sis; readonly bool _sisVar;
        readonly Volume _post; readonly float _postAgirlik;

        public Sahne3D(string ad, Vector3 konum, Color arka, Color ortamGok, Color ortamUfuk, Color ortamYer, float postAgirlik = 0.35f)
        {
            kam = Camera.main;
            _pos = kam.transform.position; _rot = kam.transform.rotation; _fov = kam.fieldOfView; _arka = kam.backgroundColor; _temizle = kam.clearFlags;
            _ortam = RenderSettings.ambientMode; _gok = RenderSettings.ambientSkyColor; _ufuk = RenderSettings.ambientEquatorColor; _yer = RenderSettings.ambientGroundColor;
            _sis = RenderSettings.fogColor; _sisVar = RenderSettings.fog;
            var menu = Object.FindFirstObjectByType<MenuSahnesi>(); _menu = menu != null ? menu.gameObject : null;
            if (_menu != null) _menu.SetActive(false);
            _post = Object.FindFirstObjectByType<Volume>(); if (_post != null) { _postAgirlik = _post.weight; _post.weight = postAgirlik; }

            kam.clearFlags = CameraClearFlags.SolidColor; kam.backgroundColor = arka;
            RenderSettings.ambientMode = AmbientMode.Trilight;
            RenderSettings.ambientSkyColor = ortamGok; RenderSettings.ambientEquatorColor = ortamUfuk; RenderSettings.ambientGroundColor = ortamYer;
            RenderSettings.fog = false;
            kok = new GameObject(ad).transform; kok.position = konum;
        }

        /// <summary>Kamerayı kökün yerel uzayında konumla, hedefe baktır.</summary>
        public void Kamera(Vector3 yerelKonum, Vector3 yerelHedef, float fov)
        {
            kam.fieldOfView = fov;
            kam.transform.position = kok.TransformPoint(yerelKonum);
            kam.transform.LookAt(kok.TransformPoint(yerelHedef));
        }

        public Material Malzeme(Color renk, float parlak = 0.3f, float metal = 0f)
        {
            var m = new Material(Shader.Find("Universal Render Pipeline/Lit"));
            m.SetColor("_BaseColor", renk); m.SetFloat("_Smoothness", parlak); m.SetFloat("_Metallic", metal);
            return m;
        }

        public GameObject Kutu(PrimitiveType tip, string ad, Vector3 konum, Vector3 olcek, Material mat, Transform ebeveyn = null)
        {
            var g = GameObject.CreatePrimitive(tip); g.name = ad;
            Object.Destroy(g.GetComponent<Collider>());
            g.transform.SetParent(ebeveyn ?? kok, false); g.transform.localPosition = konum; g.transform.localScale = olcek;
            g.GetComponent<Renderer>().sharedMaterial = mat;
            return g;
        }

        /// <summary>Oyuncunun karakteri (lobidekiyle aynı Kenney modeli), boyu ~boy birim.</summary>
        public GameObject Karakter(string oyuncuId, float boy, Transform ebeveyn = null)
        {
            var menu = Object.FindFirstObjectByType<MenuSahnesi>(FindObjectsInactive.Include);
            if (menu == null || menu.sablonlar == null || menu.sablonlar.Length == 0) return null;
            var sablon = menu.sablonlar[MenuSahnesi.SablonIndeksi(oyuncuId, menu.sablonlar.Length)];
            var go = Object.Instantiate(sablon, ebeveyn ?? kok); go.SetActive(true);
            go.transform.localScale = sablon.transform.localScale * (boy / 1.25f);
            return go;
        }

        public void Birak()
        {
            if (kok != null) Object.Destroy(kok.gameObject);
            if (kam != null) { kam.transform.SetPositionAndRotation(_pos, _rot); kam.fieldOfView = _fov; kam.backgroundColor = _arka; kam.clearFlags = _temizle; }
            RenderSettings.ambientMode = _ortam; RenderSettings.ambientSkyColor = _gok; RenderSettings.ambientEquatorColor = _ufuk; RenderSettings.ambientGroundColor = _yer;
            RenderSettings.fogColor = _sis; RenderSettings.fog = _sisVar;
            if (_post != null) _post.weight = _postAgirlik;
            if (_menu != null) _menu.SetActive(true);
        }
    }
}
