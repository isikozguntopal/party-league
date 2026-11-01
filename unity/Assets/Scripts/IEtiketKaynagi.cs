using UnityEngine;

namespace PartiLigi
{
    /// <summary>İsim etiketlerinin yerini veren 3D sahne (lobi ya da oyun). ust: etiket başın üstünde mi, ayağın altında mı.</summary>
    public interface IEtiketKaynagi { bool EtiketNoktasi(string id, out Vector3 dunya, out bool ust); }
}
