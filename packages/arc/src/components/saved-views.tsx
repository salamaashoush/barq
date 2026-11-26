import { For, Show, createEffect, createSignal, createUniqueId, untrack } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { Bookmark } from "@barqjs/lucide/icons/bookmark";
import { Check } from "@barqjs/lucide/icons/check";
import { ChevronDown } from "@barqjs/lucide/icons/chevron-down";
import { Link2 } from "@barqjs/lucide/icons/link-2";
import { Pencil } from "@barqjs/lucide/icons/pencil";
import { Save } from "@barqjs/lucide/icons/save";
import { Star } from "@barqjs/lucide/icons/star";
import { Trash2 } from "@barqjs/lucide/icons/trash-2";
import { writeClipboard } from "@barqjs/primitives/clipboard";
import { useSearchParams } from "@barqjs/router";
import { Button } from "@barqjs/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@barqjs/ui/dropdown-menu";
import { Input } from "@barqjs/ui/input";
import { toast } from "@barqjs/ui/sonner";
import { Switch } from "@barqjs/ui/switch";
import { isServer } from "@barqjs/web";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { withoutParams } from "../lib/search-state.ts";
import { fg, gap, glyph, layout, truncate, type } from "../style/index.ts";
import { confirm } from "./confirm.tsx";
import { useArcMessages } from "./messages.ts";
import { ResponsiveOverlay } from "./responsive-overlay.tsx";

/** A list's state as a view keeps it: its search parameters, less any left at their default. */
export type ViewState = Readonly<Record<string, string>>;

/** A named set of a list's filters, sort and columns. */
export interface SavedView {
  id: string;
  name: string;
  state: ViewState;
  /** The reader's own; otherwise shared with them by someone else. */
  mine: boolean;
  /** Everyone who sees the list sees it. */
  shared?: boolean;
  /** The reader's list opens on it when its address names nothing. */
  isDefault?: boolean;
  /** The reader may update, rename and share it. @default `mine` */
  canEdit?: boolean;
  /** @default `mine` */
  canDelete?: boolean;
}

/** What the save dialog asks for. */
export interface SavedViewDraft {
  name: string;
  shared: boolean;
  isDefault: boolean;
}

export interface SavedViewsProps extends Customisable<Slots> {
  /** `undefined` while they load. */
  views: readonly SavedView[] | undefined;
  /**
   * The search parameter naming the open view. The list's state is then every
   * other search parameter, less `exclude`, and opening a view rewrites the
   * address to its state in one step.
   */
  param?: string;
  /** Parameters that are not the view's: one-off dialogs. @default `["create", "preset"]` */
  exclude?: readonly string[];
  /** Without `param`: the list's state as the caller holds it. */
  state?: ViewState;
  /** Without `param`: which view is open. */
  currentId?: string | null;
  /** Without `param`: put this view's state on the list, or `null` to keep the state and close the view. */
  onApply?: (view: SavedView | null) => void;
  /** Saves the list as it is now. Its promise holds the dialog open until it settles. */
  onCreate: (draft: SavedViewDraft, state: ViewState) => SavedView | Promise<SavedView>;
  /** The open view now holds the list as it is. */
  onUpdate?: (view: SavedView, state: ViewState) => unknown;
  onRename?: (view: SavedView, draft: SavedViewDraft) => SavedView | Promise<SavedView>;
  onDefaultChange?: (view: SavedView, isDefault: boolean) => unknown;
  onDelete?: (view: SavedView) => unknown;
  /** Offer Share in the dialog. @default true */
  canShare?: boolean;
  /** Open the reader's default view as the list opens, when the address names nothing. @default true */
  applyDefault?: boolean;
}

