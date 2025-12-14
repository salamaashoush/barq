/**
 * CSS-in-JS powered by goober
 *
 * Provides styled components and css utilities with automatic setup
 */

import {
  extractCss,
  glob,
  css as gooberCss,
  styled as gooberStyled,
  keyframes,
  setup,
} from "goober";

// Track if setup has been called
let isSetup = false;

/**
 * Initialize goober with our JSX pragma
 * Called automatically on first use, but can be called manually for SSR
 */
export function setupCss(pragma?: (type: unknown, props: unknown) => unknown): void {
  if (isSetup) return;
  isSetup = true;

  // Use provided pragma or default to basic element creation
  const h =
    pragma ||
    ((type: unknown, props: unknown) => {
      if (typeof type === "string") {
        const el = document.createElement(type);
        if (props && typeof props === "object") {
          for (const [key, value] of Object.entries(props as Record<string, unknown>)) {
            if (key === "children") continue;
            if (key === "className") {
              el.className = String(value);
            } else if (key.startsWith("on") && typeof value === "function") {
              el.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
            } else if (key === "style" && typeof value === "object") {
              Object.assign(el.style, value);
            } else {
              el.setAttribute(key, String(value));
            }
          }
        }
        return el;
      }
      return null;
    });

  setup(h);
}

/**
 * Ensure setup is called before using css utilities
 */
function ensureSetup(): void {
  if (!isSetup) {
    setupCss();
  }
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
  ensureSetup();
  return boundCss(strings, ...values);
}

/**
 * Create a styled component
 *
 * @example
 * ```tsx
 * const Button = styled("button")`
 *   background: ${props => props.primary ? "blue" : "gray"};
 *   color: white;
 *   padding: 8px 16px;
 * `;
 *
 * <Button primary>Primary</Button>
 * <Button>Secondary</Button>
 * ```
 */
export const styled = new Proxy(gooberStyled, {
  apply(target, thisArg, args) {
    ensureSetup();
    return Reflect.apply(target, thisArg, args);
  },
  get(target, prop) {
    ensureSetup();
    return Reflect.get(target, prop);
  },
}) as typeof gooberStyled;

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
  ensureSetup();
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
export function globalCss(strings: TemplateStringsArray, ...values: (string | number)[]): void {
  ensureSetup();
  glob(strings, ...values);
}

/**
 * Extract all generated CSS (useful for SSR)
 */
export function getStyleTag(): string {
  return extractCss();
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
      if (selectedValue && variantOptions[selectedValue as string]) {
        classes.push(variantOptions[selectedValue as string]);
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
    if (value && typeof value === "object" && part in value) {
      value = (value as Record<string, unknown>)[part];
    } else {
      return path; // Return original path if not found
    }
  }

  return String(value);
}

// Re-export types
export type { CSSAttribute } from "goober";
