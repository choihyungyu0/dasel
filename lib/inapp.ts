// 카카오톡 등 앱 안 브라우저(인앱)로 열리면 바깥 브라우저로 넘긴다.
// 인앱 브라우저는 위성 지도(WebGL)와 복사·인쇄가 막히는 경우가 있어서다.
// 이 함수는 layout의 인라인 스크립트에 문자열로 들어가므로 바깥 변수를 쓰지 않는다.

/** 넘길 주소. 인앱이 아니거나 넘길 방법이 없으면 null */
export function externalUrl(ua: string, href: string): string | null {
  if (!/^https:\/\//.test(href)) return null;
  var inApp = /KAKAOTALK|NAVER\(inapp|Line\/|FBAN|FBAV|FB_IAB|Instagram|DaumApps|BAND\/|everytimeApp|; wv\)/i.test(ua);
  if (!inApp) return null;
  if (/Android/i.test(ua)) {
    // 크롬으로 연다. 크롬이 없으면 지금 주소에 그대로 머문다
    return "intent://" + href.replace(/^https:\/\//, "") + "#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=" + encodeURIComponent(href) + ";end";
  }
  if (/iPhone|iPad|iPod/i.test(ua)) {
    // iOS는 앱이 크롬을 지정해 열 수 없는 경우가 많다. 카카오톡·라인은 기본 브라우저로, 나머지는 크롬 주소로 시도한다
    if (/KAKAOTALK/i.test(ua)) return "kakaotalk://web/openExternal?url=" + encodeURIComponent(href);
    if (/Line\//i.test(ua)) return href + (href.indexOf("?") >= 0 ? "&" : "?") + "openExternalBrowser=1";
    return "googlechromes://" + href.replace(/^https:\/\//, "");
  }
  return null;
}

/** <head>에 넣는 스크립트. 같은 탭에서 한 번만 시도한다(되돌아왔을 때 반복하지 않게). */
export const IN_APP_SCRIPT = `(function(){try{var f=${externalUrl.toString()};if(/openExternalBrowser=1/.test(location.search))return;var u=f(navigator.userAgent,location.href);if(!u)return;if(sessionStorage.getItem("dasel_ext"))return;sessionStorage.setItem("dasel_ext","1");location.href=u;}catch(e){}})();`;
