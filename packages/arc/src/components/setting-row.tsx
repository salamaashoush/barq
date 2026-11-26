import { type Child, For, Show, createMemo, createSignal, createUniqueId } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { listFormatter } from "@barqjs/aria/i18n";
import { announce } from "@barqjs/aria/live";
import { controllable } from "@barqjs/aria/utils";
import { Lock } from "@barqjs/lucide/icons/lock";
import { Badge } from "@barqjs/ui/badge";
import { Switch } from "@barqjs/ui/switch";

import { arcLayer as arc } from "../layer.ts";
import { type FieldValueProps, bindField } from "../lib/field.tsx";
import { type Customisable, parts } from "../lib/parts.ts";
import { edge, fg, gap, glyph, layout, space, type } from "../style/index.ts";
import { InlineAlert } from "./alert.tsx";
import { type SaveState, SaveStatus } from "./autosave.tsx";
import { useArcMessages } from "./messages.ts";
import { serverMessage } from "./server-message.ts";

export const settingRowStyles = variants({
  slots: {
    root: arc(layout.row, layout.between, gap[4], edge.top, {
      paddingBlock: space.x4,
      alignItems: "flex-start",
      "&:first-child": { borderBlockStartWidth: "0" },
    }),
    text: arc(layout.column, gap[1], layout.minZero, layout.grow),
    heading: arc(layout.row, layout.wrap, gap[2]),
    label: arc(type.label),
    badge: arc(glyph.sm),
    description: arc(type.body, fg.muted),
    lock: arc(layout.row, gap[1.5], type.meta, glyph.sm, { alignItems: "flex-start" }),
    action: arc(type.meta),
    note: arc(type.meta),
    control: arc(layout.row, layout.noShrink, gap[2], { minHeight: space.x6 }),
    list: arc(layout.column),
  },
});

type Slots = ReturnType<typeof settingRowStyles>;

/** Why a setting cannot be changed here, and where that changes. */
export interface SettingLock {
  /** "Available on the Business plan", "Only owners can change this". */
  reason: Child;
  /** Beside the label: the plan it needs. */
  badge?: Child;
  /** Where to lift it: an upgrade link, an "Ask about it" button. */
  action?: Child;
}

/** The ids a row's own control is named and described by. */
export interface SettingRowIds {
  label: string;
  description: string;
}

export interface SettingRowProps extends Customisable<Slots> {
  label: Child;
  description?: Child;
  /** Its own control in place of the switch, named by the row's label through the ids it is handed. */
  control?: (ids: SettingRowIds) => Child;
  checked?: boolean;
  defaultChecked?: boolean;
  /**
   * Applies the switch at once. The switch flips while this runs and is held
   * until it settles; a rejection flips it back and says why.
   */
  onCheckedChange?: (checked: boolean) => unknown;
  /** The save state of a control of its own, shown under its words. */
  status?: SaveState;
  /** Why that control's save failed or is held. */
  statusReason?: Child;
  /** Read only here, with why and where that changes. */
  locked?: SettingLock;
  isDisabled?: boolean;
  /** Under the description: what else changes with it. */
  note?: Child;
}

/**
 * One setting: its name and a line about it at the start, its control at the
 * end, and what happened to the last change under its words.
 *
 * ```tsx
 * <SettingRow
 *   label="Require two-factor sign-in"
 *   description="Members without it are asked to set it up."
 *   checked={workspace.requireTwoFactor}
 *   onCheckedChange={(on) => api.updateWorkspace({ requireTwoFactor: on })}
 * />
 * ```
 *
 * The switch applies at once: it flips, waits for the save, says Saved, and
 * flips back with the server's reason when the save fails. With `locked` it
 * is read only, with the reason, a badge for the plan it needs and a way to
 * lift it. Any other control goes in `control`, which hands it the ids of
 * the row's label and description.
 */
