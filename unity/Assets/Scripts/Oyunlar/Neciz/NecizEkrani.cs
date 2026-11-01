using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json.Linq;
using PartiLigi.Oyunlar.Cizim;
using PartiLigi.UI;
using UnityEngine;
using UnityEngine.UI;

namespace PartiLigi.Oyunlar.Neciz
{
    /// <summary>
    /// 🖍️ Ne Çizdim? (kurallar: public/games/neciz.js). Sırayla herkes çizer: çizen 3 kelimeden birini seçer ve çizer,
    /// diğerleri canlı izleyip tahmin yazar. Canlı çizim: çizen "live" ile parça parça gönderir, izleyenler
    /// "state {live:{gen,since}}" ile alır. Bot çizimi görünümde "strokes" olarak gelir, 26 sn'ye yayılarak oynatılır.
    /// </summary>
    public class NecizEkrani : OyunEkrani
    {
        const float BotCizimMs = 26000;
        Text _sol, _sag, _bilgi, _kelime, _akis;
        RectTransform _govde;
        string _anahtar;
        CizimTuvali _tuval; InputField _girdi;
        // canlı çizim
        int _gonderilen, _seri = -1; float _sonGonder, _sonCek;
        readonly List<CizimTuvali.Darbe> _canli = new List<CizimTuvali.Darbe>(); int _canliGen = -1; bool _canliDegisti;
        List<CizimTuvali.Darbe> _botCizim; string _botAnahtar;
        float _oto;

        public override string Baslik => "Ne Çizdim?";

        public override void Kur()
        {
            var ic = Ui.Dikey(B.alan, "Icerik", 14, 40); Ui.Doldur(ic);
            OyunUi.UstSerit(ic, out _sol, out _sag, out _bilgi);
            _govde = Ui.Dikey(ic, "Govde", 12, 0); Ui.Yukseklik(_govde, 0); _govde.GetComponent<LayoutElement>().flexibleHeight = 1;
        }

        public override void Durum() { }
        string Faz => (string)B.G?["phase"];
        string Cizen => (string)B.G?["drawer"];
        bool BenCiziyorum => Cizen == B.Ben;

        public override void Kare()
        {
            var simdi = B.Simdi;
            bool acilis = B.AcilisSuruyor(out _);
            string g = acilis ? "acilis:" + B.Son["turnI"] : !B.Oynaniyor ? "bitti" : simdi < B.TurBasi ? "giris:" + B.Tur : $"{Faz}:{B.Tur}:{BenCiziyorum}:{(bool?)B.G?["myHit"]}";
            if (g != _anahtar) { _anahtar = g; Yenile(acilis, simdi); }
            _sol.text = $"Çizen {((int?)B.G?["turnI"] ?? 0) + 1}/{(int?)B.G?["T"] ?? 0}";
            double son = Faz == "draw" ? (double?)B.G?["drawEnd"] ?? 0 : (double?)B.G?["chooseEnd"] ?? 0;
            _sag.text = B.Oynaniyor && !acilis && simdi >= B.TurBasi ? OyunBaglami.Geri(son - simdi) : "";
            _sol.transform.parent.gameObject.SetActive(B.Oynaniyor || acilis);
            if (!acilis && B.Oynaniyor && Faz == "draw") CizimKaresi(simdi);
            if (_akis != null) _akis.text = Akis();
            if (_kelime != null && !acilis) _kelime.text = KelimeYazi();
            Otomatik(simdi);
        }

        Text Yazi(string m, int boyut, float yuk, Color? renk = null, bool baslik = true)
        {
            var t = Ui.Yazi(_govde, m, boyut, renk ?? Ui.Beyaz, TextAnchor.MiddleCenter, baslik); Ui.Yukseklik(t, yuk); Ui.Golge(t, 3, 0.6f); return t;
        }

        string KelimeYazi()
        {
            var w = (string)B.G?["word"]; if (w != null) return w.ToUpper(new System.Globalization.CultureInfo("tr-TR"));
            var m = (string)B.G?["mask"]; return m != null ? string.Join(" ", m.ToCharArray()) : "";
        }

