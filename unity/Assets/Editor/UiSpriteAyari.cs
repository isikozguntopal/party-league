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
        ti.spriteBorder = new Vector4(24, 20, 24, 20); // sol, alt, sağ, üst
        ti.mipmapEnabled = false;
        ti.filterMode = FilterMode.Bilinear;
    }
}
