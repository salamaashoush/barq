/**
 * Excalidraw's translations, its locale files as they are, loaded on demand.
 *
 * `en` is bundled as the fallback every other language falls back to, key by
 * key, as Excalidraw's `t` does. Each of the others is its own chunk, fetched
 * the first time its code is asked for and kept for the life of the page.
 *
 * `locales/barq/` holds the strings barq's UI has and Excalidraw's does not,
 * under the same paths: a language's file there is laid over its Excalidraw
 * file as it loads, so they translate the same way, key by key.
 */

import excalidrawEnglish from "./locales/en.json";
import barqEnglish from "./locales/barq/en.json";
import percentages from "./locales/percentages.json";

export type LocaleData = Record<string, unknown>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** `base` with `overlay`'s keys added, nested objects merged. */
const overlay = (base: LocaleData, over: LocaleData): LocaleData => {
  const merged: LocaleData = { ...base };
  for (const [key, value] of Object.entries(over)) {
    const current = merged[key];
    merged[key] = isRecord(current) && isRecord(value) ? overlay(current, value) : value;
  }
  return merged;
};

const fallbackLangData = overlay(excalidrawEnglish, barqEnglish);

type NestedKeyOf<T, Prefix extends string = ""> = {
  [K in keyof T & string]: T[K] extends string
    ? `${Prefix}${K}`
    : T[K] extends object
      ? NestedKeyOf<T[K], `${Prefix}${K}.`>
      : never;
}[keyof T & string];

/** A path into the English locale, Excalidraw's or barq's, such as `"toolBar.rectangle"`. */
export type TranslationKey =
  | NestedKeyOf<typeof excalidrawEnglish>
  | NestedKeyOf<typeof barqEnglish>;

export interface Language {
  code: string;
  label: string;
  rtl?: boolean;
}

/** Excalidraw's rule: a language is offered once 85% of it is translated. */
const COMPLETION_THRESHOLD = 85;

export const defaultLang: Language = { code: "en", label: "English" };

const LANGUAGE_LABELS: readonly Language[] = [
  { code: "ar-SA", label: "العربية", rtl: true },
  { code: "bg-BG", label: "Български" },
  { code: "ca-ES", label: "Català" },
  { code: "cs-CZ", label: "Česky" },
  { code: "de-DE", label: "Deutsch" },
  { code: "el-GR", label: "Ελληνικά" },
  { code: "es-ES", label: "Español" },
  { code: "eu-ES", label: "Euskara" },
  { code: "fa-IR", label: "فارسی", rtl: true },
  { code: "fi-FI", label: "Suomi" },
  { code: "fr-FR", label: "Français" },
  { code: "gl-ES", label: "Galego" },
  { code: "he-IL", label: "עברית", rtl: true },
  { code: "hi-IN", label: "हिन्दी" },
  { code: "hu-HU", label: "Magyar" },
  { code: "id-ID", label: "Bahasa Indonesia" },
  { code: "it-IT", label: "Italiano" },
  { code: "ja-JP", label: "日本語" },
  { code: "kab-KAB", label: "Taqbaylit" },
  { code: "kk-KZ", label: "Қазақ тілі" },
  { code: "ko-KR", label: "한국어" },
  { code: "ku-TR", label: "Kurdî" },
  { code: "lt-LT", label: "Lietuvių" },
  { code: "lv-LV", label: "Latviešu" },
  { code: "my-MM", label: "Burmese" },
  { code: "nb-NO", label: "Norsk bokmål" },
  { code: "nl-NL", label: "Nederlands" },
  { code: "nn-NO", label: "Norsk nynorsk" },
  { code: "oc-FR", label: "Occitan" },
  { code: "pa-IN", label: "ਪੰਜਾਬੀ" },
  { code: "pl-PL", label: "Polski" },
  { code: "pt-BR", label: "Português Brasileiro" },
  { code: "pt-PT", label: "Português" },
  { code: "ro-RO", label: "Română" },
  { code: "ru-RU", label: "Русский" },
  { code: "sk-SK", label: "Slovenčina" },
  { code: "sv-SE", label: "Svenska" },
  { code: "sl-SI", label: "Slovenščina" },
  { code: "tr-TR", label: "Türkçe" },
  { code: "uk-UA", label: "Українська" },
  { code: "zh-CN", label: "简体中文" },
  { code: "zh-TW", label: "繁體中文" },
  { code: "vi-VN", label: "Tiếng Việt" },
  { code: "mr-IN", label: "मराठी" },
];

