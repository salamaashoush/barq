import { createSignal } from "@barqjs/core";
import { type TestNode, TestResults } from "@barqjs/arc";

import { TESTS } from "./data.ts";

function settle(nodes: readonly TestNode[], ids: ReadonlySet<string> | "all"): TestNode[] {
  return nodes.map((node) => {
    if (node.children !== undefined) return { ...node, children: settle(node.children, ids) };
    if (ids !== "all" && !ids.has(node.id)) return node;
    return { ...node, status: "passed", duration: 2 + (node.name.length % 9), failure: undefined };
  });
}

function mark(nodes: readonly TestNode[], ids: ReadonlySet<string> | "all"): TestNode[] {
  return nodes.map((node) => {
    if (node.children !== undefined) return { ...node, children: mark(node.children, ids) };
    return ids === "all" || ids.has(node.id) ? { ...node, status: "running" } : node;
  });
}

function under(nodes: readonly TestNode[], id: string): string[] {
  for (const node of nodes) {
    if (node.id === id) {
      return node.children === undefined
        ? [node.id]
        : node.children.flatMap((child) => under([child], child.id));
    }
    const found = under(node.children ?? [], id);
    if (found.length > 0) return found;
  }
  return [];
}

export default function TestResultsExample() {
  const [tests, setTests] = createSignal<TestNode[]>(TESTS);
  const [running, setRunning] = createSignal(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  function run(ids: ReadonlySet<string> | "all"): void {
    setRunning(true);
    setTests(mark(tests(), ids));
    timer = setTimeout(() => {
      setTests(settle(tests(), ids));
      setRunning(false);
    }, 1200);
  }
  return (
    <TestResults
      tests={tests()}
      running={running()}
      defaultSelected="math/div"
      onRun={(id) => run(new Set(under(tests(), id)))}
      onRunAll={() => run("all")}
      onRerunFailed={(ids) => run(new Set(ids))}
      onStop={() => {
        clearTimeout(timer);
        setTests(TESTS);
        setRunning(false);
      }}
    />
  );
}
