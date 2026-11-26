import { type Child, Show, createEffect, createSignal, hasContext, untrack } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { ChevronDown } from "@barqjs/lucide/icons/chevron-down";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@barqjs/ui/collapsible";
import { srOnly } from "@barqjs/ui/sr-only";

import { arcLayer as arc } from "../layer.ts";
import { arcFormContext, useArcFormContext } from "../lib/field.tsx";
import { type Customisable, parts } from "../lib/parts.ts";
import {
  edge,
  fg,
  focus,
  gap,
  glyph,
  interaction,
  layout,
  motion,
  rounded,
  space,
  truncate,
  type,
} from "../style/index.ts";
import { useArcMessages } from "./messages.ts";

export const optionGroupStyles = variants({
  slots: {
    root: arc(edge.all, rounded.md),
    trigger: arc(
      layout.row,
      layout.between,
      layout.fill,
      gap[3],
      rounded.md,
      focus.visible,
      interaction.hover,
      {
        paddingInline: space.x3,
        paddingBlock: space.x2_5,
        textAlign: "start",
      },
    ),
    heading: arc(layout.column, layout.minZero),
    title: arc(type.label),
    summary: arc(type.sm, fg.muted, truncate),
    chevron: arc(layout.noShrink, fg.muted, glyph.sm, motion.transform, {
      '[aria-expanded="true"] > &': { rotate: "180deg" },
    }),
    content: arc(layout.column, gap[5], edge.top, { padding: space.x3, paddingBlock: space.x4 }),
  },
  variants: {
    invalid: { true: { root: arc({ borderColor: "var(--destructive)" }) }, false: {} },
  },
  defaults: { invalid: false },
});

type Slots = ReturnType<typeof optionGroupStyles>;

/** What the group reads of a field's state on the form. */
interface FieldMetaLike {
  isTouched: boolean;
  errors: readonly unknown[];
}

export interface OptionGroupProps extends Customisable<Slots> {
  title: Child;
  /** What is set inside, said while it is shut: "Slow 3G, Pixel 7", "Browser defaults". */
  summary: Child;
  /** The fields inside, by name on the form in scope: one holding an error opens the group and marks it. */
  fields?: readonly string[];
  /** Marked and opened, for a group whose fields are not the form's. */
  isInvalid?: boolean;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: Child;
}

/**
 * Options most people leave alone, folded under a heading that says what
 * they are set to: the emulation of a browser check, the network a probe
 * goes through.
 *
 * ```tsx
 * <OptionGroup title="Network" summary={networkSummary()} fields={["proxy", "throttle"]}>
 *   <form.AppField name="proxy">{(field) => <field.TextField label="Proxy" />}</form.AppField>
 * </OptionGroup>
 * ```
 *
 * Its fields stay mounted while it is shut, so a server error can land on
 * one; when one does, the group opens and is marked, so the error is never
 * folded out of sight.
 */
export function OptionGroup(props: OptionGroupProps) {
  const messages = useArcMessages();
  const [own, setOwn] = createSignal(untrack(() => props.defaultOpen ?? props.open ?? false));
  const fieldErrors = hasContext(arcFormContext)
    ? useArcFormContext().useSelector((state) =>
        (untrack(() => props.fields) ?? []).some((name) => {
          const meta = (state.fieldMeta as Readonly<Record<string, FieldMetaLike | undefined>>)[
            name
          ];
          return meta !== undefined && meta.isTouched && meta.errors.length > 0;
        }),
      )
    : () => false;
  function cls(): Slots {
    return parts(optionGroupStyles({ invalid: isInvalid() }), props.classes);
  }
  function isInvalid(): boolean {
    return props.isInvalid === true || fieldErrors();
  }
  function isOpen(): boolean {
    return props.open ?? own();
  }
  function set(next: boolean): void {
    setOwn(next);
    props.onOpenChange?.(next);
  }
  createEffect(isInvalid, (invalid: boolean) => {
    if (invalid && !untrack(isOpen)) untrack(() => set(true));
  });
  return (
    <Collapsible
      class={arc(cls().root, props.class, props.className)}
      data-slot="option-group"
      open={isOpen()}
      onOpenChange={set}
    >
      <CollapsibleTrigger class={cls().trigger} data-slot="option-group-trigger">
        <span class={cls().heading}>
          <span class={cls().title} data-slot="option-group-title">
            {props.title}
          </span>
          <span class={cls().summary} data-slot="option-group-summary">
            {props.summary}
          </span>
          <Show when={isInvalid()}>
            <span class={srOnly}>{messages().holdsAnError}</span>
          </Show>
        </span>
        <ChevronDown class={cls().chevron} aria-hidden="true" />
      </CollapsibleTrigger>
      <CollapsibleContent class={cls().content} data-slot="option-group-content">
        {props.children}
      </CollapsibleContent>
    </Collapsible>
  );
}
