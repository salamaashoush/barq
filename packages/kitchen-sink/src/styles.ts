/**
 * The application's CSS layer.
 *
 * It used to be `packages/extra/src/css.ts`, whose JSX pragma re-implemented
 * element creation a fifth time — 24 lines of `document.createElement` plus
 * className, `on*` and style-object handling. CSS scoping is ecosystem rather
 * than framework, so the framework stopped shipping it and the application that
 * wants goober depends on goober.
 *
 * Three exports went with it rather than moving: `setupCss` (the
 * pragma itself), `styled` (the only thing that needed the pragma, and nothing
 * here used it), and `createGlobalStyle` (a component declaration that took
 * props in the scope's position and was reachable by nobody). `getStyleTag`
 * went with them — it had no reader either.
 *
 * What survives is `css`/`keyframe`/`globalCss` over goober, and six pure
 * string functions — `clsx`, `createTheme`, `variants`, `cssVar`, `defineVars`,
 * `token` — that never touched goober or the DOM in the first place.
 */

import { extractCss, css as gooberCss, keyframes } from "goober";

/**
 * The global rules, as a function rather than a top-level side effect.
 *
 * Both entries call it. On the server that has to happen before the document is
 * built, because `collectStyles` drains goober's sheet and a rule registered
 * after the drain is a rule the first paint does not have.
 */
export function baseStyles(): void {
  globalCss`
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: system-ui, -apple-system, sans-serif;
      background: #0f172a;
      color: #e2e8f0;
      line-height: 1.6;
    }
    a { color: #60a5fa; text-decoration: none; }
    a:hover { text-decoration: underline; }
    code { background: #1e293b; padding: 2px 6px; border-radius: 4px; font-family: "Fira Code", monospace; }
    pre { background: #1e293b; padding: 16px; border-radius: 8px; overflow-x: auto; }
    button { cursor: pointer; font-family: inherit; }
    input, select, textarea { font-family: inherit; }
  `;
}

/**
 * Every rule goober has registered so far, for the server to inline.
 *
 * Without it an SSR'd page arrives unstyled and repaints once the bundle runs,
 * which is the flash a server render exists to remove.
 *
 * ACCUMULATED, because `extractCss` DRAINS. goober's sheet is a module-level
 * global and `extractCss` empties it, which is right for a process that renders
 * once and exits and wrong for a server that renders forever: the first request
 * took every rule and every request after it got only what had re-registered
 * since. Measured on the reference application — request one inlined 2481 bytes
 * and request two inlined 120, one of the twenty-one classes its own markup
 * used, so every page after the first flashed white.
 *
 * DEDUPED by rule, because appending alone leaks. A rule built inside a
 * component body is re-registered on every render and `extractCss` hands it
 * back as new each time — measured as the inlined sheet growing 120 bytes per
 * request, forever. A class name is a hash of its content, so the same rule is
 * the same bytes and a set is enough.
 *
 * A page therefore also carries the rules for routes it has not navigated to
 * yet, which is what keeps a client-side navigation from flashing too.
 */
const rules = new Set<string>();

/**
 * Split a stylesheet into top-level rules.
 *
 * Brace-aware rather than a split on `}`: `@media` and `@keyframes` nest, and
 * cutting them at the first close would emit two fragments that are each
 * invalid CSS.
 */
function splitRules(css: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < css.length; i++) {
    const character = css[i];
    if (character === "{") depth++;
    else if (character === "}") {
      depth--;
      if (depth === 0) {
        const rule = css.slice(start, i + 1).trim();
        if (rule !== "") out.push(rule);
        start = i + 1;
      }
    }
  }
  return out;
}

