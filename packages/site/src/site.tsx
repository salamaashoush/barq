import { For, signal, type Child, type Incoming } from "@barqjs/core";
import { css } from "@barqjs/css";
import { ArrowRight } from "@barqjs/lucide/icons/arrow-right";
import { Menu } from "@barqjs/lucide/icons/menu";
import { Search } from "@barqjs/lucide/icons/search";
import { Link, Outlet, useLocation } from "@barqjs/router";
import {
  Badge,
  Button,
  Kbd,
  Separator,
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@barqjs/ui";

import { installSite } from "./params.ts";

/**
 * The site around the pages, which is shadcn's own.
 *
 * `siteConfig.navItems` upstream, minus the entries this has nothing behind:
 * no changelog, no directory, no typeset. What is left is a real address per
 * thing rather than a switcher flipping a signal — `/blocks/dashboard-01` is a
 * page somebody can open, bookmark and send, and the design parameters ride
 * along in the search string on every one of them.
 */
export const NAV = [
  { to: "/", label: "Home" },
  { to: "/docs/components", label: "Components" },
  { to: "/blocks", label: "Blocks" },
  { to: "/charts/area", label: "Charts" },
  { to: "/colors", label: "Colors" },
  { to: "/create", label: "Create" },
] as const;

/**
 * The measurements the whole layout is built on, which are upstream's.
 *
 * `--header-height` is `calc(var(--spacing) * 14)` and `16` above `lg` in
 * their root layout, and `--footer-height` the same shape. They are variables
 * rather than literals because the docs sidebar sticks at
 * `calc(var(--header-height) + 0.6rem)` and an anchor jump clears the header
 * with `scroll-padding-top`: three places that have to agree, and a number
 * typed three times is three places to disagree.
 */
const layout = css`
  --header-height: calc(var(--spacing) * 14);
  --footer-height: calc(var(--spacing) * 14);

  position: relative;
  z-index: 10;
  display: flex;
  min-height: 100svh;
  flex-direction: column;
  background-color: var(--background);
  overscroll-behavior: none;

  @media (width >= 64rem) {
    --header-height: calc(var(--spacing) * 16);
  }

  /* The designer takes the viewport: its two panels scroll, the page does not. */
  &:has([data-slot="designer"]) {
    height: 100svh;
    overflow: hidden;
  }
`;

/** Upstream's `container-wrapper`: `mx-auto w-full px-2`. */
const wrapper = css`
  margin-inline: auto;
  width: 100%;
  padding-inline: calc(var(--spacing) * 2);
`;

/** The `px-6` the header and the footer pass it. */
const wrapperEdge = css`
  padding-inline: calc(var(--spacing) * 6);
`;

/**
 * Upstream's `container`: `mx-auto max-w-[1400px] px-4 lg:px-8`.
 *
 * The inner box, which the outer wrapper centres a page's content inside. Two
 * boxes rather than one because they do different jobs: the wrapper is
 * full-bleed and holds the chrome at the window's edge, and this caps the
 * measure so a line of text stays readable on a wide screen. A caller that
 * wants a different edge replaces the padding, which is what the hero does at
 * `px-6`.
 */
const container = css`
  /*
   * width: 100% is load-bearing, not belt and braces.
   *
   * margin-inline: auto on a column flex item beats align-self: stretch, so the
   * box shrinks to its content instead of filling the line. Upstream never sees
   * it because their container always sits inside container-wrapper, which is
   * an ordinary block; ours went straight into the flex main and every page
   * came out 660px wide in a 1336px column, with a three-across grid rendering
   * one card per row and nothing overflowing to say so.
   */
  width: 100%;
  margin-inline: auto;
  max-width: 1400px;
  padding-inline: calc(var(--spacing) * 4);

  @media (width >= 64rem) {
    padding-inline: calc(var(--spacing) * 8);
  }
`;

const header = css`
  position: sticky;
  top: 0;
  z-index: 50;
  width: 100%;
  background-color: var(--background);
`;

const bar = css`
  display: flex;
  height: var(--header-height);
  align-items: center;
  gap: calc(var(--spacing) * 2);

  /* Upstream's **:data-[slot=separator]:h-4! — every rule in the bar is
     4 units tall whatever the separator's own height would be. */
  & [data-slot="separator"][data-orientation="vertical"] {
    height: calc(var(--spacing) * 4);
  }
`;

const brand = css`
  display: inline-flex;
  align-items: center;
  gap: calc(var(--spacing) * 2);
  font-weight: 600;
  font-size: 0.875rem;
  text-decoration: none;
  color: var(--foreground);
  white-space: nowrap;
  margin-right: calc(var(--spacing) * 2);
`;

const nav = css`
  display: none;
  align-items: center;
  gap: 0;

  @media (width >= 64rem) {
    display: flex;
  }
`;

const navLink = css`
  text-decoration: none;
  color: inherit;
`;

const trailing = css`
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: calc(var(--spacing) * 2);

  @media (width >= 48rem) {
    flex: 1;
    justify-content: flex-end;
  }
`;

/**
 * The command affordance: a button shaped like a search field.
 *
 * `bg-surface text-surface-foreground` upstream, which this package does not
 * declare, so it is `muted` — the same job, in a token that exists here.
 */
const commandButton = css`
  display: none;
  align-items: center;
  gap: calc(var(--spacing) * 2);
  height: calc(var(--spacing) * 8);
  width: calc(var(--spacing) * 56);
  justify-content: flex-start;
  border-radius: calc(var(--radius) - 2px);
  background-color: var(--muted);
  padding-inline: calc(var(--spacing) * 2);
  font-size: 0.875rem;
  font-weight: 400;
  color: var(--muted-foreground);
  border: 0;
  cursor: pointer;

  &:hover {
    background-color: var(--accent);
    color: var(--accent-foreground);
  }

  @media (width >= 48rem) {
    display: inline-flex;
  }
`;

const commandHint = css`
  margin-left: auto;
`;

const mobileOnly = css`
  display: inline-flex;

  @media (width >= 64rem) {
    display: none;
  }
`;

const sheetNav = css`
  display: grid;
  gap: calc(var(--spacing) * 1);
  padding: calc(var(--spacing) * 4);
`;

const sheetLink = css`
  display: block;
  padding: calc(var(--spacing) * 2) 0;
  font-size: 1rem;
  text-decoration: none;
  color: var(--muted-foreground);

  &[aria-current="page"] {
    color: var(--foreground);
    font-weight: 500;
  }
`;

const main = css`
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
`;

const footer = css`
  /* The designer owns the viewport, so a footer under it would be unreachable
     and would give the page a scrollbar it must not have. */
  [data-slot="layout"]:has([data-slot="designer"]) & {
    display: none;
  }
`;

const footerInner = css`
  display: flex;
  height: var(--footer-height);
  align-items: center;
  justify-content: space-between;
`;

const footerText = css`
  width: 100%;
  padding-inline: calc(var(--spacing) * 1);
  text-align: center;
  font-size: 0.75rem;
  line-height: 1.75;
  color: var(--muted-foreground);

  @media (width >= 40rem) {
    font-size: 0.875rem;
  }
`;

const footerLink = css`
  font-weight: 500;
  text-decoration: underline;
  text-underline-offset: 4px;
  color: inherit;
`;

const sun = css`
  width: calc(var(--spacing) * 4.5);
  height: calc(var(--spacing) * 4.5);
`;

/** Whether a nav entry is the page being looked at, including its children. */
function isHere(pathname: string, to: string): boolean {
  if (to === "/") return pathname === "/";
  // `/charts/area` marks Charts active on `/charts/bar` too: the nav names one
  // address per SECTION, and a section with one entry per member is a menu.
  const section = `/${to.split("/")[1] ?? ""}`;
  return pathname === to || pathname.startsWith(`${section}/`) || pathname === section;
}

export function MainNav() {
  const here = useLocation();
  return (
    <nav class={nav} aria-label="Main">
      <For each={() => NAV}>
        {(item: (typeof NAV)[number]) => (
          <Link
            to={item.to}
            class={navLink}
            aria-current={() => (isHere(here().pathname, item.to) ? "page" : undefined)}
          >
            <Button
              size="sm"
              variant="ghost"
              data-active={() => (isHere(here().pathname, item.to) ? "true" : "false")}
            >
              {item.label}
            </Button>
          </Link>
        )}
      </For>
    </nav>
  );
}

/**
 * The nav below `lg`, which upstream puts in a sheet.
 *
 * A real `<Sheet>` from this package rather than a hand-rolled drawer, because
 * a menu that traps focus and closes on Escape is the component's job and
 * writing a second one here would be the approximation this whole site exists
 * to stop shipping.
 */
export function MobileNav() {
  const open = signal(false);
  const here = useLocation();

  return (
    <Sheet isOpen={open()} onOpenChange={(next: boolean) => open.set(next)}>
      <SheetTrigger>
        <Button variant="ghost" size="icon" class={mobileOnly} aria-label="Open the menu">
          <Menu size={18} />
        </Button>
      </SheetTrigger>
      <SheetContent side="left">
        <SheetTitle>Menu</SheetTitle>
        <nav class={sheetNav} aria-label="Main">
          <For each={() => NAV}>
            {(item: (typeof NAV)[number]) => (
              <Link
                to={item.to}
                class={sheetLink}
                aria-current={() => (isHere(here().pathname, item.to) ? "page" : undefined)}
                onClick={() => open.set(false)}
              >
                {item.label}
              </Link>
            )}
          </For>
        </nav>
      </SheetContent>
    </Sheet>
  );
}

/**
 * Light and dark, upstream's own icon.
 *
 * Their `next-themes` writes `dark` on `<html>` and persists it. Here `dark` is
 * one of the design parameters and lives in the URL beside the rest, so the
 * mode travels in a shared link the way every other choice does.
 */
export function ModeSwitcher() {
  const site = installSite();
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Toggle the theme"
      onPress={() => site.set({ dark: !site.params().dark })}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        class={sun}
        aria-hidden="true"
      >
        <path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" />
        <path d="M12 3l0 18" />
        <path d="M12 9l4.65 -4.65" />
        <path d="M12 14.3l7.37 -7.37" />
        <path d="M12 19.6l8.85 -8.85" />
      </svg>
    </Button>
  );
}

