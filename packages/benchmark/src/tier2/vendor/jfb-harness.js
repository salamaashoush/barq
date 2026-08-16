// The nine CPU benchmarks of krausest/js-framework-benchmark (Apache-2.0),
// transcribed from `webdriver-ts/src/benchmarksWebdriverAfterframe.ts` and
// `benchmarksCommon.ts` into one in-page driver.
//
// WHAT IS PRESERVED, exactly: the click sequence, the per-benchmark warmup
// count, the row indices, and the DOM assertion after each step. The assertions
// are not decoration — they are what stops a framework that rendered NOTHING
// from posting the fastest time in the table, and they are the reason a
// transcription of this suite can be trusted at all.
//
// WHAT CHANGES: the driver runs inside the page instead of over WebDriver.
// Upstream's afterframe lane already clicks with `elem.click()` from inside the
// page, so the click is the same one; the WebDriver round trip that goes away
// is a synchronisation step and was never inside the measured region.
//
// THE SPLIT IS LOAD-BEARING. `init` runs the warmups, `act` performs exactly
// ONE click, `verify` asserts the result. The Chrome trace is collected around
// `act` alone, because `computeCpuDuration` requires exactly one click
// EventDispatch in the window and a warmup click inside it would make the
// duration a measurement of the wrong operation.
//
// TWO ROWS UPSTREAM'S AFTERFRAME FILE DOES NOT TIME. `swap rows` and `remove
// row` call `clickElementById` there rather than `measureClickElementById`, so
// that lane reports no duration for them. They are timed here by the same
// instrument as the other seven; the divergence is recorded rather than
// silently inherited.
(() => {
  const $ = (id) => document.getElementById(id);
  const xp = (path) =>
    document.evaluate(path, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null)
      .singleNodeValue;
  const rows = () => document.querySelectorAll("tbody > tr");

  const frame = () => new Promise((resolve) => window.afterFrame(resolve));

  async function click(el) {
    if (!el) throw new Error("nothing to click");
    el.click();
    await frame();
  }

  const clickId = (id) => click($(id));

  function expect(condition, message) {
    if (!condition) throw new Error(`js-framework-benchmark assertion failed: ${message}`);
  }

  function firstId() {
    const cell = xp("//tbody/tr[1]/td[1]");
    return cell ? cell.textContent.trim() : null;
  }

  // Five run+clear warmups, which is `warmupCount: 5` for benchmarks 01, 07, 08
  // and 09 upstream.
  async function warmRunClear(times) {
    for (let i = 0; i < times; i++) {
      await clickId("run");
      expect(firstId() === String(i * 1000 + 1), `warmup ${i} first row id`);
      await clickId("clear");
      expect(rows().length === 0, `warmup ${i} did not clear`);
    }
  }

  const ROWS_TO_SKIP = 4;

  const benchmarks = {
    "create rows": {
      init: () => warmRunClear(5),
      act: () => $("run").click(),
      verify() {
        expect(firstId() === String(5001), "timed run first row id");
        expect(rows().length === 1000, "timed run did not produce 1000 rows");
      },
    },

    "replace all rows": {
      async init() {
        for (let i = 0; i < 5; i++) {
          await clickId("run");
          expect(firstId() === String(i * 1000 + 1), `warmup ${i} first row id`);
        }
      },
      act: () => $("run").click(),
      verify() {
        expect(firstId() === String(5001), "timed run first row id");
        expect(rows().length === 1000, "replace did not leave 1000 rows");
      },
    },

    "partial update": {
      async init() {
        await clickId("run");
        expect(rows().length === 1000, "setup did not produce 1000 rows");
        for (let i = 0; i < 3; i++) {
          await clickId("update");
          expect(
            xp("//tbody/tr[991]/td[2]/a").textContent.includes(" !!!".repeat(i + 1)),
            `warmup ${i} row 991 not updated`,
          );
        }
      },
      act: () => $("update").click(),
      verify() {
        expect(
          xp("//tbody/tr[991]/td[2]/a").textContent.includes(" !!!".repeat(4)),
          "timed update did not reach row 991",
        );
      },
    },

    "select row": {
      async init() {
        await clickId("run");
        expect(rows().length === 1000, "setup did not produce 1000 rows");
      },
      act: () => xp("//tbody/tr[2]/td[2]/a").click(),
      verify() {
        expect(
          xp("//tbody/tr[2]").className.includes("danger"),
          "row 2 did not take the danger class",
        );
      },
    },

    // Upstream's loop is `i <= warmupCount`, so six warmup swaps and the timed
    // one is the seventh. An odd number of swaps leaves row 2 holding id 999
    // and row 999 holding id 2. Upstream asserts these with a SUBSTRING match;
    // exact equality is used here because "2" is a substring of "992".
    "swap rows": {
      async init() {
        await clickId("run");
        expect(rows().length === 1000, "setup did not produce 1000 rows");
        for (let i = 0; i <= 5; i++) {
          await clickId("swaprows");
          const expected = i % 2 === 0 ? "2" : "999";
          expect(
            xp("//tbody/tr[999]/td[1]").textContent.trim() === expected,
            `warmup swap ${i} left row 999 wrong`,
          );
        }
      },
      act: () => $("swaprows").click(),
      verify() {
        expect(
          xp("//tbody/tr[999]/td[1]").textContent.trim() === "2",
          "timed swap left row 999 wrong",
        );
        expect(
          xp("//tbody/tr[2]/td[1]").textContent.trim() === "999",
          "timed swap left row 2 wrong",
        );
      },
    },

    "remove row": {
      async init() {
        await clickId("run");
        expect(rows().length === 1000, "setup did not produce 1000 rows");
        for (let i = 0; i < 5; i++) {
          const rowToClick = 5 - i + ROWS_TO_SKIP;
          await click(xp(`//tbody/tr[${rowToClick}]/td[3]/a/span[1]`));
          expect(
            xp(`//tbody/tr[${rowToClick}]/td[1]`).textContent.trim() === String(ROWS_TO_SKIP + 6),
            `warmup removal ${i} left the wrong id at row ${rowToClick}`,
          );
        }
        await click(xp(`//tbody/tr[${ROWS_TO_SKIP + 2}]/td[3]/a/span[1]`));
      },
      act: () => xp(`//tbody/tr[${ROWS_TO_SKIP}]/td[3]/a/span[1]`).click(),
      verify() {
        expect(
          xp(`//tbody/tr[${ROWS_TO_SKIP}]/td[1]`).textContent.trim() === String(ROWS_TO_SKIP + 6),
          "timed removal left the wrong id",
        );
      },
    },

    "create many rows": {
      init: () => warmRunClear(5),
      act: () => $("runlots").click(),
      verify() {
        expect(rows().length === 10000, "timed run did not produce 10000 rows");
      },
    },

    "append rows to large table": {
      async init() {
        await warmRunClear(5);
        await clickId("run");
        expect(rows().length === 1000, "setup did not produce 1000 rows");
      },
      act: () => $("add").click(),
      verify() {
        expect(rows().length === 2000, "append did not reach 2000 rows");
      },
    },

    "clear rows": {
      async init() {
        await warmRunClear(5);
        await clickId("run");
        expect(rows().length === 1000, "setup did not produce 1000 rows");
      },
      act: () => $("clear").click(),
      verify() {
        expect(rows().length === 0, "timed clear left rows behind");
      },
    },
  };

  window.__jfbNames = Object.keys(benchmarks);

  const guard = async (fn, label) => {
    try {
      return { ok: await fn() };
    } catch (error) {
      return { __benchError: `${label}: ${error && error.message ? error.message : error}` };
    }
  };

  window.__jfbInit = (name) =>
    guard(async () => {
      const bench = benchmarks[name];
      if (!bench) throw new Error(`no benchmark named ${name}`);
      await bench.init();
      return true;
    }, `${name} init`);

  // One click, then one frame. Nothing else may happen inside the traced
  // window: `computeCpuDuration` throws on a second click EventDispatch, and
  // that is deliberate.
  window.__jfbAct = (name) =>
    guard(async () => {
      const bench = benchmarks[name];
      benchmarks[name].act();
      await frame();
      bench.verify();
      return true;
    }, `${name} act`);

  // The heap after 1,000 rows are standing — js-framework-benchmark's "run
  // memory" row. Meaningful only because the launch line asks for precise
  // memory info; without it Chrome quantises this to 100 KB and a per-row
  // allocation disappears into the rounding.
  window.__jfbMemory = () =>
    guard(async () => {
      await clickId("run");
      if (window.gc) {
        window.gc();
        window.gc();
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
      return performance.memory ? performance.memory.usedJSHeapSize : null;
    }, "run memory");
})();
