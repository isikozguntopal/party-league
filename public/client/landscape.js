// Yatay mod yönetimi. Tarayıcı kendiliğinden yatay yapamadığı için (özellikle iPhone'da döndürme kilidi açıkken) "Yatay" düğmesi
// oyun ekranını 90° çevirir; kullanıcı telefonu yan tutar. Cihaz gerçekten yataya geçerse zorla döndürme otomatik kapanır.
//   html.force-land : kullanıcı düğmeyle istedi
//   html.force-on   : şu an gerçekten döndürülmüş (force-land + cihaz dikey)
//   html.land       : yatay yerleşim stilleri (gerçek yatay ve kısa ekran YA DA zorla döndürülmüş)
const root = document.documentElement;
export const isForced = () => root.classList.contains('force-on');
export const isOn = () => root.classList.contains('force-land');
// Telefonu çevirmek yatay moda GİRMEZ (kullanıcı isteği): yalnızca düğme. Masaüstünde (ince işaretçi) geniş ve kısa pencere yine yatay yerleşimdir.
const coarse = () => !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);
export function update() {
  const real = innerWidth > innerHeight;
  const want = isOn();
  const on = want && !real;                        // cihaz zaten yataysa döndürmeye gerek yok
  root.classList.toggle('force-on', on);
  root.classList.toggle('land', want ? true : (real && !coarse() ? innerHeight <= 600 : false));
  root.style.setProperty('--vw', innerWidth + 'px'); root.style.setProperty('--vh', innerHeight + 'px');
  window.dispatchEvent(new Event('lk-land'));
}
// düğme: yatay modu aç/kapat. Dönen: yeni durum (true = yatay)
export function toggle() { root.classList.toggle('force-land'); update(); return isOn(); }
export const canForce = () => true;
// oyun isteyince yatay modu aç (zaten açıksa ya da cihaz gerçekten yataysa bir şey yapmaz). Dönen: bu çağrı açtı mı
export function enable() { if (isOn()) return false; toggle(); return true; }
export function reset() { root.classList.remove('force-land'); update(); }
// Döndürülmüş ekranda dokunuş koordinatları: ekran (X,Y) → yerel (u,v) = (Y, vw − X). Tuval dikdörtgeni de aynı uzaya çevrilir.
export function localPt(ev) {
  if (!isForced()) return ev;
  return new Proxy(ev, { get(t, k) { if (k === 'clientX') return t.clientY; if (k === 'clientY') return innerWidth - t.clientX; const v = t[k]; return typeof v === 'function' ? v.bind(t) : v; } });
}
export function fixRect(el) {
  const base = Element.prototype.getBoundingClientRect;
  el.getBoundingClientRect = function () {
    const r = base.call(this);
    if (!isForced()) return r;
    const vw = innerWidth, o = { left: r.top, top: vw - r.right, right: r.bottom, bottom: vw - r.left, width: r.height, height: r.width };
    return { ...o, x: o.left, y: o.top };
  };
}
addEventListener('resize', update); addEventListener('orientationchange', update);
update();
