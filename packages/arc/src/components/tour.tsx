import {
  type Accessor,
  type Child,
  Show,
  createEffect,
  createSignal,
  onCleanup,
  untrack,
} from "@barqjs/core";
import { isServer } from "@barqjs/web";
import { variants } from "@barqjs/css";
import { Dialog, Heading, Popover } from "@barqjs/aria/dialog";
import { useLocale } from "@barqjs/aria/i18n";
import type { Placement } from "@barqjs/aria/overlays";
import { controllable } from "@barqjs/aria/utils";
import { Button } from "@barqjs/ui/button";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import {
  fg,
  gap,
  layout,
  motion,
  place,
  radius,
  rounded,
  space,
  surface,
  type,
  zIndex,
} from "../style/index.ts";
import { useArcMessages } from "./messages.ts";

/** What a step points at: a selector, or a function that finds the element. */
export type TourTarget = string | (() => Element | null);

function find(target: TourTarget): Element | null {
  if (isServer) return null;
  return typeof target === "string" ? document.querySelector(target) : target();
}

/**
 * The element a target names, looked up once the page around it is in the
 * document: a tour is usually written beside what it points at, which does
 * not exist yet while the tour is being built.
 */
function located(target: Accessor<TourTarget>): Accessor<Element | null> {
  const [element, setElement] = createSignal<Element | null>(null, { ownedWrite: true });
  if (!isServer) {
    createEffect(target, (given) => {
      setElement(find(given));
    });
  }
  return element;
}

/**
 * Where an element is on the screen, kept up to date as it moves: as the
 * page scrolls, the window resizes or the element itself changes size.
 */
function trackRect(element: Accessor<Element | null>): Accessor<DOMRect | null> {
  const [rect, setRect] = createSignal<DOMRect | null>(null, { ownedWrite: true });
  if (isServer) return rect;
  createEffect(element, (target) => {
    setRect(target === null ? null : target.getBoundingClientRect());
    if (target === null) return () => {};
    let frame = 0;
    const measure = (): void => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setRect(target.getBoundingClientRect()));
    };
    window.addEventListener("scroll", measure, { capture: true, passive: true });
    window.addEventListener("resize", measure, { passive: true });
    const observer =
      typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(() => measure());
    observer?.observe(target);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", measure, { capture: true });
      window.removeEventListener("resize", measure);
      observer?.disconnect();
    };
  });
  return rect;
}

export const spotlightStyles = variants({
  slots: {
    root: arc(motion.transform, place.floating, {
      pointerEvents: "none",
      borderRadius: radius.md,
      boxShadow: "0 0 0 100vmax var(--overlay)",
      transitionProperty: "top, left, width, height",
    }),
  },
});

export interface SpotlightProps extends Customisable<ReturnType<typeof spotlightStyles>> {
  /** What is lit. */
  target: TourTarget;
  /** Room around it, in pixels. @default 6 */
  padding?: number;
}

/**
 * The page dimmed but for one element, which stays lit and pressable: what a
 * tour points at.
 *
 * ```tsx
 * <Spotlight target="#new-invoice" />
 * ```
 *
 * Drawn, not announced: it is hidden from assistive technology, which hears
 * the coachmark beside it instead. It follows the element as the page
 * scrolls or reflows, and moves without animation under reduced motion.
 */
export function Spotlight(props: SpotlightProps) {
  const element = located(() => props.target);
  const rect = trackRect(element);
  const cls = () => parts(spotlightStyles(), props.classes);
  const box = (): Record<string, string> => {
    const at = rect();
    const pad = props.padding ?? 6;
    if (at === null) return { display: "none" };
    return {
      top: `${String(at.top - pad)}px`,
      left: `${String(at.left - pad)}px`,
      width: `${String(at.width + pad * 2)}px`,
      height: `${String(at.height + pad * 2)}px`,
    };
  };
  return (
    <div
      class={arc(cls().root, props.class, props.className)}
      data-slot="spotlight"
      aria-hidden="true"
      style={box()}
    />
  );
}

export const coachmarkStyles = variants({
  slots: {
    root: arc(surface.elevated, rounded.lg, {
      width: "min(20rem, calc(100vw - 2rem))",
      zIndex: zIndex.toast,
    }),
    dialog: arc(layout.column, gap[2], { padding: space.x4, outline: "none" }),
    title: arc(type.label, layout.flush),
    body: arc(type.body, fg.muted),
    footer: arc(layout.row, gap[2], { paddingBlockStart: space.x2 }),
    progress: arc(type.meta, type.numeric, layout.grow),
    skip: arc({}),
    back: arc({}),
    next: arc({}),
  },
});

