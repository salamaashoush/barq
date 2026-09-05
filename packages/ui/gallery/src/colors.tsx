import { For, signal, type Incoming } from "@barqjs/core";
import { css } from "@barqjs/css";
import { BASE_THEMES, tokens, type ThemeDefinition } from "@barqjs/ui";

import { Page } from "./site.tsx";

const section = css`
  display: grid;
  gap: 0.75rem;
`;

const heading = css`
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--muted-foreground);
  margin: 0;
`;

const swatches = css`
  display: grid;
  gap: 0.75rem;
  grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr));
`;

const swatch = css`
  display: grid;
  gap: 0.5rem;
  cursor: pointer;
  border: 0;
  padding: 0;
  background: none;
  text-align: left;
  font: inherit;
  color: inherit;
`;

const chip = css`
  height: 4rem;
  border-radius: calc(var(--radius) + 2px);
  border: 1px solid var(--border);
`;

const name = css`
  font-size: 0.8125rem;
  font-weight: 500;
`;

const value = css`
  font-size: 0.75rem;
  font-family: var(--font-mono);
  color: var(--muted-foreground);
  overflow-wrap: anywhere;
`;

const ramp = css`
  display: flex;
  border-radius: calc(var(--radius) + 2px);
  overflow: hidden;
  border: 1px solid var(--border);
`;

const step = css`
  height: 3rem;
  flex: 1;
`;

const rampRow = css`
  display: grid;
  gap: 0.5rem;
  grid-template-columns: 8rem 1fr;
  align-items: center;
`;

const rampName = css`
  font-size: 0.8125rem;
  font-weight: 500;
`;

/** `--card-foreground` from `cardForeground`, which is the name in the CSS. */
function propertyOf(token: string): string {
  return `--${token.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase()}`;
}

/**
 * The tokens, resolved against the page rather than read out of the theme data.
 *
 * A theme is a pair of rule sets and the page has one of them installed, so
 * asking the DOM is the only answer that accounts for the base, the accent
 * over it and the mode. Reading `BASE_THEMES` instead would print the light
 * value on a dark page and be wrong every time.
 */
function resolved(property: string): string {
  if (typeof document === "undefined") return "";
  return getComputedStyle(document.documentElement).getPropertyValue(property).trim();
}

function Swatch(props: Incoming<{ token: string }>) {
  const property = propertyOf(props.token());
  const shown = signal("");

  return (
    <button
      type="button"
      class={swatch}
      onClick={() => {
        void navigator.clipboard?.writeText(property);
        shown.set("copied");
        setTimeout(() => shown.set(""), 1200);
      }}
    >
      <div class={chip} style={{ background: `var(${property})` }} />
      <span class={name}>{property}</span>
      <span class={value}>{() => (shown() === "" ? resolved(property) : "copied")}</span>
    </button>
  );
}

export function Colors() {
  const names = Object.keys(tokens).filter((token) => token !== "radius");

  return (
    <Page
      title="Colors"
      lede="Every token this package reads, resolved against the theme the page is wearing."
    >
      <div class={section}>
        <h2 class={heading}>Tokens</h2>
        <div class={swatches}>
          <For each={() => names}>{(token: string) => <Swatch token={token} />}</For>
        </div>
      </div>

      <div class={section}>
        <h2 class={heading}>Base colors</h2>
        <For each={() => BASE_THEMES}>
          {(theme: ThemeDefinition) => (
            <div class={rampRow}>
              <span class={rampName}>{theme.title}</span>
              <div class={ramp}>
                <For each={() => ["chart-1", "chart-2", "chart-3", "chart-4", "chart-5"]}>
                  {(key: string) => (
                    <div class={step} style={{ background: theme.light[key] ?? "transparent" }} />
                  )}
                </For>
              </div>
            </div>
          )}
        </For>
      </div>
    </Page>
  );
}