/** The languages Excalidraw offers in its menu: English, then the well translated, by name. */
export const languages: readonly Language[] = [
  defaultLang,
  ...LANGUAGE_LABELS.filter(
    (lang) => ((percentages as Record<string, number>)[lang.code] ?? 0) >= COMPLETION_THRESHOLD,
  ).toSorted((left, right) => (left.label > right.label ? 1 : -1)),
];

// Every locale file Excalidraw ships, each its own chunk. A literal import per
// code (rather than one template) is what lets a bundler see and split them.
const LOADERS: Record<string, () => Promise<{ default: LocaleData }>> = {
  "ar-SA": () => import("./locales/ar-SA.json"),
  "az-AZ": () => import("./locales/az-AZ.json"),
  "bg-BG": () => import("./locales/bg-BG.json"),
  "bn-BD": () => import("./locales/bn-BD.json"),
  "bn-IN": () => import("./locales/bn-IN.json"),
  "ca-ES": () => import("./locales/ca-ES.json"),
  "cs-CZ": () => import("./locales/cs-CZ.json"),
  "da-DK": () => import("./locales/da-DK.json"),
  "de-CH": () => import("./locales/de-CH.json"),
  "de-DE": () => import("./locales/de-DE.json"),
  "el-GR": () => import("./locales/el-GR.json"),
  "es-ES": () => import("./locales/es-ES.json"),
  "eu-ES": () => import("./locales/eu-ES.json"),
  "fa-IR": () => import("./locales/fa-IR.json"),
  "fi-FI": () => import("./locales/fi-FI.json"),
  "fr-FR": () => import("./locales/fr-FR.json"),
  "gl-ES": () => import("./locales/gl-ES.json"),
  "he-IL": () => import("./locales/he-IL.json"),
  "hi-IN": () => import("./locales/hi-IN.json"),
  "hu-HU": () => import("./locales/hu-HU.json"),
  "id-ID": () => import("./locales/id-ID.json"),
  "it-IT": () => import("./locales/it-IT.json"),
  "ja-JP": () => import("./locales/ja-JP.json"),
  kaa: () => import("./locales/kaa.json"),
  "kab-KAB": () => import("./locales/kab-KAB.json"),
  "kk-KZ": () => import("./locales/kk-KZ.json"),
  "km-KH": () => import("./locales/km-KH.json"),
  "ko-KR": () => import("./locales/ko-KR.json"),
  "ku-TR": () => import("./locales/ku-TR.json"),
  "lt-LT": () => import("./locales/lt-LT.json"),
  "lv-LV": () => import("./locales/lv-LV.json"),
  "mr-IN": () => import("./locales/mr-IN.json"),
  "my-MM": () => import("./locales/my-MM.json"),
  "nb-NO": () => import("./locales/nb-NO.json"),
  "nl-NL": () => import("./locales/nl-NL.json"),
  "nn-NO": () => import("./locales/nn-NO.json"),
  "oc-FR": () => import("./locales/oc-FR.json"),
  "pa-IN": () => import("./locales/pa-IN.json"),
  "pl-PL": () => import("./locales/pl-PL.json"),
  "pt-BR": () => import("./locales/pt-BR.json"),
  "pt-PT": () => import("./locales/pt-PT.json"),
  "ro-RO": () => import("./locales/ro-RO.json"),
  "ru-RU": () => import("./locales/ru-RU.json"),
  "si-LK": () => import("./locales/si-LK.json"),
  "sk-SK": () => import("./locales/sk-SK.json"),
  "sl-SI": () => import("./locales/sl-SI.json"),
  "sv-SE": () => import("./locales/sv-SE.json"),
  "ta-IN": () => import("./locales/ta-IN.json"),
  "th-TH": () => import("./locales/th-TH.json"),
  "tr-TR": () => import("./locales/tr-TR.json"),
  "uk-UA": () => import("./locales/uk-UA.json"),
  "uz-UZ": () => import("./locales/uz-UZ.json"),
  "vi-VN": () => import("./locales/vi-VN.json"),
  "zh-CN": () => import("./locales/zh-CN.json"),
  "zh-HK": () => import("./locales/zh-HK.json"),
  "zh-TW": () => import("./locales/zh-TW.json"),
};

