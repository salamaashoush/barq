import { type Accessor, isServer, signal } from "@barqjs/core";
import { on } from "./event.ts";
import { type MaybeAccessor, access, shared } from "./utils.ts";

/** Whatever element is currently fullscreen, or `null`. */
export const fullscreenElement: () => Accessor<Element | null> = shared(() => {
  const current = signal<Element | null>(isServer ? null : (document.fullscreenElement ?? null));
  if (isServer) return current;
  const read = () => current.set(document.fullscreenElement ?? null);
  on(document, "fullscreenchange", read);
  // Firefox and Safari still fire only their prefixed events on older builds,
  // and a missing listener is invisible: the state simply never updates.
  on(document, ["webkitfullscreenchange", "mozfullscreenchange"] as never, read);
  return current;
});

export interface Fullscreen {
  /** Whether the target — or the document, without one — is fullscreen. */
  active: Accessor<boolean>;
  /** Request fullscreen. Needs a user gesture; rejects without one. */
  enter: (options?: FullscreenOptions) => Promise<void>;
  exit: () => Promise<void>;
  toggle: () => Promise<void>;
  /** Whether the API exists at all here. */
  supported: boolean;
}

/**
 * Fullscreen for an element, or for the page.
 *
 * `active` follows the document rather than the promise, so it is right when
 * the user leaves fullscreen with Escape — which no promise ever resolves for,
 * and which is how most people leave it.
 */
export function fullscreen(target?: MaybeAccessor<Element | null | undefined>): Fullscreen {
  const current = fullscreenElement();
  const supported = !isServer && typeof document.exitFullscreen === "function";

  const element = (): Element | null => {
    if (target === undefined) return isServer ? null : document.documentElement;
    return access(target) ?? null;
  };

  const active = () => {
    const showing = current();
    if (showing === null) return false;
    const wanted = element();
    return wanted === null ? false : showing === wanted;
  };

  const enter = async (options?: FullscreenOptions): Promise<void> => {
    const wanted = element();
    if (wanted === null) throw new Error("[barq] there is no element to make fullscreen");
    await wanted.requestFullscreen(options);
  };

  const exit = async (): Promise<void> => {
    if (isServer || document.fullscreenElement === null) return;
    await document.exitFullscreen();
  };

  return {
    active,
    enter,
    exit,
    toggle: async () => (active() ? exit() : enter()),
    supported,
  };
}
