/**
 * The semantic tokens, by the names shadcn/ui gives them.
 *
 * Plain `--background`, not a hashed group from `defineVars`. That is the whole
 * reason this file is hand-written: a theme copied out of tweakcn, or a
 * `:root { --primary: … }` an application already has, has to land on these
 * components without being rewritten. Hashing the names would make the package
 * a closed system.
 *
 * The strings are `var()` references for TypeScript to read. CSS written in a
 * `css` block says `var(--primary)` directly; this is for the values that cross
 * a module boundary as data — a chart's colour ramp, an inline `style`.
 */

export const tokens = {
  background: "var(--background)",
  foreground: "var(--foreground)",
  card: "var(--card)",
  cardForeground: "var(--card-foreground)",
  popover: "var(--popover)",
  popoverForeground: "var(--popover-foreground)",
  primary: "var(--primary)",
  primaryForeground: "var(--primary-foreground)",
  secondary: "var(--secondary)",
  secondaryForeground: "var(--secondary-foreground)",
  muted: "var(--muted)",
  mutedForeground: "var(--muted-foreground)",
  accent: "var(--accent)",
  accentForeground: "var(--accent-foreground)",
  destructive: "var(--destructive)",
  border: "var(--border)",
  input: "var(--input)",
  ring: "var(--ring)",
  chart1: "var(--chart-1)",
  chart2: "var(--chart-2)",
  chart3: "var(--chart-3)",
  chart4: "var(--chart-4)",
  chart5: "var(--chart-5)",
  sidebar: "var(--sidebar)",
  sidebarForeground: "var(--sidebar-foreground)",
  sidebarPrimary: "var(--sidebar-primary)",
  sidebarPrimaryForeground: "var(--sidebar-primary-foreground)",
  sidebarAccent: "var(--sidebar-accent)",
  sidebarAccentForeground: "var(--sidebar-accent-foreground)",
  sidebarBorder: "var(--sidebar-border)",
  sidebarRing: "var(--sidebar-ring)",
  radius: "var(--radius)",
} as const;

export type TokenName = keyof typeof tokens;

/** The five-step ramp a chart cycles through, in order. */
export const chart = [
  tokens.chart1,
  tokens.chart2,
  tokens.chart3,
  tokens.chart4,
  tokens.chart5,
] as const;
