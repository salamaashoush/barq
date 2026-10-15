import { flush, render } from "@barqjs/core";

import {
  aggregationFns,
  createExpandedRowModel,
  createFacetedMinMaxValues,
  createFacetedRowModel,
  createFacetedUniqueValues,
  createFilteredRowModel,
  createGroupedRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  filterFns,
  sortFns,
  stockFeatures,
  tableFeatures,
} from "./index.ts";

export type Person = {
  id: string;
  name: string;
  age: number;
  team: string;
  email: string;
  reports?: Person[];
};

export const person = (id: number, name: string, age: number, team: string): Person => ({
  id: String(id),
  name,
  age,
  team,
  email: `${name}@example.com`,
});

export const people: Person[] = [
  person(1, "salama", 30, "core"),
  person(2, "ada", 40, "docs"),
  person(3, "zed", 20, "core"),
  person(4, "lin", 30, "docs"),
  person(5, "omar", 50, "infra"),
];

export const features = tableFeatures({
  ...stockFeatures,
  filteredRowModel: createFilteredRowModel(),
  groupedRowModel: createGroupedRowModel(),
  sortedRowModel: createSortedRowModel(),
  expandedRowModel: createExpandedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  facetedRowModel: createFacetedRowModel(),
  facetedMinMaxValues: createFacetedMinMaxValues(),
  facetedUniqueValues: createFacetedUniqueValues(),
  filterFns,
  sortFns,
  aggregationFns,
});

export type Features = typeof features;

export interface Mounted {
  host: HTMLElement;
  dispose: () => void;
  text: (selector: string) => string[];
  one: (selector: string) => HTMLElement;
}

const mounted: Array<() => void> = [];

export function mount(view: () => unknown): Mounted {
  const host = document.createElement("div");
  // Delegated events are heard at the document, so the host has to be in it.
  document.body.append(host);
  const dispose = render(view as Parameters<typeof render>[0], host);
  mounted.push(dispose);
  flush();
  return {
    host,
    dispose,
    text: (selector) => [...host.querySelectorAll(selector)].map((node) => node.textContent ?? ""),
    one: (selector) => {
      const found = host.querySelector<HTMLElement>(selector);
      if (found === null) throw new Error(`nothing matches ${selector}`);
      return found;
    },
  };
}

export function unmountAll(): void {
  for (const dispose of mounted.splice(0)) dispose();
  document.body.innerHTML = "";
}

export function click(target: Element, init: MouseEventInit = {}): void {
  target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, ...init }));
  flush();
}

export function type(target: HTMLInputElement, value: string): void {
  target.value = value;
  target.dispatchEvent(new Event("input", { bubbles: true }));
  flush();
}
