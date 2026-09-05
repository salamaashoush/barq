import { css } from "@barqjs/css";
import { ArrowRight } from "@barqjs/lucide/icons/arrow-right";
import { Link } from "@barqjs/router";
import { Badge, Button } from "@barqjs/ui";

import { Showcase } from "./showcase.tsx";
import { wearStyleOn } from "./params.ts";
import { container, wrapper } from "./site.tsx";

/**
 * The front page, which is app/(app)/(root)/page.tsx and its PageHeader.
 *
 * Every number here is measured off that page rather than chosen: a centred
 * column at container flex flex-col items-center gap-2 px-6 py-8 text-center
 * md:py-16 lg:py-20 xl:gap-4, with the page's own md:pb-8 lg:pb-12 on top of
 * it. The words are ours; the layout is theirs, and the whole point of the
 * exercise is that the second sentence stays true.
 */
const header = css`
  border-color: var(--border);

  @supports (color: color-mix(in lab, red, red)) {
    border-color: color-mix(in oklab, var(--border) 50%, transparent);
  }
`;

const headerInner = css`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: calc(var(--spacing) * 2);
  padding-inline: calc(var(--spacing) * 6);
  padding-block: calc(var(--spacing) * 8);
  text-align: center;

  @media (width >= 48rem) {
    padding-block: calc(var(--spacing) * 16) calc(var(--spacing) * 8);
  }

  @media (width >= 64rem) {
    padding-block: calc(var(--spacing) * 20) calc(var(--spacing) * 12);
  }

  @media (width >= 80rem) {
    gap: calc(var(--spacing) * 4);
  }
`;

/**
 * leading-tighter max-w-4xl text-3xl font-semibold tracking-tight text-balance
 * text-primary lg:leading-[1.1] xl:text-5xl xl:tracking-tighter.
 *
 * text-3xl carries its own line-height: 2.25rem, which is why the ratio
 * only shows above lg: 30px over 36px is the size's default, and 1.1 takes
 * over at 1024 and again at the 48px the heading grows to at 1280.
 */
const heading = css`
  margin: 0;
  max-width: 56rem;
  font-size: 1.875rem;
  line-height: 2.25rem;
  font-weight: 600;
  letter-spacing: -0.025em;
  text-wrap: balance;
  color: var(--primary);

  @media (width >= 64rem) {
    line-height: 1.1;
  }

  @media (width >= 80rem) {
    font-size: 3rem;
    letter-spacing: -0.05em;
  }
`;

/** max-w-4xl text-base text-balance text-foreground sm:text-lg. */
const description = css`
  margin: 0;
  max-width: 56rem;
  font-size: 1rem;
  line-height: 1.5rem;
  text-wrap: balance;
  color: var(--foreground);

  @media (width >= 40rem) {
    font-size: 1.125rem;
    line-height: 1.75rem;
  }
`;

/** flex w-full items-center justify-center gap-2 pt-2. */
const actions = css`
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: center;
  gap: calc(var(--spacing) * 2);
  padding-top: calc(var(--spacing) * 2);

  /* **:data-[slot=button]:shadow-none — the hero's buttons sit on a flat
     surface, so the elevation every other button carries reads as a mistake. */
  & [data-slot="button"] {
    box-shadow: none;
  }
`;

const plain = css`
  text-decoration: none;
  color: inherit;
`;

/**
 * The panel under the hero: CardsDemo.
 *
 * bg-muted p-12 pb-0! [--gap:--spacing(8)] lg:p-6 lg:[--gap:--spacing(6)],
 * with the two gradients that fade the cards into the page at both ends. The
 * cards are behind them and keep going, which is what makes the page read as a
 * window onto a much larger application rather than a list that stops.
 *
 * container-name: preview because the cards inside size themselves against
 * their container rather than the window — they are the same components the
 * designer's preview renders, and a card that reflows with the viewport would
 * lay out differently in the two places that show it.
 */
