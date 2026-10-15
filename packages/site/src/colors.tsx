import { For, createSignal, type Incoming } from "@barqjs/core";
import { css } from "@barqjs/css";
import { Check } from "@barqjs/lucide/icons/check";
import { Clipboard } from "@barqjs/lucide/icons/clipboard";
import { BASE_THEMES, tokens, type ThemeDefinition } from "@barqjs/ui";

import { Page } from "./site.tsx";

/**
 * `/colors`, in upstream's own arrangement.
 *
 * A family per section: a header row carrying the name, then a row of swatches
 * that is a COLUMN below `sm` and a row above it — `flex flex-col gap-4 py-4
 * sm:flex-row sm:gap-2`, each swatch `aspect-[3/1] w-full flex-1` stacked and
 * `sm:aspect-[2/3]` beside its neighbours. A click copies.
 *
 * The families are this package's own base themes rather than Tailwind's ramps,
 * because that is what a consumer of this package actually picks between, and
 * the steps are the semantic tokens rather than 50 through 950.
 */
const section = css`
  display: grid;
`;

/** `flex items-center px-4`. */
const head = css`
  display: flex;
  align-items: center;
  padding-inline: calc(var(--spacing) * 4);
`;

/** `flex-1 pl-1 text-sm font-medium`. */
const name = css`
  flex: 1;
  padding-left: calc(var(--spacing) * 1);
  font-size: 0.875rem;
  font-weight: 500;

  & h2 {
    margin: 0;
    font-size: inherit;
    font-weight: inherit;
    text-transform: capitalize;
  }
`;

const count = css`
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--muted-foreground);
`;

/** `flex flex-col gap-4 py-4 sm:flex-row sm:gap-2`. */
const row = css`
  display: flex;
  flex-direction: column;
  gap: calc(var(--spacing) * 4);
  padding-block: calc(var(--spacing) * 4);

  @media (width >= 40rem) {
    flex-direction: row;
    gap: calc(var(--spacing) * 2);
  }
`;

/**
 * `group relative flex aspect-[3/1] w-full flex-1 cursor-pointer flex-col
 * gap-2 sm:aspect-[2/3] sm:h-auto sm:w-auto`.
 *
 * A wide bar when the family is a column and a tall column when it is a row,
 * which is the whole of how the page reflows: nothing changes but the aspect,
 * so a swatch is the same element at every width.
 */
const swatch = css`
  position: relative;
  display: flex;
  aspect-ratio: 3 / 1;
  width: 100%;
  flex: 1;
  cursor: pointer;
  flex-direction: column;
  gap: calc(var(--spacing) * 2);
  border: 0;
  padding: 0;
  background: none;
  font: inherit;
  color: inherit;
  text-align: left;

  @media (width >= 40rem) {
    aspect-ratio: 2 / 3;
    height: auto;
    width: auto;
  }

  & svg {
    position: absolute;
    top: calc(var(--spacing) * 4);
    right: calc(var(--spacing) * 4);
    z-index: 10;
    height: 0.875rem;
    width: 0.875rem;
    opacity: 0;
    transition: opacity 150ms;
    color: var(--swatch-ink);
  }

  &:hover svg,
  &:focus-visible svg {
    opacity: 1;
  }

  &:focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: 2px;
  }
`;

/** `border-ghost w-full flex-1 rounded-lg` — the painted part. */
const chip = css`
  width: 100%;
  flex: 1;
  border-radius: calc(var(--radius) - 2px);
  background-color: var(--swatch);
  box-shadow: inset 0 0 0 1px oklch(0 0 0 / 0.08);
`;

const caption = css`
  display: grid;
  gap: calc(var(--spacing) * 0.5);
  padding-inline: calc(var(--spacing) * 1);
`;

const captionName = css`
  font-size: 0.75rem;
  font-weight: 500;
`;

const captionValue = css`
  font-size: 0.6875rem;
  font-family: var(--font-mono);
  color: var(--muted-foreground);
  overflow-wrap: anywhere;
`;

/** `--card-foreground` from `cardForeground`, which is the name in the CSS. */
function propertyOf(token: string): string {
  return `--${token.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase()}`;
}

/**
 * The token's value on THIS page, resolved rather than read out of the theme.
 *
 * A theme is a pair of rule sets and the document has one of them installed, so
 * asking the DOM is the only answer that accounts for the base, the accent over
 * it and the mode. Reading the data instead would print the light value on a
 * dark page and be wrong every time.
 */
function resolved(property: string): string {
  if (typeof document === "undefined") return "";
  return getComputedStyle(document.documentElement).getPropertyValue(property).trim();
}

const TOKENS = Object.keys(tokens).filter((token) => token !== "radius");

function Swatch(props: Incoming<{ token: string; value: string; ink: string }>) {
  const [copied, setCopied] = createSignal(false);
  const property = (): string => propertyOf(props.token());

  return (
    <button
      type="button"
      class={swatch}
      style={() => ({ "--swatch": props.value(), "--swatch-ink": props.ink() })}
      aria-label={() => `Copy ${property()}`}
      onClick={() => {
        void navigator.clipboard?.writeText(property());
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
    >
      {() => (copied() ? <Check /> : <Clipboard />)}
      <div class={chip} />
      <span class={caption}>
        <span class={captionName}>{property}</span>
        <span class={captionValue}>{() => resolved(property())}</span>
      </span>
    </button>
  );
}

/**
 * A family's swatches, painted from the theme DATA rather than the page.
 *
 * The page wears one theme, so every family but that one has to come from the
 * definition — otherwise all eight sections would print the same colours and
 * the page would say nothing.
 */
function Family(props: Incoming<{ theme: ThemeDefinition }>) {
  const shown = (): readonly string[] =>
    TOKENS.filter((token) => props.theme().light[propertyOf(token).slice(2)] !== undefined);

  return (
    <div class={section}>
      <div class={head}>
        <div class={name}>
          <h2>{() => props.theme().title}</h2>
        </div>
        <span class={count}>{() => `${String(shown().length)} tokens`}</span>
      </div>
      <div class={row}>
        <For each={shown}>
          {(token: string) => (
            <Swatch
              token={token}
              value={props.theme().light[propertyOf(token).slice(2)] ?? "transparent"}
              ink={props.theme().light["foreground"] ?? "currentColor"}
            />
          )}
        </For>
      </div>
    </div>
  );
}

export function Colors() {
  return (
    <Page
      title="Every token, in every base"
      lede="The semantic tokens this package reads, and what each base color resolves them to. Click a swatch to copy its custom property."
    >
      <For each={() => BASE_THEMES}>{(theme: ThemeDefinition) => <Family theme={theme} />}</For>
    </Page>
  );
}
