import { type DiagramScene, type ImportedDataState, restore } from "@barqjs/diagram";

import saved from "./acme-architecture.excalidraw?raw";

/**
 * Acme's request path: the browser, the gateway, two services and their
 * database. A saved `.excalidraw` file, as an app loads one from its store:
 * its text is already measured, so the server renders it without a canvas.
 */
export function acmeArchitecture(): DiagramScene {
  const data: ImportedDataState = JSON.parse(saved);
  return restore(data, null, null);
}
