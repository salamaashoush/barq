import { type Child, For, Show } from "@barqjs/core";
import { variants } from "@barqjs/css";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { gap, layout, plainList, space, type } from "../style/index.ts";
import { EmptyState, type EmptyStatePlacement } from "./empty-state.tsx";
import { useArcMessages } from "./messages.ts";

export const successStateStyles = variants({
  slots: {
    root: arc({}),
    title: arc(type.heading),
    tips: arc(plainList, layout.column, gap[2], type.sm, { textAlign: "start" }),
    tip: arc(layout.row, gap[2], { alignItems: "baseline" }),
    marker: arc(layout.noShrink, type.label, { minInlineSize: space.x4 }),
    help: arc(type.sm),
  },
});

type Slots = ReturnType<typeof successStateStyles>;

export interface SuccessStateProps extends Customisable<Slots> {
  /** What was done: "You're all set", "Subscribed". */
  heading: Child;
  description?: Child;
  /** In place of the tick. */
  icon?: Child;
  /** What to do next, numbered. */
  tips?: readonly Child[];
  /** Where it leads: "Open the workspace". */
  actions?: Child;
  /** A line under the actions: a link to help. */
  help?: Child;
  /** @default "page" */
  placement?: EmptyStatePlacement;
  /** @default 2, or 1 on a page that is only this */
  headingLevel?: 1 | 2 | 3 | 4 | 5 | 6;
}

/**
 * The end of a flow that worked: a sign-up finished, a subscription
 * confirmed, a check-in made. A tick in the success tone, what was done,
 * what to do next and where to go.
 *
 * ```tsx
 * <SuccessState
 *   heading="You're all set"
 *   description="Your workspace is ready."
 *   tips={["Invite your team", "Connect a calendar"]}
 *   actions={<Button href="/app">Open the workspace</Button>}
 * />
 * ```
 *
 * It is a polite live region, so a screen reader hears the heading as the
 * page arrives at it. `EmptyState` is for a list with nothing in it.
 */
export function SuccessState(props: SuccessStateProps) {
  const messages = useArcMessages();
  function cls(): Slots {
    return parts(successStateStyles(), props.classes);
  }
  return (
    <EmptyState
      data-slot="success-state"
      role="status"
      kind="done"
      placement={props.placement}
      icon={props.icon}
      heading={props.heading}
      description={props.description}
      headingLevel={props.headingLevel ?? 2}
      class={arc(cls().root, props.class, props.className)}
      classes={{ title: cls().title }}
      actions={props.actions}
    >
      <Show when={(props.tips?.length ?? 0) > 0}>
        <ol class={cls().tips} data-slot="success-state-tips" aria-label={messages().nextSteps}>
          <For each={props.tips ?? []}>
            {(tip: Child, index: () => number) => (
              <li class={cls().tip} data-slot="success-state-tip">
                <span class={cls().marker} aria-hidden="true">
                  {index() + 1}.
                </span>
                <span>{tip}</span>
              </li>
            )}
          </For>
        </ol>
      </Show>
      <Show when={props.help !== undefined}>
        <p class={cls().help} data-slot="success-state-help">
          {props.help}
        </p>
      </Show>
    </EmptyState>
  );
}
