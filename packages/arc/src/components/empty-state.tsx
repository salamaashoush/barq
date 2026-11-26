import { type Child, Match, Show, Switch } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { useLocale } from "@barqjs/aria/i18n";
import { CircleCheck } from "@barqjs/lucide/icons/circle-check";
import { LockKeyhole } from "@barqjs/lucide/icons/lock-keyhole";
import { SearchX } from "@barqjs/lucide/icons/search-x";
import { Button } from "@barqjs/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@barqjs/ui/empty";
import type { UiProps } from "@barqjs/ui/props";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { bg, edge, fg, gap, glyph, layout, space, tone, type } from "../style/index.ts";
import { useArcMessages } from "./messages.ts";

export type EmptyStateVariant = "plain" | "outline";

/**
 * Why it is empty: nothing there yet, nothing left to do, nothing the
 * reader may see, or nothing that matches the filters. All but the first
 * bring their own icon and words, so they read alike on every page.
 */
export type EmptyStateKind = "empty" | "done" | "restricted" | "filtered";

/**
 * Where it stands: `page` stands in for a page's or a tab's whole content;
 * `section` is a quiet line inside a card or a panel whose own heading
 * already says what is missing.
 */
export type EmptyStatePlacement = "page" | "section";

export const emptyStateVariants = variants({
  slots: {
    root: arc({}),
    header: arc({}),
    media: arc({}),
    title: arc({}),
    description: arc({}),
    body: arc(layout.column, gap[2], type.sm),
    actions: arc(layout.wrap, layout.centre, gap[2], { flexDirection: "row" }),
  },
  variants: {
    variant: {
      plain: {},
      outline: { root: arc(edge.frame) },
    },
    kind: {
      empty: {},
      done: { media: arc(tone.success, bg.tone, fg.toneBase) },
      restricted: { media: arc(fg.muted) },
      filtered: { media: arc(fg.muted) },
    },
    placement: {
      page: {},
      section: {
        root: arc({ alignItems: "flex-start", textAlign: "start", padding: "0px", gap: space.x3 }),
        header: arc({
          display: "grid",
          gridTemplateColumns: "auto minmax(0, 1fr)",
          justifyItems: "start",
          textAlign: "start",
          rowGap: space.x0_5,
          columnGap: "0px",
        }),
        media: arc(glyph.md, {
          gridRow: "span 2",
          alignSelf: "start",
          width: "auto",
          height: "auto",
          marginBlock: "0px",
          marginInlineEnd: space.x2,
          backgroundColor: "transparent",
        }),
        title: arc(type.sm, type.normal, fg.muted, { gridColumnStart: "2" }),
        description: arc(type.xs, { gridColumnStart: "2" }),
        body: arc({ alignItems: "flex-start" }),
        actions: arc({ justifyContent: "flex-start" }),
      },
    },
  },
  defaults: { variant: "plain", kind: "empty", placement: "page" },
});

type Slots = ReturnType<typeof emptyStateVariants>;

export interface EmptyStateProps extends Omit<UiProps, "class" | "className">, Customisable<Slots> {
  /** What would be here, drawn in a muted square: `<Inbox />`. A kind brings its own. */
  icon?: Child;
  /** Not `title`, which is the attribute every element takes. @default the kind's own words */
  heading?: Child;
  /** @default the kind's own words, for the kinds that have them */
  description?: Child;
  /** What fills it: one button, or a few. */
  actions?: Child;
  /** Between the words and the actions: a list of tips, a detail. */
  children?: Child;
  /** `outline` draws the dashed frame, for an empty area on a plain page. @default "plain" */
  variant?: EmptyStateVariant;
  /** @default "empty" */
  kind?: EmptyStateKind;
  /** @default "page" */
  placement?: EmptyStatePlacement;
  /** With `kind="filtered"`: a Clear filters button that runs this. */
  onClearFilters?: () => void;
  /** With `kind="restricted"`: who can grant access, named in the description. */
  grantedBy?: readonly string[];
  /** Makes the heading a heading of this level, for a state that is the page's own. */
  headingLevel?: 1 | 2 | 3 | 4 | 5 | 6;
}

