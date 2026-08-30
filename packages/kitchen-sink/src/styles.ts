/**
 * The application's DESIGN TOKENS, and nothing else.
 *
 * `css`, `keyframes` and `globalCss` moved to `@barqjs/css`, where the compiler
 * can see them: it resolves the tag by symbol against that specifier, so a
 * re-export from here would be a different symbol and every block in the
 * application would have stayed on the runtime.
 *
 * What went with them is the whole apparatus goober needed and a compiled
 * stylesheet does not: `baseStyles` (an ordering problem that only existed
 * because a rule registered after the drain never reached the first paint),
 * `collectStyles` and `splitRules` (goober's `extractCss` DRAINS, so a server
 * that renders forever inlined 2481 bytes on request one and 120 on request
 * two), and the dedupe set that stopped a rule built inside a component body
 * growing the inlined sheet by 120 bytes per request forever. None of it has
 * anywhere left to go wrong: the CSS is a build asset, and `<HeadContent />`
 * was already linking the client build's stylesheets.
 *
 * `clsx` and `cssVar` also moved, unchanged — they never touched goober, and
 * they belong beside the thing that produces the class names they join.
 *
 * What is left is four pure string functions over a token object. They are the
 * application's design system rather than the framework's, which is why they
 * did not move with the rest.
 */

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

export function defineVars(vars: Record<string, string>): string {
  return Object.entries(vars)
    .map(([key, value]) => `--${key}: ${value};`)
    .join(" ");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
