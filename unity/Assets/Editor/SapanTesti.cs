// SapanKural (C#) ile public/games/lazer.js aynı sonucu veriyor mu?
//   node scripts/sapan-fixture.mjs /tmp/sapan-fixture.json
//   Unity -batchmode -nographics -quit -projectPath unity -executeMethod SapanTesti.Calistir -fixture /tmp/sapan-fixture.json
using System;
using System.Collections.Generic;
using System.IO;
using Newtonsoft.Json.Linq;
using PartiLigi.Oyunlar.Sapan;
using UnityEditor;
using UnityEngine;

public static class SapanTesti
{
    public static void Calistir()
    {
        var args = Environment.GetCommandLineArgs();
        var yol = "/tmp/sapan-fixture.json";
        for (int i = 0; i < args.Length - 1; i++) if (args[i] == "-fixture") yol = args[i + 1];
        var veri = JObject.Parse(File.ReadAllText(yol));
        int hata = 0, sayi = 0;
        void Esit(string ad, double a, double b, int i)
        {
            sayi++;
            if (Math.Abs(a - b) > 1e-9) { hata++; if (hata < 20) Debug.LogError($"[SapanTesti] {ad} #{i}: C# {a} ≠ JS {b}"); }
        }
        void EsitS(string ad, string a, string b, int i)
        {
            sayi++;
            if (a != b) { hata++; if (hata < 20) Debug.LogError($"[SapanTesti] {ad} #{i}: C# {a ?? "null"} ≠ JS {b ?? "null"}"); }
        }

        int n = 0;
        foreach (JObject c in (JArray)veri["cases"])
        {
            double x = (double)c["x"], y = (double)c["y"], a = (double)c["a"], range = (double)c["range"], scale = (double)c["scale"];
            Esit("arenaScale", SapanKural.ArenaScale((int)c["round"]), (double)c["arenaScale"], n);
            Esit("cleanRange", SapanKural.CleanRange(range), (double)c["cleanRange"], n);
            var k = SapanKural.ClampInside(x, y, SapanKural.BodyR + 0.01, scale);
            Esit("clamp.x", k.x, (double)c["clamp"]["x"], n); Esit("clamp.y", k.y, (double)c["clamp"]["y"], n);
            EsitS("onPlatform", SapanKural.OnPlatform(x, y, scale).ToString(), ((bool)c["on"]).ToString(), n);
            var hedefler = new List<SapanKural.Hedef>();
            foreach (JObject t in (JArray)c["targets"]) hedefler.Add(new SapanKural.Hedef { id = (string)t["id"], x = (double)t["x"], y = (double)t["y"] });
            var at = SapanKural.CastShot(x, y, a, hedefler, scale, SapanKural.CleanRange(range));
            EsitS("cast.hit", at.hit, (string)c["cast"]["hit"], n);
            Esit("cast.x", at.x, (double)c["cast"]["x"], n); Esit("cast.y", at.y, (double)c["cast"]["y"], n);
            n++;
        }
        n = 0;
        foreach (JObject r in (JArray)veri["resolves"])
        {
            var atislar = SapanOynatici.AtislariOku((JArray)r["shots"]);
            Esit("revealMs", SapanKural.RevealMs(atislar), (double)r["dur"], n);
            n++;
        }
        Debug.Log($"[SapanTesti] {sayi} karşılaştırma, {hata} hata");
        EditorApplication.Exit(hata == 0 ? 0 : 1);
    }
}