/**
 * A list or an area with nothing in it yet, and what to do about that.
 *
 * ```tsx
 * <EmptyState
 *   icon={<Inbox />}
 *   heading="No invoices yet"
 *   description="They appear here once one is sent."
 *   actions={<Button onPress={create}>New invoice</Button>}
 * />
 * <EmptyState kind="filtered" onClearFilters={clear} />
 * <EmptyState kind="restricted" grantedBy={["Ola", "Sam"]} placement="section" />
 * ```
 *
 * A kind other than `empty` says why in its own icon and words, which
 * `heading` and `description` replace. In a `section` it is a quiet line
 * at the start, and only a kind that is not "nothing yet" is marked with
 * its icon.
 */
export function EmptyState(props: EmptyStateProps) {
  const messages = useArcMessages();
  const locale = useLocale();
  function kind(): EmptyStateKind {
    return props.kind ?? "empty";
  }
  function placement(): EmptyStatePlacement {
    return props.placement ?? "page";
  }
  function cls(): Slots {
    return parts(
      emptyStateVariants({ variant: props.variant, kind: kind(), placement: placement() }),
      props.classes,
    );
  }
  // A section's heading already names what is missing, so only a kind is marked there.
  function ownIcon(): boolean {
    return placement() === "page" && props.icon !== undefined;
  }
  function hasIcon(): boolean {
    return ownIcon() || kind() !== "empty";
  }
  function heading(): Child {
    if (props.heading !== undefined) return props.heading;
    if (kind() === "done") return messages().allDone;
    if (kind() === "restricted") return messages().restrictedHeading;
    if (kind() === "filtered") return messages().noMatchesHeading;
    return messages().nothingHere;
  }
  function description(): Child | undefined {
    if (props.description !== undefined) return props.description;
    if (kind() === "filtered" && placement() === "page") return messages().noMatchesDescription;
    if (kind() !== "restricted") return undefined;
    const names = props.grantedBy ?? [];
    if (names.length === 0) return messages().askAnAdmin;
    const list = new Intl.ListFormat(locale().locale, { type: "disjunction" }).format(names);
    return messages().askForAccess(list);
  }
  function clearable(): boolean {
    return kind() === "filtered" && props.onClearFilters !== undefined;
  }
  return (
    <Empty
      {...props}
      data-slot={props["data-slot"] ?? "empty-state"}
      data-variant={props.variant ?? "plain"}
      data-kind={kind()}
      data-placement={placement()}
      class={arc(cls().root, props.class, props.className)}
    >
      <EmptyHeader class={cls().header}>
        <Show when={hasIcon()}>
          <EmptyMedia variant="icon" class={cls().media} aria-hidden="true">
            <Switch>
              <Match when={ownIcon()}>{props.icon}</Match>
              <Match when={kind() === "done"}>
                <CircleCheck />
              </Match>
              <Match when={kind() === "restricted"}>
                <LockKeyhole />
              </Match>
              <Match when={kind() === "filtered"}>
                <SearchX />
              </Match>
            </Switch>
          </EmptyMedia>
        </Show>
        <EmptyTitle class={cls().title}>
          <Show when={props.headingLevel !== undefined} fallback={heading()}>
            <span role="heading" aria-level={props.headingLevel} data-slot="empty-state-heading">
              {heading()}
            </span>
          </Show>
        </EmptyTitle>
        <Show when={description() !== undefined}>
          <EmptyDescription class={cls().description}>{description()}</EmptyDescription>
        </Show>
      </EmptyHeader>
      <Show when={props.children !== undefined}>
        <div class={cls().body} data-slot="empty-state-body">
          {props.children}
        </div>
      </Show>
      <Show when={props.actions !== undefined || clearable()}>
        <EmptyContent class={cls().actions}>
          <Show when={clearable()}>
            <Button
              variant="outline"
              size={placement() === "section" ? "sm" : "default"}
              onPress={() => props.onClearFilters?.()}
            >
              {messages().clearFilters}
            </Button>
          </Show>
          {props.actions}
        </EmptyContent>
      </Show>
    </Empty>
  );
}