// barq's own strings in a language, laid over Excalidraw's as it loads
const OVERLAY_LOADERS: Record<string, () => Promise<{ default: LocaleData }>> = {
  "ar-SA": () => import("./locales/barq/ar-SA.json"),
};

/** Every language code there is a locale file for, `en` first. */
export const localeCodes: readonly string[] = ["en", ...Object.keys(LOADERS)];

const RTL_CODES = new Set(LANGUAGE_LABELS.filter((lang) => lang.rtl).map((lang) => lang.code));

/** Whether Excalidraw lays the language out right to left. */
export const isRTLLanguage = (code: string): boolean => RTL_CODES.has(code);

const loaded = new Map<string, LocaleData>([["en", fallbackLangData]]);
const pending = new Map<string, Promise<LocaleData>>();

/** The language's strings when they have loaded, `undefined` before. */
export const getLoadedLanguage = (code: string): LocaleData | undefined => loaded.get(code);

/**
 * Loads a language's strings, once. A code without a locale file resolves to
 * English, as a failed load does in Excalidraw.
 */
export const loadLanguage = (code: string): Promise<LocaleData> => {
  const ready = loaded.get(code);
  if (ready) return Promise.resolve(ready);
  const inFlight = pending.get(code);
  if (inFlight) return inFlight;
  const loader = LOADERS[code];
  if (!loader) return Promise.resolve(fallbackLangData);
  const own = OVERLAY_LOADERS[code];
  const promise = Promise.all([loader(), own?.()]).then(
    ([module, barq]) => {
      const data = barq ? overlay(module.default, barq.default) : module.default;
      loaded.set(code, data);
      pending.delete(code);
      return data;
    },
    (error: unknown) => {
      pending.delete(code);
      console.error(`DiagramEditor: the "${code}" translations did not load`, error);
      return fallbackLangData;
    },
  );
  pending.set(code, promise);
  return promise;
};

const findPath = (data: unknown, parts: readonly string[]): string | undefined => {
  let node = data;
  for (const part of parts) {
    if (node === null || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string" ? node : undefined;
};

export type TranslationReplacement = Readonly<Record<string, string | number>>;

/**
 * A key's text in `data`, English where `data` has none, with each
 * `{{name}}` filled from `replacement`. Excalidraw's `t`.
 */
export const translate = (
  data: LocaleData | undefined,
  path: TranslationKey,
  replacement?: TranslationReplacement | null,
  fallback?: string,
): string => {
  const parts = path.split(".");
  // an empty translation is an untranslated one, which English stands in for
  let translation =
    (data && findPath(data, parts)) || findPath(fallbackLangData, parts) || fallback;
  if (translation === undefined) {
    console.warn(`DiagramEditor: no translation for "${path}"`);
    return "";
  }
  if (replacement) {
    for (const key in replacement) {
      const value = String(replacement[key]);
      // Excalidraw writes `toast.fileSavedToFilename`'s placeholder with single braces
      translation = translation.replace(`{{${key}}}`, value).replace(`{${key}}`, value);
    }
  }
  return translation;
};

export type Translate = (
  path: TranslationKey,
  replacement?: TranslationReplacement | null,
  fallback?: string,
) => string;

/**
 * A message the editor sets in `toast` or `errorMessage`, translated where
 * it is shown, in the language of the moment.
 */
export interface LocalizedMessage {
  key: TranslationKey;
  replacement?: TranslationReplacement;
}

export const isLocalizedMessage = (value: unknown): value is LocalizedMessage =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as { key?: unknown }).key === "string";

/** An error whose message the UI shows translated: its own message is the English. */
export class LocalizedError extends Error {
  public constructor(
    public readonly localized: LocalizedMessage,
    options?: ErrorOptions,
  ) {
    super(translate(undefined, localized.key, localized.replacement), options);
  }
}

/** What an error puts in `errorMessage`: a translatable message when it has one. */
export const errorMessageOf = (error: unknown, fallback: LocalizedMessage): unknown =>
  error instanceof LocalizedError
    ? error.localized
    : error instanceof Error && error.message
      ? error.message
      : fallback;
