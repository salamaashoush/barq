import { For, Show, createSignal } from "@barqjs/core";
import { Ellipsis } from "@barqjs/lucide/icons/ellipsis";
import { type RouteMatch, useMatches } from "@barqjs/router";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@barqjs/ui/breadcrumb";
import type { UiProps } from "@barqjs/ui/props";
import { srOnly } from "@barqjs/ui/sr-only";

import { arcLayer as arc } from "../layer.ts";
import { type LinkTarget, routerLink } from "./link.ts";

/** One step of the trail. Without `to` it is text, and the last step always is. */
export interface Crumb extends Partial<LinkTarget> {
  label: string;
}

/**
 * What a route puts in `staticData.crumb`: its label, or a function of its
 * match for a label that comes from the route's params or loader data.
 */
export type RouteCrumb = string | ((match: RouteMatch) => string | undefined);

/** The trail the matched routes declare, outermost first. */
function routeCrumbs(matches: readonly RouteMatch[]): Crumb[] {
  const out: Crumb[] = [];
  for (const match of matches) {
    const declared = match.staticData.crumb as RouteCrumb | undefined;
    const label = typeof declared === "function" ? declared(match) : declared;
    if (typeof label !== "string" || label === "") continue;
    const crumb: Crumb = { label, to: match.pathname, exact: true };
    // A layout and its index route share a path; the deeper one names it.
    if (out.at(-1)?.to === match.pathname) out[out.length - 1] = crumb;
    else out.push(crumb);
  }
  return out;
}

const root = arc({
  minWidth: "0px",
  containerType: "inline-size",
  "& [data-slot=breadcrumb-list]": {
    flexWrap: "nowrap",
  },
  "& [data-slot=breadcrumbs-more]": {
    display: "none",
  },
  "@container (width < 32rem)": {
    "&:not([data-expanded]) [data-middle]": {
      display: "none",
    },
    "& [data-slot=breadcrumbs-more]": {
      display: "inline-flex",
    },
  },
});

const item = arc({
  minWidth: "0px",
});

const crumbText = arc({
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  maxWidth: "16rem",
  borderRadius: "calc(var(--radius) * 0.6)",
  outlineStyle: "none",
  ":focus-visible": {
    boxShadow: "0 0 0 2px var(--ring)",
  },
});

const more = arc({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "calc(var(--spacing) * 6)",
  height: "calc(var(--spacing) * 6)",
  padding: "0px",
  border: "0px",
  borderRadius: "calc(var(--radius) * 0.6)",
  backgroundColor: "transparent",
  color: "inherit",
  cursor: "pointer",
  outlineStyle: "none",
  "& > svg": {
    width: "calc(var(--spacing) * 4)",
    height: "calc(var(--spacing) * 4)",
  },
  "@media (hover: hover)": {
    ":hover": { color: "var(--foreground)" },
  },
  ":focus-visible": {
    boxShadow: "0 0 0 2px var(--ring)",
  },
});

export interface BreadcrumbsProps extends UiProps {
  /** The trail itself. Left out, it is read from the matched routes' `staticData.crumb`. */
  items?: readonly Crumb[];
  /** Names the button that shows the steps a narrow trail hides. @default "Show the full path" */
  expandLabel?: string;
}

interface Placed {
  crumb: Crumb;
  first: boolean;
  last: boolean;
  middle: boolean;
  hidesMiddle: boolean;
}

/**
 * Where the page sits, each step a link but the last.
 *
 * ```tsx
 * export const Route = createFileRoute("/projects/$id")({
 *   staticData: { crumb: (match) => match.params.id },
 * });
 *
 * <Breadcrumbs />
 * <Breadcrumbs items={[{ label: "Projects", to: "/projects" }, { label: "Acme" }]} />
 * ```
 *
 * Narrower than its container query, the steps between the first and the last
 * fold behind a button that shows them again. The order is the document's, so
 * a right-to-left page reads it from the right with the chevrons turned.
 */
export function Breadcrumbs(props: BreadcrumbsProps) {
  const matches = useMatches();
  const [expanded, setExpanded] = createSignal(false);
  const crumbs = (): readonly Crumb[] => props.items ?? routeCrumbs(matches());
  const placed = (): Placed[] => {
    const all = crumbs();
    return all.map((crumb, index) => ({
      crumb,
      first: index === 0,
      last: index === all.length - 1,
      middle: index > 0 && index < all.length - 1,
      hidesMiddle: index === 0 && all.length > 2,
    }));
  };

  return (
    <Breadcrumb
      {...props}
      class={arc(root, props.class, props.className)}
      data-slot={props["data-slot"] ?? "breadcrumbs"}
      aria-label={props["aria-label"] ?? "Breadcrumb"}
      data-expanded={expanded() ? "" : undefined}
    >
      <BreadcrumbList>
        <For each={placed()}>
          {(entry: Placed) => (
            <>
              <Show when={!entry.first}>
                <BreadcrumbSeparator data-middle={entry.middle ? "" : undefined} />
              </Show>
              <BreadcrumbItem class={item} data-middle={entry.middle ? "" : undefined}>
                <CrumbStep crumb={entry.crumb} last={entry.last} />
              </BreadcrumbItem>
              <Show when={entry.hidesMiddle}>
                <BreadcrumbSeparator data-slot="breadcrumbs-more" />
                <BreadcrumbItem data-slot="breadcrumbs-more">
                  <button
                    type="button"
                    class={more}
                    data-slot="breadcrumbs-expand"
                    aria-expanded={expanded() ? "true" : "false"}
                    onClick={() => setExpanded((open) => !open)}
                  >
                    <Ellipsis aria-hidden="true" />
                    <span class={srOnly}>{props.expandLabel ?? "Show the full path"}</span>
                  </button>
                </BreadcrumbItem>
              </Show>
            </>
          )}
        </For>
      </BreadcrumbList>
    </Breadcrumb>
  );
}

function CrumbStep(props: { crumb: Crumb; last: boolean }) {
  const crumb = props.crumb;
  if (props.last) {
    return (
      <BreadcrumbPage class={crumbText} title={crumb.label}>
        {crumb.label}
      </BreadcrumbPage>
    );
  }
  if (crumb.to === undefined) {
    return (
      <span class={crumbText} data-slot="breadcrumbs-text" title={crumb.label}>
        {crumb.label}
      </span>
    );
  }
  const link = routerLink({ ...crumb, to: crumb.to });
  return (
    <BreadcrumbLink
      class={crumbText}
      href={link.href()}
      title={crumb.label}
      onClick={link.onClick}
      onMouseEnter={link.onMouseEnter}
      onMouseLeave={link.onMouseLeave}
    >
      {crumb.label}
    </BreadcrumbLink>
  );
}
