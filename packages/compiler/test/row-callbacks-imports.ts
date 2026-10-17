import { createSignal } from "@barqjs/core";

export const [count, setCount] = createSignal(0);

export function renderRow(row: { label: string }): Node {
  const item = document.createElement("li");
  item.textContent = row.label;
  return item;
}

export const labels = { renderRow, index: (index: number): string => String(index) };