const demo = css`
  --gap: calc(var(--spacing) * 8);

  position: relative;
  display: flex;
  width: 100%;
  max-width: none;
  flex-direction: column;
  gap: var(--gap);
  overflow: hidden;
  background-color: var(--muted);
  padding: calc(var(--spacing) * 12) calc(var(--spacing) * 12) 0;

  container-type: inline-size;
  container-name: preview;

  @media (width >= 64rem) {
    --gap: calc(var(--spacing) * 6);
    padding: calc(var(--spacing) * 6) calc(var(--spacing) * 6) 0;
  }
`;

const cards = css`
  position: relative;
  z-index: 10;
  margin-inline: auto;
  width: 100%;
`;

/** absolute inset-x-0 top-0 z-1 h-120 bg-linear-to-b from-background via-muted to-transparent. */
const fadeTop = css`
  position: absolute;
  inset-inline: 0;
  top: 0;
  z-index: 1;
  height: 30rem;
  background-image: linear-gradient(to bottom, var(--background), var(--muted), transparent);

  .dark & {
    display: none;
  }
`;

/** absolute inset-x-0 bottom-0 z-20 h-48 bg-linear-to-t … lg:h-80 xl:h-64. */
const fadeBottom = css`
  position: absolute;
  inset-inline: 0;
  bottom: 0;
  z-index: 20;
  height: 12rem;
  background-image: linear-gradient(to top, var(--background), var(--muted), transparent);

  @media (width >= 64rem) {
    height: 20rem;
  }

  @media (width >= 80rem) {
    height: 16rem;
  }
`;

/** container-wrapper flex-1 p-0 over container overflow-hidden md:px-0 lg:max-w-none. */
const belowFold = css`
  flex: 1;
  padding: 0;
`;

const belowFoldInner = css`
  overflow: hidden;

  @media (width >= 48rem) {
    padding-inline: 0;
  }

  @media (width >= 64rem) {
    max-width: none;
  }
`;

const hideBelowMd = css`
  display: none;

  @media (width >= 48rem) {
    display: block;
  }
`;

/**
 * The panel wears style `rhea`, because upstream's does.
 *
 * Their cards import from `@/styles/base-rhea/ui/*` while the chrome around
 * them imports the plain registry, so the front page is the one place their
 * site shows a style at all — a 24px card corner against the registry's 14px,
 * which is exactly the difference a reader is meant to notice.
 *
 * Scoped to the panel rather than the document for the same reason the
 * designer scopes its own: a style on `<html>` restyles the chrome that is
 * supposed to stay fixed.
 */
function wearDemoStyle(element: HTMLElement | null): void {
  wearStyleOn(element, "rhea", () => true);
}

export function Home() {
  return (
    <div
      class={css`
        display: flex;
        flex: 1;
        flex-direction: column;
      `}
    >
      <section class={header}>
        <div class={wrapper}>
          <div class={`${container} ${headerInner}`}>
            <Link to="/docs/components" class={plain}>
              <Badge variant="secondary">
                Every component, transcribed from upstream <ArrowRight size={12} />
              </Badge>
            </Link>
            <h1 class={heading}>Components you can own, compiled away</h1>
            <p class={description}>
              Composable, accessible components with thoughtful defaults, built on a compiler that
              folds the reactivity and the styles away. Customize, extend, and make them your own.
            </p>
            <div class={actions}>
              <Link to="/docs/components" class={plain}>
                <Button>Get Started</Button>
              </Link>
              <Link to="/create" class={plain}>
                <Button variant="secondary">Open the Designer</Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <div class={`${wrapper} ${belowFold}`}>
        <div class={`${container} ${belowFoldInner}`}>
          <section class={hideBelowMd}>
            <div class={demo} data-slot="demo" ref={wearDemoStyle}>
              <div class={cards}>
                <Showcase />
              </div>
              <div class={fadeTop} aria-hidden="true" />
              <div class={fadeBottom} aria-hidden="true" />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
