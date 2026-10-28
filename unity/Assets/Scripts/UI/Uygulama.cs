using System;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using PartiLigi.Net;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace PartiLigi.UI
{
    /// <summary>Uygulama kabuğu: ana menü → oda kur/katıl → lobi (→ oyun yer tutucusu). Tüm arayüz kodla kurulur.</summary>
    public class Uygulama : MonoBehaviour
    {
        Canvas _canvas;
        RectTransform _kok, _ekran;
        Text _toast; float _toastBitis;
        string _kod;
        JObject _durum;
        bool _yokla;
        string _ekranAdi = "";
        string _lobiAnahtar = "";

        const string AdAnahtar = "pl.ad";

        void Awake()
        {
            Application.targetFrameRate = 60;
            Screen.orientation = ScreenOrientation.Portrait;
            if (FindFirstObjectByType<EventSystem>() == null)
                new GameObject("EventSystem", typeof(EventSystem), typeof(StandaloneInputModule));

            var cgo = new GameObject("Canvas", typeof(Canvas), typeof(CanvasScaler), typeof(GraphicRaycaster));
            _canvas = cgo.GetComponent<Canvas>(); _canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            var cs = cgo.GetComponent<CanvasScaler>();
            cs.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            cs.referenceResolution = new Vector2(1080, 1920);
            cs.matchWidthOrHeight = 0.5f;
            _kok = (RectTransform)cgo.transform;
            Ui.Arkaplan(_kok, Ui.Lacivert, "Zemin");
            _ekran = Ui.Rect("Ekran", _kok); Ui.Doldur(_ekran);
            KurToast();

            var env = Environment.GetEnvironmentVariable("PARTI_SUNUCU");
            if (!string.IsNullOrEmpty(env)) PartiApi.Sunucu = env;
        }

        void Start() { AnaMenu(); }

        void Update()
        {
            if (_toast != null && _toast.gameObject.activeSelf && Time.unscaledTime > _toastBitis) _toast.transform.parent.gameObject.SetActive(false);
        }

        // ---------- Ortak ----------
        string Ad => PlayerPrefs.GetString(AdAnahtar, "");

        void KurToast()
        {
            var kap = Ui.Rect("Toast", _kok);
            kap.anchorMin = new Vector2(0.5f, 1); kap.anchorMax = new Vector2(0.5f, 1); kap.pivot = new Vector2(0.5f, 1);
            kap.sizeDelta = new Vector2(940, 130); kap.anchoredPosition = new Vector2(0, -90);
            var im = kap.gameObject.AddComponent<Image>(); im.color = Ui.Pembe;
            _toast = Ui.Yazi(kap, "", 42, Ui.Beyaz); Ui.Doldur(_toast.rectTransform, 24, 0, 24, 0);
            kap.gameObject.SetActive(false);
        }

        void Toast(string m)
        {
            _toast.text = m; _toastBitis = Time.unscaledTime + 3.5f;
            _toast.transform.parent.gameObject.SetActive(true); _toast.transform.parent.SetAsLastSibling();
        }

        RectTransform YeniEkran(string ad)
        {
            foreach (Transform c in _ekran) Destroy(c.gameObject);
            _ekranAdi = ad;
            var ic = Ui.Dikey(_ekran, "Icerik", 28, 70, TextAnchor.UpperCenter);
            Ui.Doldur(ic, 0, 0, 0, 80); // üstte çentik için pay
            return ic;
        }

        async void Calistir(Func<Task> is_)
        {
            try { await is_(); }
            catch (ApiHata e) { Toast(e.Message); }
            catch (Exception e) { Debug.LogException(e); Toast("Bir sorun çıktı"); }
        }

        static string AdTemizle(string s) => string.IsNullOrWhiteSpace(s) ? "Oyuncu" : s.Trim();

        // ---------- Ana menü ----------
        void AnaMenu()
        {
            _yokla = false; _kod = null; _durum = null;
            var ic = YeniEkran("menu");
            var bosUst = Ui.Rect("Bosluk", ic); Ui.Yukseklik(bosUst, 110);
            var baslik = Ui.Yazi(ic, "PARTİ\nLİGİ", 150, Ui.Beyaz, TextAnchor.MiddleCenter, true, "Baslik");
            // başlık yazı tipi Türkçe İ'yi desteklemeyebilir: Latin yazım kullan
            baslik.text = "PARTI\nLIGI"; Ui.Yukseklik(baslik, 420);
            var alt = Ui.Yazi(ic, "Arkadaşlarınla 20 mini oyun", 44, Ui.Soluk, TextAnchor.MiddleCenter, false, "Alt"); Ui.Yukseklik(alt, 80);
            var bos = Ui.Rect("Bosluk2", ic); Ui.Yukseklik(bos, 40);

            var ad = Ui.Girdi(ic, "Adın", 14); ad.text = Ad;
            var kur = Ui.Dugme(ic, "Oda Kur", "red");
            var katil = Ui.Dugme(ic, "Odaya Katıl", "blue");

            kur.onClick.AddListener(() => Calistir(async () =>
            {
                PlayerPrefs.SetString(AdAnahtar, AdTemizle(ad.text)); PlayerPrefs.Save();
                var r = await PartiApi.OdaKur(AdTemizle(ad.text));
                LobiyeGir(r);
            }));
            katil.onClick.AddListener(() => { PlayerPrefs.SetString(AdAnahtar, AdTemizle(ad.text)); PlayerPrefs.Save(); KatilEkrani(); });
        }

        // ---------- Odaya katıl ----------
        void KatilEkrani()
        {
            var ic = YeniEkran("katil");
            var geri = Ui.Dugme(ic, "‹ Geri", "grey", 44); Ui.Yukseklik(geri, 120);
            var bos = Ui.Rect("Bosluk", ic); Ui.Yukseklik(bos, 120);
            var b = Ui.Yazi(ic, "Oda kodu", 72, Ui.Beyaz); Ui.Yukseklik(b, 120);
            var kod = Ui.Girdi(ic, "ABCD", 4, 110); Ui.Yukseklik(kod, 220);
            kod.characterValidation = InputField.CharacterValidation.None;
            kod.onValueChanged.AddListener(v => { var u = v.ToUpperInvariant(); if (u != v) kod.text = u; });
            var gir = Ui.Dugme(ic, "Katıl", "green");
            geri.onClick.AddListener(AnaMenu);
            gir.onClick.AddListener(() => Calistir(async () =>
            {
                if (kod.text.Length != 4) { Toast("Oda kodu 4 harf olmalı"); return; }
                var r = await PartiApi.OdayaKatil(kod.text, AdTemizle(Ad));
                LobiyeGir(r);
            }));
        }

        // ---------- Lobi ----------
        void LobiyeGir(JObject yanit)
        {
            _durum = (JObject)yanit["state"];
            _kod = (string)_durum["code"];
            _lobiAnahtar = "";
            _yokla = true;
            Ciz();
            YoklamaDongusu();
        }

        async void YoklamaDongusu()
        {
            while (_yokla && this != null)
            {
                await Task.Delay(1000);
                if (!_yokla || this == null) break;
                try { var r = await PartiApi.Durum(_kod); if (!_yokla) break; _durum = (JObject)r["state"]; Ciz(); }
                catch (ApiHata e) { if (e.Kod == 404) { _yokla = false; Toast("Oda kapandı"); AnaMenu(); } }
                catch { /* geçici ağ hatası: bir sonraki yoklamada tekrar */ }
            }
        }

        bool BenHost => (string)_durum["hostId"] == PartiApi.PlayerId;

        void Ciz()
        {
            if (_durum == null) return;
            var status = (string)_durum["status"];
            var anahtar = status == "lobby" ? "lobby|" + _durum["rev"] : "oyun|" + status + "|" + _durum["rev"];
            if (anahtar == _lobiAnahtar) return;
            _lobiAnahtar = anahtar;
            if (status == "lobby") LobiCiz(); else OyunYerTutucu();
        }

        static Color Renk(string hex) { return ColorUtility.TryParseHtmlString(hex ?? "", out var c) ? c : Color.gray; }

        void LobiCiz()
        {
            var ic = YeniEkran("lobi");
            var ust = Ui.Yazi(ic, "ODA KODU", 40, Ui.Soluk); Ui.Yukseklik(ust, 60);
            var kod = Ui.Yazi(ic, (string)_durum["code"], 190, Ui.Beyaz, TextAnchor.MiddleCenter, true); Ui.Yukseklik(kod, 260);
            var paylas = Ui.Yazi(ic, "Arkadaşların bu kodla “Odaya Katıl” desin", 38, Ui.Soluk); Ui.Yukseklik(paylas, 80);

            var oyuncular = (JArray)_durum["players"];
            var liste = Ui.Dikey(ic, "Liste", 14, 0);
            Ui.Yukseklik(liste, 0); liste.GetComponent<LayoutElement>().flexibleHeight = 1; liste.GetComponent<LayoutElement>().minHeight = 300;
            var hostId = (string)_durum["hostId"];
            foreach (JObject p in oyuncular)
            {
                if ((bool?)p["left"] == true) continue;
                var satir = Ui.Rect("Oyuncu", liste); Ui.Yukseklik(satir, 130);
                var im = satir.gameObject.AddComponent<Image>(); im.color = Ui.LacivertAcik;
                var yuv = Ui.Rect("Rozet", satir); yuv.anchorMin = new Vector2(0, 0.5f); yuv.anchorMax = new Vector2(0, 0.5f); yuv.pivot = new Vector2(0, 0.5f);
                yuv.sizeDelta = new Vector2(90, 90); yuv.anchoredPosition = new Vector2(24, 0);
                var yi = yuv.gameObject.AddComponent<Image>(); yi.color = Renk((string)p["color"]);
                var bas = ((string)p["name"] ?? "?"); bas = bas.Length > 0 ? bas.Substring(0, 1).ToUpperInvariant() : "?";
                var yz = Ui.Yazi(yuv, bas, 54, Ui.Beyaz); Ui.Doldur(yz.rectTransform);
                var ad = (string)p["name"] + ((bool)p["bot"] ? "  🤖" : "") + ((string)p["id"] == hostId ? "  ⭐" : "") + ((string)p["id"] == PartiApi.PlayerId ? "  (sen)" : "");
                var at = Ui.Yazi(satir, ad, 46, Ui.Beyaz, TextAnchor.MiddleLeft); Ui.Doldur(at.rectTransform, 140, 0, 130, 0);
                if (BenHost && (bool)p["bot"])
                {
                    var id = (string)p["id"];
                    var sil = Ui.Dugme(satir, "✕", "grey", 40);
                    var srt = (RectTransform)sil.transform; srt.anchorMin = new Vector2(1, 0.5f); srt.anchorMax = new Vector2(1, 0.5f); srt.pivot = new Vector2(1, 0.5f);
                    srt.sizeDelta = new Vector2(100, 90); srt.anchoredPosition = new Vector2(-20, 0);
                    Destroy(sil.GetComponent<LayoutElement>());
                    sil.onClick.AddListener(() => Calistir(async () => { var r = await PartiApi.Eylem(_kod, "removeBot", new JObject { ["botId"] = id }); _durum = (JObject)r["state"]; _lobiAnahtar = ""; Ciz(); }));
                }
            }

            if (BenHost)
            {
                var bot = Ui.Dugme(ic, "+ Bot ekle", "blue", 46); Ui.Yukseklik(bot, 130);
                bot.onClick.AddListener(() => Calistir(async () => { var r = await PartiApi.Eylem(_kod, "addBot"); _durum = (JObject)r["state"]; _lobiAnahtar = ""; Ciz(); }));
                var basla = Ui.Dugme(ic, "Başlat", "red"); 
                basla.onClick.AddListener(() => Calistir(async () => { var r = await PartiApi.Eylem(_kod, "start"); _durum = (JObject)r["state"]; _lobiAnahtar = ""; Ciz(); }));
            }
            else
            {
                var bekle = Ui.Yazi(ic, "Oda sahibinin başlatması bekleniyor…", 42, Ui.Soluk); Ui.Yukseklik(bekle, 100);
            }
            var cik = Ui.Dugme(ic, "Odadan çık", "grey", 42); Ui.Yukseklik(cik, 120);
            cik.onClick.AddListener(() => Calistir(async () => { _yokla = false; try { await PartiApi.Eylem(_kod, "leave"); } catch { } AnaMenu(); }));
        }

        void OyunYerTutucu()
        {
            var ic = YeniEkran("oyun");
            var kind = (string)_durum["kind"] ?? "?";
            var t = Ui.Yazi(ic, "OYUN BAŞLADI", 90, Ui.Beyaz, TextAnchor.MiddleCenter, true); Ui.Yukseklik(t, 300);
            var k = Ui.Yazi(ic, "Oyun: " + kind + "\nBu oyunun Unity ekranı henüz yapılmadı.", 48, Ui.Soluk); Ui.Yukseklik(k, 300);
            var cik = Ui.Dugme(ic, "Odadan çık", "grey", 42);
            cik.onClick.AddListener(() => Calistir(async () => { _yokla = false; try { await PartiApi.Eylem(_kod, "leave"); } catch { } AnaMenu(); }));
        }
    }
}
