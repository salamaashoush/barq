export type TextDirection = "ltr" | "rtl";

const RTL = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFC]/u;
const STRONG = /[A-Za-z\u00C0-\u024F\u0370-\u052F\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFC]/u;

/** The direction of text's first strong letter, or `null` for text with none: a number, a mark, nothing. */
export function textDirection(text: string): TextDirection | null {
  const letter = STRONG.exec(text)?.[0];
  if (letter === undefined) return null;
  return RTL.test(letter) ? "rtl" : "ltr";
}

/** Whether text holds a letter that sets a direction. */
export function hasStrongLetter(text: string): boolean {
  return STRONG.test(text);
}
