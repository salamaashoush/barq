import { type Accessor, type Child, For, Show, createSignal, flush, untrack } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { numberFormatter } from "@barqjs/aria/i18n";
import { announce } from "@barqjs/aria/live";
import { ArrowDown } from "@barqjs/lucide/icons/arrow-down";
import { ArrowUp } from "@barqjs/lucide/icons/arrow-up";
import { ChevronRight } from "@barqjs/lucide/icons/chevron-right";
import { Copy } from "@barqjs/lucide/icons/copy";
import { Plus } from "@barqjs/lucide/icons/plus";
import { Trash2 } from "@barqjs/lucide/icons/trash-2";
import { Button } from "@barqjs/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@barqjs/ui/collapsible";

import { arcLayer as arc } from "../layer.ts";
import {
  type ArcFieldProps,
  type FieldSlots,
  type FieldValueProps,
  Frame,
  arrayFieldOf,
  bindField,
  fieldStyles,
} from "../lib/field.tsx";
import { type Customisable, parts } from "../lib/parts.ts";
import {
  bg,
  control,
  edge,
  fg,
  focus,
  gap,
  layout,
  plainList,
  rounded,
  space,
  square,
  surface,
  type,
} from "../style/index.ts";
import { expandChevron } from "./expand-chevron.ts";
import { IconButton } from "./icon-button.tsx";
import { useArcMessages } from "./messages.ts";
import type { RepeaterRow } from "./repeater-field.tsx";

export const stepSequenceEditorStyles = variants({
  slots: {
    list: arc(plainList, layout.column, gap[3]),
    step: arc(surface.card, rounded.lg, layout.minZero, layout.container),
    header: arc(layout.row, gap[2], { padding: space.x2 }),
    trigger: arc(control.quiet, layout.row, gap[2], focus.visible, {
      width: "auto",
      flexShrink: "0",
      paddingInline: space.x1,
    }),
    number: arc(
      layout.inlineCentre,
      rounded.full,
      bg.muted,
      type.caption,
      type.numeric,
      square.x6,
      layout.noShrink,
    ),
    label: arc(type.label, layout.clip, layout.nowrap),
    title: arc(layout.grow, layout.minZero),
    summary: arc(type.meta, layout.clip, layout.nowrap, layout.minZero, layout.fromCqSm, {
      maxWidth: "40%",
    }),
    actions: arc(layout.row, layout.noShrink, gap[0.5], layout.pushEnd),
    body: arc(edge.top, layout.column, gap[4], { padding: space.x4 }),
    add: arc({ alignSelf: "flex-start", width: "auto" }),
    empty: arc(type.body, fg.muted),
  },
});

type Slots = ReturnType<typeof stepSequenceEditorStyles> & FieldSlots;

export interface StepSequenceEditorProps<T>
  extends Omit<ArcFieldProps, "classes">, FieldValueProps<readonly T[]>, Customisable<Slots> {
  /** A new step's value, prefilled by where it goes. */
  newStep: (index: number) => T;
  /** One step's fields, shown while it is open. */
  children: (row: RepeaterRow<T>) => Child;
  /**
   * Beside the step's number in its header, outside the button that opens
   * it: the step's name edited in place.
   */
  title?: (row: RepeaterRow<T>) => Child;
  /** A quiet line in the header, from the `sm` step: "GET /health". */
  summary?: (step: T, index: number) => Child;
  /** Names a step for its buttons and announcements. @default "Step 2" */
  stepLabel?: (step: T, index: number) => string;
  /** A copy of a step for Duplicate. @default `structuredClone` */
  duplicate?: (step: T) => T;
  /** Steps it keeps at least; their remove buttons go quiet at this many. @default 1 */
  min?: number;
  /** Steps it holds at most; Add and Duplicate go quiet at this many. */
  max?: number;
  /** Which steps start open, by index. @default only the first */
  defaultExpanded?: readonly number[];
  /** @default the provider's `addStep`, "Add step" */
  addLabel?: string;
  /** What an empty sequence says. */
  emptyLabel?: Child;
}

