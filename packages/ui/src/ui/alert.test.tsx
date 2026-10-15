import { describe, expect, test } from "bun:test";
import { render, screen } from "@barqjs/testing";

import { rulesFor } from "../test-rules.ts";

import { Alert, AlertAction, AlertDescription, AlertTitle } from "./alert.tsx";

describe("Alert in a right-to-left page", () => {
  test("the text and the action follow the reading direction", () => {
    render(() => (
      <Alert>
        <AlertTitle>Heads up</AlertTitle>
        <AlertDescription>Something changed.</AlertDescription>
        <AlertAction>
          <button type="button">Undo</button>
        </AlertAction>
      </Alert>
    ));

    const root = rulesFor(screen.getByRole("alert").className);
    expect(root).toContain("text-align: start");
    expect(root).not.toContain("text-align: left");
    expect(root).toContain(
      ':has([data-slot="alert-action"]){padding-inline-end: calc(var(--spacing) * 18)',
    );
    expect(root).not.toContain("padding-right");

    const action = rulesFor(
      (document.querySelector('[data-slot="alert-action"]') as HTMLElement).className,
    );
    expect(action).toContain("inset-inline-end: calc(var(--spacing) * 2)");
    expect(action).not.toContain("{right:");
  });
});
