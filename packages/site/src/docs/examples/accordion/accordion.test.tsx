import { describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { render, screen, user } from "@barqjs/testing";

import { hydrateExamples } from "../test-harness.ts";
import AccordionDemo from "./accordion-demo.tsx";
import AccordionDisabled from "./accordion-disabled.tsx";
import AccordionMultiple from "./accordion-multiple.tsx";
import AccordionRtl from "./accordion-rtl.tsx";

const expanded = (name: string): string | null =>
  screen.getByRole("button", { name }).getAttribute("aria-expanded");

describe("the accordion examples", () => {
  test("every example is claimed from the server's markup", async () => {
    expect(await hydrateExamples("accordion")).toEqual([]);
  });

  test("a single accordion shuts the open section when another opens", async () => {
    render(() => <AccordionDemo />);
    expect(expanded("What are your shipping options?")).toBe("true");

    await user.click(screen.getByRole("button", { name: "What is your return policy?" }));
    flush();
    expect(expanded("What is your return policy?")).toBe("true");
    expect(expanded("What are your shipping options?")).toBe("false");
  });

  test("a multiple accordion keeps the first section open beside the second", async () => {
    render(() => <AccordionMultiple />);
    await user.click(screen.getByRole("button", { name: "Privacy & Security" }));
    flush();
    expect(expanded("Notification Settings")).toBe("true");
    expect(expanded("Privacy & Security")).toBe("true");
  });

  test("a disabled section does not open", async () => {
    render(() => <AccordionDisabled />);
    await user.click(screen.getByRole("button", { name: "Premium feature information" }));
    flush();
    expect(expanded("Premium feature information")).toBe("false");
  });

  test("the right-to-left example names its direction on an element", () => {
    render(() => <AccordionRtl />);
    expect(document.querySelector('[dir="rtl"] [data-slot="accordion"]')).not.toBeNull();
  });
});
