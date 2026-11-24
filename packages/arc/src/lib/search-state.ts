import { createSignal } from "@barqjs/core";
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
  const [own, setOwn] = createSignal<{ value: T }>({ value: initial });
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
  open: () => boolean | undefined;
  defaultOpen: boolean | undefined;
  onOpenChange: (open: boolean) => void;
}

/**
 * Whether a sheet is open: the URL's, the caller's or its own. Under a search
 * parameter, closing takes the parameter out with a replace, so the back
 * button is not handed a step that only closed something.
 */
export function openState(options: OpenOptions): {
  isOpen: () => boolean;
  setOpen: (next: boolean) => void;
} {
  const param = options.param;
  const url = param === undefined ? undefined : useSearchParams();
  if (url !== undefined && param !== undefined) {
    return {
      isOpen: () => url[0]().has(param),
      setOpen: (next) => {
        if (!next) url[1]((current) => withoutParams(current, new Set([param])));
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
