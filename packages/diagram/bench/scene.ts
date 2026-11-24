/**
 * The scenes both editors open: `count` elements on a ten-column grid of
 * 160 by 120 cells, rectangles, ellipses and diamonds with an arrow from
 * every fifth to its right neighbour and a label on every seventh, from a
 * fixed seed. Element `e0` is at the top left, the first hundred fill the
 * first ten rows.
 */

const CELL_WIDTH = 160;
const CELL_HEIGHT = 120;
export const COLUMNS = 10;

let seed = 1;
function random() {
  seed = (seed * 16807) % 2147483647;
  return seed;
}

interface BoundElement {
  id: string;
  type: string;
}

function base(id: string, type: string, x: number, y: number, width: number, height: number) {
  return {
    id,
    type,
    x,
    y,
    width,
    height,
    angle: 0,
    strokeColor: "#1e1e1e",
    backgroundColor: "#a5d8ff",
    fillStyle: "solid",
    strokeWidth: 2,
    strokeStyle: "solid",
    roughness: 1,
    opacity: 100,
    groupIds: [] as string[],
    frameId: null,
    roundness: null,
    seed: random(),
    version: 1,
    versionNonce: random(),
    isDeleted: false,
    boundElements: null as BoundElement[] | null,
    updated: 1,
    link: null,
    locked: false,
  };
}

const SHAPES = ["rectangle", "ellipse", "diamond"] as const;

export function makeScene(count: number): Record<string, unknown>[] {
  seed = 1;
  const elements: Record<string, unknown>[] = [];
  let index = 0;
  for (let cell = 0; elements.length < count; cell++) {
    const column = cell % COLUMNS;
    const row = Math.floor(cell / COLUMNS);
    const x = column * CELL_WIDTH + 20;
    const y = row * CELL_HEIGHT + 20;
    const shape = base(`e${index++}`, SHAPES[cell % 3], x, y, 100, 60);
    elements.push(shape);
    if (elements.length < count && cell % 7 === 0) {
      const label = {
        ...base(`e${index++}`, "text", x + 20, y + 20, 60, 25),
        backgroundColor: "transparent",
        text: `node ${cell}`,
        originalText: `node ${cell}`,
        fontSize: 20,
        fontFamily: 5,
        textAlign: "center",
        verticalAlign: "middle",
        containerId: shape.id,
        autoResize: true,
        lineHeight: 1.25,
      };
      shape.boundElements = [{ id: label.id, type: "text" }];
      elements.push(label);
    }
    if (elements.length < count && cell % 5 === 0 && column < COLUMNS - 1) {
      elements.push({
        ...base(`e${index++}`, "arrow", x + 100, y + 30, 60, 0),
        backgroundColor: "transparent",
        points: [
          [0, 0],
          [60, 0],
        ],
        startBinding: null,
        endBinding: null,
        startArrowhead: null,
        endArrowhead: "arrow",
        elbowed: false,
      });
    }
  }
  return elements.slice(0, count);
}

/** The first hundred shapes (not labels or arrows), which the drag moves. */
export function dragSelection(elements: readonly Record<string, unknown>[]): string[] {
  return elements
    .filter((element) => element.type !== "text" && element.type !== "arrow")
    .slice(0, 100)
    .map((element) => element.id as string);
}