export function SiteHeader() {
  return (
    <header class={header} data-slot="site-header">
      <div class={`${wrapper} ${wrapperEdge}`}>
        <div class={bar}>
          <MobileNav />
          <Link to="/" class={brand}>
            @barqjs/ui
          </Link>
          <MainNav />
          <div class={trailing}>
            <button type="button" class={commandButton}>
              <Search size={16} />
              Search components…
              <span class={commandHint}>
                <Kbd>⌘K</Kbd>
              </span>
            </button>
            <Separator orientation="vertical" />
            <ModeSwitcher />
          </div>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer class={footer}>
      <div class={`${wrapper} ${wrapperEdge}`}>
        <div class={footerInner}>
          <div class={footerText}>
            Built on{" "}
            <a class={footerLink} href="https://github.com/salamaashoush/barq">
              barq
            </a>
            , from{" "}
            <a class={footerLink} href="https://ui.shadcn.com" target="_blank" rel="noreferrer">
              shadcn/ui
            </a>
            &rsquo;s own class lists. The source is on{" "}
            <a class={footerLink} href="https://github.com/salamaashoush/barq">
              GitHub
            </a>
            .
          </div>
        </div>
      </div>
    </footer>
  );
}

/**
 * The chrome every page shares, which is upstream's `AppLayout`.
 *
 * A layout ROUTE rather than a wrapper each page renders: the header is built
 * once and the matched page goes into the `<Outlet />`, so moving between
 * sections never rebuilds it and never loses what it holds.
 */
