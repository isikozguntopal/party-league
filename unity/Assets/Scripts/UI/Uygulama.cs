using System;
using System.Linq;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using System.Collections.Generic;
using PartiLigi.Menu;
using PartiLigi.Net;
using PartiLigi.Oyunlar;
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
        Image _zemin;
        MenuSahnesi _sahne;                       // 3D arka plan (yoksa düz zemin)
        IEtiketKaynagi _etiketKaynagi;            // isim etiketlerinin yerini veren sahne (lobi ya da oyun)
        OyunEkrani _oyun; string _oyunAnahtar;    // açık oyun ekranı (kind/seq)
        RectTransform _sonucPanel, _kapiPanel; string _kapiAnahtar;   // sonuç paneli; takım oyunlarında "Takımlar" kapısı
        bool _otomatikHamle;                      // önizleme: oyun kendiliğinden oynasın
        RectTransform _etiketKok;                 // lobide karakterlerin üstündeki isim etiketleri
        readonly Dictionary<string, RectTransform> _etiketler = new Dictionary<string, RectTransform>();
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
            cgo.layer = 5; // UI
            _canvas = cgo.GetComponent<Canvas>(); _canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            // Sahnede arayüz kamerası varsa (3D menü sahnesinin üstüne yığılan URP kamerası) ona bağlan
            var uiKam = GameObject.Find("UIKamera");
            if (uiKam != null) { _canvas.renderMode = RenderMode.ScreenSpaceCamera; _canvas.worldCamera = uiKam.GetComponent<Camera>(); _canvas.planeDistance = 10; }
            var cs = cgo.GetComponent<CanvasScaler>();
            cs.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            cs.referenceResolution = new Vector2(1080, 1920);
            cs.matchWidthOrHeight = 0.5f;
            _kok = (RectTransform)cgo.transform;
            _zemin = Ui.Arkaplan(_kok, Ui.Lacivert, "Zemin"); _zemin.raycastTarget = false;
            _etiketKok = Ui.Rect("Etiketler", _kok); Ui.Doldur(_etiketKok);
            _ekran = Ui.Rect("Ekran", _kok); Ui.Doldur(_ekran);
            _sahne = FindFirstObjectByType<MenuSahnesi>();
            KurToast();

            var env = Environment.GetEnvironmentVariable("PARTI_SUNUCU");
            if (!string.IsNullOrEmpty(env)) PartiApi.Sunucu = env;
        }

        void Start()
        {
            // Telefonsuz görsel kontrol (MenuGoruntu -ekran katil|lobi): sunucuya gitmeden ekranı aç
            var onizleme = Environment.GetEnvironmentVariable("PARTI_ONIZLEME");
            if (onizleme == "katil") { KatilEkrani(); return; }
            if (onizleme == "lobi" || onizleme == "lobi-secici") { _durum = OrnekLobi(); _kod = (string)_durum["code"]; Ciz(); if (onizleme == "lobi-secici") OyunSecici(); return; }
            if (onizleme == "sapan" || (onizleme ?? "").StartsWith("oyun:"))
            {
                // gerçek (yerel) sunucuyla uçtan uca: oda kur → 3 bot → oyun → kendiliğinden oyna
                var tur = onizleme == "sapan" ? "lazer" : onizleme.Substring(5);
                _otomatikHamle = true;
                Calistir(async () =>
                {
                    var r = await PartiApi.OdaKur("Özgün"); LobiyeGir(r);
                    for (int i = 0; i < 3; i++) await PartiApi.Eylem(_kod, "addBot");
                    if (tur.Contains(","))   // turnuva: "oyun:suru,ayar"
                    {
                        await PartiApi.Eylem(_kod, "mode", new JObject { ["mode"] = "tour" });
                        await PartiApi.Eylem(_kod, "tourGames", new JObject { ["games"] = new JArray(tur.Split(',')) });
                    }
                    else await PartiApi.Eylem(_kod, "mode", new JObject { ["mode"] = tur });
                    r = await PartiApi.Eylem(_kod, "start"); _durum = (JObject)r["state"]; Ciz();
                });
                return;
            }
            AnaMenu();
        }

        static JObject OrnekLobi()
        {
            var ben = PartiApi.PlayerId;
            return JObject.Parse(@"{""code"":""KEDİ"",""status"":""lobby"",""rev"":1,""hostId"":""" + ben + @""",""players"":[
                {""id"":""" + ben + @""",""name"":""Özgün"",""color"":""#ff4d80"",""bot"":false},
                {""id"":""b1"",""name"":""Şeyma"",""color"":""#46a0ff"",""bot"":false},
                {""id"":""b2"",""name"":""Bot Gığı"",""color"":""#ffba30"",""bot"":true},
                {""id"":""b3"",""name"":""Bot Çaça"",""color"":""#5ad27a"",""bot"":true},
                {""id"":""b4"",""name"":""Ilgın"",""color"":""#b06bff"",""bot"":false},
                {""id"":""b5"",""name"":""Bot Pıtırcık"",""color"":""#ff8a3d"",""bot"":true},
                {""id"":""b6"",""name"":""Görkem"",""color"":""#2ec4c4"",""bot"":false}]}");
        }

        void Update()
        {
            if (_toast != null && _toast.gameObject.activeSelf && Time.unscaledTime > _toastBitis) _toast.transform.parent.gameObject.SetActive(false);
            if (_oyun != null) OyunKare();
            EtiketleriYerlestir();
        }

        // İsim etiketlerini 3D karakterlerin başının üstüne taşı (dünya → ekran → tuval)
        void EtiketleriYerlestir()
        {
            if (_etiketKaynagi == null || _etiketler.Count == 0) return;
            var kam = Camera.main; if (kam == null) return;
            foreach (var kv in _etiketler)
            {
                var gorunur = _etiketKaynagi.EtiketNoktasi(kv.Key, out var dunya, out var ust);
                kv.Value.gameObject.SetActive(gorunur);
                if (!gorunur) continue;
                var ekran = kam.WorldToScreenPoint(dunya);
                if (RectTransformUtility.ScreenPointToLocalPointInRectangle(_kok, ekran, _canvas.worldCamera, out var yerel))
                {
                    kv.Value.pivot = new Vector2(0.5f, ust ? 0 : 1); // başın üstünde alttan, ayağın altında üstten asılı
                    kv.Value.anchoredPosition = yerel;
                }
            }
        }

        void EtiketleriTemizle()
        {
            foreach (var e in _etiketler.Values) if (e != null) Destroy(e.gameObject);
            _etiketler.Clear();
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
            EtiketleriTemizle();
            if (ad != "lobi" && _sahne != null) _sahne.LobiModu(false);
            if (_oyun != null) { _oyun.Kapat(); _oyun = null; _oyunAnahtar = null; }
            _etiketKaynagi = _sahne;
            // menü ve lobide 3D sahne görünür; diğer ekranlarda okunurluk için koyu perde
            var z = Ui.Lacivert; z.a = _sahne == null ? 1f : ad == "menu" ? 0f : ad == "lobi" ? 0.15f : 0.82f; _zemin.color = z;
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
            var bosUst = Ui.Rect("Bosluk", ic); Ui.Yukseklik(bosUst, 40);
            var baslik = Ui.Yazi(ic, "PARTİ LİGİ", 150, Ui.Beyaz, TextAnchor.MiddleCenter, true, "Baslik");
            baslik.horizontalOverflow = HorizontalWrapMode.Overflow; baslik.resizeTextForBestFit = true; baslik.resizeTextMaxSize = 150; baslik.resizeTextMinSize = 60;
            var dis = baslik.gameObject.AddComponent<Outline>(); dis.effectColor = new Color32(0xC2, 0x1E, 0x5A, 255); dis.effectDistance = new Vector2(5, -5);
            Ui.Golge(baslik, 14, 0.6f);
            Ui.Yukseklik(baslik, 200);
            var alt = Ui.Yazi(ic, "Arkadaşlarınla 20 mini oyun!", 50, new Color32(0xFF, 0xB8, 0xD2, 255), TextAnchor.MiddleCenter, true, "Alt"); Ui.Yukseklik(alt, 80);
            Ui.Golge(alt, 4, 0.7f);
            var orta = Ui.Rect("Sahne", ic); Ui.Yukseklik(orta, 0); orta.GetComponent<LayoutElement>().flexibleHeight = 1; // 3D kürsü burada görünür

            var ad = Ui.Girdi(ic, "Adın", 14); ad.text = Ad;
            var kur = Ui.Dugme(ic, "Oda Kur", "menu_pembe", 64);
            var katil = Ui.Dugme(ic, "Odaya Katıl", "menu_mavi", 64);
            var bosAlt = Ui.Rect("BoslukAlt", ic); Ui.Yukseklik(bosAlt, 30);

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
            var ustSatir = Ui.Rect("UstSatir", ic); Ui.Yukseklik(ustSatir, 120);
            var geri = Ui.Dugme(ustSatir, "‹ Geri", "menu_gri", 44); Destroy(geri.GetComponent<LayoutElement>());
            var grt = (RectTransform)geri.transform; grt.anchorMin = grt.anchorMax = new Vector2(0, 0.5f); grt.pivot = new Vector2(0, 0.5f);
            grt.sizeDelta = new Vector2(300, 120); grt.anchoredPosition = Vector2.zero;
            var bos = Ui.Rect("Bosluk", ic); Ui.Yukseklik(bos, 160);
            var b = Ui.Yazi(ic, "Oda kodu", 96, Ui.Beyaz, TextAnchor.MiddleCenter, true); Ui.Yukseklik(b, 150); Ui.Golge(b, 8, 0.6f);
            var ipucu = Ui.Yazi(ic, "Arkadaşının ekranındaki 4 harfi yaz", 42, Ui.Soluk); Ui.Yukseklik(ipucu, 70);
            var kod = Ui.Girdi(ic, "ABCD", 4, 120); Ui.Yukseklik(kod, 230);
            kod.textComponent.font = Ui.Baslik; ((Text)kod.placeholder).font = Ui.Baslik;
            kod.characterValidation = InputField.CharacterValidation.None;
            kod.onValueChanged.AddListener(v => { var u = v.ToUpperInvariant(); if (u != v) kod.text = u; });
            var gir = Ui.Dugme(ic, "Katıl", "menu_pembe", 64);
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
            // Unity'de olan oyun: ekran oyun (kind/seq) başına bir kez kurulur, her durum ona aktarılır
            var kind = (string)_durum["kind"];
            if (status != "lobby" && OyunKayit.Var(kind))
            {
                var oyunAnahtar = kind + "/" + _durum["seq"];
                if (_oyun == null || _oyunAnahtar != oyunAnahtar) OyunAc(kind, oyunAnahtar);
                _oyun.B.durum = _durum; _oyun.Durum();
                _lobiAnahtar = "";
                return;
            }
            var anahtar = status == "lobby" ? "lobby|" + _durum["rev"] : "oyun|" + status + "|" + _durum["rev"];
            if (anahtar == _lobiAnahtar) return;
            _lobiAnahtar = anahtar;
            if (status == "lobby") LobiCiz(); else OyunYerTutucu();
        }

        static Color Renk(string hex) { return ColorUtility.TryParseHtmlString(hex ?? "", out var c) ? c : Color.gray; }

        void LobiCiz()
        {
            var ic = YeniEkran("lobi");
            var ust = Ui.Yazi(ic, "ODA KODU", 44, new Color32(0xFF, 0xB8, 0xD2, 255), TextAnchor.MiddleCenter, true); Ui.Yukseklik(ust, 56); Ui.Golge(ust, 4, 0.7f);
            var kod = Ui.Yazi(ic, (string)_durum["code"], 170, Ui.Beyaz, TextAnchor.MiddleCenter, true); Ui.Yukseklik(kod, 200);
            var kodDis = kod.gameObject.AddComponent<Outline>(); kodDis.effectColor = new Color32(0xC2, 0x1E, 0x5A, 255); kodDis.effectDistance = new Vector2(6, -6);
            Ui.Golge(kod, 14, 0.6f);
            var paylas = Ui.Yazi(ic, "Arkadaşların bu kodla “Odaya Katıl” desin", 38, Ui.Beyaz); Ui.Yukseklik(paylas, 60); Ui.Golge(paylas, 3, 0.8f);
            var orta = Ui.Rect("Sahne", ic); Ui.Yukseklik(orta, 0); orta.GetComponent<LayoutElement>().flexibleHeight = 1; // karakterler burada

            var hostId = (string)_durum["hostId"];
            var oyuncular = new List<JObject>();
            foreach (JObject p in (JArray)_durum["players"]) if ((bool?)p["left"] != true) oyuncular.Add(p);
            var sayi = Ui.Yazi(ic, oyuncular.Count + " / 10 oyuncu", 40, Ui.Soluk, TextAnchor.MiddleCenter, true); Ui.Yukseklik(sayi, 56); Ui.Golge(sayi, 3, 0.8f);

            // oyun seçimi: turnuva ya da tek oyun (oda sahibi seçer, diğerleri görür)
            var mod = (string)_durum["mode"] ?? "tour";
            var modAd = mod != "tour" && OyunKayit.Var(mod) ? OyunKayit.Ad(mod) : $"Turnuva ({OyunKayit.Sayi} oyun)";
            if (BenHost)
            {
                var sec = Ui.Dugme(ic, "Oyun: " + modAd + "  ›", "menu_sari", 46); Ui.Yukseklik(sec, 130);
                sec.onClick.AddListener(OyunSecici);
            }
            else { var m = Ui.Yazi(ic, "Oyun: " + modAd, 44, new Color32(0xFF, 0xC8, 0x4A, 255), TextAnchor.MiddleCenter, true); Ui.Yukseklik(m, 70); Ui.Golge(m, 3, 0.8f); }

            if (BenHost)
            {
                var basla = Ui.Dugme(ic, "Başlat", "menu_pembe", 64);
                basla.onClick.AddListener(() => Calistir(Baslat));
                var satir = Ui.Yatay(ic, "AltSatir", 28); Ui.Yukseklik(satir, 170);
                var bot = Ui.Dugme(satir, "+ Bot", "menu_mavi", 50);
                bot.onClick.AddListener(() => Calistir(async () => { var r = await PartiApi.Eylem(_kod, "addBot"); _durum = (JObject)r["state"]; _lobiAnahtar = ""; Ciz(); }));
                var cik = Ui.Dugme(satir, "Çık", "menu_gri", 50);
                cik.onClick.AddListener(OdadanCik);
            }
            else
            {
                var bekle = Ui.Yazi(ic, "Oda sahibinin başlatması bekleniyor…", 42, Ui.Beyaz); Ui.Yukseklik(bekle, 90); Ui.Golge(bekle, 3, 0.8f);
                var cik = Ui.Dugme(ic, "Odadan çık", "menu_gri", 46);
                cik.onClick.AddListener(OdadanCik);
            }

            // 3D sahne: her oyuncu kendi karakteriyle, üstünde isim etiketi
            var idler = new List<string>();
            foreach (var p in oyuncular) idler.Add((string)p["id"]);
            if (_sahne != null) { _sahne.LobiModu(true); _sahne.Oyuncular(idler); }
            foreach (var p in oyuncular) _etiketler[(string)p["id"]] = Etiket(p, hostId);
            if (_oyun != null) OyunKare();
            EtiketleriYerlestir();
        }

        // Turnuva yalnızca Unity'de oynanabilen oyunlarla (OyunKayit) başlatılır; tek oyun varsa doğrudan o
        // Oyun seçici: Turnuva + Unity'de oynanabilen her oyun; seçince odanın modu değişir (herkes görür)
        void OyunSecici()
        {
            var panel = Ui.Rect("OyunSecici", _ekran); Ui.Doldur(panel, 50, 200, 50, 220);
            Ui.Kart(panel.gameObject, new Color(0.08f, 0.06f, 0.22f, 0.95f), 0.6f);
            var ic = Ui.Dikey(panel, "Icerik", 16, 44); Ui.Doldur(ic);
            var b = Ui.Yazi(ic, "Ne oynayalım?", 64, Ui.Beyaz, TextAnchor.MiddleCenter, true); Ui.Yukseklik(b, 100); Ui.Golge(b, 5, 0.6f);
            var mod = (string)_durum["mode"] ?? "tour";
            void Sec(string kind) => Calistir(async () =>
            {
                Destroy(panel.gameObject);
                var r = await PartiApi.Eylem(_kod, "mode", new JObject { ["mode"] = kind });
                _durum = (JObject)r["state"]; _lobiAnahtar = ""; Ciz();
            });
            var tur = OyunUi.Secenek(ic, $"Turnuva · {OyunKayit.Sayi} oyun sırayla", mod == "tour" || !OyunKayit.Var(mod) ? (Color)Ui.Pembe : new Color(1, 1, 1, 0.14f), 130, 44);
            tur.d.onClick.AddListener(() => Sec("tour"));
            var liste = OyunKayit.Hepsi().ToList();
            for (int i = 0; i < liste.Count; i += 2)
            {
                var satir = Ui.Yatay(ic, "Satir", 16); Ui.Yukseklik(satir, 120);
                for (int j = i; j < Mathf.Min(i + 2, liste.Count); j++)
                {
                    var (kind, ad) = liste[j];
                    var s = OyunUi.Secenek(satir, ad, mod == kind ? (Color)Ui.Pembe : OyunUi.SikRenk[(j + 1) % 4] * new Color(1, 1, 1, 0.8f), 120, 36);
                    s.d.onClick.AddListener(() => Sec(kind));
                }
            }
            var bos = Ui.Rect("Bosluk", ic); Ui.Yukseklik(bos, 0); bos.GetComponent<LayoutElement>().flexibleHeight = 1;
            var kapat = Ui.Dugme(ic, "Kapat", "menu_gri", 46); Ui.Yukseklik(kapat, 130);
            kapat.onClick.AddListener(() => Destroy(panel.gameObject));
        }

        async Task Baslat()
        {
            var secili = (string)_durum["mode"];
            if (secili != "tour" && OyunKayit.Var(secili)) { /* tek oyun: mod zaten seçili */ }
            else if (OyunKayit.Sayi > 1)
            {
                if ((string)_durum["mode"] != "tour") await PartiApi.Eylem(_kod, "mode", new JObject { ["mode"] = "tour" });
                await PartiApi.Eylem(_kod, "tourGames", new JObject { ["games"] = OyunKayit.Turlar() });
            }
            else if ((string)_durum["mode"] != (string)OyunKayit.Turlar()[0]) await PartiApi.Eylem(_kod, "mode", new JObject { ["mode"] = OyunKayit.Turlar()[0] });
            var r = await PartiApi.Eylem(_kod, "start"); _durum = (JObject)r["state"]; _lobiAnahtar = ""; Ciz();
        }

        void OdadanCik() => Calistir(async () => { _yokla = false; try { await PartiApi.Eylem(_kod, "leave"); } catch { } AnaMenu(); });

        // Oyuncu rengindeki isim kartı (alt-orta noktası karakterin başına oturur); bot için oda sahibine X düğmesi
        // Oyunda küçük isim etiketi (yalnızca ad, oyuncu renginde)
        RectTransform KucukEtiket(JObject p)
        {
            var id = (string)p["id"];
            var rt = Ui.Rect("Etiket_" + id, _etiketKok);
            rt.anchorMin = rt.anchorMax = new Vector2(0.5f, 0.5f); rt.pivot = new Vector2(0.5f, 0); rt.sizeDelta = new Vector2(150, 50);
            var renk = Renk((string)p["color"]); renk.a = 0.9f;
            Ui.Kart(rt.gameObject, renk, 4f).raycastTarget = false;
            var ad = Ui.Yazi(rt, id == PartiApi.PlayerId ? "Sen" : (string)p["name"], 28, Ui.Beyaz, TextAnchor.MiddleCenter, true); Ui.Doldur(ad.rectTransform, 8, 2, 8, 2);
            ad.horizontalOverflow = HorizontalWrapMode.Overflow;
            if (ad.preferredWidth > 134) ad.fontSize = Mathf.Max(16, Mathf.FloorToInt(28 * 134 / ad.preferredWidth));
            Ui.Golge(ad, 2, 0.5f);
            return rt;
        }

        RectTransform Etiket(JObject p, string hostId)
        {
            var id = (string)p["id"];
            var rt = Ui.Rect("Etiket_" + id, _etiketKok);
            rt.anchorMin = rt.anchorMax = new Vector2(0.5f, 0.5f); rt.pivot = new Vector2(0.5f, 0); rt.sizeDelta = new Vector2(180, 80);
            var renk = Renk((string)p["color"]); renk.a = 0.95f;
            Ui.Kart(rt.gameObject, renk, 2.2f).raycastTarget = false;
            var ad = Ui.Yazi(rt, (string)p["name"], 32, Ui.Beyaz, TextAnchor.MiddleCenter, true); Ui.Doldur(ad.rectTransform, 10, 30, 10, 4);
            // tek satır: uzun isimde yazıyı genişliğe göre küçült (Unity'nin best fit'i iki satıra bölmeyi seçiyor)
            ad.horizontalOverflow = HorizontalWrapMode.Overflow;
            if (ad.preferredWidth > 160) ad.fontSize = Mathf.Max(18, Mathf.FloorToInt(32 * 160 / ad.preferredWidth));
            Ui.Golge(ad, 3, 0.5f);
            var rol = id == PartiApi.PlayerId ? "Sen" : id == hostId ? "Oda sahibi" : (bool)p["bot"] ? "Bot" : "";
            if (id == PartiApi.PlayerId && id == hostId) rol = "Sen · oda sahibi";
            var r = Ui.Yazi(rt, rol, 21, new Color(1, 1, 1, 0.85f), TextAnchor.MiddleCenter, true); Ui.Doldur(r.rectTransform, 6, 6, 6, 48);
            if (BenHost && (bool)p["bot"])
            {
                var x = Ui.Rect("Sil", rt); x.anchorMin = x.anchorMax = new Vector2(1, 1); x.pivot = new Vector2(0.5f, 0.5f);
                x.sizeDelta = new Vector2(56, 56); x.anchoredPosition = new Vector2(-6, -6);
                var xim = Ui.Kart(x.gameObject, Ui.Pembe, 3.2f);
                var b = x.gameObject.AddComponent<Button>(); b.targetGraphic = xim;
                var xt = Ui.Yazi(x, "X", 32, Ui.Beyaz, TextAnchor.MiddleCenter, true); Ui.Doldur(xt.rectTransform);
                b.onClick.AddListener(() => Calistir(async () => { var res = await PartiApi.Eylem(_kod, "removeBot", new JObject { ["botId"] = id }); _durum = (JObject)res["state"]; _lobiAnahtar = ""; Ciz(); }));
            }
            return rt;
        }

        // ---------- Oyun ekranı ----------
        void OyunAc(string kind, string anahtar)
        {
            YeniEkran("oyun").gameObject.SetActive(false);              // menü/lobi içeriğini temizler; oyun kendi düzenini kurar
            var alan = Ui.Rect("Oyun", _ekran); Ui.Doldur(alan, 0, 0, 0, 80);
            _oyun = OyunKayit.Olustur(kind);
            _oyunAnahtar = anahtar;
            _oyun.B = new OyunBaglami
            {
                alan = alan, durum = _durum, otomatik = _otomatikHamle, toast = Toast,
                gonder = (action, govde) => Calistir(async () => { var r = await PartiApi.Eylem(_kod, action, govde); _durum = (JObject)r["state"]; Ciz(); }),
            };
            var z = Ui.Lacivert; z.a = _sahne == null ? 1f : _oyun.ZeminSaydam; _zemin.color = z;
            _oyun.Kur();
            _sonucPanel = Ui.Rect("Sonuc", _ekran); Ui.Doldur(_sonucPanel, 60, 260, 60, 300);
            _sonucPanel.gameObject.SetActive(false);
            _kapiPanel = Ui.Rect("Kapi", _ekran); Ui.Doldur(_kapiPanel, 60, 300, 60, 300);
            _kapiPanel.gameObject.SetActive(false); _kapiAnahtar = null;
            _etiketKaynagi = _oyun.Etiketler ?? _sahne;
            if (_oyun.Etiketler != null)
                foreach (JObject p in (JArray)_durum["players"]) if ((bool?)p["left"] != true) _etiketler[(string)p["id"]] = KucukEtiket(p);
        }

        void OyunKare()
        {
            // takım oyunları: önce takımlar gösterilir, herkes "Tamam" deyince oyun başlar (gate)
            var kapi = _durum["gate"] as JObject;
            _oyun.B.alan.gameObject.SetActive(kapi == null);
            if (kapi != null) { KapiCiz(kapi); return; }
            if (_kapiPanel.gameObject.activeSelf) _kapiPanel.gameObject.SetActive(false);
            _oyun.Kare();
            bool sonuc = _oyun != null && !_oyun.B.Oynaniyor && _oyun.SonucGosterilebilir;
            if (sonuc && !_sonucPanel.gameObject.activeSelf) SonucCiz();
            if (!sonuc && _sonucPanel.gameObject.activeSelf) _sonucPanel.gameObject.SetActive(false);
        }

        // Oyun sonu: sıralama + puanlar; bittiyse tekrar oyna / lobiye dön
        void SonucCiz()
        {
            foreach (Transform c in _sonucPanel) Destroy(c.gameObject);
            _sonucPanel.gameObject.SetActive(true);
            if (_sonucPanel.GetComponent<Image>() == null) Ui.Kart(_sonucPanel.gameObject, new Color(0.08f, 0.06f, 0.22f, 0.88f), 0.6f);
            var ic = Ui.Dikey(_sonucPanel, "Icerik", 18, 50, TextAnchor.UpperCenter); Ui.Doldur(ic);
            var baslik = Ui.Yazi(ic, _oyun.Baslik + " bitti!", 66, Ui.Beyaz, TextAnchor.MiddleCenter, true); Ui.Yukseklik(baslik, 100); Ui.Golge(baslik, 6, 0.6f);
            var sonuclar = _durum["tour"]?["results"] as JArray;
            var son = sonuclar != null && sonuclar.Count > 0 ? (JObject)sonuclar[sonuclar.Count - 1] : null;
            int sira = 1;
            if (son != null)
                foreach (JArray grup in (JArray)son["ranking"])
                {
                    foreach (var idTok in grup)
                    {
                        var id = (string)idTok; var p = Oyuncu(id);
                        var satir = Ui.Rect("Satir", ic); Ui.Yukseklik(satir, 96);
                        Ui.Kart(satir.gameObject, sira == 1 ? (Color)new Color32(0xFF, 0xB8, 0x30, 230) : new Color(1, 1, 1, 0.1f), 2.1f);
                        var s = Ui.Yazi(satir, sira + ".", 48, Ui.Beyaz, TextAnchor.MiddleLeft, true); Ui.Doldur(s.rectTransform, 30, 0, 0, 0);
                        var ad = Ui.Yazi(satir, p != null ? (string)p["name"] + (id == PartiApi.PlayerId ? "  (sen)" : "") : id, 42, Ui.Beyaz, TextAnchor.MiddleLeft); Ui.Doldur(ad.rectTransform, 120, 0, 140, 0);
                        var puan = (int?)son["gained"]?[id] ?? 0;
                        var pz = Ui.Yazi(satir, puan > 0 ? "+" + puan : puan.ToString(), 44, Ui.Beyaz, TextAnchor.MiddleRight, true); Ui.Doldur(pz.rectTransform, 0, 0, 30, 0);
                    }
                    sira += grup.Count;
                }
            var bosluk = Ui.Rect("Bosluk", ic); Ui.Yukseklik(bosluk, 0); bosluk.GetComponent<LayoutElement>().flexibleHeight = 1;
            if ((string)_durum["status"] == "over")
            {
                var tekrar = Ui.Dugme(ic, "Tekrar oyna", "menu_pembe", 56);
                tekrar.onClick.AddListener(() => Calistir(async () => { var r = await PartiApi.Eylem(_kod, "rematch"); _durum = (JObject)r["state"]; Ciz(); }));
                if (BenHost)
                {
                    var lobi = Ui.Dugme(ic, "Lobiye dön", "menu_gri", 50);
                    lobi.onClick.AddListener(() => Calistir(async () => { var r = await PartiApi.Eylem(_kod, "lobby"); _durum = (JObject)r["state"]; _lobiAnahtar = ""; Ciz(); }));
                }
            }
            else { var y = Ui.Yazi(ic, "Sıradaki oyun birazdan…", 42, Ui.Soluk); Ui.Yukseklik(y, 80); }
        }

        void KapiCiz(JObject kapi)
        {
            var hazir = (JArray)kapi["ready"]; bool ben = hazir.Any(t => (string)t == PartiApi.PlayerId);
            var anahtar = hazir.Count + "/" + ben;
            _kapiPanel.gameObject.SetActive(true);
            if (_otomatikHamle && !ben && _kapiAnahtar == null) Calistir(async () => { await PartiApi.Eylem(_kod, "teamReady", new JObject { ["seq"] = _durum["seq"] }); });
            if (anahtar == _kapiAnahtar) return;
            _kapiAnahtar = anahtar;
            foreach (Transform c in _kapiPanel) Destroy(c.gameObject);
            if (_kapiPanel.GetComponent<Image>() == null) Ui.Kart(_kapiPanel.gameObject, new Color(0.08f, 0.06f, 0.22f, 0.9f), 0.6f);
            var ic = Ui.Dikey(_kapiPanel, "Icerik", 16, 50); Ui.Doldur(ic);
            var b = Ui.Yazi(ic, _oyun.Baslik, 64, Ui.Beyaz, TextAnchor.MiddleCenter, true); Ui.Yukseklik(b, 100); Ui.Golge(b, 5, 0.6f);
            var t = Ui.Yazi(ic, "Takımlar", 40, new Color32(0xFF, 0xC8, 0x4A, 255), TextAnchor.MiddleCenter, true); Ui.Yukseklik(t, 60);
            // takımlar: oyunun kendi listesi (g.teams: [{members}] ya da [[id]]), yoksa oda sahibinin düzeni
            var takimlar = (_oyun.B.G?["teams"] as JArray) ?? (_durum["tour"]?["teams"] as JArray);
            int n = 1;
            if (takimlar != null)
                foreach (var tk in takimlar)
                {
                    var uyeler = (tk is JObject o ? o["members"] as JArray : tk as JArray) ?? new JArray();
                    var adlar = string.Join("  ·  ", uyeler.Select(u => (string)u == PartiApi.PlayerId ? "Sen" : (string)Oyuncu((string)u)?["name"] ?? "?"));
                    var satir = Ui.Rect("Takim", ic); Ui.Yukseklik(satir, 90);
                    Ui.Kart(satir.gameObject, uyeler.Any(u => (string)u == PartiApi.PlayerId) ? (Color)new Color32(0xF2, 0x4B, 0x7A, 220) : new Color(1, 1, 1, 0.12f), 2.4f);
                    var y = Ui.Yazi(satir, $"{n++}. takım:  {adlar}", 36, Ui.Beyaz, TextAnchor.MiddleLeft); Ui.Doldur(y.rectTransform, 30, 0, 20, 0);
                }
            var bos = Ui.Rect("Bosluk", ic); Ui.Yukseklik(bos, 0); bos.GetComponent<LayoutElement>().flexibleHeight = 1;
            var bekleyen = (JArray)kapi["waiting"];
            var d = Ui.Yazi(ic, ben ? $"Bekleniyor… {bekleyen?.Count ?? 0} kişi kaldı" : "Takımını gördüysen Tamam'a bas", 38, Ui.Soluk); Ui.Yukseklik(d, 70);
            if (!ben)
            {
                var tamam = Ui.Dugme(ic, "Tamam", "menu_pembe", 60);
                tamam.onClick.AddListener(() => Calistir(async () => { var r = await PartiApi.Eylem(_kod, "teamReady", new JObject { ["seq"] = _durum["seq"] }); _durum = (JObject)r["state"]; Ciz(); }));
            }
        }

        JObject Oyuncu(string id)
        {
            foreach (JObject p in (JArray)_durum["players"]) if ((string)p["id"] == id) return p;
            return null;
        }

        void OyunYerTutucu()
        {
            var ic = YeniEkran("oyun");
            var kind = (string)_durum["kind"] ?? "?";
            var t = Ui.Yazi(ic, "OYUN BAŞLADI", 90, Ui.Beyaz, TextAnchor.MiddleCenter, true); Ui.Yukseklik(t, 300);
            var k = Ui.Yazi(ic, "Oyun: " + kind + "\nBu oyunun Unity ekranı henüz yapılmadı.", 48, Ui.Soluk); Ui.Yukseklik(k, 300);
            var cik = Ui.Dugme(ic, "Odadan çık", "menu_gri", 46);
            cik.onClick.AddListener(() => Calistir(async () => { _yokla = false; try { await PartiApi.Eylem(_kod, "leave"); } catch { } AnaMenu(); }));
        }
    }
}
