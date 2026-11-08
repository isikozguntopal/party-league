using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

namespace PartiLigi.UI
{
    /// <summary>Arayüz efektleri: konfeti patlaması, hızlı çarpı / tik, sallama, nabız. Hepsi kendi kendini yok eder.</summary>
    public class Efekt : MonoBehaviour
    {
        static readonly Color[] Renkler = { new Color32(0xF2, 0x4B, 0x7A, 255), new Color32(0xFF, 0xC8, 0x4A, 255), new Color32(0x3E, 0x8E, 0xF5, 255), new Color32(0x6C, 0xF0, 0x9A, 255), new Color32(0xB0, 0x6B, 0xFF, 255), Color.white };

        class Parca { public RectTransform rt; public Image im; public Vector2 hiz; public float don, donHiz; }
        readonly List<Parca> _parca = new List<Parca>();
        float _omur, _yas;
        System.Action<float> _kare;

        void Update()
        {
            float dt = Time.unscaledDeltaTime; _yas += dt;
            foreach (var p in _parca)
            {
                p.hiz += new Vector2(0, -2600f) * dt; p.hiz *= Mathf.Exp(-0.8f * dt);
                p.rt.anchoredPosition += p.hiz * dt; p.don += p.donHiz * dt;
                p.rt.localRotation = Quaternion.Euler(p.don * 0.6f, 0, p.don);
                var c = p.im.color; c.a = Mathf.Clamp01((_omur - _yas) / 0.6f); p.im.color = c;
            }
            _kare?.Invoke(_yas);
            if (_yas >= _omur) Destroy(gameObject);
        }

        static Efekt Yeni(Transform ebeveyn, string ad, float omur)
        {
            var rt = Ui.Rect(ad, ebeveyn); Ui.Doldur(rt);
            var e = rt.gameObject.AddComponent<Efekt>(); e._omur = omur;
            return e;
        }

        /// <summary>Konfeti patlaması: merkez (ebeveynin yerel koordinatı) etrafına renkli parçalar.</summary>
        public static void Konfeti(RectTransform ebeveyn, Vector2 merkez, int adet = 70, float guc = 1f)
        {
            var e = Yeni(ebeveyn, "Konfeti", 2.4f);
            for (int i = 0; i < adet; i++)
            {
                var rt = Ui.Rect("P", e.transform); rt.anchorMin = rt.anchorMax = new Vector2(0.5f, 0.5f);
                rt.sizeDelta = new Vector2(Random.Range(14f, 26f), Random.Range(8f, 14f)); rt.anchoredPosition = merkez;
                var im = rt.gameObject.AddComponent<Image>(); im.color = Renkler[Random.Range(0, Renkler.Length)]; im.raycastTarget = false;
                float a = Random.Range(0.15f, 0.85f) * Mathf.PI, h = Random.Range(900f, 2100f) * guc;
                e._parca.Add(new Parca { rt = rt, im = im, hiz = new Vector2(Mathf.Cos(a) * h * 0.8f, Mathf.Sin(a) * h), don = Random.Range(0, 360f), donHiz = Random.Range(-720f, 720f) });
            }
        }

        /// <summary>Hızlı büyük işaret (çarpı ya da tik): 0,45 sn'de büyüyüp söner.</summary>
        public static void Isaret(RectTransform ebeveyn, Vector2 merkez, bool dogru, float boyut = 420)
        {
            var e = Yeni(ebeveyn, dogru ? "Tik" : "Carpi", 0.55f);
            var t = Ui.Yazi(e.transform, dogru ? "✓" : "✗", (int)boyut, dogru ? new Color32(0x6C, 0xF0, 0x9A, 255) : new Color32(0xFF, 0x4D, 0x5E, 255), TextAnchor.MiddleCenter, true);
            t.rectTransform.anchorMin = t.rectTransform.anchorMax = new Vector2(0.5f, 0.5f); t.rectTransform.sizeDelta = new Vector2(boyut * 1.4f, boyut * 1.4f);
            t.rectTransform.anchoredPosition = merkez; t.horizontalOverflow = HorizontalWrapMode.Overflow; t.verticalOverflow = VerticalWrapMode.Overflow;
            Ui.Golge(t, 10, 0.5f);
            e._kare = y =>
            {
                float k = y / 0.55f;
                float olcek = k < 0.25f ? Mathf.Lerp(0.3f, 1.15f, k / 0.25f) : Mathf.Lerp(1.15f, 1f, (k - 0.25f) / 0.75f);
                t.rectTransform.localScale = Vector3.one * olcek;
                t.rectTransform.localRotation = Quaternion.Euler(0, 0, dogru ? 0 : Mathf.Sin(y * 60) * 6 * (1 - k));
                var c = t.color; c.a = k < 0.65f ? 1 : 1 - (k - 0.65f) / 0.35f; t.color = c;
            };
        }

        /// <summary>Yanlış: kısa sağa-sola dönme (konuma dokunmaz; düzen grupları içinde de güvenli).</summary>
        public static void Salla(RectTransform hedef, float sure = 0.45f, float aci = 5f)
        {
            var e = hedef.gameObject.AddComponent<Efekt>(); e._omur = sure;
            e._kare = y => hedef.localRotation = Quaternion.Euler(0, 0, Mathf.Sin(y * 60) * aci * (1 - y / sure));
            e.StartCoroutine(Bitince(e, () => hedef.localRotation = Quaternion.identity, sure));
        }

        /// <summary>Doğru: nabız gibi büyüyüp küçülme.</summary>
        public static void Nabiz(Transform hedef, float sure = 0.9f)
        {
            var e = hedef.gameObject.AddComponent<Efekt>(); e._omur = sure;
            e._kare = y => hedef.localScale = Vector3.one * (1 + 0.08f * Mathf.Sin(y / sure * Mathf.PI * 3) * (1 - y / sure));
            e.StartCoroutine(Bitince(e, () => hedef.localScale = Vector3.one, sure));
        }

        // hedefe eklenen bileşen hedefin kendisini yok etmesin: süre bitince yalnızca bileşen kalkar
        static System.Collections.IEnumerator Bitince(Efekt e, System.Action son, float sure)
        {
            e._omur = float.MaxValue;
            yield return new WaitForSecondsRealtime(sure);
            son(); Destroy(e);
        }
    }
}
