import { hashElementsVersion, hashString, getCommonBoundingBox } from "@excalidraw/element";

import type { ExcalidrawElement } from "@excalidraw/element/types";

import type { LibraryItem, LibraryItems } from "../types.ts";

/**
 * format: hostname or hostname/pathname
 *
 * Both hostname and pathname are matched partially,
 * hostname from the end, pathname from the start, with subdomain/path
 * boundaries
 **/
const ALLOWED_LIBRARY_URLS = [
  "excalidraw.com",
  // when installing from github PRs
  "raw.githubusercontent.com/excalidraw/excalidraw-libraries",
];

/**
 * checks if library item does not exist already in current library
 */
const isUniqueItem = (existingLibraryItems: LibraryItems, targetLibraryItem: LibraryItem) => {
  return !existingLibraryItems.find((libraryItem) => {
    if (libraryItem.elements.length !== targetLibraryItem.elements.length) {
      return false;
    }

    // detect z-index difference by checking the excalidraw elements
    // are in order
    return libraryItem.elements.every((libItemExcalidrawItem, idx) => {
      return (
        libItemExcalidrawItem.id === targetLibraryItem.elements[idx]?.id &&
        libItemExcalidrawItem.versionNonce === targetLibraryItem.elements[idx]?.versionNonce
      );
    });
  });
};

/** Merges otherItems into localItems. Unique items in otherItems array are
    sorted first. */
export const mergeLibraryItems = (
  localItems: LibraryItems,
  otherItems: LibraryItems,
): LibraryItems => {
  const newItems = [];
  for (const item of otherItems) {
    if (isUniqueItem(localItems, item)) {
      newItems.push(item);
    }
  }

  return [...newItems, ...localItems];
};

export const distributeLibraryItemsOnSquareGrid = (libraryItems: LibraryItems) => {
  const PADDING = 50;
  const ITEMS_PER_ROW = Math.ceil(Math.sqrt(libraryItems.length));

  const resElements: ExcalidrawElement[] = [];

  const getMaxHeightPerRow = (row: number) => {
    const maxHeight = libraryItems
      .slice(row * ITEMS_PER_ROW, row * ITEMS_PER_ROW + ITEMS_PER_ROW)
      .reduce((acc, item) => {
        const { height } = getCommonBoundingBox(item.elements);
        return Math.max(acc, height);
      }, 0);
    return maxHeight;
  };

  const getMaxWidthPerCol = (targetCol: number) => {
    let index = 0;
    let currCol = 0;
    let maxWidth = 0;
    for (const item of libraryItems) {
      if (index % ITEMS_PER_ROW === 0) {
        currCol = 0;
      }
      if (currCol === targetCol) {
        const { width } = getCommonBoundingBox(item.elements);
        maxWidth = Math.max(maxWidth, width);
      }
      index++;
      currCol++;
    }
    return maxWidth;
  };

  let colOffsetX = 0;
  let rowOffsetY = 0;

  let maxHeightCurrRow = 0;
  let maxWidthCurrCol = 0;

  let index = 0;
  let col = 0;
  let row = 0;

  for (const item of libraryItems) {
    if (index && index % ITEMS_PER_ROW === 0) {
      rowOffsetY += maxHeightCurrRow + PADDING;
      colOffsetX = 0;
      col = 0;
      row++;
    }

    if (col === 0) {
      maxHeightCurrRow = getMaxHeightPerRow(row);
    }
    maxWidthCurrCol = getMaxWidthPerCol(col);

    const { minX, minY, width, height } = getCommonBoundingBox(item.elements);
    const offsetCenterX = (maxWidthCurrCol - width) / 2;
    const offsetCenterY = (maxHeightCurrRow - height) / 2;
    resElements.push(
      ...item.elements.map((element) => ({
        ...element,
        x:
          element.x +
          // offset for column
          colOffsetX +
          // offset to center in given square grid
          offsetCenterX -
          // subtract minX so that given item starts at 0 coord
          minX,
        y:
          element.y +
          // offset for row
          rowOffsetY +
          // offset to center in given square grid
          offsetCenterY -
          // subtract minY so that given item starts at 0 coord
          minY,
      })),
    );
    colOffsetX += maxWidthCurrCol + PADDING;
    index++;
    col++;
  }

  return resElements;
};

export const validateLibraryUrl = (
  libraryUrl: string,
  /**
   * @returns `true` if the URL is valid, throws otherwise.
   */
  validator: ((libraryUrl: string) => boolean) | string[] = ALLOWED_LIBRARY_URLS,
): true => {
  if (
    typeof validator === "function"
      ? validator(libraryUrl)
      : validator.some((allowedUrlDef) => {
          const allowedUrl = new URL(`https://${allowedUrlDef.replace(/^https?:\/\//, "")}`);

          const { hostname, pathname } = new URL(libraryUrl);

          return (
            new RegExp(`(^|\\.)${allowedUrl.hostname}$`).test(hostname) &&
            new RegExp(`^${allowedUrl.pathname.replace(/\/+$/, "")}(/+|$)`).test(pathname)
          );
        })
  ) {
    return true;
  }

  throw new Error(`Invalid or disallowed library URL: "${libraryUrl}"`);
};

const getLibraryItemHash = (item: LibraryItem) => {
  return `${item.id}:${item.name || ""}:${hashElementsVersion(item.elements)}`;
};

export const getLibraryItemsHash = (items: LibraryItems) => {
  return hashString(
    items
      .map((item) => getLibraryItemHash(item))
      .toSorted()
      .join(),
  );
};
