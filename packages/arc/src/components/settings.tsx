import {
  type Child,
  For,
  Show,
  createContext,
  createEffect,
  createSignal,
  hasContext,
  onCleanup,
  provide,
  untrack,
  useContext,
} from "@barqjs/core";
import { variants } from "@barqjs/css";
import { type AnyFormApi, useSelector } from "@barqjs/form";
import { Check } from "@barqjs/lucide/icons/check";
import { ChevronLeft } from "@barqjs/lucide/icons/chevron-left";
import { Lock } from "@barqjs/lucide/icons/lock";
import { Button } from "@barqjs/ui/button";
import { on } from "@barqjs/ui/conditions";
import { icon } from "@barqjs/ui/shared-icon";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { edge, fg, gap, glyph, layout, place, space, surface, tone, type } from "../style/index.ts";
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
    nav: arc(layout.minZero, {
      position: { default: "static", [on.cqLg]: "sticky" },
      top: space.x4,
      ":is([data-selected]:not([data-narrow='row']) > &)": {
        display: { default: "none", [on.cqLg]: "block" },
      },
    }),
    detail: arc(layout.column, gap[6], layout.minZero, {
      ":is(:not([data-selected]):not([data-narrow='row']) > &)": {
        display: { default: "none", [on.cqLg]: "flex" },
      },
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
    list: arc({ paddingInline: space.x6 }),
    fields: arc(layout.column, gap[4], layout.flush, layout.minZero, edge.none, place.unpadded),
    readOnly: arc(layout.row, gap[1.5], type.meta, glyph.sm, layout.grow),
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
    error: arc(type.caption, fg.danger, layout.flush),
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
  /**
   * On a narrow container: the list of sections first and then the open one
   * alone (`"list"`), or the sections as one row that scrolls above the open
   * one (`"row"`). @default "list"
   */
  narrow?: "list" | "row";
  /** The open section. */
  children?: Child;
}

/** Where the sections of one settings area say whether they hold unsaved changes. */
interface LeaveGuard {
  watch: (dirty: () => boolean) => () => void;
}

const leaveGuardContext = createContext<LeaveGuard | null>(null, "SettingsLeaveGuard");

/**
 * A settings area: its sections in a `SideNav` beside the open one on a wide
 * container, and on a narrow one a list of them first and then the section
 * on its own, with a way back, or with `narrow="row"` the sections as a row
 * above it.
 *
 * Every `SettingsSection` inside reports its unsaved changes to the layout,
 * which asks once before the area is left, however many cards hold them.
 */
export function SettingsLayout(props: SettingsLayoutProps) {
  const messages = useArcMessages();
  const hasRouter = maybeRouter() !== undefined;
  const [watched, setWatched] = createSignal<readonly (() => boolean)[]>([], { ownedWrite: true });
  const guard: LeaveGuard = {
    watch(dirty) {
      setWatched((all) => [...all, dirty]);
      return () => setWatched((all) => all.filter((one) => one !== dirty));
    },
  };
  function cls(): Slots {
    return parts(settingsStyles(), props.classes);
  }
  function row(): boolean {
    return props.narrow === "row";
  }
  return (
    <div
      class={arc(cls().root, props.class, props.className)}
      data-slot="settings-layout"
      data-selected={props.selected === false ? undefined : ""}
      data-narrow={props.narrow ?? "list"}
    >
      <div class={cls().nav} data-slot="settings-layout-nav">
        <SideNav
          navigation={props.navigation}
          aria-label={props["aria-label"] ?? messages().settings}
          collapse={row() ? "scroll" : "never"}
        />
      </div>
      <div class={cls().detail} data-slot="settings-layout-detail">
        <Show when={props.back !== undefined && !row()}>
          <BackLink target={props.back as LinkTarget} classes={cls()} />
        </Show>
        {provide(
          leaveGuardContext,
          () => guard,
          () => props.children,
        )}
      </div>
      <Show when={hasRouter}>
        <UnsavedChangesGuard when={watched().some((dirty) => dirty())} />
      </Show>
    </div>
  );
}

interface BackLinkProps {
  target: LinkTarget;
  classes: Slots;
}

function BackLink(props: BackLinkProps) {
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
  /**
   * The record as the server has it now. When it changes, a refetch or
   * another tab's save, a form with no unsaved change follows it; one with
   * changes keeps them.
   */
  values?: unknown;
  /**
   * Read only, with why: "Only owners can change these". The fields are
   * disabled and Save gives way to the reason.
   */
  readOnly?: Child;
  /** Rows edge to edge under the header, `SettingRow`s or a list, before the fields. */
  list?: Child;
  children?: Child;
}

/** One block of settings: a heading, a line about it, its fields and the bar that saves them. */
export function SettingsSection(props: SettingsSectionProps) {
  const messages = useArcMessages();
  function cls(): Slots {
    return parts(settingsStyles(), props.classes);
  }
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
  const area = hasContext(leaveGuardContext) ? useContext(leaveGuardContext)() : null;
  if (area !== null && state !== undefined) {
    const release = area.watch(() => state().isDirty);
    onCleanup(release);
  }
  if (form !== undefined) {
    createEffect(
      () => props.values,
      (values) => {
        if (values !== undefined && !form.state.isDirty) form.reset(values);
      },
      { defer: true },
    );
  }
  function readOnly(): boolean {
    return props.readOnly !== undefined;
  }
  async function submit(event: Event): Promise<void> {
    event.preventDefault();
    if (form === undefined || readOnly()) return;
    await form.handleSubmit();
    // A save the server refused still completes, its errors set on the form:
    // resetting would wipe them and "Saved" would say the opposite.
    if (form.state.isSubmitSuccessful && form.state.isValid) {
      form.reset(form.state.values);
      setSaved(true);
      clearTimeout(timer);
      timer = setTimeout(() => setSaved(false), 3000);
    }
  }

  function bar() {
    return (
      <div class={cls().footer} data-slot="settings-section-footer">
        <Show when={readOnly()} fallback={<span class={cls().hint}>{props.hint}</span>}>
          <span class={cls().readOnly} data-slot="settings-section-read-only">
            <Lock aria-hidden="true" />
            {props.readOnly}
          </span>
        </Show>
        <Show when={saved() && state?.().isDirty !== true}>
          <span class={cls().saved} role="status" data-slot="settings-section-saved">
            <Check aria-hidden="true" />
            {messages().saved}
          </span>
        </Show>
        <Show when={form !== undefined && !readOnly()} fallback={props.footer}>
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
  }

  function content() {
    return (
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
        <Show when={props.list !== undefined}>
          <div class={cls().list} data-slot="settings-section-list">
            {props.list}
          </div>
        </Show>
        <Show when={props.children !== undefined}>
          <div class={cls().body} data-slot="settings-section-body">
            <Show when={form !== undefined} fallback={props.children}>
              <fieldset
                class={cls().fields}
                disabled={readOnly()}
                data-slot="settings-section-fields"
              >
                {props.children}
              </fieldset>
            </Show>
          </div>
        </Show>
        <Show when={form !== undefined || props.footer !== undefined || readOnly()}>{bar()}</Show>
      </>
    );
  }

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
        <Show when={hasRouter && area === null}>
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
  function cls(): Slots {
    return parts(settingsStyles(), props.classes);
  }
  const [running, setRunning] = createSignal<string | null>(null);
  const [failed, setFailed] = createSignal<string | null>(null);
  async function run(action: DangerAction): Promise<void> {
    const sure = await confirm({ ...action.confirm, tone: "danger" });
    if (!sure) return;
    setFailed(null);
    setRunning(action.id);
    try {
      await action.onAction();
    } catch {
      setFailed(action.id);
    } finally {
      setRunning(null);
    }
  }
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
                <Show when={failed() === action.id}>
                  <p class={cls().error} role="alert" data-slot="danger-zone-error">
                    {messages().actionFailed}
                  </p>
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
