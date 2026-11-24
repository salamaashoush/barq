/**
 * The Solid 2.0 primitives barq exports beside the engine's own: `onFlush`,
 * `createDeferred` and `from`, and the rule that a provider passing `undefined`
 * provides nothing.
 */

import { rooted } from "./test-root.ts";
import { describe, expect, test } from "bun:test";
import {
  ContextNotFoundError,
  NotReadyError,
  createContext,
  createDeferred,
  createMemo,
  createSignal,
  flush,
  from,
  isPending,
  onFlush,
  runWithOwner,
  useContext,
} from "./signals.ts";

function tick(ms = 0) {
  return new Promise((done) => setTimeout(done, ms));
}

function read<T>(node: () => T): T | "PENDING" {
  try {
    return node();
  } catch (error) {
    if (error instanceof NotReadyError) return "PENDING";
    throw error;
  }
}

describe("onFlush", () => {
  test(
    "runs once after the pending flush, and its write is an update of its own",
    rooted(async () => {
      const [open, setOpen] = createSignal(true);
      const [picked, setPicked] = createSignal(0);
      const seen = createMemo(() => `${open()}:${picked()}`);
      seen();
      let runs = 0;

      runWithOwner(null, () => {
        setPicked(1);
        onFlush(() => {
          runs++;
          setOpen(false);
        });
      });
      expect(runs).toBe(0);

      await tick();
      expect(runs).toBe(1);
      expect(seen()).toBe("false:1");
    }),
  );
});

describe("createDeferred", () => {
  test(
    "keeps its last answer while a re-run is in flight, and reports it pending",
    rooted(async () => {
      const [id, setId] = createSignal(1);
      const answers: Record<number, (value: string) => void> = {};
      const user = createDeferred(
        () => new Promise<string>((resolve) => (answers[id()] = resolve)),
      );

      expect(read(user)).toBe("PENDING");
      answers[1]("ada");
      await tick();
      flush();
      expect(user()).toBe("ada");

      runWithOwner(null, () => setId(2));
      flush();
      expect(read(user)).toBe("ada");
      expect(isPending(user)).toBe(true);

      answers[2]("grace");
      await tick();
      flush();
      expect(user()).toBe("grace");
      expect(isPending(user)).toBe(false);
    }),
  );
});

describe("from", () => {
  test(
    "reads a subscription's latest value and closes it when the memo runs again",
    rooted(async () => {
      const [channel, setChannel] = createSignal("a");
      const open: string[] = [];
      const emit: Record<string, (value: string) => void> = {};
      const value = createMemo(() => {
        const name = channel();
        return from<string>((next) => {
          open.push(name);
          emit[name] = next;
          return () => open.splice(open.indexOf(name), 1);
        });
      });

      expect(read(value)).toBe("PENDING");
      await tick();
      emit.a("a1");
      await tick();
      flush();
      expect(value()).toBe("a1");
      emit.a("a2");
      await tick();
      flush();
      expect(value()).toBe("a2");

      runWithOwner(null, () => setChannel("b"));
      flush();
      await tick();
      emit.b("b1");
      await tick();
      flush();
      expect(value()).toBe("b1");
      expect(open).toEqual(["b"]);
    }),
  );
});

interface SessionUser {
  user: string;
}

describe("a provider passing undefined", () => {
  test(
    "provides nothing: the read falls back to the default",
    rooted(() => {
      const Theme = createContext("light");
      let theme: (() => string) | undefined;
      Theme({
        value: undefined as unknown as string,
        children: () => {
          theme = useContext(Theme);
          return null;
        },
      });
      expect(theme!()).toBe("light");
    }),
  );

  test(
    "and with no default the read fails as a missing provider does",
    rooted(() => {
      const Session = createContext<SessionUser>(undefined, "Session");
      let session: (() => SessionUser) | undefined;
      Session({
        value: undefined as unknown as SessionUser,
        children: () => {
          session = useContext(Session);
          return null;
        },
      });
      expect(() => session!()).toThrow(ContextNotFoundError);
    }),
  );

  test(
    "while null is a value it passes through",
    rooted(() => {
      const Session = createContext<SessionUser | null>(null);
      let session: (() => SessionUser | null) | undefined;
      Session({
        value: null,
        children: () => {
          session = useContext(Session);
          return null;
        },
      });
      expect(session!()).toBeNull();
    }),
  );
});
