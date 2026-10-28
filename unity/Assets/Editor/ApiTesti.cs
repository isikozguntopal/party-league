using System;
using Newtonsoft.Json.Linq;
using PartiLigi.Net;
using UnityEditor;
using UnityEngine;

// Komut satırı: Unity -batchmode -nographics -projectPath unity -executeMethod ApiTesti.Calistir   (-quit KULLANMA; bitince kendisi çıkar)
public static class ApiTesti
{
    public static async void Calistir()
    {
        int cikis = 0;
        try
        {
            var env = Environment.GetEnvironmentVariable("PARTI_SUNUCU");
            if (!string.IsNullOrEmpty(env)) PartiApi.Sunucu = env;
            var r = await PartiApi.OdaKur("UnityTest");
            var kod = (string)r["state"]["code"];
            Debug.Log($"[ApiTesti] oda kuruldu: {kod}, oyuncu sayısı {((JArray)r["state"]["players"]).Count}, durum {r["state"]["status"]}");
            var d = await PartiApi.Durum(kod);
            Debug.Log($"[ApiTesti] durum: {d["state"]["status"]} host={d["state"]["hostId"]}");
            var b = await PartiApi.Eylem(kod, "addBot");
            Debug.Log($"[ApiTesti] bot eklendi: oyuncu sayısı {((JArray)b["state"]["players"]).Count}");
            try { await PartiApi.OdayaKatil("ZZZZ", "x"); Debug.LogError("[ApiTesti] hata beklenirdi"); cikis = 1; }
            catch (ApiHata e) { Debug.Log($"[ApiTesti] beklenen hata alındı: {e.Message} ({e.Kod})"); }
            Debug.Log("[ApiTesti] TAMAM");
        }
        catch (Exception e) { Debug.LogError("[ApiTesti] BAŞARISIZ: " + e); cikis = 1; }
        EditorApplication.Exit(cikis);
    }
}
