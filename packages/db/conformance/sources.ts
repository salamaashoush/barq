/**
 * The controlled source Collections the drivers hand the suite.
 *
 * Upstream drivers build these with `mockSyncCollectionOptions` from
 * `packages/db/tests/utils.ts`, which imports TanStack DB's source tree, a
 * second copy of the library beside the published one this adapter runs on.
 * These are the same sources through the public API, so every Collection the
 * suite sees comes from the adapter's own `@tanstack/db`.
 */

import {
  BTreeIndex,
  type CollectionConfig,
  type IndexConstructor,
  type SyncConfig,
  createCollection,
  withCollectionConfigFactory,
} from "@tanstack/db";

type Params<T extends object> = Parameters<SyncConfig<T>["sync"]>[0];

export interface SyncControls<T extends object> {
  begin: Params<T>["begin"];
  write: Params<T>["write"];
  commit: Params<T>["commit"];
  markReady: Params<T>["markReady"];
  truncate: Params<T>["truncate"];
}

interface SourceConfig<T extends object> {
  id: string;
  getKey: (row: T) => string | number;
  initialData?: ReadonlyArray<T>;
  rowUpdateMode?: "full";
  autoIndex?: "off" | "eager";
  defaultIndexType?: IndexConstructor;
  syncMode?: "eager" | "on-demand";
}

export interface ControlledUtils<T extends object> {
  utils: SyncControls<T>;
}

/**
 * A source whose sync the caller drives. With `initialData` it writes those
 * rows and is ready as soon as it starts; without, it starts `loading` and
 * waits for `markReady`.
 */
export function controlledOptions<T extends object>(
  config: SourceConfig<T>,
): CollectionConfig<T> & ControlledUtils<T> {
  let params: Params<T> | undefined;
  function live(): Params<T> {
    if (params === undefined) throw new Error(`source ${config.id} has not started its sync`);
    return params;
  }
  const utils: SyncControls<T> = {
    begin: () => live().begin(),
    write: (message) => live().write(message),
    commit: () => live().commit(),
    markReady: () => live().markReady(),
    truncate: () => live().truncate(),
  };
  const ready = config.initialData !== undefined;
  const options = {
    id: config.id,
    getKey: config.getKey,
    sync: {
      rowUpdateMode: config.rowUpdateMode,
      sync: (started: Params<T>) => {
        params = started;
        if (!ready) return;
        started.begin();
        for (const value of config.initialData ?? []) started.write({ type: "insert", value });
        void started.commit();
        started.markReady();
      },
    },
    ...(config.syncMode === undefined ? {} : { syncMode: config.syncMode }),
    startSync: ready,
    // A local write waits for nothing: the suite confirms through sync writes.
    onInsert: async () => {},
    onUpdate: async () => {},
    onDelete: async () => {},
    utils,
    autoIndex: config.autoIndex,
    defaultIndexType:
      config.defaultIndexType ?? (config.autoIndex === "eager" ? BTreeIndex : undefined),
  } as CollectionConfig<T> & ControlledUtils<T>;
  return withCollectionConfigFactory(options, () => controlledOptions(config));
}

export function controlledCollection<T extends object>(config: SourceConfig<T>) {
  return createCollection(controlledOptions(config));
}