export function SettingRow(props: SettingRowProps) {
  const messages = useArcMessages();
  const id = createUniqueId();
  const ids: SettingRowIds = { label: `${id}-label`, description: `${id}-description` };
  const [own, setOwn] = controllable<boolean>(
    () => props.checked,
    () => props.defaultChecked ?? false,
  );
  const [optimistic, setOptimistic] = createSignal<boolean | undefined>(undefined);
  const [state, setState] = createSignal<SaveState>("idle");
  const [reason, setReason] = createSignal<string | undefined>(undefined);
  let quiet: ReturnType<typeof setTimeout> | undefined;
  function cls(): Slots {
    return parts(settingRowStyles(), props.classes);
  }
  function checked(): boolean {
    return optimistic() ?? own();
  }
  function described(): string | undefined {
    return props.description !== undefined || props.locked !== undefined || props.note !== undefined
      ? ids.description
      : undefined;
  }
  async function toggle(next: boolean): Promise<void> {
    const before = checked();
    clearTimeout(quiet);
    setReason(undefined);
    let result: unknown;
    try {
      result = props.onCheckedChange?.(next);
    } catch (error) {
      result = Promise.reject(error);
    }
    if (!(result instanceof Promise)) {
      setOwn(next);
      setState("idle");
      return;
    }
    setOptimistic(next);
    setState("saving");
    try {
      await result;
    } catch (error) {
      setOptimistic(undefined);
      setReason(serverMessage(error, messages().actionFailed));
      setState("error");
      announce(messages().settingNotChanged, "assertive");
      if (own() !== before) setOwn(before);
      return;
    }
    setOwn(next);
    setOptimistic(undefined);
    setState("saved");
    quiet = setTimeout(() => setState("idle"), 3000);
  }
  function status(): SaveState {
    return props.status ?? state();
  }
  return (
    <div
      class={arc(cls().root, props.class, props.className)}
      data-slot="setting-row"
      data-locked={props.locked === undefined ? undefined : ""}
    >
      <div class={cls().text}>
        <div class={cls().heading}>
          <span class={cls().label} id={ids.label} data-slot="setting-row-label">
            {props.label}
          </span>
          <Show when={props.locked?.badge !== undefined}>
            <Badge variant="secondary" class={cls().badge} data-slot="setting-row-badge">
              <Lock aria-hidden="true" />
              {props.locked?.badge}
            </Badge>
          </Show>
        </div>
        <div id={ids.description} class={layout.column}>
          <Show when={props.description !== undefined}>
            <p class={cls().description} data-slot="setting-row-description">
              {props.description}
            </p>
          </Show>
          <Show when={props.note !== undefined}>
            <p class={cls().note} data-slot="setting-row-note">
              {props.note}
            </p>
          </Show>
          <Show when={props.locked !== undefined}>
            <p class={cls().lock} data-slot="setting-row-lock">
              <Show when={props.locked?.badge === undefined}>
                <Lock aria-hidden="true" />
              </Show>
              <span>{props.locked?.reason}</span>
            </p>
          </Show>
        </div>
        <Show when={props.locked?.action !== undefined}>
          <div class={cls().action} data-slot="setting-row-action">
            {props.locked?.action}
          </div>
        </Show>
        <Show when={status() !== "idle"}>
          <SaveStatus state={status()} reason={props.statusReason ?? reason()} />
        </Show>
      </div>
      <div class={cls().control} data-slot="setting-row-control">
        <Show
          when={props.control === undefined}
          fallback={props.control?.({ label: ids.label, description: ids.description })}
        >
          <Switch
            aria-labelledby={ids.label}
            aria-describedby={described()}
            isSelected={checked()}
            isDisabled={
              props.isDisabled === true || props.locked !== undefined || state() === "saving"
            }
            onChange={(next: boolean) => void toggle(next)}
            data-slot="setting-row-switch"
          />
        </Show>
      </div>
    </div>
  );
}

// --- a list of features ------------------------------------------------------------

/** One feature a workspace turns on or off. */
export interface FeatureToggle {
  id: string;
  label: string;
  description?: Child;
  /** Not this plan's to change: it keeps the state it has. */
  locked?: SettingLock;
  /** Features this one needs: turning it on turns them on, and turning one of them off turns it off. */
  requires?: readonly string[];
}

export interface FeatureTogglesProps
  extends Customisable<Slots>, FieldValueProps<readonly string[]> {
  features: readonly FeatureToggle[];
  /** Names the list. */
  "aria-label"?: string;
  isDisabled?: boolean;
}

/** Every feature `id` needs, all the way down. */
function requirementsOf(features: ReadonlyMap<string, FeatureToggle>, id: string): Set<string> {
  const found = new Set<string>();
  const queue = [...(features.get(id)?.requires ?? [])];
  while (queue.length > 0) {
    const next = queue.shift() as string;
    if (found.has(next) || next === id) continue;
    found.add(next);
    queue.push(...(features.get(next)?.requires ?? []));
  }
  return found;
}

/** Every feature that needs `id`, all the way up. */
function dependentsOf(features: ReadonlyMap<string, FeatureToggle>, id: string): Set<string> {
  const found = new Set<string>();
  for (const feature of features.values()) {
    if (feature.id !== id && requirementsOf(features, feature.id).has(id)) found.add(feature.id);
  }
  return found;
}

