import { type Accessor, For, onCleanup } from "@barqjs/core";
import { type JSX, Portal, isHydrating, onHydrationEnd } from "@barqjs/web";
import {
  $getNodeByKey,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
  mergeRegister,
} from "lexical";

import type { Decoration } from "./decorator-block-node.ts";
import type { ErrorBoundaryType } from "./error-boundary.tsx";
import { mirror } from "./hooks.ts";

/** One decorator on screen: the node's DOM element and the component mounted in it. */
interface Mounted {
  key: NodeKey;
  element: HTMLElement;
  decoration: Decoration;
  node: Accessor<LexicalNode>;
  setNode: (node: LexicalNode) => void;
}

function latestNode(editor: LexicalEditor, key: NodeKey): LexicalNode | null {
  return editor.getEditorState().read(() => $getNodeByKey(key));
}

export interface NodeDecoratorsProps {
  editor: LexicalEditor;
  ErrorBoundary: ErrorBoundaryType;
}

/**
 * Every decorator node's component, each mounted into the element Lexical made
 * for the node and disposed when that element goes.
 *
 * A node keeps its component while its element lives. A new `decorate()` for
 * the same element moves the node accessor to the new version rather than
 * rebuilding, which is what lets a component inside the document keep its
 * state while the node it draws is edited.
 */
export function NodeDecorators(props: NodeDecoratorsProps): JSX.Element {
  const editor = props.editor;
  const Boundary = props.ErrorBoundary;
  let mounted = new Map<NodeKey, Mounted>();

  function collect(): Mounted[] {
    const decorators = editor.getDecorators<unknown>();
    const next = new Map<NodeKey, Mounted>();
    for (const key of Object.keys(decorators)) {
      const decoration = decorators[key];
      const element = editor.getElementByKey(key);
      const node = latestNode(editor, key);
      if (typeof decoration !== "function" || element === null || node === null) continue;
      const known = mounted.get(key);
      if (known !== undefined && known.element === element) {
        known.setNode(node);
        next.set(key, known);
        continue;
      }
      const [current, setNode] = mirror(node);
      next.set(key, { key, element, decoration: decoration as Decoration, node: current, setNode });
    }
    mounted = next;
    return [...next.values()];
  }

  // The server never draws a decorator, so hydration starts from none and the
  // components mount once the page is the browser's.
  const claiming = isHydrating();
  const [entries, setEntries] = mirror(claiming ? [] : collect());
  function sync(): void {
    setEntries(collect());
  }
  onCleanup(
    mergeRegister(editor.registerDecoratorListener(sync), editor.registerRootListener(sync)),
  );
  if (claiming) onHydrationEnd(sync);

  function onError(error: Error): void {
    return editor._onError(error);
  }

  return (
    <For each={entries()}>
      {(entry: Mounted) => (
        <Portal mount={entry.element}>
          <Boundary onError={onError}>{entry.decoration(entry.node)}</Boundary>
        </Portal>
      )}
    </For>
  );
}
