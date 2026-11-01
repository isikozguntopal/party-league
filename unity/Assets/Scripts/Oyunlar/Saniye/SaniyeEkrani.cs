using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using PartiLigi.UI;
using UnityEngine;
using UnityEngine.UI;

namespace PartiLigi.Oyunlar.Saniye
{
    /// <summary>
    /// ⏱️ Kayıp Saniye (kurallar: public/games/saniye.js). Her tur herkes "Hazırım" der → 3-2-1 → kronometre başlar,
    /// 3. saniyede gizlenir; hedef süreyi içinden sayıp DURDUR'a basarsın. Açılışta herkesin süresi ve sapması gösterilir.
    /// </summary>
    public class SaniyeEkrani : OyunEkrani
    {
        enum Faz { Giris, Hazirlik, Sayim, Kosu, Acilis, Bitti }

        Text _tur, _sag, _bilgi, _saat, _hedef, _alt, _dugmeYazi;
        Button _dugme; Image _dugmeResim;
        RectTransform _saatKart, _tablo;
        Faz _faz;
        int _durdurulanTur = -1, _hazirTur = -1, _tabloTur = -1;
        double _durdugum;
        float _otoHedef = -1;

        public override string Baslik => "Kayıp Saniye";

        public override void Kur()
        {
            var ic = Ui.Dikey(B.alan, "Icerik", 26, 70); Ui.Doldur(ic);
            OyunUi.UstSerit(ic, out _tur, out _sag, out _bilgi);
            OyunUi.Esnek(ic, "Ust");
            _hedef = Ui.Yazi(ic, "", 60, new Color32(0xFF, 0xC8, 0x4A, 255), TextAnchor.MiddleCenter, true); Ui.Yukseklik(_hedef, 90); Ui.Golge(_hedef, 5, 0.7f);
            // kronometre kartı
            _saatKart = Ui.Rect("Saat", ic); Ui.Yukseklik(_saatKart, 360);
            Ui.Kart(_saatKart.gameObject, new Color(0.2f, 0.15f, 0.48f, 0.92f), 0.6f);
            _saat = Ui.Yazi(_saatKart, "", 210, Ui.Beyaz, TextAnchor.MiddleCenter, true); Ui.Doldur(_saat.rectTransform, 20, 10, 20, 10); Ui.Golge(_saat, 10, 0.6f);
            // sonuç tablosu (açılışta saatin yerine)
            _tablo = Ui.Dikey(ic, "Tablo", 12, 0); Ui.Yukseklik(_tablo, 0); _tablo.GetComponent<LayoutElement>().minHeight = 0;
            _alt = Ui.Yazi(ic, "", 40, Ui.Beyaz, TextAnchor.MiddleCenter); Ui.Yukseklik(_alt, 90); Ui.Golge(_alt, 3, 0.8f);
            OyunUi.Esnek(ic, "Alt");
            _dugme = Ui.Dugme(ic, "Hazırım", "menu_pembe", 72); Ui.Yukseklik(_dugme, 220);
            _dugmeResim = _dugme.GetComponent<Image>(); _dugmeYazi = _dugme.GetComponentInChildren<Text>();
            _dugme.onClick.AddListener(Bas);
        }

        public override void Durum() { }

        double HedefMs => (double?)B.G?["target"] ?? 8000;
        double Baslangic => (double?)B.G?["startAt"] ?? 0;
        double SayimMs => (double?)B.G?["countMs"] ?? 3500;
        double GosterMs => (double?)B.G?["showMs"] ?? 3000;
        bool Basladi => (bool?)B.G?["started"] == true;
        bool Hazirim => Icinde(B.G?["ready"] as JArray, B.Ben);
        static bool Icinde(JArray a, string id) { if (a != null) foreach (var t in a) if ((string)t == id) return true; return false; }

        Faz FazHesapla(double simdi)
        {
            if (B.AcilisSuruyor(out _)) return Faz.Acilis;
            if (!B.Oynaniyor) return Faz.Bitti;
            if (simdi < B.TurBasi) return Faz.Giris;
            if (simdi < Baslangic - SayimMs) return Faz.Hazirlik;
            if (simdi < Baslangic) return Faz.Sayim;
            return Faz.Kosu;
        }

        void Bas()
        {
            var simdi = B.Simdi;
            if (_faz == Faz.Hazirlik && !Hazirim && _hazirTur != B.Tur)
            {
                _hazirTur = B.Tur;
                B.Gonder("gact", new JObject { ["t"] = "ready" });
            }
            else if (_faz == Faz.Kosu && _durdurulanTur != B.Tur && B.BenCanliyim)
            {
                _durdurulanTur = B.Tur; _durdugum = simdi - Baslangic;
                B.Gonder("act", new JObject { ["t"] = _durdugum });
            }
        }

