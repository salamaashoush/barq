/**
 * The locale, and everything that depends on it.
 *
 * Three things a widget cannot do with a plain string comparison:
 *
 * - Sort or search text. `"résumé".startsWith("resume")` is false, and a
 *   typeahead that answers that way is broken for most of the world. `Intl.Collator`
 *   with `usage: "search"` answers it correctly, per locale.
 * - Choose left or right. Arrow keys in a listbox, the side a submenu opens on,
 *   and which end of a slider is the minimum all flip in a right-to-left locale.
 * - Say a number or a date. `aria-valuetext` on a slider showing a currency has
 *   to be formatted, not concatenated.
 *
 * The locale is a signal, so a page that switches language updates every
 * formatter without re-rendering anything that does not read one.
 */

import {
  type Accessor,
  context,
  getContext,
  getOwner,
  install,
  isServer,
  signal,
} from "@barqjs/core";
import { tryCleanup } from "@barqjs/primitives/utils";
import { access, type MaybeAccessor } from "./utils.ts";

export interface Locale {
  /** A BCP 47 language tag. */
  locale: string;
  /** Which way the text runs. */
  direction: "ltr" | "rtl";
}

// https://en.wikipedia.org/wiki/Right-to-left
const RTL_SCRIPTS = new Set([
  "Adlm",
  "Arab",
  "Hebr",
  "Mand",
  "Mend",
  "Nkoo",
  "Rohg",
  "Samr",
  "Syrc",
  "Thaa",
]);

const RTL_LANGUAGES = new Set([
  "ae",
  "ar",
  "arc",
  "bcc",
  "bqi",
  "ckb",
  "dv",
  "fa",
  "glk",
  "he",
  "ku",
  "mzn",
  "nqo",
  "pnb",
  "ps",
  "sd",
  "ug",
  "ur",
  "yi",
]);

/**
 * Whether the locale is read right to left.
 *
 * By script rather than by language where the platform can tell us: Kurdish is
 * written in both Arabic and Latin scripts, and the language tag alone gets it
 * wrong half the time.
 */
export function isRTL(tag: string): boolean {
  if (typeof Intl.Locale === "function") {
    const locale = new Intl.Locale(tag).maximize();
    const info = locale as Intl.Locale & {
      getTextInfo?: () => { direction: string };
      textInfo?: { direction: string };
    };
    const textInfo = typeof info.getTextInfo === "function" ? info.getTextInfo() : info.textInfo;
    if (textInfo !== undefined) return textInfo.direction === "rtl";
    if (locale.script !== undefined) return RTL_SCRIPTS.has(locale.script);
  }

  return RTL_LANGUAGES.has(tag.split("-")[0] as string);
}

/** The locale set on the page by a server-side localisation provider. */
const LOCALE_SYMBOL = Symbol.for("barq.aria.locale");

/** The browser's locale, right now. */
export function defaultLocale(): Locale {
  let tag =
    (typeof window !== "undefined" &&
      (window as unknown as Record<symbol, string | undefined>)[LOCALE_SYMBOL]) ||
    (typeof navigator !== "undefined" && navigator.language) ||
    "en-US";

  try {
    Intl.DateTimeFormat.supportedLocalesOf([tag]);
  } catch {
    tag = "en-US";
  }

  return { locale: tag, direction: isRTL(tag) ? "rtl" : "ltr" };
}

const browserLocale = signal<Locale>(defaultLocale());
let languageListeners = 0;

function watchLanguage(): () => void {
  if (isServer || typeof window === "undefined") return () => {};
  const update = (): void => browserLocale.set(defaultLocale());
  if (languageListeners === 0) window.addEventListener("languagechange", update);
  languageListeners++;
  return () => {
    languageListeners--;
    if (languageListeners === 0) window.removeEventListener("languagechange", update);
  };
}

/** The locale every widget below reads. */
export const LocaleContext = context<Accessor<Locale> | null>(null);

/**
 * The locale in scope: the one an ancestor declared, or the browser's.
 *
 * ```tsx
 * const locale = useLocale();
 * <div dir={() => locale().direction} />
 * ```
 */
