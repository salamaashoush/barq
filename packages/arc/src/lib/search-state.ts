import { type Accessor, createEffect, createSignal, onCleanup, untrack } from "@barqjs/core";
import { isServer } from "@barqjs/web";
import { controllable } from "@barqjs/aria/utils";
import { useSearchParams } from "@barqjs/router";

export type Url = ReturnType<typeof useSearchParams>;

/** The search parameters as a record, less the ones named. */
export function withoutParams(
  current: Iterable<[string, string]>,
  removed: ReadonlySet<string>,
): Record<string, string> {
  const kept: Record<string, string> = {};
  for (const [key, value] of current) if (!removed.has(key)) kept[key] = value;
  return kept;
}

/** A value that is the caller's, the component's own, or a search parameter's. */
export interface Bound<T> {
  read: () => T;
  write: (next: T) => void;
  /** The search parameter it lives in, when it does. */
  param: string | undefined;
}

interface Boxed<T> {
  value: T;
}

/**
 * State held in one of three places: a search parameter when the component was
 * given one (so it has a link and survives a reload), else the caller's value
 * when it passes one, else the component's own.
 */
export function bound<T>(
  url: Url | undefined,
  param: string | undefined,
  given: () => T | undefined,
  initial: T,
  parse: (raw: string | null) => T,
  format: (value: T) => string,
  notify: (value: T) => void,
): Bound<T> {
  const [own, setOwn] = createSignal<Boxed<T>>({ value: initial });
  return {
    param: url === undefined ? undefined : param,
    read: () => {
      if (url !== undefined && param !== undefined) return parse(url[0]().get(param));
      return given() ?? own().value;
    },
    write: (next) => {
      if (url !== undefined && param !== undefined) {
        url[1]((current) => ({ ...withoutParams(current, new Set()), [param]: format(next) }));
      } else if (given() === undefined) {
        setOwn({ value: next });
      }
      notify(next);
    },
  };
}

export interface OpenOptions {
  /** Read once: the search parameter whose presence means open. */
  param: string | undefined;
  /** Read once: parameters a link set beside `param`, taken out with it on closing. */
  also?: readonly string[];
  open: () => boolean | undefined;
  defaultOpen: boolean | undefined;
  onOpenChange: (open: boolean) => void;
}

export interface OpenState {
  isOpen: () => boolean;
  setOpen: (next: boolean) => void;
}

/**
 * Whether a sheet or a dialog is open: the URL's, the caller's or its own.
 * Under a search parameter it opens for the parameter, which a link sets, or
 * for its own trigger, which leaves the URL alone. Closing takes the
 * parameter out, and `also` with it, with a replace, so the back button is
 * not handed a step that only closed something and a reload does not open it
 * again.
 */
export function openState(options: OpenOptions): OpenState {
  const param = options.param;
  const url = param === undefined ? undefined : useSearchParams();
  if (url !== undefined && param !== undefined) {
    const dropped = new Set([param, ...(options.also ?? [])]);
    const [own, setOwn] = controllable(options.open, () => options.defaultOpen ?? false);
    return {
      isOpen: () => url[0]().has(param) || own(),
      setOpen: (next) => {
        // A dialog that navigated away on success closes on a page without
        // the parameter, where taking it out would navigate back.
        if (!next && untrack(url[0]).has(param)) {
          url[1]((current) => withoutParams(current, dropped));
        }
        setOwn(next);
        options.onOpenChange(next);
      },
    };
  }
  const [isOpen, setOpen] = controllable(
    options.open,
    () => options.defaultOpen ?? false,
    options.onOpenChange,
  );
  return { isOpen, setOpen: (next) => setOpen(next) };
}

/**
 * A dialog's open state kept in a search parameter, for any overlay of ui's
 * or the app's own: a link to `?create` opens it, its trigger opens it
 * without one, and closing takes the parameter, and `also`, out of the URL.
 *
 * ```tsx
 * const create = useOpenParam("create", ["preset"]);
 * <Dialog isOpen={create.isOpen()} onOpenChange={create.setOpen}>…</Dialog>
 * ```
 */
