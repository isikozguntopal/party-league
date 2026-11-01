using System;
using UnityEngine;
using UnityEngine.EventSystems;

namespace PartiLigi.UI
{
    /// <summary>Parmağın alan içindeki yerini 0..1 olarak bildirir (dokun + sürükle). Raycast için alanda bir Graphic olmalı.</summary>
    public class SurukleAlan : MonoBehaviour, IPointerDownHandler, IDragHandler, IPointerUpHandler
    {
        public Action<Vector2> degisti;      // (x, y) 0..1, sol-alt köşe 0
        public Action<Vector2> ekranda;      // parmağın ekran (piksel) konumu: 3D sahnede ışın atmak için
        public Action birakildi;
        public bool etkin = true;

        void Bildir(PointerEventData e)
        {
            if (!etkin) return;
            ekranda?.Invoke(e.position);
            var rt = (RectTransform)transform;
            if (!RectTransformUtility.ScreenPointToLocalPointInRectangle(rt, e.position, e.pressEventCamera, out var p)) return;
            var r = rt.rect;
            degisti?.Invoke(new Vector2(Mathf.Clamp01((p.x - r.xMin) / r.width), Mathf.Clamp01((p.y - r.yMin) / r.height)));
        }
        public void OnPointerDown(PointerEventData e) => Bildir(e);
        public void OnDrag(PointerEventData e) => Bildir(e);
        public void OnPointerUp(PointerEventData e) { if (etkin) birakildi?.Invoke(); }
    }
}
