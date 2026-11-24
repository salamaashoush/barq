import { type Child, For, Show, createSignal, provide, untrack } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { type AnyFormApi, useSelector } from "@barqjs/form";
import { Check } from "@barqjs/lucide/icons/check";
import { ChevronLeft } from "@barqjs/lucide/icons/chevron-left";
import { Button } from "@barqjs/ui/button";
import { on } from "@barqjs/ui/conditions";
import { icon } from "@barqjs/ui/shared-icon";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { edge, fg, gap, glyph, layout, space, surface, tone, type } from "../style/index.ts";
import type { NavGroup } from "./app-shell.tsx";
import { type ConfirmOptions, confirm } from "./confirm.tsx";
import { arcFormContext } from "./form.tsx";
import { type LinkTarget, maybeRouter, routerLink } from "./link.ts";
import { useArcMessages } from "./messages.ts";
import { SideNav } from "./side-nav.tsx";
import { UnsavedChangesGuard } from "./unsaved-changes-guard.tsx";

export const settingsStyles = variants({
  slots: {
    root: arc(layout.container, layout.minZero, {
      display: "grid",
      gap: { default: space.x6, [on.cqLg]: space.x10 },
      gridTemplateColumns: { default: "100%", [on.cqLg]: "14rem minmax(0, 1fr)" },
      alignItems: "start",
    }),
    nav: arc({
      position: { default: "static", [on.cqLg]: "sticky" },
      top: space.x4,
      ":is([data-selected] > &)": { display: { default: "none", [on.cqLg]: "block" } },
    }),
    detail: arc(layout.column, gap[6], layout.minZero, {
      ":is(:not([data-selected]) > &)": { display: { default: "none", [on.cqLg]: "flex" } },
    }),
    back: arc(layout.row, gap[1], type.sm, fg.muted, glyph.md, {
      textDecorationLine: "none",
      display: { default: "inline-flex", [on.cqLg]: "none" },
    }),
    section: arc(surface.card, layout.column, { scrollMarginTop: space.x4 }),
    header: arc(layout.column, gap[1], { padding: space.x6, paddingBlockEnd: "0" }),
    heading: arc(type.heading),
    description: arc(type.body, fg.muted),
    body: arc(layout.column, gap[4], { padding: space.x6 }),
    footer: arc(layout.row, layout.wrap, gap[3], edge.top, {
      paddingInline: space.x6,
      paddingBlock: space.x3,
    }),
    hint: arc(type.meta, layout.grow),
    saved: arc(layout.row, gap[1], type.meta, tone.success, fg.tone, glyph.sm),
    danger: arc(tone.danger, edge.tone),
    dangerHeading: arc(fg.danger),
    row: arc(layout.row, layout.wrap, gap[4], layout.between, edge.top, {
      padding: space.x6,
      "&:first-of-type": { borderBlockStartWidth: "0" },
    }),
    rowText: arc(layout.column, gap[1], layout.minZero, layout.grow, { flexBasis: "16rem" }),
    rowTitle: arc(type.label),
  },
});

type Slots = ReturnType<typeof settingsStyles>;

// --- the layout ------------------------------------------------------------------

export interface SettingsLayoutProps extends Customisable<Slots> {
  /** The sections, as `SideNav` takes them: router links in named groups. */
  navigation: readonly NavGroup[];
  /** @default arc's "Settings" */
  "aria-label"?: string;
  /**
   * Whether a section is open. On a narrow screen the list of sections shows
   * until one is, and then the section alone with a way back to the list.
   * @default true
   */
  selected?: boolean;
  /** Where the way back goes on a narrow screen: the settings' own index route. */
  back?: LinkTarget;
  /** The open section. */
  children?: Child;
}

/**
 * A settings area: its sections in a `SideNav` beside the open one on a wide
 * container, and on a narrow one a list of them first and then the section
 * on its own, with a way back.
 */
export function SettingsLayout(props: SettingsLayoutProps) {
  const messages = useArcMessages();
  const cls = (): Slots => parts(settingsStyles(), props.classes);
  return (
    <div
      class={arc(cls().root, props.class, props.className)}
      data-slot="settings-layout"
      data-selected={props.selected === false ? undefined : ""}
    >
      <div class={cls().nav} data-slot="settings-layout-nav">
        <SideNav
          navigation={props.navigation}
          aria-label={props["aria-label"] ?? messages().settings}
          collapse="never"
        />
      </div>
      <div class={cls().detail} data-slot="settings-layout-detail">
        <Show when={props.back !== undefined}>
          <BackLink target={props.back as LinkTarget} classes={cls()} />
        </Show>
        {props.children}
      </div>
    </div>
  );
}

function BackLink(props: { target: LinkTarget; classes: Slots }) {
  const messages = useArcMessages();
  const link = routerLink(untrack(() => props.target));
  return (
    <a
      href={link.href()}
      onClick={link.onClick}
      class={props.classes.back}
      data-slot="settings-layout-back"
    >
      <ChevronLeft aria-hidden="true" class={icon.directional} />
      {messages().allSettings}
    </a>
  );
}

// --- a section ---------------------------------------------------------------------

