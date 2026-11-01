using System.Collections.Generic;
using System.IO;
using PartiLigi.Menu;
using PartiLigi.Oyunlar.Sapan;
using PartiLigi.UI;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

// Unity -batchmode -quit -projectPath unity -executeMethod SahneKur.Olustur   (-nographics OLMADAN: yoksa malzeme anahtar kelimeleri (_EMISSION) kaydedilmez)
// Ana sahne: arkada 3D parti sahnesi (kürsü + karakterler + perde + ışıklar + konfeti), önde kodla kurulan arayüz (Uygulama).
public static class SahneKur
{
    public const string Yol = "Assets/Scenes/Ana.unity";
    const string Malzeme = "Assets/Menu/Malzeme";
    const string MeshKlasor = "Assets/Menu/Mesh";
    const int UiKatman = 5;

    public static void Olustur()
    {
        Klasor("Assets/Menu"); Klasor(Malzeme); Klasor(MeshKlasor);
        var sahne = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);

        // ---------- Kameralar: 3D ana kamera (post-processing) + üstüne arayüz kamerası ----------
        var hedef = new GameObject("KameraHedef").transform; hedef.position = new Vector3(0, 1.45f, 1.5f);
        var cam = new GameObject("Kamera", typeof(Camera), typeof(AudioListener)).GetComponent<Camera>();
        cam.tag = "MainCamera";
        cam.transform.position = new Vector3(0, 3.1f, -10.2f); cam.transform.LookAt(hedef);
        cam.fieldOfView = 50; cam.nearClipPlane = 0.3f; cam.farClipPlane = 60;
        cam.clearFlags = CameraClearFlags.SolidColor; cam.backgroundColor = Ui.Lacivert;
        cam.cullingMask = ~(1 << UiKatman);
        var camVeri = cam.GetUniversalAdditionalCameraData(); camVeri.renderPostProcessing = true;

        var uiCam = new GameObject("UIKamera", typeof(Camera)).GetComponent<Camera>();
        uiCam.orthographic = true; uiCam.cullingMask = 1 << UiKatman; uiCam.clearFlags = CameraClearFlags.Depth;
        uiCam.transform.position = new Vector3(0, 0, -100);
        var uiVeri = uiCam.GetUniversalAdditionalCameraData(); uiVeri.renderType = CameraRenderType.Overlay; uiVeri.renderPostProcessing = false;
        camVeri.cameraStack.Add(uiCam);

        // ---------- Işık ortamı ----------
        RenderSettings.skybox = null;
        RenderSettings.ambientMode = AmbientMode.Trilight;
        RenderSettings.ambientSkyColor = new Color(0.32f, 0.28f, 0.58f);
        RenderSettings.ambientEquatorColor = new Color(0.22f, 0.14f, 0.34f);
        RenderSettings.ambientGroundColor = new Color(0.06f, 0.04f, 0.1f);
        RenderSettings.fog = true; RenderSettings.fogMode = FogMode.ExponentialSquared;
        RenderSettings.fogColor = new Color(0.08f, 0.07f, 0.2f); RenderSettings.fogDensity = 0.045f;

        var gunes = new GameObject("AnaIsik", typeof(Light)).GetComponent<Light>();
        gunes.type = LightType.Directional; gunes.color = new Color(0.78f, 0.82f, 1f); gunes.intensity = 0.75f;
        gunes.shadows = LightShadows.Soft; gunes.shadowStrength = 0.7f;
        gunes.transform.rotation = Quaternion.Euler(48, -25, 0);

        var hacim = new GameObject("PostProcess", typeof(Volume)).GetComponent<Volume>();
        hacim.isGlobal = true; hacim.sharedProfile = Profil();

        var kok = new GameObject("MenuSahnesi").transform;
        var menu = kok.gameObject.AddComponent<MenuSahnesi>();
        menu.kamera = cam.transform; menu.kameraHedef = hedef;

        // ---------- Zemin, sahne, kürsü ----------
        var tahta = AssetDatabase.LoadAssetAtPath<Texture2D>("Assets/Menu/Doku/zemin_tahta.png");
        var zeminMat = Mat("Zemin", new Color(0.75f, 0.7f, 0.85f), 0.78f, 0f, tahta, new Vector2(10, 10));
        Prim(PrimitiveType.Plane, "Zemin", kok, new Vector3(0, 0, 4), new Vector3(5, 1, 5), zeminMat);

        Prim(PrimitiveType.Cylinder, "Sahne", kok, new Vector3(0, 0.15f, 1.2f), new Vector3(7.4f, 0.15f, 7.4f), Mat("SahneLake", new Color(0.42f, 0.06f, 0.26f), 0.9f, 0.1f));
        Prim(PrimitiveType.Cylinder, "SahneNeon", kok, new Vector3(0, 0.05f, 1.2f), new Vector3(7.6f, 0.05f, 7.6f), Parlak("NeonPembe", new Color(4f, 0.6f, 1.8f)));

