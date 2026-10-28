using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEngine;

// Unity -batchmode -nographics -quit -projectPath unity -executeMethod IosDerle.Calistir   → unity/Builds/iOS (Xcode projesi)
public static class IosDerle
{
    public static void Calistir()
    {
        ProjeAyari.Uygula();
        var secenek = new BuildPlayerOptions { scenes = new[] { SahneKur.Yol }, locationPathName = "Builds/iOS", target = BuildTarget.iOS, options = BuildOptions.None };
        var r = BuildPipeline.BuildPlayer(secenek);
        Debug.Log("[IosDerle] sonuç: " + r.summary.result + ", hata " + r.summary.totalErrors);
        EditorApplication.Exit(r.summary.result == BuildResult.Succeeded ? 0 : 1);
    }
}
