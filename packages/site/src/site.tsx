import { For, type Child, type Incoming } from "@barqjs/core";
import { css } from "@barqjs/css";
import { Button, Separator } from "@barqjs/ui";
import { Link, Outlet, useLocation } from "@barqjs/router";

import { installSite } from "./params.ts";

/**
 * The site around the pages, which is shadcn's own.
 *
 * `siteConfig.navItems` upstream, minus the entries this gallery has nothing
 * behind: no changelog, no directory, no typeset. What is left is a real
 * address per thing rather than a switcher flipping a signal — `/blocks/
 * dashboard-01` is a page somebody can open, bookmark and send, and the design
 * parameters ride along in the search string on every one of them.
 */
export const NAV = [
  { to: "/", label: "Home" },
  { to: "/docs/components", label: "Components" },
  { to: "/blocks", label: "Blocks" },
  { to: "/charts/area", label: "Charts" },
  { to: "/colors", label: "Colors" },
] as const;

const header = css`
  position: sticky;
  top: 0;
  z-index: 50;
  width: 100%;
  background-color: var(--background);
  border-bottom: 1px solid var(--border);
`;

const bar = css`
  display: flex;
  height: 3.5rem;
  align-items: center;
  gap: 0.5rem;
  padding-inline: 1.5rem;
`;

const brand = css`
  font-weight: 600;
  font-size: 0.875rem;
  text-decoration: none;
  color: var(--foreground);
  margin-right: 0.5rem;
  white-space: nowrap;
`;

const nav = css`
  display: none;
  align-items: center;
  gap: 0;

  @media (width >= 48rem) {
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
  gap: 0.5rem;
`;

const body = css`
  min-height: calc(100dvh - 3.5rem);
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

export function SiteHeader() {
  return (
    <header class={header} data-slot="site-header">
      <div class={bar}>
        <Link to="/" class={brand}>
          @barqjs/ui
        </Link>
        <MainNav />
        <div class={trailing}>
          <Separator orientation="vertical" />
          <Link to="/create" class={navLink}>
            <Button size="sm">New</Button>
          </Link>
        </div>
      </div>
    </header>
  );
}

/**
 * The chrome every page shares.
 *
 * A layout ROUTE rather than a wrapper each page renders: the header is built
 * once and the matched page goes into the `<Outlet />`, so moving between
 * sections never rebuilds it and never loses what it holds.
 */
export function SiteLayout() {
  // The whole document, from the same search string the designer writes. Every
  // page but `/create` had no theme at all before this: `--chart-1`, `--radius`
  // and the rest were undefined, and an undefined `var()` takes the property's
  // INITIAL value rather than falling back, so the charts drew grey and every
  // corner was square with nothing reporting a problem.
  installSite();

  return (
    <>
      <SiteHeader />
      <div class={body} data-slot="site-body">
        <Outlet />
      </div>
    </>
  );
}

const shell = css`
  padding: 2rem 1.5rem 4rem;
  display: grid;
  gap: 2rem;
  max-width: 80rem;
  margin-inline: auto;
`;

const title = css`
  font-size: 1.875rem;
  font-weight: 600;
  letter-spacing: -0.025em;
  margin: 0;
`;

const lede = css`
  color: var(--muted-foreground);
  margin: 0.5rem 0 0;
  max-width: 46rem;
`;

/** A page's heading and its body, so every section on the site opens the same. */
export function Page(props: Incoming<{ title: string; lede?: string; children?: Child }>) {
  return (
    <main class={shell}>
      <div>
        <h1 class={title}>{props.title}</h1>
        {props.lede?.() === undefined ? null : <p class={lede}>{props.lede()}</p>}
      </div>
      {props.children}
    </main>
  );
}
