import { describe, expect, test } from "bun:test";
import { render } from "@barqjs/testing";

import { hydrateExamples } from "../test-harness.ts";
import SkeletonCard from "./skeleton-card.tsx";
import SkeletonDemo from "./skeleton-demo.tsx";
import SkeletonForm from "./skeleton-form.tsx";
import SkeletonRtl from "./skeleton-rtl.tsx";
import SkeletonTable from "./skeleton-table.tsx";

const skeletons = (within: ParentNode = document): Element[] => [
  ...within.querySelectorAll('[data-slot="skeleton"]'),
];

describe("the skeleton examples", () => {
  test("every example is claimed from the server's markup", async () => {
    expect(await hydrateExamples("skeleton")).toEqual([]);
  });

  test("each placeholder is given its own shape by a class", () => {
    render(() => <SkeletonDemo />);
    const shapes = skeletons();
    expect(shapes).toHaveLength(3);
    expect(new Set(shapes.map((shape) => shape.className)).size).toBe(3);
  });

  test("the card holds two lines in its header and a block in its content", () => {
    render(() => <SkeletonCard />);
    const header = document.querySelector('[data-slot="card-header"]');
    const content = document.querySelector('[data-slot="card-content"]');
    expect(skeletons(header as Element)).toHaveLength(2);
    expect(skeletons(content as Element)).toHaveLength(1);
  });

  test("the form is two fields and a button, each field a label over a control", () => {
    render(() => <SkeletonForm />);
    expect(skeletons()).toHaveLength(5);
  });

  test("the table is five rows of three cells", () => {
    render(() => <SkeletonTable />);
    const rows = [...new Set(skeletons().map((cell) => cell.parentElement))];
    expect(rows).toHaveLength(5);
    expect(rows.map((row) => row?.children.length)).toEqual([3, 3, 3, 3, 3]);
  });

  test("the right-to-left example names its direction on an element", () => {
    render(() => <SkeletonRtl />);
    expect(document.querySelectorAll('[dir="rtl"] [data-slot="skeleton"]')).toHaveLength(3);
  });
});
