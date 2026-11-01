using UnityEditor;
using UnityEngine;

// Resources/UI altındaki düğme görsellerini 9-dilimli sprite olarak içe aktarır.
public class UiSpriteAyari : AssetPostprocessor
{
    void OnPreprocessTexture()
    {
        if (!assetPath.StartsWith("Assets/Resources/UI/") || !assetPath.EndsWith(".png")) return;
        var ti = (TextureImporter)assetImporter;
        ti.textureType = TextureImporterType.Sprite;
        ti.spriteImportMode = SpriteImportMode.Single;
        ti.spriteBorder = System.IO.Path.GetFileName(assetPath).StartsWith("menu_")
            ? new Vector4(90, 110, 90, 90)   // menü hap düğmeleri (512x200, alt 22 px derinlik)
            : new Vector4(24, 20, 24, 20);   // sol, alt, sağ, üst
        ti.mipmapEnabled = false;
        ti.filterMode = FilterMode.Bilinear;
    }
}
