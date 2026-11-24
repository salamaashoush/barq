import { type Child, Show, cells } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { dynamic } from "@barqjs/web";
import { on } from "@barqjs/ui/conditions";
import type { UiProps } from "@barqjs/ui/props";
import { uiProps } from "@barqjs/ui/slot";
import { tokens } from "@barqjs/ui/theme/tokens";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import {
  fg,
  layout,
  radius,
  rounded,
  space,
  surface,
  tone as tones,
  truncate,
  type,
} from "../style/index.ts";

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;
export type HeadingSize = "xs" | "sm" | "md" | "lg" | "xl" | "2xl" | "3xl";
export type TextSize = "xs" | "sm" | "md" | "lg";
export type TextColor =
  | "default"
  | "muted"
  | "faint"
  | "link"
  | "inherit"
  | "danger"
  | "success"
  | "warning"
  | "info";
export type TextWeight = "normal" | "medium" | "strong";

const toned = (name: "success" | "warning" | "info") => arc(tones[name], fg.tone);

const colours = {
  default: { root: fg.default },
  muted: { root: fg.muted },
  faint: { root: fg.faint },
  link: { root: fg.link },
  inherit: { root: fg.inherit },
  danger: { root: arc(tones.danger, fg.tone) },
  success: { root: toned("success") },
  warning: { root: toned("warning") },
  info: { root: toned("info") },
};

/** What a text element takes besides its look. */
export interface TextElementProps {
  children?: Child;
  id?: string;
  title?: string;
  lang?: string;
  dir?: "ltr" | "rtl" | "auto";
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  "aria-hidden"?: boolean | "true" | "false";
  "data-testid"?: string;
}

/**
 * The attributes, each read where the element binds it: an element chosen at
 * run time takes its attributes one by one, as values.
 */
function passed(props: TextElementProps): Record<string, unknown> {
  return {
    id: props.id,
    title: props.title,
    lang: props.lang,
    dir: props.dir,
    "aria-label": props["aria-label"],
    "aria-labelledby": props["aria-labelledby"],
    "aria-describedby": props["aria-describedby"],
    "aria-hidden": props["aria-hidden"],
    "data-testid": props["data-testid"],
  };
}

const LEVEL_SIZE: Record<HeadingLevel, HeadingSize> = {
  1: "2xl",
  2: "xl",
  3: "lg",
  4: "md",
  5: "sm",
  6: "xs",
};

export const headingStyles = variants({
  slots: {
    root: arc(type.heading, { textWrap: "balance" }),
  },
  variants: {
    size: {
      xs: { root: arc(type.caption, { textTransform: "uppercase", letterSpacing: "0.04em" }) },
      sm: { root: type.sm },
      md: { root: arc(type.subheading, type.strong) },
      lg: {},
      xl: {
        root: arc({ fontSize: "var(--text-xl)", lineHeight: "var(--text-xl--line-height)" }),
      },
      "2xl": { root: type.title },
      "3xl": {
        root: arc(type.title, {
          [on.sm]: {
            fontSize: "var(--text-3xl)",
            lineHeight: "var(--text-3xl--line-height)",
          },
        }),
      },
    },
    color: colours,
    truncate: { true: { root: arc(truncate, layout.minZero) }, false: {} },
  },
  defaults: { size: "lg", color: "default", truncate: false },
});

type HeadingSlots = ReturnType<typeof headingStyles>;

export interface HeadingProps extends TextElementProps, Customisable<HeadingSlots> {
  /** The element, `<h1>` to `<h6>`, which is the outline a screen reader walks. @default 2 */
  level?: HeadingLevel;
  /** How large it is drawn, apart from where it sits in the outline. @default the level's own */
  size?: HeadingSize;
  /** @default "default" */
  color?: TextColor;
  /** One line, cut with an ellipsis. */
  truncate?: boolean;
}

/**
 * A heading whose place in the outline and whose size are two choices.
 *
 * ```tsx
 * <Heading level={2}>Billing</Heading>
 * <Heading level={3} size="sm" color="muted">Payment method</Heading>
 * ```
 *
 * `level` picks the element, so the outline stays right whatever the design
 * asks for, and `size` the look, which defaults to the level's own: 2xl for
 * an `<h1>` down to xs, small capitals, for an `<h6>`. `3xl` steps down to 2xl
 * on a phone.
 */
export function Heading(props: HeadingProps) {
  const level = (): HeadingLevel => props.level ?? 2;
  const Element = dynamic(() => `h${String(level())}` as "h2");
  const cls = (): HeadingSlots =>
    parts(
      headingStyles({
        size: props.size ?? LEVEL_SIZE[level()],
        color: props.color,
        truncate: props.truncate === true,
      }),
      props.classes,
    );
  return (
    <Element
      class={arc(cls().root, props.class, props.className)}
      data-slot="heading"
      data-size={props.size ?? LEVEL_SIZE[level()]}
      {...passed(props)}
    >
      {props.children}
    </Element>
  );
}

