import { For, type JSXElement, Match, Show, Switch, createSignal, onCleanup } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { Button } from "@barqjs/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@barqjs/ui/dialog";
import { Skeleton } from "@barqjs/ui/skeleton";
import { srOnly } from "@barqjs/ui/sr-only";
import { isServer } from "@barqjs/web";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { gap, layout, space } from "../style/index.ts";
import { maybeRouter } from "./link.ts";
import { useArcMessages } from "./messages.ts";
import { serverMessage } from "./server-message.ts";

/** How a modal ends: with its result, or dismissed with none. */
export interface ModalControl<Result> {
  /** Whether it is open; false while it animates out, before the host lets it go. */
  isOpen: () => boolean;
  /** For the overlay's own `onOpenChange`: Escape, the backdrop and its close button dismiss through it. */
  onOpenChange: (open: boolean) => void;
  /** Close it with a result, which `openModal` resolves with. */
  resolve: (result: Result) => void;
  /** Close it with no result. */
  dismiss: () => void;
}

/** The prop the host hands a modal beside its own. */
export interface ModalOwnProps<Result> {
  modal: ModalControl<Result>;
}

/** What a modal component resolves with. */
export type ModalResult<P> = P extends ModalOwnProps<infer Result> ? Result : never;

/** The props a modal is opened with: its component's, less `modal`. */
export type ModalOpenProps<P> = Omit<P, "modal">;

export interface ModalOptions {
  /**
   * Stays open when the page changes under it, such as a recording that goes
   * on while the reader looks elsewhere. Every other modal is dismissed once
   * the path changes, since what it was opened about is no longer on screen.
   */
  keepOnNavigation?: boolean;
}

type ModalComponent<P> = (props: P) => JSXElement;

/** A modal the host can open: its id, and how its component is fetched. */
export interface ModalDefinition<P extends ModalOwnProps<never>> {
  readonly id: string;
  readonly load: () => Promise<ModalComponent<P>>;
  readonly keepOnNavigation: boolean;
}

/**
 * Names a modal and how its component is fetched, the first time it is
 * opened or preloaded, so a page carries none of its code until then.
 *
 * ```ts
 * export const inviteModal = defineModal("invite", () =>
 *   import("./invite-modal.tsx").then((module) => module.InviteModal),
 * );
 * ```
 *
 * The component takes its own props and `modal`, whose `resolve` gives the
 * result, and draws its own overlay: a `ResponsiveOverlay`, a `Tearsheet`,
 * a ui `Dialog`, each opened by `modal.isOpen()` and closed through
 * `modal.onOpenChange`.
 */
export function defineModal<P extends ModalOwnProps<never>>(
  id: string,
  load: () => Promise<ModalComponent<P>>,
  options: ModalOptions = {},
): ModalDefinition<P> {
  return { id, load, keepOnNavigation: options.keepOnNavigation === true };
}

type Loader = () => Promise<ModalComponent<never>>;

type Loaded =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly component: ModalComponent<ModalOwnProps<unknown>> }
  | { readonly status: "failed"; readonly error: unknown };

interface Entry {
  readonly key: number;
  readonly id: string;
  readonly load: Loader;
  readonly keepOnNavigation: boolean;
  readonly props: object;
  readonly result: Promise<unknown>;
  readonly settle: (result: unknown) => void;
  readonly open: () => boolean;
  readonly setOpen: (open: boolean) => void;
  closed: boolean;
}

// Plain values are what the functions here read, since a write to a signal
// is not read back until the scheduler flushes; the signals are what the
// host draws from.
let entries: readonly Entry[] = [];
const fetched = new Map<Loader, Loaded>();
const [stack, setStack] = createSignal<readonly Entry[]>([]);
const [fetches, setFetches] = createSignal(0);
let nextKey = 1;

// Long enough that its exit animation has finished before the modal is let go.
const RELEASE_AFTER_MS = 1000;
// Long enough that a modal fetched quickly appears without a loading dialog
// flashing before it.
const LOADING_DELAY_MS = 150;

function changed(next: readonly Entry[]): void {
  entries = next;
  setStack(next);
}

function record(load: Loader, state: Loaded): void {
  fetched.set(load, state);
  setFetches((count) => count + 1);
}

function loadedOf(load: Loader): Loaded | undefined {
  fetches();
  return fetched.get(load);
}

function fetchModal(load: Loader): void {
  const known = fetched.get(load);
  if (known !== undefined && known.status !== "failed") return;
  record(load, { status: "loading" });
  load().then(
    (component) => {
      record(load, {
        status: "ready",
        component: component as ModalComponent<ModalOwnProps<unknown>>,
      });
    },
    (error: unknown) => record(load, { status: "failed", error }),
  );
}

function finish(entry: Entry, result: unknown): void {
  if (entry.closed) return;
  entry.closed = true;
  entry.settle(result);
  entry.setOpen(false);
  setTimeout(() => changed(entries.filter((each) => each !== entry)), RELEASE_AFTER_MS);
}

function push(definition: ModalDefinition<never>, props: object): Promise<unknown> {
  fetchModal(definition.load);
  const { promise, resolve } = Promise.withResolvers<unknown>();
  const [open, setOpen] = createSignal(true);
  const entry: Entry = {
    key: nextKey++,
    id: definition.id,
    load: definition.load,
    keepOnNavigation: definition.keepOnNavigation,
    props,
    result: promise,
    settle: resolve,
    open,
    setOpen,
    closed: false,
  };
  changed([...entries, entry]);
  return promise;
}