        // kürsüler + menü karakterleri: lobide birlikte gizlenir
        var menuGrup = new GameObject("MenuGrubu").transform; menuGrup.SetParent(kok, false);
        menu.menuGrubu = menuGrup.gameObject;
        var kursuler = new[] {
            (ad: "Kursu1", x: 0f, h: 1.0f, mat: Mat("Altin", new Color(1f, 0.74f, 0.22f), 0.82f, 0.9f)),
            (ad: "Kursu2", x: -1.75f, h: 0.66f, mat: Mat("Gumus", new Color(0.82f, 0.85f, 0.95f), 0.85f, 0.9f)),
            (ad: "Kursu3", x: 1.75f, h: 0.4f, mat: Mat("Bronz", new Color(0.85f, 0.45f, 0.22f), 0.78f, 0.9f)),
        };
        var seritMat = Mat("KursuSerit", new Color(0.12f, 0.1f, 0.3f), 0.7f, 0f);
        foreach (var k in kursuler)
        {
            Prim(PrimitiveType.Cylinder, k.ad, menuGrup, new Vector3(k.x, 0.3f + k.h / 2, 1.2f), new Vector3(1.6f, k.h / 2, 1.6f), k.mat);
            Prim(PrimitiveType.Cylinder, k.ad + "Serit", menuGrup, new Vector3(k.x, 0.3f + k.h - 0.12f, 1.2f), new Vector3(1.64f, 0.05f, 1.64f), seritMat);
        }

        // ---------- Karakterler ----------
        var animler = new List<Animation>();
        var yerler = new[] {
            (harf: 'a', p: new Vector3(0, 1.3f, 1.2f), ry: 180f),
            (harf: 'e', p: new Vector3(-1.75f, 0.96f, 1.2f), ry: 170f),
            (harf: 'k', p: new Vector3(1.75f, 0.7f, 1.2f), ry: 190f),
            (harf: 'c', p: new Vector3(-2.9f, 0.3f, 3.5f), ry: 160f),
            (harf: 'n', p: new Vector3(2.9f, 0.3f, 3.5f), ry: 200f),
        };
        foreach (var y in yerler)
        {
            var a = Karakter(y.harf, menuGrup, y.p, y.ry);
            if (a != null) animler.Add(a);
        }
        menu.karakterler = animler.ToArray();
        menu.birinci = animler.Count > 0 ? animler[0] : null;

        // lobide oyunculara verilecek karakter şablonları (her Kenney karakteri bir kez, pasif)
        var sablonGrup = new GameObject("KarakterSablonlari").transform; sablonGrup.SetParent(kok, false);
        var sablonlar = new List<GameObject>();
        foreach (var yol in Directory.GetFiles(GorselAyar.KarakterKlasor, "character-*.fbx"))
        {
            var harf = Path.GetFileNameWithoutExtension(yol).Substring("character-".Length)[0];
            var a = Karakter(harf, sablonGrup, Vector3.zero, 180);
            if (a == null) continue;
            a.gameObject.SetActive(false); sablonlar.Add(a.gameObject);
        }
        menu.sablonlar = sablonlar.ToArray();

        // lobi basamağı (arka sıra için, koro dizilişi), kenarında pembe neon şerit
        var basamak = new GameObject("LobiBasamak").transform; basamak.SetParent(kok, false);
        Prim(PrimitiveType.Cube, "Govde", basamak, new Vector3(0, 0.3f + 0.225f, 2.6f), new Vector3(6.2f, 0.45f, 1.1f), Mat("Kemer", new Color(0.16f, 0.12f, 0.36f), 0.8f, 0.3f));
        Prim(PrimitiveType.Cube, "Neon", basamak, new Vector3(0, 0.3f + 0.42f, 2.04f), new Vector3(6.2f, 0.04f, 0.04f), Parlak("NeonPembe", new Color(4f, 0.6f, 1.8f)));
        basamak.gameObject.SetActive(false);
        menu.lobiBasamak = basamak.gameObject;

        // ---------- Perde (kıvrımlı mesh) ve üst saçak ----------
        var kadife = Mat("Kadife", new Color(0.5f, 0.05f, 0.2f), 0.32f, 0f);
        var perde = Prim(PrimitiveType.Quad, "Perde", kok, new Vector3(0, 0, 6.5f), Vector3.one, kadife);
        perde.GetComponent<MeshFilter>().sharedMesh = PerdeMesh("Perde", 22f, 11f, 34, 0.32f);
        var sacak = Prim(PrimitiveType.Quad, "Sacak", kok, new Vector3(0, 7.6f, 5.9f), Vector3.one, kadife);
        sacak.GetComponent<MeshFilter>().sharedMesh = PerdeMesh("Sacak", 22f, 1.6f, 60, 0.12f);
        Prim(PrimitiveType.Cube, "SacakSerit", kok, new Vector3(0, 7.62f, 5.75f), new Vector3(22f, 0.12f, 0.1f), kursuler[0].mat);

