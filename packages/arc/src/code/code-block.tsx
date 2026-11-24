import { Show, createUniqueId } from "@barqjs/core";
import { variants } from "@barqjs/css";

import { CopyButton } from "../components/copy-button.tsx";
import { arcLayer as arc } from "../layer.ts";
import { useArcMessages } from "../components/messages.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { bg, edge, focus, gap, layout, rounded, space, truncate, type } from "../style/index.ts";
import type { CodeLanguage } from "./languages.ts";
import { codeVars } from "./options.ts";
import { StaticCode } from "./static-code.tsx";
import { codeSurface } from "./style.ts";

export const codeBlockStyles = variants({
  slots: {
    root: arc(
      layout.relative,
      layout.column,
      layout.minZero,
      layout.flush,
      edge.all,
      rounded.md,
      bg.sunken,
      {
        overflow: "hidden",
      },
    ),
    header: arc(layout.row, gap[2], edge.bottom, type.sans, type.meta, {
      minHeight: space.x9,
      paddingInlineStart: "var(--code-pad-x)",
      paddingInlineEnd: space.x1,
    }),
    title: arc(layout.growAuto, layout.minZero, truncate),
    copy: arc({
      position: "absolute",
      insetBlockStart: space.x1,
      insetInlineEnd: space.x1,
      zIndex: "1",
    }),
    body: arc(focus.outline),
  },
});

type Slots = ReturnType<typeof codeBlockStyles>;

export interface HighlightProps {
  code: string;
  /** A registered name (`"typescript"`, `"json"`, ...) or a `LanguageSupport`. Plain text when left out. */
  language?: CodeLanguage;
  /** @default false */
  lineNumbers?: boolean;
  /** Wrap long lines instead of scrolling sideways. @default false */
  wrap?: boolean;
  class?: string;
  className?: string;
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
      class={arc(codeSurface, props.class, props.className)}
    />
  );
}

export interface CodeBlockProps extends HighlightProps, Customisable<Slots> {
  /** Shown above the code, and names the figure. */
  filename?: string;
  /** Shown above the code when there is no filename. @default the language's name */
  label?: string;
  /** A button that copies the code. @default true */
  copyable?: boolean;
  /** Names the copy button. @default the provider's `copyCode`, "Copy code" */
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
  const messages = useArcMessages();
  const cls = (): Slots => parts(codeBlockStyles(), props.classes);

  return (
    <figure
      class={arc(codeSurface, cls().root, props.class, props.className)}
      data-slot="code-block"
      aria-labelledby={title() === undefined ? undefined : captionId}
      style={codeVars({ maxHeight: props.maxHeight })}
    >
      <Show
        when={title() !== undefined}
        fallback={
          <Show when={copyable()}>
            <span class={cls().copy} data-slot="code-block-copy">
              <CopyButton value={props.code} label={props.copyLabel ?? messages().copyCode} />
            </span>
          </Show>
        }
      >
        <figcaption class={cls().header} data-slot="code-block-header">
          <span id={captionId} class={cls().title} data-slot="code-block-title">
            {title()}
          </span>
          <Show when={copyable()}>
            <CopyButton value={props.code} label={props.copyLabel ?? messages().copyCode} />
          </Show>
        </figcaption>
      </Show>
      <StaticCode
        code={props.code}
        language={props.language}
        lineNumbers={props.lineNumbers === true}
        wrap={props.wrap === true}
        class={cls().body}
        tabIndex={0}
      />
    </figure>
  );
}