export function useOpenParam(param: string, also: readonly string[] = []): OpenState {
  return openState({
    param,
    also,
    open: () => undefined,
    defaultOpen: false,
    onOpenChange: () => {},
  });
}

export interface SearchParamOptions<T> {
  /**
   * What the control holds while the address names nothing. The address never
   * holds it: choosing it takes the parameter out, so a link stays short.
   */
  defaultValue: T;
  /**
   * The value a parameter's text holds, or `undefined` for text this control
   * does not accept, which falls back to `defaultValue` rather than failing.
   * @default the text itself
   */
  parse?: (raw: string) => T | undefined;
  /** @default `String(value)` */
  format?: (value: T) => string;
  /**
   * Milliseconds the address waits after the last change: for a search field,
   * which shows each keystroke at once and writes the address once typing
   * pauses. A change to the parameter from elsewhere (Clear, a saved view, the
   * back button) replaces what was being typed.
   */
  debounce?: number;
}

export interface SearchParamState<T> {
  /** What the control shows: the typed value while it waits, else the address's. */
  value: Accessor<T>;
  setValue: (next: T) => void;
  /** Writes a waiting value now. */
  commit: () => void;
}

interface Draft<T> {
  value: T;
  /** The parameter's text when typing started, so a change from elsewhere is told apart. */
  from: string | null;
  /** The text this draft writes, `null` for the default. */
  to: string | null;
}

/**
 * State any control keeps in one search parameter, so it has a link, survives
 * a reload and comes back with the back button: a segmented filter, a time
 * window, a checkbox, an open sheet, a playhead.
 *
 * ```tsx
 * const window = useSearchParam("window", { defaultValue: "24h", parse: oneOf(WINDOWS) });
 * <SegmentedControl value={window.value()} onChange={window.setValue} items={…} />
 * ```
 *
 * Writes go through the router's `useSearchParams`, which replaces the entry
 * rather than adding one and keeps every other parameter.
 */
export function useSearchParam<T>(
  key: string,
  options: SearchParamOptions<T>,
): SearchParamState<T> {
  const url = useSearchParams();
  const parse = options.parse ?? ((text: string) => text as unknown as T);
  const format = options.format ?? ((value: T) => String(value));
  const [draft, setDraft] = createSignal<Draft<T> | null>(null, { ownedWrite: true });
  let timer: ReturnType<typeof setTimeout> | undefined;

  function raw(): string | null {
    return url[0]().get(key);
  }
  function read(): T {
    const text = raw();
    if (text === null) return options.defaultValue;
    return parse(text) ?? options.defaultValue;
  }
  function textOf(value: T): string | null {
    const text = format(value);
    return text === format(options.defaultValue) || text === "" ? null : text;
  }
  function write(text: string | null): void {
    url[1]((current) => {
      const kept = withoutParams(current, new Set([key]));
      if (text !== null) kept[key] = text;
      return kept;
    });
  }
  function stop(): void {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  }
  function commit(): void {
    const held = untrack(draft);
    stop();
    if (held !== null) write(held.to);
  }

  if (options.debounce !== undefined && !isServer) {
    createEffect(raw, (text) => {
      const held = untrack(draft);
      if (held === null) return;
      if (text === held.to && timer === undefined) setDraft(null);
      else if (text !== held.from && text !== held.to) {
        stop();
        setDraft(null);
      }
    });
    onCleanup(stop);
  }

  return {
    value: () => draft()?.value ?? read(),
    setValue(next) {
      const to = textOf(next);
      if (options.debounce === undefined) {
        write(to);
        return;
      }
      const held = untrack(draft);
      setDraft({ value: next, from: held?.from ?? untrack(raw), to });
      stop();
      timer = setTimeout(() => {
        timer = undefined;
        write(to);
      }, options.debounce);
    },
    commit,
  };
}

/** A `parse` that accepts only the listed values. */
export function oneOf<T extends string>(values: readonly T[]): (raw: string) => T | undefined {
  return (raw) => values.find((value) => value === raw);
}