        string Akis()
        {
            var f = B.G?["feed"] as JArray; if (f == null) return "";
            return string.Join("\n", f.Cast<JObject>().TakeLast(4).Select(x => (bool?)x["ok"] == true ? $"<color=#6CF09A>{B.Ad((string)x["p"])} bildi!</color>" :
                $"{B.Ad((string)x["p"])}: {(string)x["txt"] ?? "…"}{((bool?)x["close"] == true ? " <color=#FFC84A>(yakın!)</color>" : "")}"));
        }

        void Yenile(bool acilis, double simdi)
        {
            foreach (Transform c in _govde) Object.Destroy(c.gameObject);
            _tuval = null; _girdi = null; _kelime = null; _akis = null; _botCizim = null; _botAnahtar = null;
            if (acilis) { AcilisCiz(); return; }
            if (!B.Oynaniyor) { _bilgi.text = ""; return; }
            if (simdi < B.TurBasi)
            {
                _bilgi.text = "Sırayla herkes çizer, diğerleri tahmin eder";
                OyunUi.Esnek(_govde);
                if (B.Tur == 1) { Yazi("Ne Çizdim?", 110, 160); Yazi("Önce bilen çok puan alır: 10, 9, 8…\nÇizen her doğru tahminde puan kazanır!", 38, 160, null, false); }
                Yazi("Sıradaki çizen: " + B.Ad(Cizen), 50, 90, new Color32(0xFF, 0xC8, 0x4A, 255));
                OyunUi.Esnek(_govde);
                return;
            }
            if (Faz == "choose")
            {
                if (BenCiziyorum)
                {
                    _bilgi.text = "Sıra sende! Çizeceğin kelimeyi seç";
                    OyunUi.Esnek(_govde);
                    var sec = B.G?["options"] as JArray;
                    if (sec != null) for (int i = 0; i < sec.Count; i++) { int ii = i; var s = OyunUi.Secenek(_govde, (string)sec[i], OyunUi.SikRenk[i % 4], 150, 54); s.d.onClick.AddListener(() => B.Gonder("gact", new JObject { ["pick"] = ii })); }
                    OyunUi.Esnek(_govde);
                }
                else { _bilgi.text = B.Ad(Cizen) + " kelime seçiyor…"; OyunUi.Esnek(_govde); Yazi(B.Ad(Cizen) + " kelime seçiyor…", 50, 120, Ui.Soluk, false); OyunUi.Esnek(_govde); }
                return;
            }
            // çizim
            _kelime = Yazi("", 56, 80, new Color32(0xFF, 0xC8, 0x4A, 255));
            _tuval = CizimTuvali.Olustur(_govde, 900);
            if (BenCiziyorum)
            {
                _bilgi.text = "Çiz! Arkadaşların tahmin ediyor";
                _tuval.cizilebilir = true; _gonderilen = 0; _seri = B.Tur;
                _tuval.degisti = () => _gonderilen = Mathf.Min(_gonderilen, Mathf.Max(0, _tuval.darbeler.Count - 1));
                CizimArac.Kur(_govde, _tuval);
            }
            else
            {
                _canli.Clear(); _canliGen = -1; _canliDegisti = true;
                bool bildim = (bool?)B.G?["myHit"] == true;
                _bilgi.text = bildim ? "Bildin! Diğerlerini izle" : B.Ad(Cizen) + " çiziyor, tahmin et!";
                if (!bildim)
                {
                    var satir = Ui.Yatay(_govde, "Tahmin", 14); Ui.Yukseklik(satir, 130);
                    _girdi = Ui.Girdi(satir, "Tahminin", 40, 42); _girdi.GetComponent<LayoutElement>().flexibleWidth = 3;
                    var gon = OyunUi.Secenek(satir, "Gönder", Ui.Pembe, 130, 40); gon.d.GetComponent<LayoutElement>().flexibleWidth = 1;
                    gon.d.onClick.AddListener(Tahmin);
                    _girdi.onEndEdit.AddListener(_ => { if (Input.GetKeyDown(KeyCode.Return)) Tahmin(); });
                }
            }
            _akis = Ui.Yazi(_govde, "", 32, Ui.Beyaz, TextAnchor.UpperLeft); Ui.Yukseklik(_akis, 0); _akis.GetComponent<LayoutElement>().flexibleHeight = 1; _akis.supportRichText = true;
        }

        void Tahmin()
        {
            var t = (_girdi?.text ?? "").Trim(); if (t.Length == 0) return;
            _girdi.text = "";
            B.Gonder("gact", new JObject { ["guess"] = t });
        }

        void CizimKaresi(double simdi)
        {
            if (_tuval == null) return;
            // bot çiziyor: görünümdeki darbeleri zamanla oynat
            var bot = B.G?["doodle"] as JObject;
            if (bot != null)
            {
                var anahtar = (string)bot["doodle"] + bot["seed"];
                if (_botAnahtar != anahtar) { _botAnahtar = anahtar; _botCizim = CizimTuvali.Oku(bot["strokes"] as JArray); }
                if (_botCizim != null) _tuval.Oynat(_botCizim, (simdi - (double)bot["at"]) * CizimTuvali.Sure(_botCizim) / BotCizimMs);
                return;
            }
            if (BenCiziyorum)
            {
                // değişen kısmı gönder (en çok ~0,7 sn'de bir, yalnızca bir şey değiştiyse)
                if (Time.time - _sonGonder < 0.7f || _seri != B.Tur || _tuval.surum == _gonderilenSurum) return;
                int n = _tuval.darbeler.Count, from = Mathf.Min(_gonderilen, n);
                _sonGonder = Time.time; _gonderilenSurum = _tuval.surum;
                var parca = new JArray(_tuval.Json().Skip(from));
                B.cagir("live", new JObject { ["seq"] = B.Seq, ["round"] = B.Tur, ["from"] = from, ["strokes"] = parca });
                _gonderilen = Mathf.Max(0, n - 1);                    // son çizgi hâlâ çiziliyor olabilir: bir dahakine yeniden gönder
                return;
            }
            // izleyen: canlı çizimi çek
            if (Time.time - _sonCek > 0.6f)
            {
                _sonCek = Time.time;
                B.cagir("state", new JObject { ["code"] = (string)B.durum["code"], ["live"] = new JObject { ["gen"] = _canliGen, ["since"] = _canli.Count } }).ContinueWith(t =>
                {
                    if (!t.IsCompletedSuccessfully || !(t.Result["live"] is JObject l) || (int?)l["round"] != B.Tur) return;
                    int gen = (int)l["gen"], from = (int)l["from"];
                    var yeni = CizimTuvali.Oku(l["s"] as JArray);
                    if (gen != _canliGen) { _canli.Clear(); _canliGen = gen; from = 0; }
                    if (from < _canli.Count) _canli.RemoveRange(from, _canli.Count - from);
                    _canli.AddRange(yeni);
                    if (yeni.Count > 0 || from == 0) _canliDegisti = true;
                }, System.Threading.Tasks.TaskScheduler.FromCurrentSynchronizationContext());
            }
            if (_canliDegisti) { _canliDegisti = false; _tuval.Goster(_canli); }
        }
        int _gonderilenSurum = -1;

        void AcilisCiz()
        {
            var son = B.Son;
            _bilgi.text = (bool?)son["all"] == true ? "Herkes bildi! Çizene bonus" : "Kelime açıldı";
            OyunUi.Esnek(_govde);
            Yazi("Kelime", 40, 60, Ui.Soluk, false);
            Yazi(((string)son["word"]).ToUpper(new System.Globalization.CultureInfo("tr-TR")), 96, 140, new Color32(0xFF, 0xC8, 0x4A, 255));
            var kazanc = (JObject)son["gains"];
            foreach (var p in kazanc.Properties().OrderByDescending(p => (int)p.Value))
                OyunUi.OyuncuSatiri(_govde, B, p.Name, (p.Name == (string)son["drawer"] ? "çizdi " : "") + "+" + (int)p.Value, p.Name == (string)son["drawer"] ? (Color?)new Color32(0xFF, 0xB8, 0x30, 220) : null, 86);
            OyunUi.Esnek(_govde);
        }

        // Önizleme: kelime seç, karala; tahmin et
        void Otomatik(double simdi)
        {
            if (!B.otomatik || !B.Oynaniyor || simdi < B.TurBasi || B.AcilisSuruyor(out _) || Time.time < _oto) return;
            _oto = Time.time + 2f;
            if (Faz == "choose" && BenCiziyorum) B.Gonder("gact", new JObject { ["pick"] = 0 });
            else if (Faz == "draw" && BenCiziyorum && _tuval != null && _tuval.darbeler.Count < 3)
            {
                var d = new CizimTuvali.Darbe { c = 1 + _tuval.darbeler.Count * 3, w = 2, t0 = 0, t1 = 600 };
                for (int i = 0; i <= 20; i++) { float a = i / 20f * Mathf.PI * 2; d.p.Add(500 + (int)(Mathf.Cos(a) * (150 + 80 * _tuval.darbeler.Count))); d.p.Add(500 + (int)(Mathf.Sin(a) * (150 + 80 * _tuval.darbeler.Count))); }
                _tuval.darbeler.Add(d); _tuval.surum++; _tuval.Goster(_tuval.darbeler);
            }
            else if (Faz == "draw" && !BenCiziyorum && (bool?)B.G?["myHit"] != true) B.Gonder("gact", new JObject { ["guess"] = "kedi" });
        }
    }
}
