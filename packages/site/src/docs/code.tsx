/**
 * The two code surfaces a documentation page has that are not a preview card.
 *
 * `<CodeBlock>` is upstream's `[data-rehype-pretty-code-figure]`: the `--code`
 * surface at `rounded-2xl`, a copy button top right, and no syntax colouring —
 * theirs comes from `rehype-pretty-code` at build time over a Shiki grammar,
 * and a highlighter in the client bundle to colour eight lines of `npx shadcn
 * add` is a worse trade than plain text.
 *
 * `<CommandTabs>` is their `<CodeTabs>` over the four package managers.
 */

import { For, signal, type Incoming } from "@barqjs/core";
import { css } from "@barqjs/css";
import { Check } from "@barqjs/lucide/icons/check";
import { Copy } from "@barqjs/lucide/icons/copy";
import { Button } from "@barqjs/ui";

const figure = css`
  --code: oklch(0.98 0 0);
  --code-foreground: var(--foreground);

  :is(.dark) & {
    --code: oklch(0.2 0 0);
    --code-foreground: oklch(0.708 0 0);
  }

  position: relative;
  margin-block-start: calc(var(--spacing) * 6);
  overflow: hidden;
  border-radius: var(--radius-2xl);
  background-color: var(--code);
  color: var(--code-foreground);
`;

const body = css`
  margin: 0;
  overflow-x: auto;
  padding: calc(var(--spacing) * 4);
  font-family: var(--font-mono);
  /* 14px on a 1.75 leading, measured off their card page: the panel was a
     size smaller and a third tighter, which is the loudest thing on a docs
     page that is mostly code. */
  font-size: 0.875rem;
  line-height: 1.75;
  tab-size: 2;
  white-space: pre;
  background-color: transparent;
`;

const copy = css`
  position: absolute;
  top: calc(var(--spacing) * 3);
  right: calc(var(--spacing) * 2);
  z-index: 10;
  background-color: var(--code);
`;

/** `[data-rehype-pretty-code-title]`, when the block names a file. */
const title = css`
  border-bottom: 1px solid color-mix(in oklab, var(--border) 30%, transparent);
  padding-block: calc(var(--spacing) * 2.5);
  padding-inline: calc(var(--spacing) * 4);
  font-size: 0.875rem;
  font-family: var(--font-mono);
  color: var(--code-foreground);
`;

function useCopy(): { copied: () => boolean; onCopy: (value: string) => void } {
  const copied = signal(false);
  return {
    copied,
    onCopy: (value: string) => {
      void navigator.clipboard?.writeText(value).then(() => {
        copied.set(true);
        setTimeout(() => copied.set(false), 2000);
      });
    },
  };
}

export function CodeBlock(props: Incoming<{ code: string; title?: string }>) {
  const { copied, onCopy } = useCopy();
  return (
    <figure class={figure} data-not-typeset>
      {props.title === undefined ? null : <div class={title}>{props.title}</div>}
      <Button
        class={copy}
        size="icon"
        variant="ghost"
        aria-label="Copy the code"
        onClick={() => onCopy(props.code())}
      >
        {() => (copied() ? <Check /> : <Copy />)}
      </Button>
      <pre class={body}>
        <code>{() => props.code()}</code>
      </pre>
    </figure>
  );
}

const tabs = css`
  display: flex;
  align-items: center;
  gap: calc(var(--spacing) * 1);
  border-bottom: 1px solid color-mix(in oklab, var(--border) 30%, transparent);
  padding-inline: calc(var(--spacing) * 2);
`;

const tab = css`
  appearance: none;
  border: 0;
  background: transparent;
  padding: calc(var(--spacing) * 2.5) calc(var(--spacing) * 2);
  font-family: var(--font-mono);
  font-size: 0.875rem;
  color: var(--muted-foreground);
  cursor: pointer;
  border-bottom: 1px solid transparent;

  &[aria-selected="true"] {
    color: var(--foreground);
    border-bottom-color: var(--foreground);
  }
`;

const MANAGERS = [
  { id: "pnpm", run: "pnpm dlx" },
  { id: "npm", run: "npx" },
  { id: "yarn", run: "yarn dlx" },
  { id: "bun", run: "bunx --bun" },
] as const;

/**
 * `npx shadcn@latest add <name>` across the four, which is what upstream's
 * install block shows first. Ours is `barq-ui`, since that is the CLI that
 * writes these components into a project.
 */
export function CommandTabs(props: Incoming<{ command: string }>) {
  const picked = signal<string>("pnpm");
  const line = (): string => {
    const manager = MANAGERS.find((entry) => entry.id === picked()) ?? MANAGERS[0];
    return `${manager.run} ${props.command()}`;
  };
  const { copied, onCopy } = useCopy();

  return (
    <figure class={figure} data-not-typeset>
      <div class={tabs} role="tablist" aria-label="Package manager">
        <For each={() => MANAGERS}>
          {(manager: (typeof MANAGERS)[number]) => (
            <button
              type="button"
              role="tab"
              class={tab}
              aria-selected={() => picked() === manager.id}
              onClick={() => picked.set(manager.id)}
            >
              {manager.id}
            </button>
          )}
        </For>
      </div>
      <Button
        class={copy}
        size="icon"
        variant="ghost"
        aria-label="Copy the command"
        onClick={() => onCopy(line())}
      >
        {() => (copied() ? <Check /> : <Copy />)}
      </Button>
      <pre class={body}>
        <code>{line}</code>
      </pre>
    </figure>
  );
}