export const savedViewsStyles = variants({
  slots: {
    trigger: arc({ maxWidth: "14rem" }),
    name: arc(truncate, layout.minZero),
    item: arc(gap[2], glyph.sm),
    itemName: arc(truncate, layout.grow, layout.minZero),
    star: arc(fg.muted, { "& > svg": { fill: "currentColor" } }),
    form: arc(layout.column, gap[4]),
    field: arc(layout.column, gap[1.5]),
    toggle: arc(layout.row, layout.between, gap[4]),
    hint: arc(type.meta, fg.muted),
    error: arc(type.meta, fg.danger),
    actions: arc(layout.row, layout.end, gap[2]),
  },
});

type Slots = ReturnType<typeof savedViewsStyles>;

/** Two states are the same view whatever order their keys came in. */
export function sameViewState(a: ViewState, b: ViewState): boolean {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => a[key] === b[key]);
}

/**
 * A list's saved views: open one from a menu, save the list as it is now
 * under a name, update the open view once it is edited, rename or share it,
 * choose the one the list opens on, copy a link to it, delete it.
 *
 * ```tsx
 * <SavedViews
 *   param="view"
 *   views={views.data}
 *   onCreate={(draft, state) => api.views.create({ ...draft, state })}
 *   onUpdate={(view, state) => api.views.update(view.id, { state })}
 *   onDelete={(view) => api.views.delete(view.id)}
 * />
 * ```
 *
 * With `param`, the view's state is the list's search parameters, as
 * `DataToolbar`, `SegmentedControl` and `useSearchParam` keep them, and a
 * link to a view opens it. The trigger names the open view and says
 * "(edited)" once the list moves away from it.
 */