/**
 * Opens a modal from anywhere: a handler, a menu, what a loader does next.
 * Resolves with its result, or `undefined` when it is dismissed or the page
 * changes under it. Opening the modal already on top joins it rather than
 * stacking a second, so a double click opens one. On the server nothing
 * opens. Needs a `<ModalHost />`, which `<ArcProvider>` renders.
 *
 * ```ts
 * const invited = await openModal(inviteModal, { team: "Platform" });
 * if (invited !== undefined) toast.success(`Invited ${invited.email}`);
 * ```
 */
export function openModal<P extends ModalOwnProps<never>>(
  modal: ModalDefinition<P>,
  props: ModalOpenProps<P>,
): Promise<ModalResult<P> | undefined> {
  if (isServer) return Promise.resolve(undefined);
  const top = entries.findLast((entry) => !entry.closed);
  const result = top !== undefined && top.id === modal.id ? top.result : push(modal, props);
  return result as Promise<ModalResult<P> | undefined>;
}

/** Fetches a modal's component before it is opened: on hover or focus of what opens it. */
export function preloadModal(modal: ModalDefinition<never>): void {
  if (isServer) return;
  fetchModal(modal.load);
}

/** Dismisses every open modal. */
export function closeModals(): void {
  for (const entry of entries) finish(entry, undefined);
}

export const modalHostStyles = variants({
  slots: {
    loading: arc(layout.column, gap[3], { paddingInlineEnd: space.x8 }),
    barTitle: arc({ height: space.x5, width: "40%" }),
    barLong: arc({ height: space.x4, width: "100%" }),
    barShort: arc({ height: space.x4, width: "60%" }),
    failed: arc({}),
  },
});

type Slots = ReturnType<typeof modalHostStyles>;

export type ModalHostProps = Customisable<Slots>;

interface OpenEntryProps {
  entry: Entry;
  cls: Slots;
}

function controlOf(entry: Entry): ModalControl<unknown> {
  return {
    isOpen: entry.open,
    onOpenChange: (open) => {
      if (!open) finish(entry, undefined);
    },
    resolve: (result) => finish(entry, result),
    dismiss: () => finish(entry, undefined),
  };
}

function ModalLoading(props: OpenEntryProps) {
  const messages = useArcMessages();
  const control = controlOf(props.entry);
  const [shown, setShown] = createSignal(false, { ownedWrite: true });
  const timer = setTimeout(() => setShown(true), LOADING_DELAY_MS);
  onCleanup(() => clearTimeout(timer));
  return (
    <Show when={shown()}>
      <Dialog isOpen={control.isOpen()} onOpenChange={control.onOpenChange}>
        <DialogContent closeLabel={messages().close}>
          <DialogTitle class={srOnly}>{messages().loading}</DialogTitle>
          <div class={props.cls.loading} data-slot="modal-loading" aria-busy="true">
            <Skeleton class={props.cls.barTitle} />
            <Skeleton class={props.cls.barLong} />
            <Skeleton class={props.cls.barShort} />
          </div>
        </DialogContent>
      </Dialog>
    </Show>
  );
}

interface ModalFailedProps extends OpenEntryProps {
  error: unknown;
}

function ModalFailed(props: ModalFailedProps) {
  const messages = useArcMessages();
  const control = controlOf(props.entry);
  return (
    <Dialog isOpen={control.isOpen()} onOpenChange={control.onOpenChange}>
      <DialogContent
        class={props.cls.failed}
        data-slot="modal-failed"
        closeLabel={messages().close}
      >
        <DialogHeader>
          <DialogTitle>{messages().modalFailed}</DialogTitle>
          <DialogDescription>
            {serverMessage(props.error, messages().somethingWentWrong)}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onPress={control.dismiss}>
            {messages().close}
          </Button>
          <Button onPress={() => fetchModal(props.entry.load)}>{messages().retry}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface RenderedProps {
  entry: Entry;
  component: ModalComponent<ModalOwnProps<unknown>>;
}

function Rendered(props: RenderedProps) {
  const Component = props.component;
  return <Component {...props.entry.props} modal={controlOf(props.entry)} />;
}

function OpenEntry(props: OpenEntryProps) {
  function loaded(): Loaded | undefined {
    return loadedOf(props.entry.load);
  }
  function component(): ModalComponent<ModalOwnProps<unknown>> | undefined {
    const state = loaded();
    return state?.status === "ready" ? state.component : undefined;
  }
  function failure(): unknown {
    const state = loaded();
    return state?.status === "failed" ? state.error : undefined;
  }
  return (
    <Switch fallback={<ModalLoading entry={props.entry} cls={props.cls} />}>
      <Match when={component() !== undefined}>
        <Rendered
          entry={props.entry}
          component={component() as ModalComponent<ModalOwnProps<unknown>>}
        />
      </Match>
      <Match when={loaded()?.status === "failed"}>
        <ModalFailed entry={props.entry} cls={props.cls} error={failure()} />
      </Match>
    </Switch>
  );
}

/**
 * Draws the open modals, the latest on top, and dismisses them when the
 * page's path changes under them. One per app, inside the router and arc's
 * provider; `<ArcProvider>` renders it.
 */
export function ModalHost(props: ModalHostProps) {
  function cls(): Slots {
    return parts(modalHostStyles(), props.classes);
  }
  const router = maybeRouter();
  if (router !== undefined && !isServer) {
    const off = router.subscribe("onBeforeNavigate", (event) => {
      if (!event.pathChanged) return;
      for (const entry of entries) if (!entry.keepOnNavigation) finish(entry, undefined);
    });
    onCleanup(off);
  }
  // A host leaving the page answers what it was showing.
  onCleanup(() => {
    for (const entry of entries) entry.settle(undefined);
  });
  return <For each={stack()}>{(entry: Entry) => <OpenEntry entry={entry} cls={cls()} />}</For>;
}
