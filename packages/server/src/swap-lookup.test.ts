import { afterEach, expect, test } from "bun:test";

import { swapDeferredRange } from "./swap.ts";

afterEach(() => {
  document.body.innerHTML = "";
});

/**
 * A page with many streamed boundaries pays for finding them once. The walk of
 * the whole body per swap made a page of N boundaries cost N walks of it.
 */
test("finding a boundary walks the document once per page, not once per swap", () => {
  const ids = [0, 1, 2, 3, 4, 5, 6, 7];
  document.body.innerHTML =
    `<main>${ids.map((id) => `<section><!--[b:${id}--><i>wait ${id}</i><!--]--></section>`).join("")}</main>` +
    ids.map((id) => `<template data-barq="${id}"><b>salama ${id}</b></template>`).join("");
  const walk = document.createTreeWalker.bind(document);
  const roots: Node[] = [];
  document.createTreeWalker = (root: Node, ...rest: never[]) => {
    roots.push(root);
    return walk(root, ...rest);
  };
  try {
    for (const id of ids) swapDeferredRange(id);
  } finally {
    document.createTreeWalker = walk;
  }

  expect(roots.filter((root) => root === document.body)).toHaveLength(1);
  expect([...document.querySelectorAll("b")].map((b) => b.textContent)).toEqual(
    ids.map((id) => `salama ${id}`),
  );
  expect(document.querySelectorAll("i")).toHaveLength(0);
});

test("a boundary nested in content the stream delivered is found without another walk", () => {
  document.body.innerHTML =
    "<main><!--[b:0--><i>outer</i><!--]--></main>" +
    '<template data-barq="0"><div><!--[b:1--><i>inner</i><!--]--></div></template>' +
    '<template data-barq="1"><b>salama</b></template>';
  const walk = document.createTreeWalker.bind(document);
  const roots: Node[] = [];
  document.createTreeWalker = (root: Node, ...rest: never[]) => {
    roots.push(root);
    return walk(root, ...rest);
  };
  try {
    swapDeferredRange(0);
    swapDeferredRange(1);
  } finally {
    document.createTreeWalker = walk;
  }

  expect(roots.filter((root) => root === document.body)).toHaveLength(1);
  expect(document.querySelector("main")?.innerHTML).toBe(
    "<!--[--><div><!--[--><b>salama</b><!--]--></div><!--]-->",
  );
});