export function SavedViews(props: SavedViewsProps) {
  const messages = useArcMessages();
  function cls(): Slots {
    return parts(savedViewsStyles(), props.classes);
  }
  const param = untrack(() => props.param);
  const url = param === undefined ? undefined : useSearchParams();
  function excluded(): ReadonlySet<string> {
    return new Set([
      ...(props.exclude ?? ["create", "preset"]),
      ...(param === undefined ? [] : [param]),
    ]);
  }
  function state(): ViewState {
    if (url === undefined) return props.state ?? {};
    const held: Record<string, string> = {};
    for (const [key, value] of url[0]()) if (!excluded().has(key)) held[key] = value;
    return held;
  }
  function currentId(): string | null | undefined {
    return url === undefined || param === undefined ? props.currentId : url[0]().get(param);
  }
  function current(): SavedView | undefined {
    const id = currentId();
    return id === null || id === undefined
      ? undefined
      : props.views?.find((view) => view.id === id);
  }
  function edited(): boolean {
    const view = current();
    return view !== undefined && !sameViewState(state(), view.state);
  }
  function canEdit(view: SavedView): boolean {
    return view.canEdit ?? view.mine;
  }
  function canDelete(view: SavedView): boolean {
    return view.canDelete ?? view.mine;
  }

  function apply(view: SavedView | null): void {
    if (url === undefined || param === undefined) {
      props.onApply?.(view);
      return;
    }
    if (view === null) {
      url[1]((now) => withoutParams(now, new Set([param])));
      return;
    }
    url[1]({ ...view.state, [param]: view.id });
  }

  let applied = false;
  if (!isServer) {
    createEffect(
      () => props.views,
      (views) => {
        if (applied || views === undefined) return;
        applied = true;
        untrack(() => {
          if (props.applyDefault === false) return;
          const named = currentId();
          if (named !== null && named !== undefined) return;
          if (Object.keys(state()).length > 0) return;
          const opening = views.find((view) => view.isDefault === true);
          if (opening !== undefined) apply(opening);
        });
      },
    );
  }

  const [dialog, setDialog] = createSignal<"new" | "edit" | null>(null);

  async function copyLink(view: SavedView): Promise<void> {
    if (param === undefined) return;
    const link = new URL(window.location.href);
    link.search = new URLSearchParams({ [param]: view.id }).toString();
    await writeClipboard(link.href);
    toast.success(messages().copied);
  }

  async function remove(view: SavedView): Promise<void> {
    const sure = await confirm({
      title: messages().deleteView,
      description: view.name,
      tone: "danger",
      confirmLabel: messages().delete,
    });
    if (!sure) return;
    await props.onDelete?.(view);
    if (current()?.id === view.id) apply(null);
  }

  function triggerLabel(): string {
    const view = current();
    if (view === undefined) return messages().views;
    return edited() ? messages().viewEdited(view.name) : view.name;
  }

  function item(view: SavedView) {
    return (
      <DropdownMenuItem
        class={cls().item}
        data-slot="saved-views-item"
        onAction={() => apply(view)}
      >
        {current()?.id === view.id ? <Check aria-hidden="true" /> : <Bookmark aria-hidden="true" />}
        <span class={cls().itemName}>{view.name}</span>
        <Show when={view.isDefault === true}>
          <span class={cls().star} role="img" aria-label={messages().opensByDefault}>
            <Star aria-hidden="true" />
          </span>
        </Show>
      </DropdownMenuItem>
    );
  }

  function mine(): readonly SavedView[] {
    return (props.views ?? []).filter((view) => view.mine);
  }
  function others(): readonly SavedView[] {
    return (props.views ?? []).filter((view) => !view.mine);
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger>
          <Button
            variant="outline"
            size="sm"
            class={arc(cls().trigger, props.class, props.className)}
            data-slot="saved-views"
            data-edited={edited() ? "" : undefined}
          >
            <Bookmark aria-hidden="true" />
            <span class={cls().name} data-slot="saved-views-name">
              {triggerLabel()}
            </span>
            <ChevronDown aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" aria-label={messages().views}>
          <Show when={mine().length > 0}>
            <DropdownMenuLabel>{messages().yourViews}</DropdownMenuLabel>
            <For each={mine}>{(view: SavedView) => item(view)}</For>
          </Show>
          <Show when={others().length > 0}>
            <DropdownMenuLabel>{messages().sharedViews}</DropdownMenuLabel>
            <For each={others}>{(view: SavedView) => item(view)}</For>
          </Show>
          <Show when={(props.views ?? []).length > 0}>
            <DropdownMenuSeparator />
          </Show>
          <DropdownMenuItem class={cls().item} onAction={() => setDialog("new")}>
            <Save aria-hidden="true" />
            {messages().saveAsView}
          </DropdownMenuItem>
          <Show when={current()}>
            {(view: () => SavedView) => (
              <>
                <Show when={edited() && canEdit(view()) && props.onUpdate !== undefined}>
                  <DropdownMenuItem
                    class={cls().item}
                    onAction={() => void props.onUpdate?.(view(), untrack(state))}
                  >
                    <Save aria-hidden="true" />
                    {messages().updateView(view().name)}
                  </DropdownMenuItem>
                </Show>
                <Show when={canEdit(view()) && props.onRename !== undefined}>
                  <DropdownMenuItem class={cls().item} onAction={() => setDialog("edit")}>
                    <Pencil aria-hidden="true" />
                    {messages().renameView}
                  </DropdownMenuItem>
                </Show>
                <Show when={props.onDefaultChange !== undefined}>
                  <DropdownMenuItem
                    class={cls().item}
                    onAction={() => void props.onDefaultChange?.(view(), view().isDefault !== true)}
                  >
                    <Star aria-hidden="true" />
                    {view().isDefault === true
                      ? messages().stopOpeningOnView
                      : messages().openOnView}
                  </DropdownMenuItem>
                </Show>
                <Show when={param !== undefined}>
                  <DropdownMenuItem class={cls().item} onAction={() => void copyLink(view())}>
                    <Link2 aria-hidden="true" />
                    {messages().copyViewLink}
                  </DropdownMenuItem>
                </Show>
                <Show when={canDelete(view()) && props.onDelete !== undefined}>
                  <DropdownMenuItem
                    class={cls().item}
                    variant="destructive"
                    onAction={() => void remove(view())}
                  >
                    <Trash2 aria-hidden="true" />
                    {messages().deleteView}
                  </DropdownMenuItem>
                </Show>
              </>
            )}
          </Show>
        </DropdownMenuContent>
      </DropdownMenu>
      <Show when={dialog()}>
        {(mode: () => "new" | "edit") => (
          <ViewDialog
            view={mode() === "edit" ? current() : undefined}
            canShare={props.canShare !== false}
            classes={cls()}
            onClose={() => setDialog(null)}
            onSave={async (draft) => {
              const editing = mode() === "edit" ? current() : undefined;
              const saved =
                editing === undefined
                  ? await props.onCreate(draft, untrack(state))
                  : await props.onRename?.(editing, draft);
              setDialog(null);
              if (saved !== undefined) apply(saved);
            }}
          />
        )}
      </Show>
    </>
  );
}