export interface SettingsSectionProps extends Customisable<Slots> {
  heading: Child;
  description?: Child;
  /** The anchor a link to the section uses. */
  id?: string;
  /**
   * Its own form, from `useArcForm`: the fields are its children, Save sits
   * in the bar at the foot, a moment of "Saved" follows a save, and leaving
   * with unsaved changes asks first.
   */
  form?: AnyFormApi;
  /** In the bar beside Save: what saving does. */
  hint?: Child;
  /** @default arc's "Save" */
  submitLabel?: Child;
  /** Actions in the bar when there is no form. */
  footer?: Child;
  children?: Child;
}

/** One block of settings: a heading, a line about it, its fields and the bar that saves them. */
export function SettingsSection(props: SettingsSectionProps) {
  const messages = useArcMessages();
  const cls = (): Slots => parts(settingsStyles(), props.classes);
  const headingId = `${props.id ?? "settings"}-heading`;
  const form = untrack(() => props.form);
  const hasRouter = maybeRouter() !== undefined;
  const [saved, setSaved] = createSignal(false);
  const state =
    form === undefined
      ? undefined
      : useSelector(form.store, (current) => ({
          isDirty: current.isDirty,
          isSubmitting: current.isSubmitting,
          canSubmit: current.canSubmit,
        }));
  let timer: ReturnType<typeof setTimeout> | undefined;
  const submit = async (event: Event): Promise<void> => {
    event.preventDefault();
    if (form === undefined) return;
    await form.handleSubmit();
    if (form.state.isSubmitSuccessful) {
      form.reset(form.state.values);
      setSaved(true);
      clearTimeout(timer);
      timer = setTimeout(() => setSaved(false), 3000);
    }
  };

  const bar = () => (
    <div class={cls().footer} data-slot="settings-section-footer">
      <span class={cls().hint}>{props.hint}</span>
      <Show when={saved() && state?.().isDirty !== true}>
        <span class={cls().saved} role="status" data-slot="settings-section-saved">
          <Check aria-hidden="true" />
          {messages().saved}
        </span>
      </Show>
      <Show when={form !== undefined} fallback={props.footer}>
        <Button
          type="submit"
          isPending={state?.().isSubmitting === true}
          isDisabled={state?.().isDirty !== true || !state().canSubmit}
          data-slot="settings-section-submit"
        >
          {props.submitLabel ?? messages().save}
        </Button>
      </Show>
    </div>
  );

  const content = () => (
    <>
      <header class={cls().header} data-slot="settings-section-header">
        <h2 id={headingId} class={cls().heading} data-slot="settings-section-heading">
          {props.heading}
        </h2>
        <Show when={props.description !== undefined}>
          <p class={cls().description} data-slot="settings-section-description">
            {props.description}
          </p>
        </Show>
      </header>
      <div class={cls().body} data-slot="settings-section-body">
        {props.children}
      </div>
      <Show when={form !== undefined || props.footer !== undefined}>{bar()}</Show>
    </>
  );

  return (
    <section
      class={arc(cls().section, props.class, props.className)}
      id={props.id}
      aria-labelledby={headingId}
      data-slot="settings-section"
    >
      <Show when={form !== undefined} fallback={content()}>
        <form noValidate onSubmit={(event: Event) => void submit(event)}>
          {provide(
            arcFormContext,
            () => form as AnyFormApi,
            () => content(),
          )}
        </form>
        <Show when={hasRouter}>
          <UnsavedChangesGuard when={state?.().isDirty === true} />
        </Show>
      </Show>
    </section>
  );
}

// --- the danger zone -------------------------------------------------------------------

export interface DangerAction {
  id: string;
  title: Child;
  description?: Child;
  /** The button's words: "Delete workspace". */
  label: string;
  /** Asked through `confirm()` first, in the danger tone. */
  confirm: Omit<ConfirmOptions, "tone">;
  onAction: () => void | Promise<unknown>;
  isDisabled?: boolean;
}

export interface DangerZoneProps extends Customisable<Slots> {
  /** @default arc's "Danger zone" */
  heading?: Child;
  actions: readonly DangerAction[];
}

/** The actions that cannot be undone, each with a line about it and a button that asks first. */
export function DangerZone(props: DangerZoneProps) {
  const messages = useArcMessages();
  const cls = (): Slots => parts(settingsStyles(), props.classes);
  const [running, setRunning] = createSignal<string | null>(null);
  const run = async (action: DangerAction): Promise<void> => {
    const sure = await confirm({ ...action.confirm, tone: "danger" });
    if (!sure) return;
    setRunning(action.id);
    try {
      await action.onAction();
    } finally {
      setRunning(null);
    }
  };
  return (
    <section
      class={arc(cls().section, cls().danger, props.class, props.className)}
      aria-labelledby="arc-danger-zone"
      data-slot="danger-zone"
    >
      <header class={cls().header}>
        <h2 id="arc-danger-zone" class={arc(cls().heading, cls().dangerHeading)}>
          {props.heading ?? messages().dangerZone}
        </h2>
      </header>
      <div>
        <For each={props.actions}>
          {(action: DangerAction) => (
            <div class={cls().row} data-slot="danger-zone-action">
              <div class={cls().rowText}>
                <span class={cls().rowTitle}>{action.title}</span>
                <Show when={action.description !== undefined}>
                  <p class={cls().description}>{action.description}</p>
                </Show>
              </div>
              <Button
                variant="destructive"
                isDisabled={action.isDisabled}
                isPending={running() === action.id}
                onPress={() => void run(action)}
              >
                {action.label}
              </Button>
            </div>
          )}
        </For>
      </div>
    </section>
  );
}
