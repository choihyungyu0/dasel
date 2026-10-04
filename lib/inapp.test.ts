import { describe, expect, it } from "vitest";
import { externalUrl, IN_APP_SCRIPT } from "./inapp";

const URL_ = "https://dasel-weld.vercel.app/?b=121902&s=u50";
const AND = "Mozilla/5.0 (Linux; Android 14; SM-S918N Build/UP1A; wv) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36";
const IOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";

describe("인앱 브라우저 → 바깥 브라우저", () => {
  it("일반 브라우저는 그대로 둔다", () => {
    expect(externalUrl("Mozilla/5.0 (Windows NT 10.0) Chrome/126.0 Safari/537.36", URL_)).toBeNull();
    expect(externalUrl("Mozilla/5.0 (Linux; Android 14; SM-S918N) Chrome/126.0 Mobile Safari/537.36", URL_)).toBeNull();
    expect(externalUrl(`${IOS} Version/17.5 Safari/604.1`, URL_)).toBeNull();
  });
  it("안드로이드 인앱(카카오톡·네이버·웹뷰)은 크롬 인텐트, 주소·쿼리 유지", () => {
    for (const ua of [`${AND} KAKAOTALK 10.8.5`, `${AND} NAVER(inapp; search; 2000; 12.5.2)`, AND]) {
      const u = externalUrl(ua, URL_)!;
      expect(u.startsWith("intent://dasel-weld.vercel.app/?b=121902&s=u50#Intent;scheme=https;package=com.android.chrome;")).toBe(true);
      expect(u).toContain(`S.browser_fallback_url=${encodeURIComponent(URL_)}`);
    }
  });
  it("iOS 카카오톡은 기본 브라우저, 라인은 파라미터, 그 밖은 크롬 주소", () => {
    expect(externalUrl(`${IOS} KAKAOTALK 10.8.5`, URL_)).toBe(`kakaotalk://web/openExternal?url=${encodeURIComponent(URL_)}`);
    expect(externalUrl(`${IOS} Line/14.1.0`, URL_)).toBe(`${URL_}&openExternalBrowser=1`);
    expect(externalUrl(`${IOS} Instagram 330.0`, URL_)).toBe("googlechromes://dasel-weld.vercel.app/?b=121902&s=u50");
  });
  it("localhost(http)는 넘기지 않는다", () => expect(externalUrl(`${AND} KAKAOTALK`, "http://localhost:3000/")).toBeNull());
  it("인라인 스크립트는 한 번만 시도한다", () => {
    expect(IN_APP_SCRIPT).toContain("dasel_ext");
    expect(() => new Function(IN_APP_SCRIPT)).not.toThrow();
  });
});
