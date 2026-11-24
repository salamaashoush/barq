import { Show, createUniqueId } from "@barqjs/core";

import { CopyButton } from "../components/copy-button.tsx";
import { arcLayer as arc } from "../layer.ts";
import type { CodeLanguage } from "./languages.ts";
import { codeVars } from "./options.ts";
import { StaticCode } from "./static-code.tsx";
import { codeSurface } from "./style.ts";

const figure = arc({
  position: "relative",
  display: "flex",
  flexDirection: "column",
  minWidth: "0px",
  margin: "0",
  overflow: "hidden",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "var(--border)",
  borderRadius: "var(--radius)",
  backgroundColor: "var(--sunken)",
});

const header = arc({
  display: "flex",
  alignItems: "center",
  gap: "calc(var(--spacing) * 2)",
  minHeight: "calc(var(--spacing) * 9)",
  paddingInlineStart: "var(--code-pad-x)",
  paddingInlineEnd: "calc(var(--spacing) * 1)",
  borderBottomWidth: "1px",
  borderBottomStyle: "solid",
  borderBottomColor: "var(--border)",
  fontFamily: "var(--font-sans)",
  fontSize: "var(--text-xs)",
  lineHeight: "var(--text-xs--line-height)",
  color: "var(--muted-foreground)",
});

const caption = arc({
  flex: "1 1 auto",
  minWidth: "0px",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const floating = arc({
  position: "absolute",
  insetBlockStart: "calc(var(--spacing) * 1)",
  insetInlineEnd: "calc(var(--spacing) * 1)",
  zIndex: "1",
});

const body = arc({
  ":focus-visible": {
    outlineWidth: "2px",
    outlineStyle: "solid",
    outlineColor: "var(--ring)",
    outlineOffset: "-2px",
  },
});

export interface HighlightProps {
  code: string;
  /** A registered name (`"typescript"`, `"json"`, ...) or a `LanguageSupport`. Plain text when left out. */
  language?: CodeLanguage;
  /** @default false */
  lineNumbers?: boolean;
  /** Wrap long lines instead of scrolling sideways. @default false */
  wrap?: boolean;
  class?: string;
}

/**
 * Code highlighted with no editor: a `<pre>` in arc's code colours.
 *
 * ```tsx
 * <Highlight code={snippet} language="tsx" />
 * ```
 *
 * It renders on a server: the language loads there, the markup is written
 * highlighted, and the browser adopts it without loading the language. A
 * page that renders it only in a browser shows the lines plain for the
 * moment the language takes to load.
 */
export function Highlight(props: HighlightProps) {
  return (
    <StaticCode
      code={props.code}
      language={props.language}
      lineNumbers={props.lineNumbers === true}
      wrap={props.wrap === true}
      class={props.class === undefined ? codeSurface : `${codeSurface} ${props.class}`}
    />
  );
}

export interface CodeBlockProps extends HighlightProps {
  /** Shown above the code, and names the figure. */
  filename?: string;
  /** Shown above the code when there is no filename. @default the language's name */
  label?: string;
  /** A button that copies the code. @default true */
  copyable?: boolean;
  /** Names the copy button. @default "Copy code" */
  copyLabel?: string;
  /** A CSS length, or pixels. Past it the code scrolls. */
  maxHeight?: string | number;
}

/**
 * A block of code to read and copy: the highlighted code, the file it comes
 * from or its language above it, and a button that copies it.
 *
 * ```tsx
 * <CodeBlock filename="vite.config.ts" language="typescript" code={config} lineNumbers />
 * ```
 *
 * The code is a Tab stop, so a keyboard scrolls what overflows, and line
 * numbers are drawn by CSS, so a copy of the text leaves them out.
 */
export function CodeBlock(props: CodeBlockProps) {
  const captionId = createUniqueId();
  const title = (): string | undefined =>
    props.filename ??
    props.label ??
    (typeof props.language === "string" ? props.language : undefined);
  const copyable = (): boolean => props.copyable !== false;

  return (
    <figure
      class={[codeSurface, figure, props.class]}
      data-slot="code-block"
      aria-labelledby={title() === undefined ? undefined : captionId}
      style={codeVars({ maxHeight: props.maxHeight })}
    >
      <Show
        when={title() !== undefined}
        fallback={
          <Show when={copyable()}>
            <span class={floating}>
              <CopyButton value={props.code} label={props.copyLabel ?? "Copy code"} />
            </span>
          </Show>
        }
      >
        <figcaption class={header} data-slot="code-block-header">
          <span id={captionId} class={caption} data-slot="code-block-title">
            {title()}
          </span>
          <Show when={copyable()}>
            <CopyButton value={props.code} label={props.copyLabel ?? "Copy code"} />
          </Show>
        </figcaption>
      </Show>
      <StaticCode
        code={props.code}
        language={props.language}
        lineNumbers={props.lineNumbers === true}
        wrap={props.wrap === true}
        class={body}
        tabIndex={0}
      />
    </figure>
  );
}
