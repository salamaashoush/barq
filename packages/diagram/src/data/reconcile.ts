import { arrayToMap, isDevEnv, isTestEnv } from "@excalidraw/common";
import {
  orderByFractionalIndex,
  syncInvalidIndices,
  validateFractionalIndices,
} from "@excalidraw/element";

import type { OrderedExcalidrawElement } from "@excalidraw/element/types";

import { throttle } from "../throttle.ts";

import type { AppState } from "../types.ts";

declare const reconciledBrand: unique symbol;
declare const remoteBrand: unique symbol;

export type ReconciledExcalidrawElement = OrderedExcalidrawElement & {
  readonly [reconciledBrand]: "ReconciledElement";
};

export type RemoteExcalidrawElement = OrderedExcalidrawElement & {
  readonly [remoteBrand]: "RemoteExcalidrawElement";
};

export function shouldDiscardRemoteElement(
  localAppState: Pick<AppState, "resizingElement" | "newElement">,
  local: OrderedExcalidrawElement | undefined,
  remote: RemoteExcalidrawElement,
): boolean {
  if (
    local &&
    // local element is being edited. (Not a text in its editor: the editor
    // holds the draft, and writes it on top of whatever the scene has by
    // then, so the newest write wins on every client. Discarded, a remote
    // copy isn't sent again, and the clients end up on different texts.)
    (local.id === localAppState.resizingElement?.id ||
      local.id === localAppState.newElement?.id ||
      // local element is newer
      local.version > remote.version ||
      // resolve conflicting edits deterministically by taking the one with
      // the lowest versionNonce
      (local.version === remote.version && local.versionNonce <= remote.versionNonce))
  ) {
    return true;
  }
  return false;
}

interface DebugGlobals {
  DEBUG_FRACTIONAL_INDICES?: boolean;
}

const validateIndicesThrottled = throttle(
  (
    orderedElements: readonly OrderedExcalidrawElement[],
    localElements: readonly OrderedExcalidrawElement[],
    remoteElements: readonly RemoteExcalidrawElement[],
  ) => {
    if (isDevEnv() || isTestEnv() || (globalThis as DebugGlobals).DEBUG_FRACTIONAL_INDICES) {
      // create new instances due to the mutation
      const elements = syncInvalidIndices(orderedElements.map((x) => ({ ...x })));

      validateFractionalIndices(elements, {
        // throw in dev & test only, to remain functional on `DEBUG_FRACTIONAL_INDICES`
        shouldThrow: isTestEnv() || isDevEnv(),
        includeBoundTextValidation: true,
        reconciliationContext: {
          localElements,
          remoteElements,
        },
      });
    }
  },
  1000 * 60,
  { leading: true, trailing: false },
);

/**
 * Merges the elements a collaborator sent into the local ones: the newer
 * version of each, the lower `versionNonce` on a tie, the local one while
 * it is being drawn or resized; ordered by their fractional indices.
 */
export function reconcileElements(
  localElements: readonly OrderedExcalidrawElement[],
  remoteElements: readonly RemoteExcalidrawElement[],
  localAppState: Pick<AppState, "resizingElement" | "newElement">,
): ReconciledExcalidrawElement[] {
  const localElementsMap = arrayToMap(localElements);
  const reconciledElements: OrderedExcalidrawElement[] = [];
  const added = new Set<string>();

  // process remote elements
  for (const remoteElement of remoteElements) {
    if (!added.has(remoteElement.id)) {
      const localElement = localElementsMap.get(remoteElement.id);
      const discardRemoteElement = shouldDiscardRemoteElement(
        localAppState,
        localElement,
        remoteElement,
      );

      if (localElement && discardRemoteElement) {
        reconciledElements.push(localElement);
        added.add(localElement.id);
      } else {
        reconciledElements.push(remoteElement);
        added.add(remoteElement.id);
      }
    }
  }

  // process remaining local elements
  for (const localElement of localElements) {
    if (!added.has(localElement.id)) {
      reconciledElements.push(localElement);
      added.add(localElement.id);
    }
  }

  const orderedElements = orderByFractionalIndex(reconciledElements);

  validateIndicesThrottled(orderedElements, localElements, remoteElements);

  // de-duplicate indices
  syncInvalidIndices(orderedElements);

  return orderedElements as ReconciledExcalidrawElement[];
}