export const textStyles = variants({
  slots: { root: arc(layout.flush, { textWrap: "pretty" }) },
  variants: {
    size: {
      xs: { root: type.caption },
      sm: { root: type.sm },
      md: { root: type.subheading },
      lg: { root: arc(type.heading, type.sans) },
    },
    weight: {
      normal: { root: type.normal },
      medium: { root: type.medium },
      strong: { root: type.strong },
    },
    color: colours,
    lines: {
      none: {},
      1: { root: arc(truncate, layout.minZero) },
      2: { root: layout.clamp2 },
      3: { root: layout.clamp3 },
    },
    numeric: { true: { root: type.numeric }, false: {} },
    mono: { true: { root: type.mono }, false: {} },
  },
  defaults: {
    size: "sm",
    weight: "normal",
    color: "default",
    lines: "none",
    numeric: false,
    mono: false,
  },
});

type TextSlots = ReturnType<typeof textStyles>;

export type TextElement = "p" | "span" | "div" | "strong" | "em" | "small" | "label";

export interface TextProps extends TextElementProps, Customisable<TextSlots> {
  /** @default "p" */
  as?: TextElement;
  /** @default "sm" */
  size?: TextSize;
  /** @default "normal" */
  weight?: TextWeight;
  /** @default "default" */
  color?: TextColor;
  /** Cut after this many lines, with an ellipsis. */
  lines?: 1 | 2 | 3;
  /** Figures of one width, which line up and hold still while they change. */
  numeric?: boolean;
  mono?: boolean;
  /** For `as="label"`. */
  for?: string;
}

/**
 * Running text on arc's scale.
 *
 * ```tsx
 * <Text>Invoices are sent on the first of the month.</Text>
 * <Text as="span" size="xs" color="muted" numeric>12:04</Text>
 * <Text lines={2}>{comment.body}</Text>
 * ```
 *
 * A colour is a role, so a theme decides what muted is, and a tone colour
 * (`success`, `danger`, ...) is the tone's foreground, which reads on the page.
 */
export function Text(props: TextProps) {
  const Element = dynamic(() => props.as ?? "p");
  const cls = (): TextSlots =>
    parts(
      textStyles({
        size: props.size,
        weight: props.weight,
        color: props.color,
        lines: props.lines ?? "none",
        numeric: props.numeric === true,
        mono: props.mono === true,
      }),
      props.classes,
    );
  return (
    <Element
      class={arc(cls().root, props.class, props.className)}
      data-slot="text"
      for={props.for}
      {...passed(props)}
    >
      {props.children}
    </Element>
  );
}

export const codeStyles = variants({
  slots: {
    root: arc(type.mono, surface.sunken, rounded.sm, fg.default, {
      fontSize: "0.875em",
      paddingInline: space.x1,
      paddingBlock: "0.1em",
      overflowWrap: "anywhere",
    }),
  },
});

type CodeSlots = ReturnType<typeof codeStyles>;

export interface CodeProps extends Omit<UiProps, "class" | "className">, Customisable<CodeSlots> {}

/**
 * A piece of code inside a sentence: a name, a path, a command.
 *
 * ```tsx
 * <Text>Set <Code>API_TOKEN</Code> before you deploy.</Text>
 * ```
 *
 * A block of code to read and copy is `CodeBlock`, from `@barqjs/arc/code`.
 */
export function Code(props: CodeProps) {
  const cls = (): CodeSlots => parts(codeStyles(), props.classes);
  return <code {...uiProps("code", () => cls().root, cells(props))}>{props.children}</code>;
}

/** What `Prose` draws every block of long-form text in: its own corners and rules. */
const well = "var(--sunken, var(--muted))";