        // ---------- Ampullü kemer ----------
        var yanik = Parlak("AmpulYanik", new Color(6f, 4.2f, 1.8f));
        var sonuk = Parlak("AmpulSonuk", new Color(0.55f, 0.32f, 0.12f));
        var kemerMat = Mat("Kemer", new Color(0.16f, 0.12f, 0.36f), 0.8f, 0.3f);
        var ampuller = new List<Renderer>();
        const int adet = 25; const float r = 3.4f; var merkez = new Vector3(0, 0.4f, 4.6f);
        for (int i = 0; i < adet; i++)
        {
            float aci = Mathf.PI * i / (adet - 1);
            var p = merkez + new Vector3(Mathf.Cos(aci) * r, Mathf.Sin(aci) * r, 0);
            Prim(PrimitiveType.Cube, "KemerParca" + i, kok, p + new Vector3(0, 0, 0.12f), new Vector3(0.5f, 0.5f, 0.2f), kemerMat).transform.rotation = Quaternion.Euler(0, 0, aci * Mathf.Rad2Deg);
            var amp = Prim(PrimitiveType.Sphere, "Ampul" + i, kok, p, Vector3.one * 0.2f, yanik);
            amp.GetComponent<Renderer>().shadowCastingMode = ShadowCastingMode.Off;
            ampuller.Add(amp.GetComponent<Renderer>());
        }
        foreach (var sx in new[] { -1f, 1f })
            Prim(PrimitiveType.Cube, "KemerAyak", kok, new Vector3(sx * r, 0.5f, 4.72f), new Vector3(0.5f, 1.0f, 0.2f), kemerMat);
        menu.ampuller = ampuller.ToArray(); menu.ampulYanik = yanik; menu.ampulSonuk = sonuk;

        // ---------- Spot ışıkları + görünür huzmeler ----------
        var huzmeMesh = KoniMesh();
        var spotlar = new List<Light>();
        var spotTanim = new[] {
            (p: new Vector3(-4.2f, 8.5f, -1.5f), renk: new Color(1f, 0.35f, 0.65f)),
            (p: new Vector3(0f, 9.5f, -2.5f), renk: new Color(1f, 0.93f, 0.78f)),
            (p: new Vector3(4.2f, 8.5f, -1.5f), renk: new Color(0.35f, 0.78f, 1f)),
        };
        foreach (var s in spotTanim)
        {
            var l = new GameObject("Spot", typeof(Light)).GetComponent<Light>();
            l.transform.SetParent(kok); l.transform.position = s.p; l.transform.LookAt(new Vector3(0, 1.2f, 1.2f));
            l.type = LightType.Spot; l.spotAngle = 34; l.innerSpotAngle = 18; l.range = 18; l.intensity = 40; l.color = s.renk; l.shadows = LightShadows.None;
            var h = new GameObject("Huzme", typeof(MeshFilter), typeof(MeshRenderer));
            h.transform.SetParent(l.transform, false); h.transform.localScale = new Vector3(2.2f, 2.2f, 10f);
            h.GetComponent<MeshFilter>().sharedMesh = huzmeMesh;
            var hr = h.GetComponent<MeshRenderer>(); hr.sharedMaterial = HuzmeMat("Huzme" + spotlar.Count, s.renk); hr.shadowCastingMode = ShadowCastingMode.Off;
            spotlar.Add(l);
        }
        menu.spotlar = spotlar.ToArray();

        var arka = new GameObject("ArkaIsik", typeof(Light)).GetComponent<Light>();
        arka.transform.SetParent(kok); arka.transform.position = new Vector3(0, 3.2f, 3.6f);
        arka.type = LightType.Point; arka.color = new Color(0.9f, 0.3f, 1f); arka.intensity = 6; arka.range = 7;

