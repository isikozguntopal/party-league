using PartiLigi.UI;
using UnityEngine;
using UnityEngine.UI;

namespace PartiLigi.Oyunlar.Sapan
{
    /// <summary>Sapan Arenası arayüzü (üst şerit, Hazırım düğmesi); 3D sahneyi SapanOyunu yürütür.</summary>
    public class SapanEkrani : OyunEkrani
    {
        SapanOyunu _sapan;
        Text _tur, _sure, _bilgi, _durum, _hazirYazi; Button _hazir; RectTransform _ust;
        float _yerlesmeBas = -1;

        public override string Baslik => "Sapan Arenası";
        public override IEtiketKaynagi Etiketler => _sapan;
        public override float ZeminSaydam => 0f;
        public override bool SonucGosterilebilir => _sapan != null && _sapan.Faz == SapanFaz.Bitti;

        public override void Kur()
        {
            _sapan = Object.FindFirstObjectByType<SapanOyunu>(FindObjectsInactive.Include);
            _sapan.Baslat(() => B.Simdi);
            var ic = Ui.Dikey(B.alan, "Icerik", 28, 70); Ui.Doldur(ic);
            _ust = OyunUi.UstSerit(ic, out _tur, out _sure, out _bilgi);
            OyunUi.Esnek(ic, "Alan");
            _durum = Ui.Yazi(ic, "", 42, Ui.Beyaz, TextAnchor.MiddleCenter, true); Ui.Yukseklik(_durum, 70); Ui.Golge(_durum, 3, 0.8f);
            _hazir = Ui.Dugme(ic, "Hazırım", "menu_pembe", 64);
            _hazirYazi = _hazir.GetComponentInChildren<Text>();
            _hazir.onClick.AddListener(HamleGonder);
        }

        public override void Durum() => _sapan.Durum(B.durum);
        public override void Kapat() { if (_sapan != null && _sapan.gameObject.activeSelf) _sapan.Bitir(); }

        void HamleGonder()
        {
            if (_sapan.Faz != SapanFaz.Yerlesme || !_sapan.BenCanliyim) return;
            B.Gonder("act", _sapan.Hamle());
        }

        public override void Kare()
        {
            var faz = _sapan.Faz;
            _tur.text = "Tur " + _sapan.Tur;
            _sure.text = faz == SapanFaz.Yerlesme ? OyunBaglami.Geri(_sapan.KalanMs) : "";
            bool hamleVar = faz == SapanFaz.Yerlesme && _sapan.BenCanliyim;
            _hazir.gameObject.SetActive(hamleVar);
            if (hamleVar) _hazirYazi.text = _sapan.Gonderildi && !_sapan.HamleDegisti ? "Hazır ✓" : _sapan.Gonderildi ? "Güncelle" : "Hazırım";
            switch (faz)
            {
                case SapanFaz.Giris:
                    _bilgi.text = _sapan.Tur == 1 ? "Platformdan düşen elenir. Son kalan kazanır!" : "Yeni tur başlıyor…";
                    _durum.text = (_sapan.Tur == 1 ? "Sapan Arenası · " : "") + OyunBaglami.Geri(_sapan.KalanMs);
                    break;
                case SapanFaz.Yerlesme:
                    _bilgi.text = _sapan.BenCanliyim ? "Karakterini sürükle, boş yere dokunup nişan al" : "Elendin, izliyorsun";
                    _durum.text = _sapan.Gonderildi && !_sapan.HamleDegisti ? $"Bekleniyor… {_sapan.HazirSayisi}/{_sapan.CanliSayisi} hazır" : "";
                    break;
                case SapanFaz.Acilis:
                    _bilgi.text = "Taşlar fırlatılıyor!"; _durum.text = "";
                    break;
                default:
                    _bilgi.text = ""; _durum.text = "";
                    break;
            }
            _ust.gameObject.SetActive(faz != SapanFaz.Bitti); // sonuç paneli üst şeridi örtmesin

            // önizleme: yerleşmede kendiliğinden hazır de
            if (B.otomatik && faz == SapanFaz.Yerlesme && _sapan.BenCanliyim && !_sapan.Gonderildi)
            {
                if (_yerlesmeBas < 0) _yerlesmeBas = Time.time;
                if (Time.time - _yerlesmeBas > 1.5f) HamleGonder();
            }
            if (faz != SapanFaz.Yerlesme) _yerlesmeBas = -1;
        }
    }
}
