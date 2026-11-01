using System;
using UnityEngine;
using UnityEngine.EventSystems;

namespace PartiLigi.UI
{
    /// <summary>Basma ve bırakma anlarını ayrı bildirir (basılı tutma gereken düğmeler için). Raycast için bir Graphic olmalı.</summary>
    public class BasiliDugme : MonoBehaviour, IPointerDownHandler, IPointerUpHandler
    {
        public Action basildi, birakildi;
        public bool basili { get; private set; }
        public float basmaAni { get; private set; }
        public void OnPointerDown(PointerEventData e) { basili = true; basmaAni = Time.time; basildi?.Invoke(); }
        public void OnPointerUp(PointerEventData e) { if (!basili) return; basili = false; birakildi?.Invoke(); }
    }
}
