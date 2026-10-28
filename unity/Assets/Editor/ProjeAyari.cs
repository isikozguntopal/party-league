// Komut satırından tek seferlik proje ayarı:
// Unity -batchmode -quit -projectPath unity -executeMethod ProjeAyari.Uygula
using UnityEditor;
using UnityEditor.Build;
using UnityEngine;

public static class ProjeAyari
{
    public static void Uygula()
    {
        PlayerSettings.companyName = "Parti Ligi";
        PlayerSettings.productName = "Parti Ligi";
        PlayerSettings.SetApplicationIdentifier(NamedBuildTarget.iOS, "com.partiligi.app");
        PlayerSettings.defaultInterfaceOrientation = UIOrientation.Portrait;
        PlayerSettings.allowedAutorotateToLandscapeLeft = false;
        PlayerSettings.allowedAutorotateToLandscapeRight = false;
        PlayerSettings.allowedAutorotateToPortraitUpsideDown = false;
        PlayerSettings.allowedAutorotateToPortrait = true;
        PlayerSettings.iOS.targetOSVersionString = "15.0";
        PlayerSettings.iOS.requiresPersistentWiFi = false;
        PlayerSettings.SetScriptingBackend(NamedBuildTarget.iOS, ScriptingImplementation.IL2CPP);
        PlayerSettings.SetArchitecture(NamedBuildTarget.iOS, 1); // ARM64
        PlayerSettings.SetUseDefaultGraphicsAPIs(BuildTarget.iOS, false);
        PlayerSettings.SetGraphicsAPIs(BuildTarget.iOS, new[] { UnityEngine.Rendering.GraphicsDeviceType.Metal });
        PlayerSettings.bundleVersion = "0.1.0";
        AssetDatabase.SaveAssets();
        Debug.Log("[ProjeAyari] tamam: iOS, com.partiligi.app, dikey, Metal, IL2CPP");
    }
}
