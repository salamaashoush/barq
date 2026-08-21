// What routes.rs emits. It knows the SPECIFIER and nothing else about the file;
// TypeScript does the inference. Every arm FAILS CLOSED — an unreadable shape
// resolves to `never`, never to a permissive record, because a wrong type that
// admits anything is worse than no type at all.
type StandardOut<R> = R extends { value: infer S } ? S : never;

type ValidatedBy<V> = V extends { "~standard": { validate: (value: never) => infer R } }
  ? StandardOut<Awaited<R>>
  : V extends { parse: (input: never) => infer S }
    ? S
    : V extends (input: never) => infer S
      ? S
      : never;

type SearchOf<M> = M extends { validateSearch: infer V }
  ? ValidatedBy<V>
  : Record<string, unknown>;

type DataOf<M> = M extends { loader: infer L }
  ? L extends (...args: never) => infer R
    ? Awaited<R>
    : never
  : undefined;

export interface RouteData {
  "/a/$id": { search: SearchOf<typeof import("./route-a.ts")>; data: DataOf<typeof import("./route-a.ts")> };
  "/b": { search: SearchOf<typeof import("./route-b.ts")>; data: DataOf<typeof import("./route-b.ts")> };
  "/std": { search: SearchOf<typeof import("./route-std.ts")>; data: DataOf<typeof import("./route-std.ts")> };
  "/parseobj": { search: SearchOf<typeof import("./route-parse.ts")>; data: DataOf<typeof import("./route-parse.ts")> };
}