export function useLocale(): Accessor<Locale> {
  const provided = getContext(LocaleContext);
  if (provided !== null && provided !== undefined) return provided;

  tryCleanup(watchLanguage());
  return browserLocale;
}

/**
 * Declare the locale for a subtree.
 *
 * Returns the props for the element that wraps it: `lang` and `dir` are not
 * decoration, they are what tells the engine which way to lay text out and
 * which font to pick.
 *
 * ```tsx
 * const localeProps = provideLocale(() => "ar-EG");
 * <div {...localeProps}>{props.children}</div>
 * ```
 */
export function provideLocale(tag: MaybeAccessor<string>): {
  lang: Accessor<string>;
  dir: Accessor<"ltr" | "rtl">;
} {
  const value = (): Locale => {
    const resolved = access(tag);
    return { locale: resolved, direction: isRTL(resolved) ? "rtl" : "ltr" };
  };

  const owner = getOwner();
  if (owner !== null) install(owner, LocaleContext, () => value);

  return { lang: () => value().locale, dir: () => value().direction };
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

/**
 * One instance per locale and option set, kept for the life of the page.
 *
 * Constructing an `Intl` formatter is expensive — tens of microseconds — and a
 * list of a thousand rows formatting a number per row constructs a thousand of
 * them unless something remembers.
 */
function memoised<O extends object, T>(
  create: (locale: string, options?: O) => T,
): (locale: string, options?: O) => T {
  const cache = new Map<string, T>();
  return (locale: string, options?: O): T => {
    const key = options === undefined ? locale : `${locale}:${JSON.stringify(options)}`;
    let value = cache.get(key);
    if (value === undefined) {
      value = create(locale, options);
      cache.set(key, value);
    }
    return value;
  };
}

const collators = memoised(
  (locale: string, options?: Intl.CollatorOptions) => new Intl.Collator(locale, options),
);

/** An `Intl.Collator` for the locale in scope, cached. */
export function collator(options?: Intl.CollatorOptions): Accessor<Intl.Collator> {
  const locale = useLocale();
  return () => collators(locale().locale, options);
}

export interface Filter {
  startsWith: (text: string, substring: string) => boolean;
  endsWith: (text: string, substring: string) => boolean;
  contains: (text: string, substring: string) => boolean;
}

/**
 * Locale-aware substring matching, for a typeahead or an autocomplete.
 *
 * `String.prototype.includes` compares code points, so "resume" does not match
 * "résumé" and "STRASSE" does not match "Straße". A search collator says both
 * match, which is what a user typing without diacritics expects.
 */
export function filter(options?: Intl.CollatorOptions): Filter {
  const search = collator({ usage: "search", ...options });

  const compare = (a: string, b: string): boolean => search().compare(a, b) === 0;

  return {
    startsWith(text, substring) {
      if (substring.length === 0) return true;
      const normalised = text.normalize("NFC");
      const needle = substring.normalize("NFC");
      return compare(normalised.slice(0, needle.length), needle);
    },

    endsWith(text, substring) {
      if (substring.length === 0) return true;
      const normalised = text.normalize("NFC");
      const needle = substring.normalize("NFC");
      return compare(normalised.slice(-needle.length), needle);
    },

    contains(text, substring) {
      if (substring.length === 0) return true;
      const normalised = text.normalize("NFC");
      const needle = substring.normalize("NFC");
      // A sliding window rather than `indexOf`: the collator can call two
      // strings of the same length equal without them being identical.
      for (let at = 0; at + needle.length <= normalised.length; at++) {
        if (compare(needle, normalised.slice(at, at + needle.length))) return true;
      }
      return false;
    },
  };
}

const numberFormatters = memoised(
  (locale: string, options?: Intl.NumberFormatOptions) => new Intl.NumberFormat(locale, options),
);

/** An `Intl.NumberFormat` for the locale in scope, cached. */
export function numberFormatter(options?: Intl.NumberFormatOptions): Accessor<Intl.NumberFormat> {
  const locale = useLocale();
  return () => numberFormatters(locale().locale, options);
}

// ---------------------------------------------------------------------------
// Parsing a number back
// ---------------------------------------------------------------------------

/** The characters a locale writes a number with. */
interface NumberSymbols {
  minusSign: string;
  plusSign?: string;
  decimal?: string;
  group?: string;
  /** Everything in a formatted number that is not part of its VALUE. */
  literals: RegExp;
  numeral: RegExp;
  index: (digit: string) => string;
}

const NON_LITERAL = new Set(["decimal", "fraction", "integer", "minusSign", "plusSign", "group"]);

/** Numbering systems worth trying when the locale's own does not match. */
const NUMBERING_SYSTEMS = ["latn", "arab", "hanidec", "deva", "beng", "fullwide"];

const ACCOUNTING_NEGATIVE = /^.*\(.*\).*$/;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function symbolsFor(
  locale: string,
  resolved: Intl.ResolvedNumberFormatOptions,
  given: Intl.NumberFormatOptions,
): NumberSymbols {
  // Every symbol at once: a negative number with a group separator and a
  // fraction produces the minus sign, the group and the decimal in one pass,
  // and a positive one produces the plus sign a `signDisplay` asked for.
  const wide = new Intl.NumberFormat(locale, {
    ...resolved,
    minimumSignificantDigits: 1,
    maximumSignificantDigits: 21,
    roundingIncrement: 1,
    useGrouping: true,
  });
  const negative = wide.formatToParts(-10000.111);
  const positive = wide.formatToParts(10000.111);

  const minusSign = negative.find((part) => part.type === "minusSign")?.value ?? "-";
  let plusSign = positive.find((part) => part.type === "plusSign")?.value;
  if (
    plusSign === undefined &&
    (given.signDisplay === "always" || given.signDisplay === "exceptZero")
  ) {
    plusSign = "+";
  }

  // A percent format has no fraction digits by default and a significant-digit
  // one may have none either, so the decimal separator is asked for
  // separately.
  const decimal = new Intl.NumberFormat(locale, {
    ...resolved,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
    .formatToParts(0.001)
    .find((part) => part.type === "decimal")?.value;

  const literalValues = [
    ...new Set(
      negative.filter((part) => !NON_LITERAL.has(part.type)).map((part) => escapeRegex(part.value)),
    ),
  ].toSorted((a, b) => b.length - a.length);

  // Whitespace and format characters go too: a narrow no-break space between
  // the number and its currency symbol is not part of the number.
  const literals =
    literalValues.length === 0
      ? /\p{White_Space}|\p{Cf}/gu
      : new RegExp(`${literalValues.join("|")}|\\p{White_Space}|\\p{Cf}`, "gu");

  const digits = Array.from(
    new Intl.NumberFormat(resolved.locale, { useGrouping: false }).format(9876543210),
  ).toReversed();
  const indexes = new Map(digits.map((digit, at) => [digit, at]));

  return {
    minusSign,
    plusSign,
    decimal,
    group: negative.find((part) => part.type === "group")?.value,
    literals,
    numeral: new RegExp(`[${digits.join("")}]`, "g"),
    index: (digit) => String(indexes.get(digit)),
  };
}

class NumberParserImpl {
  readonly locale: string;
  readonly formatter: Intl.NumberFormat;
  readonly options: Intl.ResolvedNumberFormatOptions;
  readonly symbols: NumberSymbols;

  constructor(locale: string, options: Intl.NumberFormatOptions = {}) {
    this.locale = locale;
    this.formatter = new Intl.NumberFormat(locale, options);
    this.options = this.formatter.resolvedOptions();
    this.symbols = symbolsFor(locale, this.options, options);
  }

  /**
   * What is left after everything that is not the number itself.
   *
   * Also the place where a keyboard the locale does not have is forgiven: an
   * ASCII minus for a locale that writes U+2212, a plain apostrophe for Swiss
   * currency's U+2019 group, a comma for Arabic's decimal.
   */
  sanitize(value: string): string {
    const grouped = this.formatter.resolvedOptions().useGrouping !== false;
    let text = value.replace(this.symbols.literals, "");

    if (this.symbols.minusSign !== "-") text = text.split("-").join(this.symbols.minusSign);

    if (this.options.numberingSystem === "arab") {
      if (this.symbols.decimal !== undefined) {
        text = text.split(",").join(this.symbols.decimal);
        text = text.split(String.fromCharCode(1548)).join(this.symbols.decimal);
      }
      if (this.symbols.group !== undefined && grouped) {
        text = text.split(".").join(this.symbols.group);
      }
    }

    if (this.symbols.group === "\u2019" && text.includes("'") && grouped) {
      text = text.split("'").join(this.symbols.group);
    }
    if (this.symbols.group === "'" && text.includes("\u2019") && grouped) {
      text = text.split("\u2019").join(this.symbols.group);
    }
    // The French group separator is a narrow no-break space, which no French
    // keyboard has; an ordinary space and a no-break one both mean it.
    if (this.symbols.group === "\u202f" && grouped) {
      text = text.split(" ").join(this.symbols.group);
      text = text.split("\u00a0").join(this.symbols.group);
    }

    return text;
  }

  parse(value: string): number {
    const grouped = this.formatter.resolvedOptions().useGrouping !== false;
    let text = this.sanitize(value);

    if (this.symbols.group !== undefined) {
      // A group separator where grouping is off is not a number at all.
      if (!grouped && text.includes(this.symbols.group)) return Number.NaN;
      text = text.split(this.symbols.group).join("");
    }
    if (this.symbols.decimal !== undefined) text = text.replace(this.symbols.decimal, ".");
    text = text.replace(this.symbols.minusSign, "-");
    text = text.replace(this.symbols.numeral, this.symbols.index);

    if (this.options.style === "percent") {
      // Divided on the STRING. Dividing 1.1 by 100 in binary floating point
      // gives 0.011000000000000001, and the field would show it.
      const negative = text.includes("-");
      text = text.replace("-", "").replace("+", "");
      let point = text.indexOf(".");
      if (point === -1) point = text.length;
      text = text.replace(".", "");
      if (point - 2 === 0) text = `0.${text}`;
      else if (point - 2 === -1) text = `0.0${text}`;
      else if (point - 2 <= -2) text = "0.00";
      else text = `${text.slice(0, point - 2)}.${text.slice(point - 2)}`;
      if (negative) text = `-${text}`;
    }

    const parsed = text === "" ? Number.NaN : Number(text);
    if (Number.isNaN(parsed)) return Number.NaN;

    // A negative accounting value is written in parentheses, which sanitising
    // strips along with every other literal.
    if (this.options.currencySign === "accounting" && ACCOUNTING_NEGATIVE.test(value)) {
      return -parsed;
    }
    return parsed;
  }

  /**
   * Whether this could still BECOME a number.
   *
   * A field that rejected every keystroke that is not yet a number would
   * reject the minus sign, and then the decimal point after it.
   */
  isValidPartialNumber(value: string, minValue = -Infinity, maxValue = Infinity): boolean {
    const grouped = this.formatter.resolvedOptions().useGrouping !== false;
    let text = this.sanitize(value);

    if (text.startsWith(this.symbols.minusSign) && minValue < 0) {
      text = text.slice(this.symbols.minusSign.length);
    } else if (
      this.symbols.plusSign !== undefined &&
      text.startsWith(this.symbols.plusSign) &&
      maxValue > 0
    ) {
      text = text.slice(this.symbols.plusSign.length);
    }

    if (
      this.symbols.decimal !== undefined &&
      text.includes(this.symbols.decimal) &&
      this.options.maximumFractionDigits === 0
    ) {
      return false;
    }

    if (this.symbols.group !== undefined && grouped) {
      text = text.split(this.symbols.group).join("");
    }
    text = text.replace(this.symbols.numeral, "");
    if (this.symbols.decimal !== undefined) text = text.replace(this.symbols.decimal, "");

    return text.length === 0;
  }
}

const numberParsers = memoised(
  (locale: string, options?: Intl.NumberFormatOptions) => new NumberParserImpl(locale, options),
);

/**
 * Reading a number back out of what a locale wrote.
 *
 * `Number("1.234,5")` is NaN in every locale that writes it that way, and
 * `parseFloat` silently reads "1.234" instead, which is a hundredth of what
 * the user typed. The symbols come from `Intl.NumberFormat.formatToParts`, so
 * they are the ones the same options would have PRODUCED, and the numbering
 * system is detected from the text rather than assumed.
 */
export class NumberParser {
  #locale: string;
  #options: Intl.NumberFormatOptions;

  constructor(locale: string, options: Intl.NumberFormatOptions = {}) {
    this.#locale = locale;
    this.#options = options;
  }

  /** The parser whose numbering system this text is written in. */
  #for(value: string): NumberParserImpl {
    const own = numberParsers(this.#locale, this.#options);
    if (this.#locale.includes("-nu-") || own.isValidPartialNumber(value)) return own;

    for (const system of NUMBERING_SYSTEMS) {
      if (system === own.options.numberingSystem) continue;
      const tagged = `${this.#locale}${this.#locale.includes("-u-") ? "-nu-" : "-u-nu-"}${system}`;
      const parser = numberParsers(tagged, this.#options);
      if (parser.isValidPartialNumber(value)) return parser;
    }

    return own;
  }

  /** The number, or NaN when the text is not one. */
  parse(value: string): number {
    return this.#for(value).parse(value);
  }

  /** Whether the text could still become a number as the user keeps typing. */
  isValidPartialNumber(value: string, minValue?: number, maxValue?: number): boolean {
    return this.#for(value).isValidPartialNumber(value, minValue, maxValue);
  }

  /** Which numbering system the text is written in. */
  getNumberingSystem(value: string): string {
    return this.#for(value).options.numberingSystem;
  }
}

/** A {@link NumberParser} for the locale in scope. */
export function numberParser(options?: Intl.NumberFormatOptions): Accessor<NumberParser> {
  const locale = useLocale();
  return () => new NumberParser(locale().locale, options);
}

const dateFormatters = memoised(
  (locale: string, options?: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, options),
);

/** An `Intl.DateTimeFormat` for the locale in scope, cached. */
export function dateFormatter(options?: Intl.DateTimeFormatOptions): Accessor<Intl.DateTimeFormat> {
  const locale = useLocale();
  return () => dateFormatters(locale().locale, options);
}

const listFormatters = memoised(
  (locale: string, options?: Intl.ListFormatOptions) => new Intl.ListFormat(locale, options),
);

/** An `Intl.ListFormat` for the locale in scope, cached. */
export function listFormatter(options?: Intl.ListFormatOptions): Accessor<Intl.ListFormat> {
  const locale = useLocale();
  return () => listFormatters(locale().locale, options);
}

// ---------------------------------------------------------------------------
// Localized strings
// ---------------------------------------------------------------------------

export type Variables = Record<string, string | number | boolean> | undefined;

/**
 * One message. A function when it needs the count, the gender or a number
 * formatted, which is most of the messages a widget produces.
 */
export type LocalizedString = string | ((variables: Variables, format: StringFormatter) => string);

export type LocalizedStrings<K extends string = string> = Record<
  string,
  Record<K, LocalizedString>
>;

function languageOf(tag: string): string {
  if (typeof Intl.Locale === "function") return new Intl.Locale(tag).language;
  return tag.split("-")[0] as string;
}

function scriptOf(tag: string): string | undefined {
  if (typeof Intl.Locale === "function") return new Intl.Locale(tag).script;
  return undefined;
}

/**
 * Every translation of a widget's strings, with the fallback rules.
 *
 * A locale with no exact entry falls back by script first and language second:
 * `sr-Latn-RS` must reach `sr-Latn` rather than `sr`, because the two are
 * written in different alphabets and one is unreadable to a reader of the
 * other.
 */
export class StringDictionary<K extends string = string> {
  #strings: LocalizedStrings<K>;
  #fallback: string;

  constructor(strings: LocalizedStrings<K>, fallback = "en-US") {
    // Entries a locale-pruning build step emptied are dropped, not kept as
    // an empty object that would shadow the fallback.
    this.#strings = Object.fromEntries(Object.entries(strings).filter(([, value]) => value));
    this.#fallback = fallback;
  }

  forLocale(locale: string): Record<K, LocalizedString> {
    const cached = this.#strings[locale];
    if (cached !== undefined) return cached;

    const resolved = this.#resolve(locale);
    this.#strings[locale] = resolved;
    return resolved;
  }

  get(key: K, locale: string): LocalizedString {
    const string = this.forLocale(locale)[key];
    if (string === undefined) {
      throw new Error(`No message "${key}" for locale "${locale}".`);
    }
    return string;
  }

  #resolve(locale: string): Record<K, LocalizedString> {
    const language = languageOf(locale);

    const script = scriptOf(locale);
    if (script !== undefined) {
      const withScript = this.#strings[`${language}-${script}`];
      if (withScript !== undefined) return withScript;
    }

    const byLanguage = this.#strings[language];
    if (byLanguage !== undefined) return byLanguage;

    for (const key in this.#strings) {
      if (key.startsWith(`${language}-`)) return this.#strings[key] as Record<K, LocalizedString>;
    }

    return this.#strings[this.#fallback] as Record<K, LocalizedString>;
  }
}

const pluralRules = new Map<string, Intl.PluralRules>();

/** Formats one dictionary's messages for one locale. */
export class StringFormatter<K extends string = string> {
  #locale: string;
  #strings: StringDictionary<K>;

  constructor(locale: string, strings: StringDictionary<K>) {
    this.#locale = locale;
    this.#strings = strings;
  }

  format(key: K, variables?: Variables): string {
    const message = this.#strings.get(key, this.#locale);
    return typeof message === "function" ? message(variables, this) : message;
  }

  /** The branch for `count`, by the locale's own plural categories. */
  plural(
    count: number,
    options: Record<string, string | (() => string)>,
    type: Intl.PluralRuleType = "cardinal",
  ): string {
    // An exact form wins: "no items" reads better than "0 items".
    const exact = options[`=${count}`];
    if (exact !== undefined) return typeof exact === "function" ? exact() : exact;

    const key = `${this.#locale}:${type}`;
    let rules = pluralRules.get(key);
    if (rules === undefined) {
      rules = new Intl.PluralRules(this.#locale, { type });
      pluralRules.set(key, rules);
    }

    const branch = options[rules.select(count)] ?? options.other;
    if (branch === undefined) return "";
    return typeof branch === "function" ? branch() : branch;
  }

  /** The branch for a value that is not a number: a gender, a state. */
  select(options: Record<string, string | (() => string)>, value: string): string {
    const branch = options[value] ?? options.other;
    if (branch === undefined) return "";
    return typeof branch === "function" ? branch() : branch;
  }

  number(value: number): string {
    return numberFormatters(this.#locale).format(value);
  }
}

const formatterCache = new WeakMap<StringDictionary, Map<string, StringFormatter>>();

/**
 * A formatter for a dictionary, in the locale in scope.
 *
 * ```ts
 * const strings = new StringDictionary({ "en-US": { close: "Close" } });
 * const message = stringFormatter(strings);
 * <button aria-label={() => message().format("close")} />
 * ```
 */
export function stringFormatter<K extends string>(
  strings: StringDictionary<K>,
): Accessor<StringFormatter<K>> {
  const locale = useLocale();

  return () => {
    const tag = locale().locale;
    let byLocale = formatterCache.get(strings);
    if (byLocale === undefined) {
      byLocale = new Map();
      formatterCache.set(strings, byLocale);
    }
    let formatter = byLocale.get(tag);
    if (formatter === undefined) {
      formatter = new StringFormatter(tag, strings);
      byLocale.set(tag, formatter);
    }
    return formatter;
  };
}