/**
 * Steps in an order that matters, each a card that folds: a multi-step
 * check's requests, a workflow's actions, a form's pages.
 *
 * ```tsx
 * <form.AppField name="steps" mode="array">
 *   {(field) => (
 *     <field.StepSequenceEditor
 *       label="Requests"
 *       newStep={(index) => ({ method: "GET", url: index === 0 ? "https://" : "" })}
 *       summary={(step) => `${step.method} ${step.url}`}
 *       max={20}
 *     >
 *       {(row) => <form.AppField name={row.name("url")}>{(url) => <url.TextField label="URL" />}</form.AppField>}
 *     </field.StepSequenceEditor>
 *   )}
 * </form.AppField>
 * ```
 *
 * Each step is a card whose header holds its number and a button that opens
 * and folds its fields, its `title` and `summary`, and buttons that move it
 * up and down, duplicate it and remove it, each named after the step and
 * quiet where it cannot act. A new or duplicated step opens and takes focus;
 * a moved one keeps focus on the button that moved it; a removed one hands
 * focus to the step in its place. Inside `form.AppField` the steps move
 * through the array field's own insert, remove and move, so each step's
 * errors go with it.
 */
export function StepSequenceEditor<T>(props: StepSequenceEditorProps<T>) {
  const messages = useArcMessages();
  const of = bindField<readonly T[]>(props, []);
  const array = arrayFieldOf(of);
  const number = numberFormatter();
  const [open, setOpen] = createSignal<readonly boolean[]>(
    untrack(() => (of.value() ?? []).map((_, index) => opensAt(index))),
  );
  let list: HTMLElement | undefined;
  let adder: HTMLButtonElement | undefined;
  function opensAt(index: number): boolean {
    const given = untrack(() => props.defaultExpanded);
    return given === undefined ? index === 0 : given.includes(index);
  }
  function cls(): Slots {
    return parts({ ...fieldStyles(), ...stepSequenceEditorStyles() }, props.classes);
  }
  function steps(): readonly T[] {
    return of.value() ?? [];
  }
  function label(index: number): string {
    const step = steps()[index];
    if (step !== undefined && props.stepLabel !== undefined) return props.stepLabel(step, index);
    return messages().stepNumbered(index + 1);
  }
  function isOpen(index: number): boolean {
    return open()[index] ?? false;
  }
  function setOpenAt(index: number, value: boolean): void {
    const next = [...untrack(open)];
    next[index] = value;
    setOpen(next);
  }
  function canAdd(): boolean {
    return props.isDisabled !== true && (props.max === undefined || steps().length < props.max);
  }
  function canRemove(): boolean {
    return props.isDisabled !== true && steps().length > (props.min ?? 1);
  }
  function focusIn(index: number, ...slots: string[]): void {
    flush();
    const step = list?.querySelectorAll<HTMLElement>('[data-slot="step-sequence-step"]')[index];
    const target = [...slots, "step-sequence-trigger"]
      .map((slot) => step?.querySelector<HTMLElement>(`[data-slot="${slot}"]:not([disabled])`))
      .find((one) => one !== null && one !== undefined);
    (target ?? adder)?.focus();
  }
  function insert(index: number, value: T): void {
    if (array === undefined) {
      const next = [...untrack(steps)];
      next.splice(index, 0, value);
      of.change(next);
    } else {
      untrack(array).insertValue(index, value);
    }
    const flags = [...untrack(open)];
    flags.splice(index, 0, true);
    setOpen(flags);
  }
  function add(): void {
    const index = untrack(steps).length;
    insert(index, untrack(() => props.newStep)(index));
    announce(
      untrack(() => messages().rowAdded(label(index))),
      "polite",
    );
    focusIn(index, "step-sequence-trigger");
  }
  function duplicate(index: number): void {
    const step = untrack(steps)[index];
    if (step === undefined) return;
    const copy = untrack(() => props.duplicate)?.(step) ?? structuredClone(step);
    const named = untrack(() => label(index));
    insert(index + 1, copy);
    announce(untrack(messages).rowDuplicated(named), "polite");
    focusIn(index + 1, "step-sequence-trigger");
  }
  function remove(index: number): void {
    const named = untrack(() => label(index));
    if (array === undefined) of.change(untrack(steps).filter((_, at) => at !== index));
    else untrack(array).removeValue(index);
    setOpen(untrack(open).filter((_, at) => at !== index));
    announce(untrack(messages).rowRemoved(named), "polite");
    focusIn(Math.min(index, untrack(steps).length - 1), "step-sequence-trigger");
  }
  function move(index: number, to: number): void {
    if (array === undefined) {
      const next = [...untrack(steps)];
      const [moved] = next.splice(index, 1);
      if (moved !== undefined) next.splice(to, 0, moved);
      of.change(next);
    } else {
      untrack(array).moveValue(index, to);
    }
    const flags = [...untrack(open)];
    const [flag] = flags.splice(index, 1);
    flags.splice(to, 0, flag ?? false);
    setOpen(flags);
    announce(
      untrack(() => messages().rowMoved(label(to), to + 1, steps().length)),
      "polite",
    );
    const [way, back] =
      to > index
        ? ["step-sequence-down", "step-sequence-up"]
        : ["step-sequence-up", "step-sequence-down"];
    focusIn(to, way, back);
  }
  function update(index: number, next: T): void {
    of.change(untrack(steps).map((step, at) => (at === index ? next : step)));
  }
  function row(index: number, value: Accessor<T>): RepeaterRow<T> {
    return {
      index,
      value,
      name: (key?: string) =>
        key === undefined
          ? `${of.name() ?? ""}[${String(index)}]`
          : `${of.name() ?? ""}[${String(index)}].${key}`,
      update: (next: T) => update(index, next),
    };
  }

  return (
    <Frame
      of={of}
      label={props.label}
      description={props.description}
      field={props}
      labelledById
      slot="step-sequence-editor"
    >
      <Show
        when={steps().length > 0}
        fallback={
          <Show when={props.emptyLabel !== undefined}>
            <p class={cls().empty} data-slot="step-sequence-empty">
              {props.emptyLabel}
            </p>
          </Show>
        }
      >
        <ol
          class={cls().list}
          data-slot="step-sequence-list"
          aria-labelledby={of.ids.label}
          aria-describedby={of.describedBy(props.description !== undefined)}
          ref={(element: HTMLElement) => {
            list = element;
          }}
        >
          <For each={steps()} keyed={false}>
            {(value: Accessor<T>, index: number) => (
              <li class={cls().step} data-slot="step-sequence-step">
                <Collapsible
                  isExpanded={isOpen(index)}
                  onExpandedChange={(expanded: boolean) => setOpenAt(index, expanded)}
                >
                  <div class={cls().header} data-slot="step-sequence-header">
                    <CollapsibleTrigger
                      class={cls().trigger}
                      data-slot="step-sequence-trigger"
                      aria-label={label(index)}
                    >
                      <ChevronRight class={expandChevron} aria-hidden="true" />
                      <span
                        class={cls().number}
                        data-slot="step-sequence-number"
                        aria-hidden="true"
                      >
                        {number().format(index + 1)}
                      </span>
                      <Show when={props.title === undefined}>
                        <span
                          class={cls().label}
                          data-slot="step-sequence-label"
                          aria-hidden="true"
                        >
                          {label(index)}
                        </span>
                      </Show>
                    </CollapsibleTrigger>
                    <div class={cls().title} data-slot="step-sequence-title">
                      {props.title?.(row(index, value))}
                    </div>
                    <Show when={props.summary !== undefined}>
                      <span class={cls().summary} data-slot="step-sequence-summary">
                        {props.summary?.(value(), index)}
                      </span>
                    </Show>
                    <div class={cls().actions} data-slot="step-sequence-actions">
                      <IconButton
                        label={messages().moveRowUpOf(label(index))}
                        size="sm"
                        slot="step-sequence-up"
                        isDisabled={props.isDisabled === true || index === 0}
                        onPress={() => move(index, index - 1)}
                      >
                        <ArrowUp />
                      </IconButton>
                      <IconButton
                        label={messages().moveRowDownOf(label(index))}
                        size="sm"
                        slot="step-sequence-down"
                        isDisabled={props.isDisabled === true || index === steps().length - 1}
                        onPress={() => move(index, index + 1)}
                      >
                        <ArrowDown />
                      </IconButton>
                      <IconButton
                        label={messages().duplicateRowOf(label(index))}
                        size="sm"
                        slot="step-sequence-duplicate"
                        isDisabled={!canAdd()}
                        onPress={() => duplicate(index)}
                      >
                        <Copy />
                      </IconButton>
                      <IconButton
                        label={messages().removeRowOf(label(index))}
                        size="sm"
                        slot="step-sequence-remove"
                        isDisabled={!canRemove()}
                        onPress={() => remove(index)}
                      >
                        <Trash2 />
                      </IconButton>
                    </div>
                  </div>
                  <CollapsibleContent>
                    <div class={cls().body} data-slot="step-sequence-body">
                      {props.children(row(index, value))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </li>
            )}
          </For>
        </ol>
      </Show>
      <Button
        variant="outline"
        size="sm"
        class={cls().add}
        data-slot="step-sequence-add"
        isDisabled={!canAdd()}
        ref={(element: HTMLButtonElement) => {
          adder = element;
        }}
        onPress={add}
      >
        <Plus aria-hidden="true" />
        {props.addLabel ?? messages().addStep}
      </Button>
    </Frame>
  );
}
