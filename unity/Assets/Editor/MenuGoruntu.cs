// Ana sahneyi editörde oynatıp 1080x1920 ekran görüntüsü alır (grafikle çalışmalı, -nographics OLMADAN):
// Unity -batchmode -projectPath unity -executeMethod MenuGoruntu.Cek -cikti /mutlak/yol.png [-sure 4] [-ekran katil|lobi]
using System;
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering.Universal;

[InitializeOnLoad]
public static class MenuGoruntu
{
    const string Anahtar = "MenuGoruntu.cikti", SureAnahtar = "MenuGoruntu.sure";
    static double _bas; static bool _hazir;
    static RenderTexture _rt;

    static MenuGoruntu() { if (SessionState.GetString(Anahtar, "") != "") EditorApplication.update += Tik; }

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
        for (int i = 0; i < args.Length - 1; i++)
        {
            if (args[i] == "-cikti") cikti = args[i + 1];
            if (args[i] == "-ekran") Environment.SetEnvironmentVariable("PARTI_ONIZLEME", args[i + 1]); // Uygulama.Start okur
            if (args[i] == "-sure") sure = float.Parse(args[i + 1], System.Globalization.CultureInfo.InvariantCulture);
        }
        SessionState.SetString(Anahtar, cikti); SessionState.SetFloat(SureAnahtar, sure);
        EditorSceneManager.OpenScene(SahneKur.Yol);
        EditorApplication.update -= Tik; EditorApplication.update += Tik;
        EditorApplication.isPlaying = true;
    }

    static void Tik()
    {
        if (!EditorApplication.isPlaying) return;
        if (_bas == 0) _bas = EditorApplication.timeSinceStartup;
        var gecen = EditorApplication.timeSinceStartup - _bas;
        var anaKam = Camera.main; var uiKam = GameObject.Find("UIKamera")?.GetComponent<Camera>();
        if (!_hazir && gecen > 0.5 && anaKam != null)
        {
            _rt = new RenderTexture(1080, 1920, 24, RenderTextureFormat.ARGB32) { antiAliasing = 4 };
            anaKam.targetTexture = _rt; if (uiKam != null) uiKam.targetTexture = _rt; // arayüz yerleşimi 1080x1920'ye göre hesaplansın
            _hazir = true;
        }
        if (!_hazir || gecen < SessionState.GetFloat(SureAnahtar, 4)) return;

        // Overlay arayüz kamerası tek başına Render() edilemez: yığından çıkarıp geçici Base kamera olarak
        // saydam ayrı bir dokuya çiz, sonra 3D görüntünün üstüne birleştir
        if (uiKam != null) anaKam.GetUniversalAdditionalCameraData().cameraStack.Remove(uiKam);
        anaKam.Render();
        var tex = Oku(_rt);
        if (uiKam != null)
        {
            var uiRt = new RenderTexture(1080, 1920, 24, RenderTextureFormat.ARGB32);
            uiKam.targetTexture = uiRt;
            uiKam.GetUniversalAdditionalCameraData().renderType = CameraRenderType.Base;
            uiKam.clearFlags = CameraClearFlags.SolidColor; uiKam.backgroundColor = new Color(0, 0, 0, 0);
            uiKam.allowHDR = false; uiKam.allowMSAA = false;
            uiKam.Render();
            var ui = Oku(uiRt);
            var a3 = tex.GetPixels(); var au = ui.GetPixels();
            for (int i = 0; i < a3.Length; i++)
            {
                // UI shader'ı alfa kanalına a² yazar (SrcAlpha, OneMinusSrcAlpha) → gerçek örtme √a; renk zaten a ile çarpılmış
                float k = Mathf.Sqrt(au[i].a);
                a3[i] = new Color(au[i].r + a3[i].r * (1 - k), au[i].g + a3[i].g * (1 - k), au[i].b + a3[i].b * (1 - k), 1);
            }
            tex.SetPixels(a3); tex.Apply();
        }
        var yol = SessionState.GetString(Anahtar, "menu.png");
        Directory.CreateDirectory(Path.GetDirectoryName(yol));
        File.WriteAllBytes(yol, tex.EncodeToPNG());
        Debug.Log("[MenuGoruntu] kaydedildi: " + yol);
        SessionState.EraseString(Anahtar);
        EditorApplication.update -= Tik;
        EditorApplication.Exit(0);
    }
}