        public override void Kare()
        {
            var simdi = B.Simdi;
            _faz = FazHesapla(simdi);
            int tur = _faz == Faz.Acilis ? (int?)B.Son?["round"] ?? B.Tur : B.Tur;
            _tur.text = $"Tur {tur}/{(int?)B.G?["rounds"] ?? 4}";
            _sag.text = "";
            _tur.transform.parent.gameObject.SetActive(_faz != Faz.Bitti);

            bool tablo = _faz == Faz.Acilis;
            _saatKart.gameObject.SetActive(!tablo && _faz != Faz.Bitti);
            _tablo.gameObject.SetActive(tablo);
            _hedef.gameObject.SetActive(_faz != Faz.Bitti);
            _hedef.text = "Hedef: " + OyunBaglami.Saniye(tablo ? (double)B.Son["target"] : HedefMs, "0") + " saniye";
            if (tablo) TabloCiz();

            switch (_faz)
            {
                case Faz.Giris:
                    _bilgi.text = tur == 1 ? "Kronometre 3. saniyede kaybolur. İçinden say!" : "Sıradaki tur";
                    _saat.text = OyunBaglami.Geri(B.TurBasi - simdi); _alt.text = "";
                    Dugme(false);
                    break;
                case Faz.Hazirlik:
                    _bilgi.text = "Herkes hazır olunca kronometre başlar";
                    _saat.text = "0,00";
                    var hazir = (B.G?["ready"] as JArray)?.Count ?? 0; var gerek = (B.G?["need"] as JArray)?.Count ?? 0;
                    _alt.text = Hazirim || _hazirTur == B.Tur ? $"Bekleniyor… {hazir}/{gerek} hazır" : "";
                    Dugme(B.BenCanliyim && !Hazirim && _hazirTur != B.Tur, "Hazırım", "menu_pembe");
                    break;
                case Faz.Sayim:
                    _bilgi.text = "Hazır ol…";
                    _saat.text = OyunBaglami.Geri(Baslangic - simdi); _alt.text = "";
                    Dugme(B.BenCanliyim, "DURDUR", "menu_mavi", false);
                    break;
                case Faz.Kosu:
                    double gecen = simdi - Baslangic;
                    bool durdum = _durdurulanTur == B.Tur;
                    _bilgi.text = gecen < GosterMs ? "Saymaya başla!" : "Kronometre gizlendi, içinden say";
                    _saat.text = durdum ? "Durdun!" : gecen < GosterMs ? OyunBaglami.Saniye(gecen) : "?,??";
                    _alt.text = durdum ? "Diğerleri bekleniyor…" : "";
                    Dugme(B.BenCanliyim && !durdum, "DURDUR", "menu_mavi");
                    break;
                case Faz.Acilis:
                    _bilgi.text = "Kim ne kadar yaklaştı?"; _alt.text = "";
                    Dugme(false);
                    break;
                default:
                    _bilgi.text = ""; _alt.text = ""; Dugme(false);
                    break;
            }
            Otomatik(simdi);
        }

        void Dugme(bool gorunur, string yazi = null, string renk = null, bool etkin = true)
        {
            _dugme.gameObject.SetActive(gorunur);
            if (!gorunur) return;
            _dugmeYazi.text = yazi; _dugme.interactable = etkin;
            var sprite = Ui.Btn(renk); if (_dugmeResim.sprite != sprite) _dugmeResim.sprite = sprite;
        }

        // Açılış: hedef + herkesin süresi ve sapması (en yakın üstte)
        void TabloCiz()
        {
            var son = B.Son; int tur = (int?)son["round"] ?? 0;
            if (_tabloTur == tur && _tablo.childCount > 0) return;
            _tabloTur = tur;
            foreach (Transform c in _tablo) Object.Destroy(c.gameObject);
            int sira = 0;
            var rows = (JArray)son["rows"];
            foreach (JObject r in rows)
            {
                var id = (string)r["id"];
                var t = r["t"]?.Type == JTokenType.Null ? (double?)null : (double?)r["t"];
                var err = r["err"]?.Type == JTokenType.Null ? (double?)null : (double?)r["err"];
                var sag = t == null ? "durdurmadı" : $"{OyunBaglami.Saniye(t.Value)} sn  ±{OyunBaglami.Saniye(err.Value)}";
                OyunUi.OyuncuSatiri(_tablo, B, id, sag, sira == 0 && t != null ? (Color?)new Color32(0xFF, 0xB8, 0x30, 230) : null, 104);
                sira++;
            }
            Ui.Yukseklik(_tablo, rows.Count * 116);
        }

        // Önizleme: hazır de, hedefe yakın bir anda durdur
        void Otomatik(double simdi)
        {
            if (!B.otomatik || !B.BenCanliyim) return;
            if (_faz == Faz.Hazirlik) { Bas(); _otoHedef = -1; }
            if (_faz == Faz.Kosu)
            {
                if (_otoHedef < 0) _otoHedef = (float)(HedefMs + Random.Range(-600f, 600f));
                if (simdi - Baslangic >= _otoHedef) Bas();
            }
        }
    }
}