        // ---------- Balonlar ----------
        var balonlar = new List<Transform>();
        var renkler = new[] { new Color(1f, 0.25f, 0.45f), new Color(0.25f, 0.6f, 1f), new Color(1f, 0.78f, 0.15f), new Color(0.35f, 0.9f, 0.5f), new Color(0.75f, 0.4f, 1f) };
        var ipMat = Mat("BalonIp", new Color(0.9f, 0.9f, 0.95f), 0.3f, 0f);
        var rnd = new System.Random(5);
        for (int i = 0; i < 12; i++)
        {
            float sx = i < 6 ? -1 : 1; int j = i % 6;
            var b = new GameObject("Balon" + i).transform; b.SetParent(kok);
            b.localPosition = new Vector3(sx * (2.5f + (float)rnd.NextDouble() * 1.2f), 2.6f + j * 0.38f + (float)rnd.NextDouble() * 0.3f, 2.2f + (float)rnd.NextDouble() * 1.4f);
            var top = Prim(PrimitiveType.Sphere, "Top", b, Vector3.zero, new Vector3(0.55f, 0.66f, 0.55f), Mat("Balon" + (i % renkler.Length), renkler[i % renkler.Length], 0.9f, 0.05f));
            top.transform.localPosition = Vector3.zero;
            var ip = Prim(PrimitiveType.Cylinder, "Ip", b, Vector3.zero, new Vector3(0.012f, 0.7f, 0.012f), ipMat);
            ip.transform.localPosition = new Vector3(0, -1.03f, 0); ip.GetComponent<Renderer>().shadowCastingMode = ShadowCastingMode.Off;
            balonlar.Add(b);
        }
        menu.balonlar = balonlar.ToArray();

        // ---------- Konfeti ----------
        Konfeti(kok);

        // ---------- Yansıma ----------
        var yp = new GameObject("Yansima", typeof(ReflectionProbe)).GetComponent<ReflectionProbe>();
        yp.transform.SetParent(kok); yp.transform.position = new Vector3(0, 1.5f, 0);
        yp.mode = ReflectionProbeMode.Realtime; yp.refreshMode = ReflectionProbeRefreshMode.ViaScripting;
        yp.timeSlicingMode = ReflectionProbeTimeSlicingMode.NoTimeSlicing; yp.resolution = 128; yp.size = new Vector3(30, 15, 30);
        yp.hdr = true;
        menu.yansima = yp;

        SapanKur(kok.gameObject, menu.sablonlar);

