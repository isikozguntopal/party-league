// Ana sahneyi editörde oynatıp ekran görüntüsü ya da video kareleri alır (grafikle çalışmalı, -nographics OLMADAN):
//   Tek kare:  Unity -batchmode -projectPath unity -executeMethod MenuGoruntu.Cek -cikti /mutlak/yol.png [-sure 4] [-ekran katil|lobi|oyun:<kind>]
//   Video:     Unity -batchmode -projectPath unity -executeMethod MenuGoruntu.Cek -kayit /klasör -bas <sn> -sure <sn> [-fps 15] [-ekran …]
//              → klasöre 0001.jpg… (540×960); sonra ffmpeg ile mp4 (scripts/klip-kaydet.sh)
using System;
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering.Universal;

[InitializeOnLoad]
public static class MenuGoruntu
{
    const string Anahtar = "MenuGoruntu.cikti", SureAnahtar = "MenuGoruntu.sure", KayitAnahtar = "MenuGoruntu.kayit", BasAnahtar = "MenuGoruntu.bas", FpsAnahtar = "MenuGoruntu.fps";
    static double _bas, _sonKare = -1; static bool _hazir; static int _kare;
    static RenderTexture _rt, _uiRt;

    static MenuGoruntu() { if (SessionState.GetString(Anahtar, "") != "" || SessionState.GetString(KayitAnahtar, "") != "") EditorApplication.update += Tik; }

    static Texture2D Oku(RenderTexture rt)
    {
        var onceki = RenderTexture.active; RenderTexture.active = rt;
        var t = new Texture2D(rt.width, rt.height, TextureFormat.RGBA32, false);
        t.ReadPixels(new Rect(0, 0, rt.width, rt.height), 0, 0); t.Apply();
        RenderTexture.active = onceki;
        return t;
    }

    public static void Cek()
    {
        var args = Environment.GetCommandLineArgs();
        string cikti = Path.GetFullPath("menu.png"); float sure = 4;
        SessionState.EraseString(KayitAnahtar);
        for (int i = 0; i < args.Length - 1; i++)
        {
            var d = args[i + 1];
            switch (args[i])
            {
                case "-cikti": cikti = d; break;
                case "-ekran": Environment.SetEnvironmentVariable("PARTI_ONIZLEME", d); break;   // Uygulama.Start okur
                case "-sure": sure = Sayi(d); break;
                case "-kayit": SessionState.SetString(KayitAnahtar, d); break;
                case "-bas": SessionState.SetFloat(BasAnahtar, Sayi(d)); break;
                case "-fps": SessionState.SetFloat(FpsAnahtar, Sayi(d)); break;
            }
        }
        SessionState.SetString(Anahtar, cikti); SessionState.SetFloat(SureAnahtar, sure);
        EditorSceneManager.OpenScene(SahneKur.Yol);
        EditorApplication.update -= Tik; EditorApplication.update += Tik;
        EditorApplication.isPlaying = true;
    }
    static float Sayi(string s) => float.Parse(s, System.Globalization.CultureInfo.InvariantCulture);

    // 3D kamera + arayüz kamerası birleşik görüntü. Overlay arayüz kamerası tek başına Render() edilemez:
    // yığından çıkarılıp geçici Base kamera olarak saydam ayrı dokuya çizilir, sonra 3D'nin üstüne birleştirilir.
    static Texture2D Goruntu(Camera ana, Camera ui)
    {
        if (ui != null) ana.GetUniversalAdditionalCameraData().cameraStack.Remove(ui);
        ana.targetTexture = _rt; ana.Render();
        var tex = Oku(_rt);
        if (ui == null) return tex;
        if (_uiRt == null || _uiRt.width != _rt.width) _uiRt = new RenderTexture(_rt.width, _rt.height, 24, RenderTextureFormat.ARGB32);
        ui.targetTexture = _uiRt;
        ui.GetUniversalAdditionalCameraData().renderType = CameraRenderType.Base;
        ui.clearFlags = CameraClearFlags.SolidColor; ui.backgroundColor = new Color(0, 0, 0, 0);
        ui.allowHDR = false; ui.allowMSAA = false;
        ui.Render();
        var u = Oku(_uiRt);
        var a3 = tex.GetPixels(); var au = u.GetPixels();
        for (int i = 0; i < a3.Length; i++)
        {
            // UI shader'ı alfa kanalına a² yazar (SrcAlpha, OneMinusSrcAlpha) → gerçek örtme √a; renk zaten a ile çarpılmış
            float k = Mathf.Sqrt(au[i].a);
            a3[i] = new Color(au[i].r + a3[i].r * (1 - k), au[i].g + a3[i].g * (1 - k), au[i].b + a3[i].b * (1 - k), 1);
        }
        tex.SetPixels(a3); tex.Apply();
        UnityEngine.Object.DestroyImmediate(u);
        return tex;
    }

    static void Tik()
    {
        if (!EditorApplication.isPlaying) return;
        if (_bas == 0) _bas = EditorApplication.timeSinceStartup;
        var gecen = EditorApplication.timeSinceStartup - _bas;
        var anaKam = Camera.main; var uiKam = GameObject.Find("UIKamera")?.GetComponent<Camera>();
        var klasor = SessionState.GetString(KayitAnahtar, "");
        if (!_hazir && gecen > 0.5 && anaKam != null)
        {
            // arayüz yerleşimi hedef çözünürlüğe göre hesaplansın (kayıtta 540×960)
            _rt = klasor != "" ? new RenderTexture(540, 960, 24, RenderTextureFormat.ARGB32) { antiAliasing = 4 } : new RenderTexture(1080, 1920, 24, RenderTextureFormat.ARGB32) { antiAliasing = 4 };
            anaKam.targetTexture = _rt; if (uiKam != null) uiKam.targetTexture = _rt;
            _hazir = true;
        }
        if (!_hazir) return;
        anaKam = Camera.main;                                          // oyunlar kamerayı değiştirebilir

        if (klasor != "")
        {
            double bas = SessionState.GetFloat(BasAnahtar, 0), son = bas + SessionState.GetFloat(SureAnahtar, 6), fps = SessionState.GetFloat(FpsAnahtar, 15);
            if (gecen < bas) return;
            if (gecen <= son)
            {
                if (_sonKare >= 0 && gecen - _sonKare < 1.0 / fps) return;
                _sonKare = gecen;
                Directory.CreateDirectory(klasor);
                var t = Goruntu(anaKam, uiKam);
                File.WriteAllBytes(Path.Combine(klasor, (++_kare).ToString("0000") + ".jpg"), t.EncodeToJPG(88));
                UnityEngine.Object.DestroyImmediate(t);
                return;
            }
            Debug.Log($"[MenuGoruntu] {_kare} kare kaydedildi: {klasor}");
            Bitir();
            return;
        }

        if (gecen < SessionState.GetFloat(SureAnahtar, 4)) return;
        var tex = Goruntu(anaKam, uiKam);
        var yol = SessionState.GetString(Anahtar, "menu.png");
        Directory.CreateDirectory(Path.GetDirectoryName(yol));
        File.WriteAllBytes(yol, tex.EncodeToPNG());
        Debug.Log("[MenuGoruntu] kaydedildi: " + yol);
        Bitir();
    }

    static void Bitir()
    {
        SessionState.EraseString(Anahtar); SessionState.EraseString(KayitAnahtar);
        EditorApplication.update -= Tik;
        EditorApplication.Exit(0);
    }
}
