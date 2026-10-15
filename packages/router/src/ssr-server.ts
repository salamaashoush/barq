/**
 * The server half of {@link ServerSsr}: what one page render injects into its
 * own response, and the dehydrated payload among it.
 *
 * Apart from `ssr.ts` because encoding needs `@barqjs/server`, and that module
 * is reachable from a browser bundle.
 */

import { createSeedEncoder } from "@barqjs/server/codec";

import type { RouterState } from "./router.ts";
import { ROUTER_DEHYDRATED_GLOBAL, type ServerSsr } from "./ssr.ts";

/** How long a render waits for a dehydrated value that is still settling. */
const SETTLE_TIMEOUT = 5_000;

export interface RenderChannel {
  readonly serverSsr: ServerSsr;
  /** The scripts injected since this was last asked, as markup. */
  drain(): string;
  /** Resolves when {@link drain} has something to answer with. */
  waiting(): Promise<void>;
  /**
   * Run the router's `dehydrate` and inject what it returned.
   *
   * `after` is what it waits for first: the loaders of a streamed page, which
   * settle once the shell has gone.
   */
  dehydrate(state: RouterState, after?: Promise<void>): void;
  /** The render has produced its last byte: tell whoever asked to be told. */
  renderFinished(): void;
  /**
   * Resolves when the payload, and everything it left pending, has been
   * injected or given up on.
   */
  written(): Promise<void>;
}

export function createRenderChannel(nonce?: string): RenderChannel {
  const attr = nonce === undefined ? "" : ` nonce="${nonce}"`;
  const scripts: string[] = [];
  const listeners: (() => void)[] = [];
  let finished = false;
  let wake: (() => void) | null = null;
  let written: Promise<void> = Promise.resolve();

  const injectScript = (script: string): void => {
    scripts.push(`<script${attr}>${script}</script>`);
    const waiter = wake;
    wake = null;
    waiter?.();
  };

  const queued = (body: string): string =>
    `(window.${ROUTER_DEHYDRATED_GLOBAL}=window.${ROUTER_DEHYDRATED_GLOBAL}||[]).push(function(){${body}})`;

  const carry = async (value: unknown): Promise<void> => {
    if (value === undefined) return;
    const encoder = createSeedEncoder();
    await new Promise<void>((settled) => {
      // The deferred form always: a payload may hold a promise or an async
      // iterable, and what either settles on arrives as a later statement.
      const initial = encoder.encodeDeferred(
        { value },
        (statement) => injectScript(queued(statement)),
        settled,
      );
      // The reference table is defined at parse time; the payload is rebuilt
      // when the client asks, after its serialization adapters are registered.
      injectScript(`${encoder.header};${queued(`return ${initial}.value`)}`);
    });
  };

  return {
    serverSsr: {
      injectScript,
      onRenderFinished(listener) {
        if (finished) listener();
        else listeners.push(listener);
      },
    },
    drain: () => scripts.splice(0, scripts.length).join(""),
    waiting() {
      if (scripts.length > 0) return Promise.resolve();
      return new Promise<void>((resolve) => {
        wake = resolve;
      });
    },
    dehydrate(state, after = Promise.resolve()) {
      const run = state.options.dehydrate;
      if (run === undefined) return;
      written = after
        .then(run)
        .then(carry)
        .catch((error: unknown) => console.error(error));
    },
    renderFinished() {
      finished = true;
      for (const listener of listeners.splice(0, listeners.length)) listener();
    },
    async written() {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const deadline = new Promise<void>((resolve) => {
        timer = setTimeout(resolve, SETTLE_TIMEOUT);
        (timer as { unref?: () => void }).unref?.();
      });
      await Promise.race([written, deadline]);
      clearTimeout(timer);
    },
  };
}