type CoachSlots = ReturnType<typeof coachmarkStyles>;

export interface CoachmarkProps extends Customisable<CoachSlots> {
  /** What it points at. */
  target: TourTarget;
  title: Child;
  children?: Child;
  /** @default "bottom" */
  placement?: Placement;
  /** Shown as "2 of 5" when both are given, counted from 1. */
  step?: number;
  total?: number;
  isOpen?: boolean;
  /** Escape, or Skip. */
  onDismiss?: () => void;
  onNext?: () => void;
  onBack?: () => void;
  /** @default the provider's `next`, or `done` on the last step */
  nextLabel?: string;
  /** @default the provider's `skipTour`, "Skip tour" */
  skipLabel?: string;
}

/**
 * A note pointing at one part of the page: what it is, and a way on.
 *
 * ```tsx
 * <Coachmark target="#filters" title="Filters" onDismiss={close} onNext={close}>
 *   Narrow the list to what you need.
 * </Coachmark>
 * ```
 *
 * A dialog beside its target, named by its title: focus moves in when it
 * opens and goes back where it was when it closes, Escape dismisses it, and
 * a press elsewhere on the page does not.
 */
export function Coachmark(props: CoachmarkProps) {
  const messages = useArcMessages();
  const locale = useLocale();
  const element = located(() => props.target);
  const cls = () => parts(coachmarkStyles(), props.classes);
  const last = (): boolean =>
    props.step !== undefined && props.total !== undefined && props.step >= props.total;
  const count = (value: number): string => new Intl.NumberFormat(locale().locale).format(value);
  return (
    <Popover
      class={arc(cls().root, props.class, props.className)}
      data-slot="coachmark"
      triggerRef={element}
      isOpen={(props.isOpen ?? true) && element() !== null}
      placement={props.placement ?? "bottom"}
      isDismissable={false}
      onOpenChange={(open: boolean) => {
        if (!open) props.onDismiss?.();
      }}
    >
      <Dialog class={cls().dialog} data-slot="coachmark-dialog">
        <Heading slot="title" class={cls().title} data-slot="coachmark-title">
          {props.title}
        </Heading>
        <Show when={props.children !== undefined}>
          <div class={cls().body} data-slot="coachmark-body">
            {props.children}
          </div>
        </Show>
        <div class={cls().footer} data-slot="coachmark-footer">
          <span class={cls().progress} data-slot="coachmark-progress">
            {props.step !== undefined && props.total !== undefined
              ? messages().stepOf(count(props.step), count(props.total))
              : ""}
          </span>
          <Show when={props.onDismiss !== undefined && !last()}>
            <Button
              class={cls().skip}
              data-slot="coachmark-skip"
              variant="ghost"
              size="sm"
              onPress={() => props.onDismiss?.()}
            >
              {props.skipLabel ?? messages().skipTour}
            </Button>
          </Show>
          <Show when={props.onBack !== undefined && (props.step ?? 1) > 1}>
            <Button
              class={cls().back}
              data-slot="coachmark-back"
              variant="outline"
              size="sm"
              onPress={() => props.onBack?.()}
            >
              {messages().back}
            </Button>
          </Show>
          <Show when={props.onNext !== undefined}>
            <Button
              class={cls().next}
              data-slot="coachmark-next"
              size="sm"
              autoFocus
              onPress={() => props.onNext?.()}
            >
              {props.nextLabel ?? (last() ? messages().done : messages().next)}
            </Button>
          </Show>
        </div>
      </Dialog>
    </Popover>
  );
}

export interface TourStep {
  target: TourTarget;
  title: Child;
  body?: Child;
  /** @default "bottom" */
  placement?: Placement;
}

export interface TourProps {
  steps: readonly TourStep[];
  /** Whether it is running. */
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** The step shown, from 0. */
  step?: number;
  defaultStep?: number;
  onStepChange?: (step: number) => void;
  /** Done was pressed on the last step. */
  onFinish?: () => void;
  /** Skip, or Escape, before the end. */
  onSkip?: (step: number) => void;
  /** Dim the page but for the step's target. @default true */
  spotlight?: boolean;
  classes?: CoachmarkProps["classes"];
}

/**
 * A guided sequence of coachmarks, each pointing at a part of the page in
 * turn, with the page dimmed around it.
 *
 * ```tsx
 * const progress = useTourProgress("invoices-intro");
 *
 * <Tour
 *   open={!progress.seen()}
 *   steps={[
 *     { target: "#new-invoice", title: "Create an invoice", body: "Start here." },
 *     { target: "#filters", title: "Find one", body: "Filter by status or customer." },
 *   ]}
 *   step={progress.step()}
 *   onStepChange={progress.setStep}
 *   onFinish={progress.complete}
 *   onSkip={progress.dismiss}
 * />
 * ```
 *
 * Next, Back and Skip are buttons; focus moves into each step and Escape
 * skips the rest. Each step's target is scrolled into view, at once under
 * reduced motion, and a step whose target is not on the page is passed by.
 */
