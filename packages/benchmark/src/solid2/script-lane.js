// The script half of each js-framework-benchmark operation, timed in the page:
// from the click to the end of the microtask queue, which is where both Solid
// 2.0 and barq have finished writing the DOM and where no style, layout or
// paint has run yet. The trace lane measures the whole frame and its median
// moves in vsync steps; this one isolates the work the framework controls.
//
// A macrotask separates every sample so a framework's deferred work cannot
// spill into the next one, and `gc()` runs between samples (Chrome is
// launched with --expose-gc) so a collection is not billed to the click after
// it.
(() => {
  const $ = (id) => document.getElementById(id);
  const rows = () => document.querySelectorAll("tbody > tr");
  const task = () => new Promise((resolve) => setTimeout(resolve, 0));
  const drain = async () => {
    for (let i = 0; i < 4; i++) await Promise.resolve();
  };
  const expect = (condition, message) => {
    if (!condition) throw new Error(`script lane: ${message}`);
  };
  const clickXp = (path) =>
    document
      .evaluate(path, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null)
      .singleNodeValue.click();

  async function settle(fn) {
    fn();
    await drain();
    await task();
  }

  const ops = {
    "create rows": {
      setup: () => settle(() => $("clear").click()),
      act: () => $("run").click(),
      check: () => expect(rows().length === 1000, "create"),
    },
    "replace all rows": {
      setup: () => settle(() => $("run").click()),
      act: () => $("run").click(),
      check: () => expect(rows().length === 1000, "replace"),
    },
    "partial update": {
      setup: async () => {
        if (rows().length !== 1000) await settle(() => $("run").click());
      },
      act: () => $("update").click(),
      check: () => expect(rows()[0].querySelector("a").textContent.endsWith(" !!!"), "update"),
    },
    "select row": {
      setup: async () => {
        if (rows().length !== 1000) await settle(() => $("run").click());
      },
      act: (i) => clickXp(`//tbody/tr[${(i % 10) + 1}]/td[2]/a`),
      check: (i) => expect(rows()[i % 10].className.includes("danger"), "select"),
    },
    "swap rows": {
      setup: async () => {
        if (rows().length !== 1000) await settle(() => $("run").click());
      },
      act: () => $("swaprows").click(),
      check: () => expect(rows().length === 1000, "swap"),
    },
    "remove row": {
      setup: async () => {
        if (rows().length < 900) await settle(() => $("run").click());
      },
      act: () => clickXp("//tbody/tr[4]/td[3]/a/span[1]"),
      check: () => expect(rows().length < 1000, "remove"),
    },
    "create many rows": {
      setup: () => settle(() => $("clear").click()),
      act: () => $("runlots").click(),
      check: () => expect(rows().length === 10000, "create many"),
    },
    "append rows to large table": {
      setup: () => settle(() => $("run").click()),
      act: () => $("add").click(),
      check: () => expect(rows().length === 2000, "append"),
    },
    "clear rows": {
      setup: () => settle(() => $("run").click()),
      act: () => $("clear").click(),
      check: () => expect(rows().length === 0, "clear"),
    },
  };

  window.__scriptLane = async (name, samples, warmup) => {
    try {
      const op = ops[name];
      if (!op) throw new Error(`no operation ${name}`);
      const out = [];
      for (let i = 0; i < warmup + samples; i++) {
        await op.setup();
        if (window.gc) window.gc();
        await task();
        const start = performance.now();
        op.act(i);
        await drain();
        const elapsed = performance.now() - start;
        op.check(i);
        if (i >= warmup) out.push(elapsed);
        await task();
      }
      return out;
    } catch (error) {
      return { __benchError: `${name}: ${error && error.message ? error.message : error}` };
    }
  };
})();