export function SiteLayout() {
  const site = installSite();

  return (
    // `dark` is on the LAYOUT, not on `<html>`. The shell renders outside the
    // router's context, so it cannot read the location; the theme's dark rule
    // is a plain `.dark` class and matches here just as well. Written into the
    // server's markup either way, which is what stops a dark page arriving
    // light and flipping on hydration.
    <div class={() => (site.params().dark ? `${layout} dark` : layout)} data-slot="layout">
      <SiteHeader />
      <main class={main}>
        <Outlet />
      </main>
      <SiteFooter />
    </div>
  );
}

/**
 * `PageHeader`: the centred column every page of theirs opens with.
 *
 * `container flex flex-col items-center gap-2 px-6 py-8 text-center md:py-16
 * lg:py-20 xl:gap-4`, inside a `border-grid` section. The home page, `/colors`,
 * `/blocks` and the docs index all render it, which is why the type on each of
 * them lands on the same baseline — and why extracting it is not tidying but
 * the thing that makes them agree.
 */
const headerSection = css`
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
 * `leading-tighter max-w-3xl text-3xl font-semibold tracking-tight text-balance
 * text-primary lg:leading-[1.1] xl:text-5xl xl:tracking-tighter`.
 *
 * `text-3xl` carries its own `line-height: 2.25rem`, which is why the ratio
 * only shows above `lg`: 30 over 36 is the size's own default, and 1.1 takes
 * over at 1024 and again at the 48px the heading grows to at 1280.
 */
const headerHeading = css`
  margin: 0;
  max-width: 48rem;
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

