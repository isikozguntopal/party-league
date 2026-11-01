// Görüntü kurulumu: URP mobil ayar dosyası + Kenney karakterlerini Legacy animasyonla içe aktarma.
// Unity -batchmode -nographics -quit -projectPath unity -executeMethod GorselAyar.Uygula
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

public static class GorselAyar
{
    const string Klasor = "Assets/Ayarlar";
    const string UrpYol = Klasor + "/URP-Mobil.asset";
    const string RendererYol = Klasor + "/URP-Mobil-Renderer.asset";
    public const string KarakterKlasor = "Assets/Kenney/Karakterler";

    public static void Uygula()
    {
        Urp();
        Karakterler();
        AssetDatabase.SaveAssets();
        Debug.Log("[GorselAyar] tamam");
    }

    static void Urp()
    {
        if (!AssetDatabase.IsValidFolder(Klasor)) AssetDatabase.CreateFolder("Assets", "Ayarlar");
        var asset = AssetDatabase.LoadAssetAtPath<UniversalRenderPipelineAsset>(UrpYol);
        if (asset == null)
        {
            var veri = ScriptableObject.CreateInstance<UniversalRendererData>();
            AssetDatabase.CreateAsset(veri, RendererYol);
            asset = UniversalRenderPipelineAsset.Create(veri);
            AssetDatabase.CreateAsset(asset, UrpYol);
        }
        // CreateInstance ile kurulan renderer'da post-processing verisi boş kalır → paketin varsayılanını bağla
        var veriR = AssetDatabase.LoadAssetAtPath<UniversalRendererData>(RendererYol);
        if (veriR != null && veriR.postProcessData == null)
        {
            veriR.postProcessData = AssetDatabase.LoadAssetAtPath<PostProcessData>("Packages/com.unity.render-pipelines.universal/Runtime/Data/PostProcessData.asset");
            EditorUtility.SetDirty(veriR);
        }
        asset.supportsHDR = true;
        asset.msaaSampleCount = 4;
        asset.shadowDistance = 30f;
        asset.mainLightShadowmapResolution = 2048;
        var so = new SerializedObject(asset);
        so.FindProperty("m_MainLightShadowsSupported").boolValue = true;
        so.FindProperty("m_SoftShadowsSupported").boolValue = true;
        so.FindProperty("m_AdditionalLightsRenderingMode").intValue = (int)LightRenderingMode.PerPixel;
        so.ApplyModifiedPropertiesWithoutUndo();
        EditorUtility.SetDirty(asset);

        GraphicsSettings.defaultRenderPipeline = asset;
        var eski = QualitySettings.GetQualityLevel();
        for (int i = 0; i < QualitySettings.names.Length; i++) { QualitySettings.SetQualityLevel(i, false); QualitySettings.renderPipeline = asset; }
        QualitySettings.SetQualityLevel(eski, false);
    }

    // Karakter FBX'leri: Legacy animasyon (Animation bileşeni, Animator denetleyicisi gerekmez), döngülü klipler
    static readonly string[] Donguler = { "idle", "walk", "sprint", "emote-yes", "static" };
    static void Karakterler()
    {
        foreach (var yol in Directory.GetFiles(KarakterKlasor, "*.fbx"))
        {
            var imp = (ModelImporter)AssetImporter.GetAtPath(yol.Replace('\\', '/'));
            if (imp == null) continue;
            imp.animationType = ModelImporterAnimationType.Legacy;
            imp.importAnimation = true;
            var klipler = imp.defaultClipAnimations;
            foreach (var k in klipler)
            {
                var dongu = Donguler.Contains(k.name);
                k.loopTime = dongu;
                k.wrapMode = dongu ? WrapMode.Loop : WrapMode.Once;
            }
            imp.clipAnimations = klipler;
            imp.SaveAndReimport();
        }
    }
}
