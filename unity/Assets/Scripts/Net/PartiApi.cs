using System;
using System.Text;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.Networking;

namespace PartiLigi.Net
{
    /// <summary>Sunucu hatası (sunucunun gönderdiği Türkçe mesajı taşır).</summary>
    public class ApiHata : Exception
    {
        public long Kod;
        public ApiHata(string mesaj, long kod = 0) : base(mesaj) { Kod = kod; }
    }

    /// <summary>
    /// Netlify /api ucuyla konuşur (PWA ile aynı JSON protokolü). Tüm çağrılar: POST { action, playerId, ... }.
    /// Yanıt: { state, now, ... } ya da { error }.
    /// </summary>
    public static class PartiApi
    {
        public const string VarsayilanSunucu = "https://parti-ligi.lazer-kafes.workers.dev";
        public static string Sunucu = VarsayilanSunucu;

        const string IdAnahtar = "pl.playerId";
        static string _playerId;

        /// <summary>Cihaza kalıcı oyuncu kimliği (sunucu: ^[a-z0-9-]{4,40}$).</summary>
        public static string PlayerId
        {
            get
            {
                if (_playerId != null) return _playerId;
                _playerId = PlayerPrefs.GetString(IdAnahtar, "");
                if (string.IsNullOrEmpty(_playerId))
                {
                    _playerId = "u" + Guid.NewGuid().ToString("N").Substring(0, 20);
                    PlayerPrefs.SetString(IdAnahtar, _playerId);
                    PlayerPrefs.Save();
                }
                return _playerId;
            }
            set { _playerId = value; }
        }

        public static async Task<JObject> Cagir(JObject govde)
        {
            govde["playerId"] = PlayerId;
            var bayt = Encoding.UTF8.GetBytes(govde.ToString(Newtonsoft.Json.Formatting.None));
            using var istek = new UnityWebRequest(Sunucu + "/api", "POST");
            istek.uploadHandler = new UploadHandlerRaw(bayt);
            istek.downloadHandler = new DownloadHandlerBuffer();
            istek.SetRequestHeader("Content-Type", "application/json");
            istek.timeout = 15;
            await istek.SendWebRequest();

            var metin = istek.downloadHandler.text;
            JObject yanit = null;
            try { yanit = string.IsNullOrEmpty(metin) ? null : JObject.Parse(metin); } catch { /* json değil */ }

            if (yanit != null && yanit["error"] != null)
                throw new ApiHata(yanit["error"].ToString(), istek.responseCode);
            if (istek.result != UnityWebRequest.Result.Success || yanit == null)
                throw new ApiHata("Bağlantı kurulamadı", istek.responseCode);
            return yanit;
        }

        public static Task<JObject> Cagir(string action, object ek = null)
        {
            var g = ek == null ? new JObject() : JObject.FromObject(ek);
            g["action"] = action;
            return Cagir(g);
        }

        // ---- Sık kullanılan çağrılar ----
        public static Task<JObject> OdaKur(string ad, JObject gorunum = null) => Cagir(new JObject { ["action"] = "create", ["name"] = ad, ["look"] = gorunum });
        public static Task<JObject> OdayaKatil(string kod, string ad, JObject gorunum = null) => Cagir(new JObject { ["action"] = "join", ["code"] = kod.ToUpperInvariant(), ["name"] = ad, ["look"] = gorunum });
        public static Task<JObject> Durum(string kod) => Cagir(new JObject { ["action"] = "state", ["code"] = kod });
        public static Task<JObject> Eylem(string kod, string action, JObject ek = null)
        {
            var g = ek ?? new JObject();
            g["action"] = action; g["code"] = kod;
            return Cagir(g);
        }
    }
}
