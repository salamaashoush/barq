/**
 * `<ComponentPreview />`, which is upstream's
 * (`apps/v4/components/component-preview-tabs.tsx`).
 *
 * A card holding the example above its source: `group relative mt-4 mb-12 flex
 * flex-col overflow-hidden rounded-2xl border` around a `preview relative flex
 * h-72 w-full justify-center p-10` and a code panel under a `border-t`. The
 * 288px height is `h-72` and it is fixed on purpose — a page of examples whose
 * cards each take their content's height reads as a ragged column, and theirs
 * does not.
 *
 * `data-not-typeset` on the card, which is the thing that is easy to miss: the
 * card sits inside `.typeset`, and without the opt-out every element in it
 * takes a paragraph's `margin-block-start` and the example lands 20px below
 * where upstream puts it.
 */

import { signal, type Child, type Incoming } from "@barqjs/core";
import { css } from "@barqjs/css";
import { Check } from "@barqjs/lucide/icons/check";
import { Copy } from "@barqjs/lucide/icons/copy";
import { Button } from "@barqjs/ui";

/**
 * `--code` is upstream's, and it is not in the generated theme.
 *
 * `theme.ts` comes from `tools/emit-theme.ts`, which emits the registry's
 * tokens — and `--code` is the SITE's, not the registry's: no consumer of
 * `@barqjs/ui` gets a code surface because no component reads one. So it is
 * declared here, on the page that has code on it, at upstream's own values
 * (`--surface`, `oklch(0.98 0 0)` and `oklch(0.2 0 0)`).
 */
const codeSurface = css`
  --code: oklch(0.98 0 0);
  --code-foreground: var(--foreground);

  :is(.dark) & {
    --code: oklch(0.2 0 0);
    --code-foreground: oklch(0.708 0 0);
  }
`;

/** `group relative mt-4 mb-12 flex flex-col overflow-hidden rounded-2xl border`. */
const card = css`
  position: relative;
  margin-block: calc(var(--spacing) * 4) calc(var(--spacing) * 12);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: var(--radius-2xl);
  border: 1px solid var(--border);
`;

/**
 * `preview relative flex h-72 w-full justify-center p-10`, with `align`
 * deciding the cross axis: `center` is `items-center`, `start` is
 * `items-start`. A form with six fields in it does not fit 288px centred, and
 * upstream's own examples pass `align="start"` for exactly those.
 */
const preview = css`
  position: relative;
  display: flex;
  height: calc(var(--spacing) * 72);
  width: 100%;
  justify-content: center;
  padding: calc(var(--spacing) * 10);

  &[data-align="center"] {
    align-items: center;
  }
  &[data-align="start"] {
    align-items: flex-start;
  }
  &[data-align="end"] {
    align-items: flex-end;
  }
  /* NO overflow, which upstream's has none of either. A scroller here clips
     every tooltip, popover and menu a demo opens — they are positioned in
     viewport coordinates and land outside this box — and puts two scrollbars
     on a card that is meant to be a picture of a component. A demo too tall
     for 288px says size="auto" instead. */

  /* A demo that cannot be measured at 288px says so and takes its own height. */
  &[data-size="auto"] {
    height: auto;
    min-height: calc(var(--spacing) * 72);
  }
`;

const codePanel = css`
  position: relative;
  overflow: hidden;
  border-top: 1px solid var(--border);
  background-color: var(--code);
  color: var(--code-foreground);
  font-size: 0.875rem;
`;

const pre = css`
  margin: 0;
  max-height: calc(var(--spacing) * 72);
  overflow: auto;
  padding: calc(var(--spacing) * 4);
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  line-height: 1.6;
  tab-size: 2;
  white-space: pre;
`;

/**
 * `[&_pre]:max-h-72` collapsed to three lines with a gradient over it and a
 * `View Code` button in the middle, which is what upstream shows first.
 */
const collapsed = css`
  max-height: calc(var(--spacing) * 24);
  overflow: hidden;
`;

const veil = css`
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding-bottom: calc(var(--spacing) * 4);
  background: linear-gradient(
    to top,
    var(--code),
    color-mix(in oklab, var(--code) 60%, transparent),
    transparent
  );
`;

const copy = css`
  position: absolute;
  top: calc(var(--spacing) * 3);
  right: calc(var(--spacing) * 2);
  z-index: 10;
  background-color: var(--code);
`;

export interface PreviewProps {
  /** The example itself. */
  children?: Child;
  /** The source shown under it. Omitted, the card is the example alone. */
  code?: string;
  align?: "center" | "start" | "end";
  /** `auto` for a demo that will not fit 288px — a sidebar, a long form. */
  size?: "fixed" | "auto";
}

export function ComponentPreview(props: Incoming<PreviewProps>) {
  const open = signal(false);
  const copied = signal(false);

  const onCopy = (): void => {
    const source = props.code?.() ?? "";
    if (source === "") return;
    void navigator.clipboard?.writeText(source).then(() => {
      copied.set(true);
      setTimeout(() => copied.set(false), 2000);
    });
  };

  return (
    <div class={`${card} ${codeSurface}`} data-slot="component-preview" data-not-typeset>
      <div
        class={preview}
        data-slot="preview"
        data-align={() => props.align?.() ?? "center"}
        data-size={() => props.size?.() ?? "fixed"}
      >
        {props.children}
      </div>
      {props.code === undefined ? null : (
        <div class={codePanel} data-slot="code">
          <Button
            class={copy}
            size="icon"
            variant="ghost"
            aria-label="Copy the code"
            onClick={onCopy}
          >
            {() => (copied() ? <Check /> : <Copy />)}
          </Button>
          <pre class={() => `${pre} ${open() ? "" : collapsed}`}>
            <code>{() => props.code?.() ?? ""}</code>
          </pre>
          {() =>
            open() ? null : (
              <div class={veil}>
                <Button size="sm" variant="outline" onClick={() => open.set(true)}>
                  View Code
                </Button>
              </div>
            )
          }
        </div>
      )}
    </div>
  );
}
