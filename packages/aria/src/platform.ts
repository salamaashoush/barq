/**
 * Browser and platform detection.
 *
 * Every quirk this package works around is tied to one engine or one operating
 * system, and the workaround is wrong everywhere else: `user-select: none` on
 * the document element is what iOS WebKit needs and what everything else pays
 * for in style recalculation; the Meta-key keyup bug is macOS only.
 *
 * Each answer is computed once. `navigator` cannot change under a running
 * page, and these are read inside event handlers on the hot path.
 */

function testUserAgent(re: RegExp): boolean {
  if (typeof window === "undefined" || window.navigator === undefined) return false;
  const brands = (
    window.navigator as Navigator & {
      userAgentData?: { brands?: { brand: string; version: string }[]; platform?: string };
    }
  ).userAgentData?.brands;
  if (Array.isArray(brands) && brands.some((b) => re.test(b.brand))) return true;
  return re.test(window.navigator.userAgent);
}

function testPlatform(re: RegExp): boolean {
  if (typeof window === "undefined" || window.navigator === undefined) return false;
  const data = (window.navigator as Navigator & { userAgentData?: { platform?: string } })
    .userAgentData;
  return re.test(data?.platform ?? window.navigator.platform);
}

/**
 * The answer, computed on the first call and kept.
 *
 * Not cached under a test runner: happy-dom's `navigator.userAgent` is
 * writable, and a suite that pins a platform to exercise its branch would
 * otherwise get whatever the first test that asked happened to see.
 */
function cached(fn: () => boolean): () => boolean {
  if (typeof process !== "undefined" && process.env.NODE_ENV === "test") return fn;

  let answer: boolean | null = null;
  return (): boolean => {
    if (answer === null) answer = fn();
    return answer;
  };
}

export const isMac: () => boolean = cached(() => testPlatform(/^Mac/i));

export const isIPhone: () => boolean = cached(() => testPlatform(/^iPhone/i));

export const isIPad: () => boolean = cached(
  () =>
    testPlatform(/^iPad/i) ||
    // iPadOS 13 and later report themselves as a Mac. Touch points are what
    // separate the two.
    (isMac() && navigator.maxTouchPoints > 1),
);

export const isIOS: () => boolean = cached(() => isIPhone() || isIPad());

export const isAppleDevice: () => boolean = cached(() => isMac() || isIOS());

export const isChrome: () => boolean = cached(() => testUserAgent(/Chrome|CriOS|CrMo/i));

export const isFirefox: () => boolean = cached(() => testUserAgent(/(Firefox|FxiOS)/i));

export const isAndroid: () => boolean = cached(() => testUserAgent(/Android/i));

export const isWebKit: () => boolean = cached(
  () => testUserAgent(/AppleWebKit/i) && (isIOS() || !isChrome()),
);

export const isSafari: () => boolean = cached(() => isWebKit() && !isChrome() && !isFirefox());