export function Tour(props: TourProps) {
  const [isOpen, setOpen] = controllable<boolean>(
    () => props.open,
    () => untrack(() => props.defaultOpen) ?? false,
    (next) => props.onOpenChange?.(next),
  );
  const [step, setStep] = controllable<number>(
    () => props.step,
    () => untrack(() => props.defaultStep) ?? 0,
    (next) => props.onStepChange?.(next),
  );
  const current = (): TourStep | undefined => props.steps[step()];

  const go = (next: number): void => {
    const direction = next >= untrack(step) ? 1 : -1;
    let at = next;
    while (
      at >= 0 &&
      at < props.steps.length &&
      find((props.steps[at] as TourStep).target) === null
    ) {
      at += direction;
    }
    if (at >= props.steps.length) {
      setOpen(false);
      props.onFinish?.();
      return;
    }
    if (at < 0) return;
    setStep(at);
    const target = find((props.steps[at] as TourStep).target);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target?.scrollIntoView?.({ block: "center", behavior: reduced ? "auto" : "smooth" });
  };

  const finish = (): void => {
    setOpen(false);
    props.onFinish?.();
  };
  const skip = (): void => {
    setOpen(false);
    props.onSkip?.(untrack(step));
  };

  return (
    <Show when={isOpen() && current() !== undefined}>
      <Show when={props.spotlight !== false}>
        <Spotlight target={(current() as TourStep).target} />
      </Show>
      <Coachmark
        target={(current() as TourStep).target}
        title={(current() as TourStep).title}
        placement={(current() as TourStep).placement}
        step={step() + 1}
        total={props.steps.length}
        classes={props.classes}
        onDismiss={skip}
        onBack={() => go(untrack(step) - 1)}
        onNext={() => (untrack(step) + 1 >= props.steps.length ? finish() : go(untrack(step) + 1))}
      >
        {(current() as TourStep).body}
      </Coachmark>
    </Show>
  );
}

export interface TourProgress {
  /** Finished or skipped: do not show it again. */
  seen: Accessor<boolean>;
  status: Accessor<"new" | "started" | "completed" | "dismissed">;
  /** Where it was left, to resume from. */
  step: Accessor<number>;
  setStep: (step: number) => void;
  complete: () => void;
  dismiss: () => void;
  /** Forget it, to show it again. */
  reset: () => void;
}

interface Stored {
  status: TourProgress["status"] extends Accessor<infer S> ? S : never;
  step: number;
}

/**
 * Whether a tour was seen and where it was left, kept in `localStorage`
 * under `arc-tour:<key>` (or the `storage` given), so it is shown once and a
 * reload resumes it. On a server it reads as new.
 */
export function useTourProgress(key: string, storage?: Storage): TourProgress {
  const store = (): Storage | undefined =>
    storage ?? (isServer || typeof localStorage === "undefined" ? undefined : localStorage);
  const name = `arc-tour:${key}`;
  const read = (): Stored => {
    try {
      const raw = store()?.getItem(name);
      if (raw !== null && raw !== undefined) return JSON.parse(raw) as Stored;
    } catch {
      // A value written by something else, or storage refused: start again.
    }
    return { status: "new", step: 0 };
  };
  const [state, setState] = createSignal<Stored>(read());
  const write = (next: Stored): void => {
    setState(next);
    try {
      store()?.setItem(name, JSON.stringify(next));
    } catch {
      // Private mode or a full store: the tour is still right for this visit.
    }
  };
  const onStorage = (event: StorageEvent): void => {
    if (event.key === name) setState(read());
  };
  if (!isServer && typeof window !== "undefined") {
    window.addEventListener("storage", onStorage);
    onCleanup(() => window.removeEventListener("storage", onStorage));
  }
  return {
    seen: () => state().status === "completed" || state().status === "dismissed",
    status: () => state().status,
    step: () => state().step,
    setStep: (step) => write({ status: "started", step }),
    complete: () => write({ status: "completed", step: untrack(state).step }),
    dismiss: () => write({ status: "dismissed", step: untrack(state).step }),
    reset: () => {
      setState({ status: "new", step: 0 });
      try {
        store()?.removeItem(name);
      } catch {
        // Nothing to forget.
      }
    },
  };
}