/**
 * The features a workspace has on, as switches: a feature its plan does not
 * include shown locked with the plan it needs and a way to ask for it, and
 * features that need one another turned on and off together.
 *
 * ```tsx
 * <FeatureToggles
 *   aria-label="Modules"
 *   features={[
 *     { id: "grades", label: "Gradebook" },
 *     { id: "reports", label: "Report cards", requires: ["grades"] },
 *     { id: "sis", label: "Student records sync", locked: { reason: "On the District plan", badge: "District" } },
 *   ]}
 *   defaultValue={["grades"]}
 * />
 * ```
 *
 * Held as the ids that are on. Turning on a feature turns on what it needs,
 * turning one off turns off what needs it, and a screen reader is told what
 * else moved. A feature whose need is locked off is locked too, naming it.
 * It is a field: inside `form.AppField` it is the form's.
 */
export function FeatureToggles(props: FeatureTogglesProps) {
  const messages = useArcMessages();
  const list = listFormatter({ type: "conjunction" });
  const of = bindField<readonly string[]>(props, []);
  const byId = createMemo(
    (): ReadonlyMap<string, FeatureToggle> =>
      new Map(props.features.map((feature) => [feature.id, feature])),
  );
  function cls(): Slots {
    return parts(settingRowStyles(), props.classes);
  }
  function enabled(): ReadonlySet<string> {
    return new Set(of.value());
  }
  function labels(ids: Iterable<string>): string {
    return list().format([...ids].map((id) => byId().get(id)?.label ?? id));
  }
  /** A need that is locked off, which locks this one too. */
  function blockedBy(feature: FeatureToggle): string[] {
    return [...requirementsOf(byId(), feature.id)].filter(
      (id) => byId().get(id)?.locked !== undefined && !enabled().has(id),
    );
  }
  function set(feature: FeatureToggle, on: boolean): void {
    const next = new Set(enabled());
    const moved = on ? requirementsOf(byId(), feature.id) : dependentsOf(byId(), feature.id);
    const also = [...moved].filter((id) => next.has(id) !== on);
    for (const id of [feature.id, ...also]) {
      if (on) next.add(id);
      else next.delete(id);
    }
    of.change(props.features.map((one) => one.id).filter((id) => next.has(id)));
    of.blur();
    if (also.length > 0) {
      announce(
        on ? messages().alsoTurnedOn(labels(also)) : messages().alsoTurnedOff(labels(also)),
        "polite",
      );
    }
  }
  function lockOf(feature: FeatureToggle): SettingLock | undefined {
    if (feature.locked !== undefined) return feature.locked;
    const blocked = blockedBy(feature);
    return blocked.length === 0 ? undefined : { reason: messages().needsFeature(labels(blocked)) };
  }
  function note(feature: FeatureToggle): Child {
    const needs = feature.requires ?? [];
    if (needs.length === 0 || blockedBy(feature).length > 0) return undefined;
    return messages().needsFeature(labels(needs));
  }
  return (
    <div
      class={arc(cls().list, props.class, props.className)}
      role="group"
      aria-label={props["aria-label"]}
      data-slot="feature-toggles"
    >
      <For each={props.features}>
        {(feature: FeatureToggle) => (
          <SettingRow
            label={feature.label}
            description={feature.description}
            note={note(feature)}
            locked={lockOf(feature)}
            isDisabled={props.isDisabled}
            checked={enabled().has(feature.id)}
            onCheckedChange={(on: boolean) => set(feature, on)}
            classes={props.classes}
          />
        )}
      </For>
    </div>
  );
}

// --- a feature the plan leaves out ---------------------------------------------------

export interface PlanGateProps extends Customisable<Slots> {
  /** Whether the plan includes it. Off, the notice stands in for the children. */
  allowed: boolean;
  /** "IP allowlists are on the Business plan". */
  title: Child;
  description?: Child;
  /** An upgrade link, a "Talk to sales" button. */
  action?: Child;
  children?: Child;
}

/**
 * A feature's editor, or, where the plan does not include it, a notice in
 * its place saying which plan does and how to get it.
 *
 * ```tsx
 * <PlanGate allowed={plan.allowlists} title="IP allowlists are on the Business plan"
 *   action={<Button href="/billing" size="sm">See plans</Button>}>
 *   <AllowlistEditor />
 * </PlanGate>
 * ```
 */
export function PlanGate(props: PlanGateProps) {
  return (
    <Show when={!props.allowed} fallback={props.children}>
      <InlineAlert
        tone="info"
        title={props.title}
        icon={<Lock aria-hidden="true" />}
        actions={props.action}
        class={arc(props.class, props.className)}
      >
        {props.description}
      </InlineAlert>
    </Show>
  );
}
