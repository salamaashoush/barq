import { expect, test } from "bun:test";
import { createRoot, createSignal, flush } from "@barqjs/core";
import {
  NumberParser,
  filter,
  provideDirection,
  provideLocale,
  useDirection,
  useLocale,
} from "./i18n.ts";

test("a filter matches without diacritics", () => {
  createRoot((dispose) => {
    const match = filter({ sensitivity: "base" });
    expect(match.contains("résumé", "resume")).toBe(true);
    expect(match.contains("Apple", "PP")).toBe(true);
    expect(match.contains("Apple", "z")).toBe(false);
    expect(match.startsWith("Apple", "app")).toBe(true);
    dispose();
  });
});

test("parses plain numbers", () => {
  const p = new NumberParser("en-US");
  expect(p.parse("10")).toBe(10);
  expect(p.parse("-10.5")).toBe(-10.5);
  expect(p.parse("1,234")).toBe(1234);
  expect(p.parse("abc")).toBeNaN();
});

test("parses in a locale that groups with a dot", () => {
  const p = new NumberParser("de-DE");
  expect(p.parse("1.234,5")).toBe(1234.5);
});

test("parses currency", () => {
  const p = new NumberParser("en-US", { style: "currency", currency: "USD" });
  expect(p.parse("$1,234.50")).toBe(1234.5);
  expect(p.parse("1234.50")).toBe(1234.5);
});

test("parses percent without floating point noise", () => {
  const p = new NumberParser("en-US", { style: "percent" });
  expect(p.parse("30%")).toBe(0.3);
  expect(p.parse("10%")).toBe(0.1);
});

test("accounting negatives", () => {
  const p = new NumberParser("en-US", {
    style: "currency",
    currency: "USD",
    currencySign: "accounting",
  });
  expect(p.parse("($1,234.50)")).toBe(-1234.5);
});

test("partial input stays valid", () => {
  const p = new NumberParser("en-US");
  expect(p.isValidPartialNumber("-")).toBe(true);
  expect(p.isValidPartialNumber("-1.")).toBe(true);
  expect(p.isValidPartialNumber("1.2.3")).toBe(false);
  expect(p.isValidPartialNumber("x")).toBe(false);
});

test("integers reject a decimal point", () => {
  const p = new NumberParser("en-US", { maximumFractionDigits: 0 });
  expect(p.isValidPartialNumber("1.")).toBe(false);
  expect(p.isValidPartialNumber("12")).toBe(true);
});

test("detects another numbering system", () => {
  const p = new NumberParser("en-US");
  expect(p.parse("١٢٣")).toBe(123);
});

test("a declared direction is read by the subtree, apart from the locale", () => {
  createRoot((dispose) => {
    provideLocale("en-US");
    createRoot(() => {
      provideDirection("rtl");
      createRoot(() => {
        expect(useDirection()()).toBe("rtl");
        expect(useLocale()()).toEqual({ locale: "en-US", direction: "rtl" });
      });
    });
    dispose();
  });
});

test("without a declared direction it follows the locale", () => {
  createRoot((dispose) => {
    provideLocale("ar-EG");
    createRoot(() => {
      expect(useDirection()()).toBe("rtl");
    });
    dispose();
  });
});

test("the nearest declaration wins, whichever kind it is", () => {
  createRoot((dispose) => {
    provideDirection("rtl");
    createRoot(() => {
      provideLocale("en-US");
      createRoot(() => {
        expect(useDirection()()).toBe("ltr");
      });
    });
    dispose();
  });
});

test("a direction signal moves every reader", () => {
  const [direction, setDirection] = createSignal<"ltr" | "rtl">("ltr");
  let read: () => "ltr" | "rtl" = direction;
  const dispose = createRoot((done) => {
    provideDirection(direction);
    createRoot(() => {
      read = useDirection();
    });
    return done;
  });
  expect(read()).toBe("ltr");
  setDirection("rtl");
  flush();
  expect(read()).toBe("rtl");
  dispose();
});
