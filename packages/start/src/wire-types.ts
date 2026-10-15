/**
 * What can cross the wire, as types: the check `createServerFn` runs on a
 * handler's result and a validator's input, so a value the codec would refuse
 * at runtime is a type error where it is written.
 *
 * The codec is seroval with `RegExp` refused and errors redacted
 * (`@barqjs/server/codec`). It carries primitives, `bigint`, `undefined`,
 * `Date`, `Error`, `Map`, `Set`, `Promise`, typed arrays, `ArrayBuffer`, arrays
 * and plain objects, and throws on a function, a symbol, a `RegExp`, a `URL`, a
 * `Blob` and an instance of a class it was not given an adapter for.
 *
 * A class instance whose type has no methods is structurally a plain object,
 * and no type can tell the two apart, so that one is caught at runtime only.
 * The same is true of a class a `createSerializationAdapter` carries: its type
 * has methods, so it is a type error here, and `strict: { output: false }` is
 * how a function that returns one says the adapter is there.
 */

type Leaf =
  | string
  | number
  | boolean
  | bigint
  | null
  | undefined
  | void
  | Date
  | Error
  | ArrayBuffer
  | ArrayBufferView;

/** Classes the codec refuses whose types would otherwise be read member by member. */
type Refused =
  | readonly [RegExp, "a RegExp"]
  | readonly [URL, "a URL"]
  | readonly [URLSearchParams, "a URLSearchParams"]
  | readonly [Blob, "a Blob"]
  | readonly [Headers, "a Headers"]
  | readonly [Request, "a Request"]
  | readonly [Response, "a Response, which crosses only as the whole result"]
  | readonly [ReadableStream, "a stream, which crosses only as the whole result"]
  | readonly [WeakMap<object, unknown>, "a WeakMap"]
  | readonly [WeakSet<object>, "a WeakSet"];

type RefusedName<Value> = Refused extends infer Each
  ? Each extends readonly [infer Class, infer Name]
    ? Value extends Class
      ? Name
      : never
    : never
  : never;

/** Deep enough for any payload written by hand; a recursive type stops here rather than looping. */
type Depth = [never, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/**
 * Every place in `Value` the codec cannot carry, as a sentence naming where,
 * or `never` when there is none.
 */
export type WireProblem<Value, Path extends string = "the value", Left extends number = 10> = [
  Left,
] extends [never]
  ? never
  : 0 extends 1 & Value
    ? never
    : unknown extends Value
      ? never
      : Value extends Leaf
        ? never
        : Value extends symbol
          ? `${Path} is a symbol`
          : Value extends (...args: never[]) => unknown
            ? `${Path} is a function`
            : [RefusedName<Value>] extends [never]
              ? Value extends Promise<infer Settled>
                ? WireProblem<Settled, Path, Depth[Left]>
                : Value extends ReadonlyMap<infer Key, infer Item>
                  ?
                      | WireProblem<Key, `${Path}'s keys`, Depth[Left]>
                      | WireProblem<Item, `${Path}'s values`, Depth[Left]>
                  : Value extends ReadonlySet<infer Item>
                    ? WireProblem<Item, `${Path}'s members`, Depth[Left]>
                    : Value extends readonly unknown[]
                      ? WireProblem<Value[number], `${Path}[number]`, Depth[Left]>
                      : Value extends object
                        ? {
                            [Key in keyof Value]-?: WireProblem<
                              Value[Key],
                              `${Path}.${Key & string}`,
                              Depth[Left]
                            >;
                          }[keyof Value]
                        : never
              : `${Path} is ${RefusedName<Value>}`;

/**
 * A handler's result: a `Response` or a stream as the whole of it, or a value
 * the codec carries. A stream's values are checked like any other.
 */
export type ResultProblem<Result> = 0 extends 1 & Result
  ? never
  : Result extends Response
    ? never
    : Result extends ReadableStream<infer Value>
      ? WireProblem<Value, "each value it streams">
      : Result extends AsyncIterable<infer Value>
        ? WireProblem<Value, "each value it yields">
        : WireProblem<Result, "the result">;

/** A validator's input: a value the codec carries, or a form where a form can be sent. */
export type InputProblem<Input, Method> = 0 extends 1 & Input
  ? never
  : Input extends FormData
    ? Method extends "POST"
      ? never
      : "the input is a form, and a GET has no body to carry one"
    : WireProblem<Input, "the input">;

/**
 * What a checked type must also be: anything, when there is no problem, and a
 * type naming the problem, which nothing is, when there is one. The name is
 * what the type error shows.
 */
export type Crossable<Problem> = [Problem] extends [never]
  ? unknown
  : { readonly "cannot cross the wire": Problem };

/** `strict`, as `createServerFn` takes it. */
export type Strictness = boolean | { readonly input?: boolean; readonly output?: boolean };

/** Whether a side is checked: on unless `strict` or its side says `false`. */
export type StrictOn<Strict, Side extends "input" | "output"> = Strict extends false
  ? false
  : Strict extends { readonly [Key in Side]: false }
    ? false
    : true;
