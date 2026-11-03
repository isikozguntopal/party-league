using System.Runtime.InteropServices;

namespace PartiLigi.Oyunlar.Melodi
{
    /// <summary>iPhone'da m4a önizlemeyi AVAudioPlayer ile çalar (Plugins/iOS/MelodiSes.mm). Editörde/diğer platformlarda çalışmaz (Var = false).</summary>
    public static class MelodiSes
    {
#if UNITY_IOS && !UNITY_EDITOR
        [DllImport("__Internal")] static extern void MelodiYukle(string adres);
        [DllImport("__Internal")] static extern int MelodiHazir();
        [DllImport("__Internal")] static extern void MelodiCal(float saniye);
        [DllImport("__Internal")] static extern void MelodiDur();
        [DllImport("__Internal")] static extern int MelodiCaliyor();
        public const bool Var = true;
        public static void Yukle(string adres) => MelodiYukle(adres);
        public static int Hazir => MelodiHazir();
        public static void Cal(float saniye) => MelodiCal(saniye);
        public static void Dur() => MelodiDur();
        public static bool Caliyor => MelodiCaliyor() == 1;
#else
        public const bool Var = false;
        public static void Yukle(string adres) { }
        public static int Hazir => -1;
        public static void Cal(float saniye) { }
        public static void Dur() { }
        public static bool Caliyor => false;
#endif
    }
}