        new GameObject("Uygulama", typeof(Uygulama));
        EditorSceneManager.SaveScene(sahne, Yol);
        EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(Yol, true) };
        AssetDatabase.SaveAssets();
        Debug.Log("[SahneKur] tamam: " + Yol);
    }

    // ---------- Sapan Arenası: gökyüzünde süzülen sekizgen ada (oyun başlayınca açılır) ----------
    static void SapanKur(GameObject menuKok, GameObject[] sablonlar)
    {
        var kok = new GameObject("Sapan").transform; kok.position = new Vector3(0, 0, 300);
        var oyun = kok.gameObject.AddComponent<SapanOyunu>();
        oyun.menuKok = menuKok; oyun.sablonlar = sablonlar;

        var ada = new GameObject("Ada", typeof(MeshFilter), typeof(MeshRenderer)).transform; ada.SetParent(kok, false);
        ada.GetComponent<MeshFilter>().sharedMesh = AdaMesh();
        ada.GetComponent<MeshRenderer>().sharedMaterials = new[] {
            Mat("SapanCim", new Color(0.38f, 0.74f, 0.4f), 0.15f, 0f),
            Mat("SapanKenar", new Color(0.88f, 0.84f, 0.74f), 0.25f, 0f),
            Mat("SapanKaya", new Color(0.46f, 0.38f, 0.36f), 0.1f, 0f) };
        oyun.ada = ada;

        // bulut denizi + bulut kümeleri (sis içinde kaybolur)
        Prim(PrimitiveType.Plane, "BulutDenizi", kok, new Vector3(0, -8, 0), new Vector3(30, 1, 30), Parlak("SapanBulutDeniz", new Color(0.86f, 0.92f, 1f)));
        var bulut = Mat("SapanBulut", Color.white, 0f, 0f);
        var rnd = new System.Random(11);
        for (int i = 0; i < 18; i++)
        {
            float a = (float)(rnd.NextDouble() * Mathf.PI * 2), r = 9 + (float)rnd.NextDouble() * 16;
            var b = Prim(PrimitiveType.Sphere, "Bulut" + i, kok, new Vector3(Mathf.Cos(a) * r, -6.5f + (float)rnd.NextDouble() * 3.5f, Mathf.Sin(a) * r + 4),
                new Vector3(4 + (float)rnd.NextDouble() * 4, 1.2f + (float)rnd.NextDouble(), 3 + (float)rnd.NextDouble() * 3), bulut);
            b.GetComponent<Renderer>().shadowCastingMode = ShadowCastingMode.Off;
        }

        var tas = Prim(PrimitiveType.Sphere, "Tas", kok, Vector3.zero, Vector3.one * 0.32f, Mat("SapanTas", new Color(0.42f, 0.4f, 0.42f), 0.35f, 0f));
        tas.SetActive(false); oyun.tasSablon = tas;

        var halka = Prim(PrimitiveType.Cylinder, "Halka", kok, Vector3.zero, new Vector3(0.9f, 0.01f, 0.9f), Parlak("SapanHalka", Color.white));
        halka.GetComponent<Renderer>().shadowCastingMode = ShadowCastingMode.Off;
        halka.SetActive(false); oyun.halkaSablon = halka;

        var hedef = Prim(PrimitiveType.Cylinder, "HedefHalka", kok, Vector3.zero, new Vector3(0.55f, 0.01f, 0.55f), Parlak("SapanHedef", new Color(1.6f, 1.4f, 0.4f)));
        hedef.GetComponent<Renderer>().shadowCastingMode = ShadowCastingMode.Off;
        oyun.hedefHalka = hedef.transform;

        var nisanGo = new GameObject("Nisan", typeof(LineRenderer)); nisanGo.transform.SetParent(kok, false);
        var lr = nisanGo.GetComponent<LineRenderer>();
        lr.widthMultiplier = 0.12f; lr.numCapVertices = 4; lr.shadowCastingMode = ShadowCastingMode.Off;
        lr.sharedMaterial = Parlak("SapanNisan", new Color(1.8f, 1.6f, 0.6f));
        oyun.nisan = lr;

        // çarpma tozu
        var tozGo = new GameObject("Toz", typeof(ParticleSystem)); tozGo.transform.SetParent(kok, false);
        var ps = tozGo.GetComponent<ParticleSystem>();
        var ana = ps.main; ana.playOnAwake = false; ana.loop = false; ana.duration = 0.5f; ana.startLifetime = new ParticleSystem.MinMaxCurve(0.4f, 0.8f);
        ana.startSpeed = new ParticleSystem.MinMaxCurve(1.5f, 4f); ana.startSize = new ParticleSystem.MinMaxCurve(0.25f, 0.6f);
        ana.startColor = new Color(0.95f, 0.9f, 0.8f); ana.gravityModifier = 0.4f; ana.simulationSpace = ParticleSystemSimulationSpace.World;
        var em = ps.emission; em.rateOverTime = 0; em.SetBursts(new[] { new ParticleSystem.Burst(0, 24) });
        var sh = ps.shape; sh.shapeType = ParticleSystemShapeType.Sphere; sh.radius = 0.2f;
        var boy = ps.sizeOverLifetime; boy.enabled = true; boy.size = new ParticleSystem.MinMaxCurve(1, AnimationCurve.Linear(0, 1, 1, 0));
        var pr = tozGo.GetComponent<ParticleSystemRenderer>(); pr.sharedMaterial = Mat("SapanToz", new Color(0.95f, 0.9f, 0.82f), 0f, 0f);
        pr.renderMode = ParticleSystemRenderMode.Mesh; pr.mesh = Resources.GetBuiltinResource<Mesh>("Sphere.fbx");
        tozGo.SetActive(false); oyun.tozSablon = ps;

        kok.gameObject.SetActive(false);
    }

    // Düz gölgeli (low-poly) sekizgen ada: üstte çim (0), kenar şeridi + yan (1), altta sivri kaya (2). Köşe yarıçapı 5 (= oyun birimi 1 × S).
    static Mesh AdaMesh()
    {
        const float R = SapanOyunu.S;
        var v = new List<Vector3>(); var alt = new[] { new List<int>(), new List<int>(), new List<int>() };
        void Ucgen(int sm, Vector3 a, Vector3 b, Vector3 c) { int i = v.Count; v.Add(a); v.Add(b); v.Add(c); alt[sm].AddRange(new[] { i, i + 1, i + 2 }); }
        void Dortgen(int sm, Vector3 a, Vector3 b, Vector3 c, Vector3 d) { Ucgen(sm, a, b, c); Ucgen(sm, a, c, d); }
        Vector3 K(int k, float r, float y) { float a = Mathf.PI / 8 + k * Mathf.PI / 4; return new Vector3(Mathf.Cos(a) * r, y, Mathf.Sin(a) * r); }
        const float ic = 0.92f, yan = -0.45f;
        var rnd = new System.Random(3);
        float J(float m) => (float)(rnd.NextDouble() - 0.5) * m;
        var halka1 = new Vector3[8]; var halka2 = new Vector3[8];
        for (int k = 0; k < 8; k++) { halka1[k] = K(k, R * 0.78f, -1.7f + J(0.5f)) + new Vector3(J(0.6f), 0, J(0.6f)); halka2[k] = K(k, R * 0.42f, -3.3f + J(0.6f)) + new Vector3(J(0.6f), 0, J(0.6f)); }
        var uc = new Vector3(J(0.6f), -5.2f, J(0.6f));
        for (int k = 0; k < 8; k++)
        {
            int n = (k + 1) % 8;
            Ucgen(0, Vector3.zero, K(n, R * ic, 0), K(k, R * ic, 0));                               // çim
            Dortgen(1, K(k, R * ic, 0), K(n, R * ic, 0), K(n, R, 0), K(k, R, 0));                    // kenar şeridi
            Dortgen(1, K(k, R, 0), K(n, R, 0), K(n, R, yan), K(k, R, yan));                         // yan yüz
            Dortgen(2, K(k, R, yan), K(n, R, yan), halka1[n], halka1[k]);                           // kaya
            Dortgen(2, halka1[k], halka1[n], halka2[n], halka2[k]);
            Ucgen(2, halka2[k], halka2[n], uc);
        }
        // dışa bakan yüzler için sarma yönünü düzelt: üçgen normali merkezden dışarı/yukarı baksın
        for (int sm = 0; sm < 3; sm++)
            for (int i = 0; i < alt[sm].Count; i += 3)
            {
                Vector3 a = v[alt[sm][i]], b = v[alt[sm][i + 1]], c = v[alt[sm][i + 2]];
                var nrm = Vector3.Cross(b - a, c - a); var orta = (a + b + c) / 3;
                var dis = sm == 0 ? Vector3.up : new Vector3(orta.x, sm == 1 && orta.y > -0.01f ? 1 : 0, orta.z);
                if (sm == 2) dis = new Vector3(orta.x, -1, orta.z);
                if (Vector3.Dot(nrm, dis) < 0) { var t = alt[sm][i + 1]; alt[sm][i + 1] = alt[sm][i + 2]; alt[sm][i + 2] = t; }
            }
        var m = new Mesh { name = "SapanAda" }; m.SetVertices(v); m.subMeshCount = 3;
        for (int sm = 0; sm < 3; sm++) m.SetTriangles(alt[sm], sm);
        m.RecalculateNormals(); m.RecalculateBounds();
        return Kaydet(m, "SapanAda");
    }

    // ---------- Yardımcılar ----------
    static void Klasor(string yol)
    {
        if (AssetDatabase.IsValidFolder(yol)) return;
        AssetDatabase.CreateFolder(Path.GetDirectoryName(yol).Replace('\\', '/'), Path.GetFileName(yol));
    }

    static GameObject Prim(PrimitiveType tip, string ad, Transform ebeveyn, Vector3 konum, Vector3 olcek, Material mat)
    {
        var go = GameObject.CreatePrimitive(tip); go.name = ad;
        Object.DestroyImmediate(go.GetComponent<Collider>());
        go.transform.SetParent(ebeveyn, false); go.transform.localPosition = konum; go.transform.localScale = olcek;
        go.GetComponent<Renderer>().sharedMaterial = mat;
        return go;
    }

    static Material Mat(string ad, Color renk, float parlak, float metal, Texture2D doku = null, Vector2? tekrar = null, Color? emisyon = null)
    {
        var yol = $"{Malzeme}/{ad}.mat";
        var m = AssetDatabase.LoadAssetAtPath<Material>(yol);
        if (m == null) { m = new Material(Shader.Find("Universal Render Pipeline/Lit")); AssetDatabase.CreateAsset(m, yol); }
        m.SetColor("_BaseColor", renk); m.SetFloat("_Smoothness", parlak); m.SetFloat("_Metallic", metal);
        if (doku != null) { m.SetTexture("_BaseMap", doku); m.SetTextureScale("_BaseMap", tekrar ?? Vector2.one); }
        if (emisyon.HasValue)
        {
            m.EnableKeyword("_EMISSION"); m.SetColor("_EmissionColor", emisyon.Value);
            m.globalIlluminationFlags = MaterialGlobalIlluminationFlags.None;
        }
        EditorUtility.SetDirty(m);
        return m;
    }

    // Işıktan etkilenmeyen HDR renk: bloom parlamasını doğrudan bu renk verir (ampul, neon)
    static Material Parlak(string ad, Color hdr)
    {
        var yol = $"{Malzeme}/{ad}.mat";
        var m = AssetDatabase.LoadAssetAtPath<Material>(yol);
        if (m != null && m.shader.name != "Universal Render Pipeline/Unlit") { AssetDatabase.DeleteAsset(yol); m = null; }
        if (m == null) { m = new Material(Shader.Find("Universal Render Pipeline/Unlit")); AssetDatabase.CreateAsset(m, yol); }
        m.SetColor("_BaseColor", hdr);
        EditorUtility.SetDirty(m);
        return m;
    }

    static Material HuzmeMat(string ad, Color renk)
    {
        var yol = $"{Malzeme}/{ad}.mat";
        var m = AssetDatabase.LoadAssetAtPath<Material>(yol);
        if (m == null) { m = new Material(Shader.Find("Universal Render Pipeline/Particles/Unlit")); AssetDatabase.CreateAsset(m, yol); }
        m.SetColor("_BaseColor", new Color(renk.r, renk.g, renk.b, 0.22f));
        m.SetFloat("_Surface", 1); m.SetFloat("_Blend", 2); m.SetFloat("_Cull", 0); m.SetFloat("_ZWrite", 0);
        m.SetFloat("_SrcBlend", (float)BlendMode.SrcAlpha); m.SetFloat("_DstBlend", (float)BlendMode.One);
        m.SetFloat("_SrcBlendAlpha", (float)BlendMode.One); m.SetFloat("_DstBlendAlpha", (float)BlendMode.One);
        m.EnableKeyword("_SURFACE_TYPE_TRANSPARENT"); m.renderQueue = (int)RenderQueue.Transparent;
        EditorUtility.SetDirty(m);
        return m;
    }

    static Animation Karakter(char harf, Transform ebeveyn, Vector3 konum, float ry)
    {
        var fbx = AssetDatabase.LoadAssetAtPath<GameObject>($"{GorselAyar.KarakterKlasor}/character-{harf}.fbx");
        if (fbx == null) { Debug.LogWarning("karakter yok: " + harf); return null; }
        var go = (GameObject)PrefabUtility.InstantiatePrefab(fbx, ebeveyn);
        go.name = "Karakter_" + harf;
        var doku = AssetDatabase.LoadAssetAtPath<Texture2D>($"{GorselAyar.KarakterKlasor}/Textures/texture-{harf}.png");
        var mat = Mat("Karakter_" + harf, Color.white, 0.25f, 0f, doku);
        var b = new Bounds(); bool ilk = true;
        foreach (var rr in go.GetComponentsInChildren<Renderer>())
        {
            var mats = rr.sharedMaterials; for (int i = 0; i < mats.Length; i++) mats[i] = mat; rr.sharedMaterials = mats;
            if (ilk) { b = rr.bounds; ilk = false; } else b.Encapsulate(rr.bounds);
            if (rr is SkinnedMeshRenderer smr) smr.updateWhenOffscreen = true;
        }
        float olcek = b.size.y > 0.01f ? 1.25f / b.size.y : 1f;
        go.transform.localScale = Vector3.one * olcek;
        go.transform.localPosition = konum; go.transform.localRotation = Quaternion.Euler(0, ry, 0);
        var a = go.GetComponent<Animation>();
        if (a == null) Debug.LogWarning("Animation bileşeni yok (GorselAyar.Uygula çalıştı mı?): " + harf);
        else { a.playAutomatically = true; if (a["idle"] != null) a.clip = a["idle"].clip; a.cullingType = AnimationCullingType.AlwaysAnimate; }
        return a;
    }

    // Dikey kıvrımlı perde: x boyunca sinüs dalgası, alttan üste hafif genişleyen kıvrımlar
    static Mesh PerdeMesh(string ad, float gen, float yuk, int kivrim, float derin)
    {
        int nx = kivrim * 8, ny = 8;
        var v = new Vector3[(nx + 1) * (ny + 1)]; var uv = new Vector2[v.Length]; var tri = new List<int>();
        for (int j = 0; j <= ny; j++)
            for (int i = 0; i <= nx; i++)
            {
                float u = (float)i / nx, w = (float)j / ny;
                float x = (u - 0.5f) * gen;
                float z = Mathf.Sin(u * kivrim * Mathf.PI * 2) * derin * (0.75f + 0.25f * w);
                v[j * (nx + 1) + i] = new Vector3(x, w * yuk, z); uv[j * (nx + 1) + i] = new Vector2(u * kivrim, w);
            }
        for (int j = 0; j < ny; j++)
            for (int i = 0; i < nx; i++)
            {
                int a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
                tri.AddRange(new[] { a, c, b, b, c, d });
            }
        var m = new Mesh { name = ad, vertices = v, uv = uv, triangles = tri.ToArray() };
        m.RecalculateNormals(); m.RecalculateBounds();
        return Kaydet(m, ad);
    }

    // Işık huzmesi: tepe noktası (0,0,0), +Z yönünde açılan, uca doğru saydamlaşan açık koni
    static Mesh KoniMesh()
    {
        const int n = 32;
        var v = new List<Vector3>(); var c = new List<Color>(); var tri = new List<int>();
        for (int i = 0; i <= n; i++)
        {
            float a = Mathf.PI * 2 * i / n;
            v.Add(new Vector3(Mathf.Cos(a) * 0.02f, Mathf.Sin(a) * 0.02f, 0)); c.Add(new Color(1, 1, 1, 1));
            v.Add(new Vector3(Mathf.Cos(a) * 0.3f, Mathf.Sin(a) * 0.3f, 1)); c.Add(new Color(1, 1, 1, 0));
        }
        for (int i = 0; i < n; i++) { int a = i * 2; tri.AddRange(new[] { a, a + 1, a + 2, a + 2, a + 1, a + 3 }); }
        var m = new Mesh { name = "Huzme", vertices = v.ToArray(), colors = c.ToArray(), triangles = tri.ToArray() };
        m.RecalculateNormals(); m.RecalculateBounds();
        return Kaydet(m, "Huzme");
    }

    static Mesh Kaydet(Mesh m, string ad)
    {
        var yol = $"{MeshKlasor}/{ad}.asset";
        AssetDatabase.DeleteAsset(yol); AssetDatabase.CreateAsset(m, yol);
        return m;
    }

    static void Konfeti(Transform kok)
    {
        var go = new GameObject("Konfeti", typeof(ParticleSystem)); go.transform.SetParent(kok);
        go.transform.position = new Vector3(0, 8.5f, 1.2f);
        var ps = go.GetComponent<ParticleSystem>();
        var ana = ps.main;
        ana.loop = true; ana.prewarm = true; ana.duration = 10;
        ana.startLifetime = 11; ana.startSpeed = 0; ana.gravityModifier = 0.05f; ana.maxParticles = 700;
        ana.startSize3D = true; ana.startSizeX = new ParticleSystem.MinMaxCurve(0.09f, 0.14f); ana.startSizeY = new ParticleSystem.MinMaxCurve(0.05f, 0.08f); ana.startSizeZ = 1;
        ana.startRotation3D = true;
        ana.startRotationX = new ParticleSystem.MinMaxCurve(0, Mathf.PI * 2); ana.startRotationY = new ParticleSystem.MinMaxCurve(0, Mathf.PI * 2); ana.startRotationZ = new ParticleSystem.MinMaxCurve(0, Mathf.PI * 2);
        var g = new Gradient();
        g.SetKeys(new[] {
            new GradientColorKey(new Color(1f, 0.3f, 0.5f), 0f), new GradientColorKey(new Color(1f, 0.8f, 0.2f), 0.25f),
            new GradientColorKey(new Color(0.3f, 0.7f, 1f), 0.5f), new GradientColorKey(new Color(0.4f, 0.95f, 0.5f), 0.75f),
            new GradientColorKey(new Color(0.8f, 0.45f, 1f), 1f) }, new[] { new GradientAlphaKey(1, 0), new GradientAlphaKey(1, 1) });
        g.mode = GradientMode.Fixed;
        ana.startColor = new ParticleSystem.MinMaxGradient(g) { mode = ParticleSystemGradientMode.RandomColor };
        ana.simulationSpace = ParticleSystemSimulationSpace.World;

        var em = ps.emission; em.rateOverTime = 45;
        var sh = ps.shape; sh.shapeType = ParticleSystemShapeType.Box; sh.scale = new Vector3(12, 0.2f, 5);
        var rot = ps.rotationOverLifetime; rot.enabled = true; rot.separateAxes = true;
        rot.x = new ParticleSystem.MinMaxCurve(-5, 5); rot.y = new ParticleSystem.MinMaxCurve(-5, 5); rot.z = new ParticleSystem.MinMaxCurve(-3, 3);
        var gurultu = ps.noise; gurultu.enabled = true; gurultu.strength = 0.35f; gurultu.frequency = 0.4f; gurultu.scrollSpeed = 0.3f;

        var pr = go.GetComponent<ParticleSystemRenderer>();
        pr.renderMode = ParticleSystemRenderMode.Mesh;
        pr.mesh = Resources.GetBuiltinResource<Mesh>("Quad.fbx");
        pr.alignment = ParticleSystemRenderSpace.Local;
        var yol = $"{Malzeme}/Konfeti.mat";
        var m = AssetDatabase.LoadAssetAtPath<Material>(yol);
        if (m == null) { m = new Material(Shader.Find("Universal Render Pipeline/Particles/Lit")); AssetDatabase.CreateAsset(m, yol); }
        m.SetFloat("_Cull", 0); m.SetFloat("_Smoothness", 0.7f);
        m.EnableKeyword("_EMISSION"); m.SetColor("_EmissionColor", new Color(0.25f, 0.25f, 0.25f));
        EditorUtility.SetDirty(m);
        pr.sharedMaterial = m; pr.shadowCastingMode = ShadowCastingMode.Off;
    }

    static VolumeProfile Profil()
    {
        const string yol = "Assets/Menu/MenuPost.asset";
        AssetDatabase.DeleteAsset(yol);
        var p = ScriptableObject.CreateInstance<VolumeProfile>();
        AssetDatabase.CreateAsset(p, yol);
        var bloom = p.Add<Bloom>(true); bloom.intensity.Override(1.8f); bloom.threshold.Override(1.0f); bloom.scatter.Override(0.7f);
        var ton = p.Add<Tonemapping>(true); ton.mode.Override(TonemappingMode.ACES);
        var vin = p.Add<Vignette>(true); vin.intensity.Override(0.32f); vin.smoothness.Override(0.5f);
        var renk = p.Add<ColorAdjustments>(true); renk.postExposure.Override(0.35f); renk.saturation.Override(18f); renk.contrast.Override(8f);
        foreach (var c in p.components) AssetDatabase.AddObjectToAsset(c, p);
        EditorUtility.SetDirty(p);
        return p;
    }
}