export function collectStyles(): string {
  // ON THE CLIENT this is the sheet the SERVER sent, read back off the element
  // it is already in. The shell renders `<style id="_goober">{collectStyles()}
  // </style>` on both sides, and the document is hydrated — so the two have to
  // agree, and only the server's answer is the right one: goober's client sheet
  // starts empty and fills as components mount, which would replace a complete
  // stylesheet with a partial one mid-hydration.
  if (typeof document !== "undefined") {
    const served = document.getElementById("_goober");
    if (served !== null) return served.textContent ?? "";
  }
  for (const rule of splitRules(extractCss())) rules.add(rule);
  // Globals FIRST, so a component class still wins on specificity ties, and
  // because `body { background }` is the rule whose absence is a white page.
  return globalRules.join("") + [...rules].join("");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Create a CSS class from a template literal
 *
 * @example
 * ```tsx
 * const buttonClass = css`
 *   background: blue;
 *   color: white;
 *   padding: 8px 16px;
 *   border-radius: 4px;
 *
 *   &:hover {
 *     background: darkblue;
 *   }
 * `;
 *
 * <button class={buttonClass}>Click me</button>
 * ```
 */
// Bind to empty object to avoid global `this` pollution (e.g., window.k from other libs)
const boundCss = gooberCss.bind({});

export function css(strings: TemplateStringsArray, ...values: (string | number)[]): string {
  return boundCss(strings, ...values);
}

/**
 * Create CSS keyframes animation
 *
 * @example
 * ```tsx
 * const fadeIn = keyframe`
 *   from { opacity: 0; }
 *   to { opacity: 1; }
 * `;
 *
 * const FadeBox = styled("div")`
 *   animation: ${fadeIn} 0.3s ease-in;
 * `;
 * ```
 */
export function keyframe(strings: TemplateStringsArray, ...values: (string | number)[]): string {
  return keyframes(strings, ...values);
}

/**
 * Inject global styles
 *
 * @example
 * ```tsx
 * globalCss`
 *   * {
 *     box-sizing: border-box;
 *   }
 *
 *   body {
 *     margin: 0;
 *     font-family: system-ui, sans-serif;
 *   }
 * `;
 * ```
 */
// Track injected global CSS to avoid duplicates
const injectedGlobalCss = new Set<string>();

/**
 * The global rules, in declaration order, for `collectStyles` to inline.
 *
 * These do NOT go through goober's sheet — `globalCss` writes them to the
 * document itself — so `extractCss` never sees them and the server had no way
 * to send them.
 */
const globalRules: string[] = [];

export function globalCss(strings: TemplateStringsArray, ...values: (string | number)[]): void {
  // Build the CSS string from template literal
  let cssText = strings[0];
  for (let i = 0; i < values.length; i++) {
    cssText += String(values[i]) + strings[i + 1];
  }

  // Skip if already injected
  const trimmed = cssText.trim();
  if (injectedGlobalCss.has(trimmed)) return;
  injectedGlobalCss.add(trimmed);

  // RECORDED for the server, not only written to the DOM. This function used to
  // do nothing at all under `typeof document === "undefined"`, so the global
  // rules never reached the server's inlined sheet — `body { background }`
  // among them, which is why an SSR'd page painted white until the bundle ran
  // and re-registered them. goober's own `css` goes through `extractCss`; these
  // do not, so they are kept here.
  globalRules.push(cssText);

  // Inject directly into goober's style sheet (append, don't replace)
  // This fixes goober's glob behavior which replaces previous global CSS
  if (typeof document !== "undefined") {
    const GOOBER_ID = "_goober";
    let styleEl = document.getElementById(GOOBER_ID) as HTMLStyleElement | null;

    if (!styleEl) {
      // Create goober's style element if it doesn't exist
      styleEl = document.createElement("style");
      styleEl.id = GOOBER_ID;
      styleEl.textContent = " ";
      document.head.appendChild(styleEl);
    }

    // Only if the server did not already inline it. The client calls
    // `baseStyles()` too, and appending a second copy of every global rule to a
    // sheet the server already sent is bytes and parse time for no change.
    const current = styleEl.textContent ?? "";
    if (!current.includes(trimmed)) styleEl.textContent = current + cssText;
  }
}

/**
 * Conditionally join class names (like clsx/classnames)
 *
 * @example
 * ```tsx
 * // Strings
 * clsx("foo", "bar") // => "foo bar"
 *
 * // Conditionals
 * clsx("foo", isActive && "active") // => "foo active" or "foo"
 *
 * // Objects
 * clsx({ foo: true, bar: false, baz: isActive }) // => "foo baz"
 *
 * // Arrays
 * clsx(["foo", "bar"]) // => "foo bar"
 *
 * // Mixed
 * clsx("base", isActive && "active", { error: hasError }, ["extra"])
 * ```
 */
export type ClassValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | ClassValue[]
  | Record<string, boolean | null | undefined>;

export function clsx(...inputs: ClassValue[]): string {
  const classes: string[] = [];

  for (const input of inputs) {
    if (!input) continue;

    if (typeof input === "string" || typeof input === "number") {
      classes.push(String(input));
    } else if (Array.isArray(input)) {
      const inner = clsx(...input);
      if (inner) classes.push(inner);
    } else if (typeof input === "object") {
      for (const [key, value] of Object.entries(input)) {
        if (value) classes.push(key);
      }
    }
  }

  return classes.join(" ");
}

/**
 * Design tokens type - apps define their own tokens
 */
export interface DesignTokens {
  colors: Record<string, string>;
  fonts: Record<string, string>;
  spacing: Record<string, string>;
  radius: Record<string, string>;
  shadow: Record<string, string>;
  fontSize: Record<string, string>;
  fontWeight: Record<string, string | number>;
  lineHeight: Record<string, string | number>;
  zIndex: Record<string, number>;
}

/**
 * Create a theme by merging base tokens with overrides
 */
export function createTheme(base: DesignTokens, overrides: Partial<DesignTokens>): DesignTokens {
  return {
    colors: { ...base.colors, ...overrides.colors },
    fonts: { ...base.fonts, ...overrides.fonts },
    spacing: { ...base.spacing, ...overrides.spacing },
    radius: { ...base.radius, ...overrides.radius },
    shadow: { ...base.shadow, ...overrides.shadow },
    fontSize: { ...base.fontSize, ...overrides.fontSize },
    fontWeight: { ...base.fontWeight, ...overrides.fontWeight },
    lineHeight: { ...base.lineHeight, ...overrides.lineHeight },
    zIndex: { ...base.zIndex, ...overrides.zIndex },
  };
}

/**
 * Variant configuration type
 */
export type VariantConfig<V extends Record<string, Record<string, string>>> = {
  base?: string;
  variants: V;
  defaultVariants?: { [K in keyof V]?: keyof V[K] };
  compoundVariants?: Array<{ [K in keyof V]?: keyof V[K] } & { class: string }>;
};

/**
 * Create variant-based styles (like CVA - class-variance-authority)
 *
 * @example
 * ```tsx
 * const button = variants({
 *   base: css`padding: 8px 16px; border-radius: 4px;`,
 *   variants: {
 *     intent: {
 *       primary: css`background: blue; color: white;`,
 *       secondary: css`background: gray; color: black;`,
 *     },
 *     size: {
 *       sm: css`font-size: 12px;`,
 *       md: css`font-size: 14px;`,
 *       lg: css`font-size: 16px;`,
 *     },
 *   },
 *   defaultVariants: {
 *     intent: "primary",
 *     size: "md",
 *   },
 *   compoundVariants: [
 *     { intent: "primary", size: "lg", class: css`font-weight: bold;` },
 *   ],
 * });
 *
 * // Usage
 * <button class={button({ intent: "primary", size: "lg" })}>Click</button>
 * ```
 */
export function variants<V extends Record<string, Record<string, string>>>(
  config: VariantConfig<V>,
): (props?: { [K in keyof V]?: keyof V[K] }) => string {
  return (props = {}) => {
    const classes: string[] = [];

    // Add base
    if (config.base) {
      classes.push(config.base);
    }

    // Add variant classes
    for (const [variantKey, variantOptions] of Object.entries(config.variants)) {
      const selectedValue =
        props[variantKey as keyof V] ?? config.defaultVariants?.[variantKey as keyof V];
      if (typeof selectedValue === "string" && variantOptions[selectedValue]) {
        classes.push(variantOptions[selectedValue]);
      }
    }

    // Add compound variants
    if (config.compoundVariants) {
      for (const compound of config.compoundVariants) {
        const { class: compoundClass, ...conditions } = compound;
        const matches = Object.entries(conditions).every(([key, value]) => {
          const selectedValue = props[key as keyof V] ?? config.defaultVariants?.[key as keyof V];
          return selectedValue === value;
        });
        if (matches && compoundClass) {
          classes.push(compoundClass);
        }
      }
    }

    return classes.join(" ");
  };
}

/**
 * CSS custom property utilities
 */
export function cssVar(name: string, fallback?: string): string {
  return fallback ? `var(--${name}, ${fallback})` : `var(--${name})`;
}

export function defineVars(vars: Record<string, string>): string {
  return Object.entries(vars)
    .map(([key, value]) => `--${key}: ${value};`)
    .join(" ");
}

/**
 * Access a token value by dot notation path
 *
 * @example
 * ```tsx
 * token(tokens, "colors.primary") // => "#667eea"
 * token(tokens, "spacing.4") // => "16px"
 * ```
 */
export function token(tokens: DesignTokens, path: string): string {
  const parts = path.split(".");
  let value: unknown = tokens;

  for (const part of parts) {
    if (isRecord(value) && part in value) {
      value = value[part];
    } else {
      return path; // Return original path if not found
    }
  }

  return String(value);
}