interface ViewDialogProps {
  view: SavedView | undefined;
  canShare: boolean;
  classes: Slots;
  onClose: () => void;
  onSave: (draft: SavedViewDraft) => Promise<void>;
}

function ViewDialog(props: ViewDialogProps) {
  const messages = useArcMessages();
  const view = untrack(() => props.view);
  const [name, setName] = createSignal(view?.name ?? "");
  const [shared, setShared] = createSignal(view?.shared ?? false);
  const [opening, setOpening] = createSignal(view?.isDefault ?? false);
  const [saving, setSaving] = createSignal(false);
  const [failure, setFailure] = createSignal<string | null>(null);
  const nameId = createUniqueId();
  const shareId = createUniqueId();
  const defaultId = createUniqueId();
  const errorId = createUniqueId();

  async function save(): Promise<void> {
    if (name().trim() === "") return;
    setSaving(true);
    setFailure(null);
    try {
      await props.onSave({ name: name().trim(), shared: shared(), isDefault: opening() });
    } catch (error) {
      setFailure(error instanceof Error ? error.message : messages().somethingWentWrong);
    } finally {
      setSaving(false);
    }
  }

  return (
    <ResponsiveOverlay
      heading={view === undefined ? messages().saveView : messages().changeView(view.name)}
      description={
        view === undefined ? messages().saveViewDescription : messages().changeViewDescription
      }
      open
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
      footer={
        <div class={props.classes.actions}>
          <Button variant="outline" onPress={() => props.onClose()}>
            {messages().cancel}
          </Button>
          <Button
            data-slot="saved-views-save"
            isPending={saving()}
            isDisabled={name().trim() === ""}
            onPress={() => void save()}
          >
            {messages().saveView}
          </Button>
        </div>
      }
    >
      <form
        class={props.classes.form}
        data-slot="saved-views-form"
        onSubmit={(event: SubmitEvent) => {
          event.preventDefault();
          void save();
        }}
      >
        <div class={props.classes.field}>
          <label for={nameId}>{messages().viewName}</label>
          <Input
            id={nameId}
            autoComplete="off"
            placeholder={messages().viewNamePlaceholder}
            value={name()}
            aria-invalid={failure() === null ? undefined : true}
            aria-describedby={failure() === null ? undefined : errorId}
            onInput={(event: Event) => {
              setName((event.currentTarget as HTMLInputElement).value);
            }}
          />
          <Show when={failure() !== null}>
            <span class={props.classes.error} id={errorId} role="alert">
              {failure()}
            </span>
          </Show>
        </div>
        <Show when={props.canShare}>
          <div class={props.classes.toggle}>
            <div class={props.classes.field}>
              <label for={shareId}>{messages().shareView}</label>
              <span class={props.classes.hint}>{messages().shareViewHint}</span>
            </div>
            <Switch id={shareId} isSelected={shared()} onChange={(on: boolean) => setShared(on)} />
          </div>
        </Show>
        <Show when={view === undefined}>
          <div class={props.classes.toggle}>
            <div class={props.classes.field}>
              <label for={defaultId}>{messages().openOnView}</label>
              <span class={props.classes.hint}>{messages().openOnViewHint}</span>
            </div>
            <Switch
              id={defaultId}
              isSelected={opening()}
              onChange={(on: boolean) => setOpening(on)}
            />
          </div>
        </Show>
      </form>
    </ResponsiveOverlay>
  );
}
