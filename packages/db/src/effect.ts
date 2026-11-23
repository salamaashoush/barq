import { createRenderEffect, runWithOwner } from "@barqjs/core";
import { isServer } from "@barqjs/web";
import { type EffectConfig, createEffect, prepareLiveQueryValue } from "@tanstack/db";

import { useOptionalDbClient } from "./client.ts";

/**
 * Run callbacks as rows enter, update in and leave a live query's result,
 * for as long as the calling scope lives. Nothing renders from it: it is for
 * side effects such as notifications or analytics.
 *
 * `config` may be an accessor; a signal it reads, or that its query callback
 * reads, disposes the running effect and starts a new one. It never runs on
 * the server.
 */
export function useLiveQueryEffect<
  TRow extends object = Record<string, unknown>,
  TKey extends string | number = string | number,
>(config: EffectConfig<TRow, TKey> | (() => EffectConfig<TRow, TKey>)): void {
  const client = useOptionalDbClient();
  createRenderEffect(
    () => {
      if (isServer) return undefined;
      const current = typeof config === "function" ? config() : config;
      return { current, query: prepareLiveQueryValue(current.query, client) };
    },
    (next) => {
      if (next === undefined) return undefined;
      const { current, query } = next;
      // The first rows enter synchronously, and a callback's writes are its own.
      const effect = runWithOwner(null, () =>
        createEffect<TRow, TKey>({ ...current, query: query as EffectConfig<TRow, TKey>["query"] }),
      );
      return () => {
        void effect.dispose().catch((error: unknown) => {
          console.error("[barq] useLiveQueryEffect failed to dispose its effect:", error);
        });
      };
    },
  );
}