export const proseStyles = variants({
  slots: {
    root: arc(fg.default, {
      maxWidth: "70ch",
      overflowWrap: "break-word",
      "& > :first-child": { marginBlockStart: "0" },
      "& > :last-child": { marginBlockEnd: "0" },
      "& :where(p, ul, ol, blockquote, pre, table, figure, hr, dl)": {
        marginBlock: "0 1.25em",
      },
      "& :where(h1, h2, h3, h4, h5, h6)": {
        fontFamily: "var(--font-heading, var(--font-sans))",
        fontWeight: "var(--font-weight-semibold)",
        textWrap: "balance",
        marginBlock: "1.6em 0.6em",
        lineHeight: "1.3",
        scrollMarginBlockStart: space.x16,
      },
      "& h1": { fontSize: "2em", marginBlockStart: "0", letterSpacing: "var(--tracking-tight)" },
      "& h2": { fontSize: "1.5em" },
      "& h3": { fontSize: "1.25em" },
      "& :is(h4, h5, h6)": { fontSize: "1em" },
      "& a": {
        color: "var(--link)",
        textDecorationLine: "underline",
        textUnderlineOffset: "0.2em",
      },
      "& :is(strong, b)": { fontWeight: "var(--font-weight-semibold)" },
      "& :is(ul, ol)": { paddingInlineStart: "1.5em" },
      "& ul": { listStyleType: "disc" },
      "& ol": { listStyleType: "decimal" },
      "& li": { marginBlock: "0.3em" },
      "& li > :is(ul, ol)": { marginBlock: "0.3em 0" },
      "& li::marker": { color: tokens.mutedForeground },
      "& blockquote": {
        borderColor: tokens.border,
        borderStyle: "solid",
        borderWidth: "0",
        borderInlineStartWidth: "3px",
        paddingInlineStart: "1em",
        fontStyle: "italic",
        color: tokens.mutedForeground,
      },
      "& hr": {
        borderColor: tokens.border,
        borderStyle: "solid",
        borderWidth: "0",
        borderBlockStartWidth: "1px",
        marginBlock: "2em",
      },
      "& :is(code, kbd, samp)": { fontFamily: "var(--font-mono)", fontSize: "0.875em" },
      "& :not(pre) > code": {
        backgroundColor: well,
        borderRadius: radius.sm,
        paddingInline: "0.3em",
        paddingBlock: "0.1em",
      },
      "& pre": {
        backgroundColor: well,
        borderRadius: radius.md,
        padding: "1em",
        overflowX: "auto",
        direction: "ltr",
        textAlign: "start",
        lineHeight: "1.6",
      },
      "& pre code": { fontSize: "inherit" },
      "& table": {
        display: "block",
        maxWidth: "100%",
        overflowX: "auto",
        borderCollapse: "collapse",
        fontVariantNumeric: "tabular-nums",
      },
      "& :is(th, td)": {
        borderColor: tokens.border,
        borderStyle: "solid",
        borderWidth: "0",
        borderBlockEndWidth: "1px",
        paddingBlock: "0.5em",
        paddingInline: "0.75em",
        textAlign: "start",
      },
      "& th": { fontWeight: "var(--font-weight-semibold)" },
      "& :is(img, video)": { maxWidth: "100%", height: "auto", borderRadius: radius.md },
      "& figcaption": {
        marginBlockStart: "0.5em",
        fontSize: "0.875em",
        color: tokens.mutedForeground,
      },
      "& dt": { fontWeight: "var(--font-weight-semibold)" },
      "& dd": { marginInlineStart: "1.5em", marginBlockEnd: "0.5em" },
    }),
  },
  variants: {
    size: {
      sm: { root: type.sm },
      md: { root: arc({ fontSize: "var(--text-base)", lineHeight: "1.7" }) },
      lg: { root: arc({ fontSize: "var(--text-lg)", lineHeight: "1.75" }) },
    },
    width: { prose: {}, full: { root: arc({ maxWidth: "none" }) } },
  },
  defaults: { size: "md", width: "prose" },
});

type ProseSlots = ReturnType<typeof proseStyles>;

export interface ProseProps extends Omit<UiProps, "class" | "className">, Customisable<ProseSlots> {
  /** @default "md" */
  size?: "sm" | "md" | "lg";
  /** `prose` holds a line to a readable 70 characters; `full` takes the room it is given. @default "prose" */
  width?: "prose" | "full";
  /**
   * Markup to draw, already made safe: what a markdown renderer or a CMS
   * produced. Never a string a user typed, unsanitised.
   */
  html?: string;
}

/**
 * Long-form text styled from its own elements: headings, paragraphs, lists,
 * quotes, code, tables and figures, as markdown or a CMS writes them.
 *
 * ```tsx
 * <Prose html={rendered} />
 * <Prose size="sm"><h2>Terms</h2><p>…</p></Prose>
 * ```
 *
 * Every rule is logical, so a quote's rule and a list's indent sit at the
 * start of the line in either direction. A code block reads left to right
 * whatever the page does, and a wide table scrolls inside its own box.
 */
export function Prose(props: ProseProps) {
  const cls = (): ProseSlots =>
    parts(proseStyles({ size: props.size, width: props.width }), props.classes);
  return (
    <Show
      when={props.html !== undefined}
      fallback={<div {...uiProps("prose", () => cls().root, cells(props))}>{props.children}</div>}
    >
      <div
        {...uiProps("prose", () => cls().root, cells(props))}
        dangerouslySetInnerHTML={{ __html: props.html ?? "" }}
      />
    </Show>
  );
}
