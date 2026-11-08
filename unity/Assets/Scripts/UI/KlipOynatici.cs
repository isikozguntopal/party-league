using System.IO;
using UnityEngine;
using UnityEngine.UI;
using UnityEngine.Video;

namespace PartiLigi.UI
{
    /// <summary>
    /// Oynanış klibi oynatıcı: StreamingAssets/Klipler/{ad}.mp4 (scripts/klipler-hepsi.sh) → RenderTexture.
    /// Ana ekran ve oyun kataloğu kullanır. Ses yok, döngüde oynar.
    /// </summary>
    public class KlipOynatici : MonoBehaviour
    {
        VideoPlayer _vp; RenderTexture _rt; string _ad;
        public RenderTexture Doku => _rt;
        public string Ad => _ad;
        public bool Oynuyor => _vp != null && _vp.isPlaying && _vp.frame > 0;

        public static KlipOynatici Olustur(Transform ebeveyn)
        {
            var go = new GameObject("KlipOynatici"); go.transform.SetParent(ebeveyn, false);
            var k = go.AddComponent<KlipOynatici>();
            k._rt = new RenderTexture(540, 960, 0, RenderTextureFormat.ARGB32);
            k._vp = go.AddComponent<VideoPlayer>();
            k._vp.playOnAwake = false; k._vp.isLooping = true; k._vp.skipOnDrop = true;
            k._vp.renderMode = VideoRenderMode.RenderTexture; k._vp.targetTexture = k._rt;
            k._vp.audioOutputMode = VideoAudioOutputMode.None; k._vp.source = VideoSource.Url;
            return k;
        }

        public static bool Var(string ad) => File.Exists(Path.Combine(Application.streamingAssetsPath, "Klipler", ad + ".mp4")) || Application.platform == RuntimePlatform.IPhonePlayer;

        public void Oynat(string ad)
        {
            if (_ad == ad && _vp.isPlaying) return;
            _ad = ad;
            _vp.url = Path.Combine(Application.streamingAssetsPath, "Klipler", ad + ".mp4");
            _vp.Play();
        }

        public void Durdur() { _vp.Stop(); _ad = null; }

        void OnDestroy() { if (_rt != null) { _rt.Release(); Destroy(_rt); } }

        /// <summary>Ebeveyni kaplayan video görüntüsü (9:16 klip, ekranı taşırarak doldurur).</summary>
        public RawImage Goruntu(RectTransform ebeveyn)
        {
            var r = Ui.Rect("Video", ebeveyn); Ui.Doldur(r);
            var raw = r.gameObject.AddComponent<RawImage>(); raw.texture = _rt; raw.raycastTarget = false;
            var f = r.gameObject.AddComponent<AspectRatioFitter>(); f.aspectMode = AspectRatioFitter.AspectMode.EnvelopeParent; f.aspectRatio = 540f / 960f;
            return raw;
        }
    }
}
