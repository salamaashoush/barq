import { describe, expect, test } from "bun:test";
import { render, screen } from "@barqjs/testing";

import { CopyButton } from "./copy-button.tsx";
import { ENGLISH } from "./messages.ts";
import { ArcProvider } from "./provider.tsx";

describe("arc's words", () => {
  test("are English with nothing provided", () => {
    render(() => <CopyButton value="x" />);
    expect(screen.getByRole("button", { name: ENGLISH.copy })).toBeDefined();
  });

  test("come from the provider, and a component's own prop still wins", () => {
    render(() => (
      <ArcProvider colorScheme={false} toaster={false} messages={{ copy: "Kopieren" }}>
        <CopyButton value="x" />
        <CopyButton value="y" label="Den Schlüssel kopieren" />
      </ArcProvider>
    ));
    expect(screen.getByRole("button", { name: "Kopieren" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Den Schlüssel kopieren" })).toBeDefined();
  });
});
