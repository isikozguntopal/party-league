using PartiLigi.UI;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

// Unity -batchmode -nographics -quit -projectPath unity -executeMethod SahneKur.Olustur
public static class SahneKur
{
    public const string Yol = "Assets/Scenes/Ana.unity";
    public static void Olustur()
    {
        var sahne = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
        var cam = new GameObject("Kamera", typeof(Camera), typeof(AudioListener));
        var c = cam.GetComponent<Camera>(); c.clearFlags = CameraClearFlags.SolidColor; c.backgroundColor = Ui.Lacivert; c.orthographic = true;
        new GameObject("Uygulama", typeof(Uygulama));
        EditorSceneManager.SaveScene(sahne, Yol);
        EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(Yol, true) };
        Debug.Log("[SahneKur] tamam: " + Yol);
    }
}
