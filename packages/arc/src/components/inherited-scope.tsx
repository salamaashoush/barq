import { type Child, For, Show, createUniqueId } from "@barqjs/core";
import { variants } from "@barqjs/css";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { fg, gap, layout, type } from "../style/index.ts";
import { useArcMessages } from "./messages.ts";
import { Link } from "./text-link.tsx";

/** A parent scope's items, shown read-only beside a child's own. */
export interface InheritedScope {
  id: string;
  /** Who owns them: "Acme organization". */
  owner: string;
  /** Where they are edited. */
  href?: string;
  /** The items, usually a `DataTable` without row actions. */
  content: Child;
  /** Says "None." in place of the content. */
  isEmpty?: boolean;
}

export const inheritedScopeListStyles = variants({
  slots: {
    root: arc(layout.column, gap[6], layout.minZero),
    own: arc(layout.column, gap[3], layout.minZero),
    scope: arc(layout.column, gap[2], layout.minZero),
    heading: arc(type.subheading),
    description: arc(type.meta, fg.muted),
    empty: arc(type.sm, fg.muted),
    note: arc(type.meta, fg.muted),
  },
});

type Slots = ReturnType<typeof inheritedScopeListStyles>;

export interface InheritedScopeListProps extends Customisable<Slots> {
  /** The scope's own items, which it edits. */
  own: Child;
  /** Names the scope's own items, when they need a heading of their own. */
  ownHeading?: Child;
  inherited: readonly InheritedScope[];
  /** Under every list: what happens to what none of them covers. */
  note?: Child;
  /** The level of the section headings. @default 3 */
  headingLevel?: 2 | 3 | 4 | 5 | 6;
}

/**
 * A scope's own items with the ones it inherits beside them, read-only: a
 * project's alert routes and the organization's that also apply. Each
 * inherited list is a section named "From Acme organization", says where
 * its items are edited with a link there, and says "None." when it is empty.
 *
 * ```tsx
 * <InheritedScopeList
 *   own={<DataTable label="Project routes" … rowActions={…} />}
 *   inherited={[{ id: "org", owner: "Acme organization", href: "/acme/alerts", content: <DataTable label="Organization routes" … /> }]}
 *   note="Incidents no route covers go to the project's owners."
 * />
 * ```
 */
export function InheritedScopeList(props: InheritedScopeListProps) {
  const messages = useArcMessages();
  const ownId = createUniqueId();
  function cls(): Slots {
    return parts(inheritedScopeListStyles(), props.classes);
  }
  function level(): number {
    return props.headingLevel ?? 3;
  }
  return (
    <div class={arc(cls().root, props.class, props.className)} data-slot="inherited-scope-list">
      <section
        class={cls().own}
        data-slot="inherited-scope-own"
        aria-labelledby={props.ownHeading === undefined ? undefined : ownId}
      >
        <Show when={props.ownHeading !== undefined}>
          <span role="heading" aria-level={level()} class={cls().heading} id={ownId}>
            {props.ownHeading}
          </span>
        </Show>
        {props.own}
      </section>
      <For each={() => props.inherited}>
        {(scope: InheritedScope) => {
          const headingId = createUniqueId();
          return (
            <section
              class={cls().scope}
              data-slot="inherited-scope"
              data-scope={scope.id}
              aria-labelledby={headingId}
            >
              <span
                role="heading"
                aria-level={level()}
                class={cls().heading}
                id={headingId}
                data-slot="inherited-scope-heading"
              >
                {messages().fromScope(scope.owner)}
              </span>
              <p class={cls().description} data-slot="inherited-scope-description">
                {messages().editIn}{" "}
                <Show when={scope.href !== undefined} fallback={scope.owner}>
                  <Link href={scope.href}>{scope.owner}</Link>
                </Show>
                .
              </p>
              <Show
                when={scope.isEmpty !== true}
                fallback={
                  <p class={cls().empty} data-slot="inherited-scope-empty">
                    {messages().noneInScope}
                  </p>
                }
              >
                {scope.content}
              </Show>
            </section>
          );
        }}
      </For>
      <Show when={props.note !== undefined}>
        <p class={cls().note} data-slot="inherited-scope-note">
          {props.note}
        </p>
      </Show>
    </div>
  );
}