/** `max-w-4xl text-base text-balance text-foreground sm:text-lg`. */
const headerLede = css`
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

/**
 * `Announcement`: the badge above every page's heading, not just the home one.
 *
 * `<Badge asChild variant="secondary" className="bg-muted">` wrapping a link,
 * and it is in `PageHeader`'s children on `/`, `/colors`, `/blocks` and the
 * docs index alike — which is why their headings all start at the same `y`.
 */
export function Announcement() {
  return (
    <Link to="/docs/components" class={navLink}>
      <Badge variant="secondary">
        Every component, transcribed from upstream <ArrowRight size={12} />
      </Badge>
    </Link>
  );
}

/**
 * `flex w-full items-center justify-center gap-2 pt-2
 * **:data-[slot=button]:shadow-none` — upstream's `PageActions`, which is the
 * last of `PageHeader`'s children rather than a section of its own.
 */
const headerActions = css`
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: center;
  gap: calc(var(--spacing) * 2);
  padding-top: calc(var(--spacing) * 2);

  /* The hero's buttons sit on a flat surface, so the elevation every other
     button carries reads there as a mistake. */
  & [data-slot="button"] {
    box-shadow: none;
  }
`;

export function PageHeader(
  props: Incoming<{ title: string; lede?: string; actions?: Child; children?: Child }>,
) {
  return (
    <section class={headerSection}>
      <div class={wrapper}>
        <div class={`${container} ${headerInner}`}>
          {props.children}
          <h1 class={headerHeading}>{props.title}</h1>
          {props.lede?.() === undefined ? null : <p class={headerLede}>{props.lede()}</p>}
          {/* `props.actions === undefined` tests PRESENCE without invoking.
              `actions` is JSX, so it lowers to a Block, and a Block called with
              no scope throws — `props.actions?.()` is the Cell read this slot
              is not. The absent prop is not an own property, so comparing the
              carrier is the whole test. */}
          {props.actions === undefined ? null : <div class={headerActions}>{props.actions}</div>}
        </div>
      </div>
    </section>
  );
}

const shell = css`
  padding-block: calc(var(--spacing) * 8) calc(var(--spacing) * 16);
  display: grid;
  gap: calc(var(--spacing) * 8);
`;

/**
 * A page: their `PageHeader` over its body.
 *
 * Upstream's `/colors`, `/blocks` and docs index all open with the same centred
 * header the front page does, so this is that header and the content under it
 * rather than a heading each page styles itself.
 */
export function Page(props: Incoming<{ title: string; lede?: string; children?: Child }>) {
  return (
    <>
      <PageHeader title={props.title()} lede={props.lede?.()}>
        <Announcement />
      </PageHeader>
      <div class={wrapper}>
        <div class={`${container} ${shell}`}>{props.children}</div>
      </div>
    </>
  );
}

export { container, wrapper, wrapperEdge };
