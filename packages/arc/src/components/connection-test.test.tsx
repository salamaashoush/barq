import { afterEach, describe, expect, test } from "bun:test";
import { destroyAnnouncer } from "@barqjs/aria/live";
import { ariaViolations, render, screen, user, waitFor, within } from "@barqjs/testing";

import { hydrates, settle } from "../test-arc.ts";
import { ConnectionTestDialog, type ConnectionTestResult } from "./connection-test.tsx";

afterEach(() => destroyAnnouncer());

function deferred(): PromiseWithResolvers<ConnectionTestResult> {
  return Promise.withResolvers<ConnectionTestResult>();
}

describe("ConnectionTestDialog", () => {
  test("tests, says how it went in a status, and stays open to try again", async () => {
    const probes: string[] = [];
    let pending = deferred();
    render(() => (
      <ConnectionTestDialog
        heading="Test vault-prod"
        defaultOpen
        probe={{ label: "Reference", placeholder: "web/stripe#api_key" }}
        onTest={(probe: string) => {
          probes.push(probe);
          return pending.promise;
        }}
      />
    ));
    await settle();
    const dialog = await waitFor(() => screen.getByRole("dialog", { name: "Test vault-prod" }));
    await user.type(within(dialog).getByLabelText("Reference"), "web/stripe#api_key");
    await user.click(within(dialog).getByRole("button", { name: "Test" }));
    await settle();
    expect(probes).toEqual(["web/stripe#api_key"]);
    const status = within(dialog).getByRole("status");
    expect(status.textContent).toBe("Testing…");
    pending.resolve({ ok: false, message: "Vault refused the role." });
    await waitFor(() => expect(status.textContent).toBe("It failed. Vault refused the role."));
    expect(status.getAttribute("data-outcome")).toBe("failed");
    pending = deferred();
    await user.click(within(dialog).getByRole("button", { name: "Test" }));
    pending.resolve({ ok: true, message: "Signed in and read the reference." });
    await waitFor(() =>
      expect(status.textContent).toBe("It worked. Signed in and read the reference."),
    );
    expect(screen.getByRole("dialog")).toBeDefined();
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("a test that throws is a failure in the server's words; Done closes it", async () => {
    render(() => (
      <ConnectionTestDialog
        defaultOpen
        onTest={() => Promise.reject(new Error("connection refused"))}
      />
    ));
    await settle();
    const dialog = await waitFor(() => screen.getByRole("dialog", { name: "Test the connection" }));
    expect(within(dialog).queryByRole("textbox")).toBeNull();
    await user.click(within(dialog).getByRole("button", { name: "Test" }));
    await waitFor(() =>
      expect(within(dialog).getByRole("status").textContent).toBe("It failed. Connection refused."),
    );
    await user.click(within(dialog).getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.queryByRole("dialog") === null).toBe(true));
  });
});

describe("ConnectionTestDialog on the server", () => {
  test("its trigger is hydrated in place", async () => {
    const result = await hydrates(`
      import { ConnectionTestDialog } from "<arc>";
      import { Button } from "@barqjs/ui/button";
      export function Page() {
        return (
          <ConnectionTestDialog heading="Test vault-prod" trigger={<Button variant="outline">Test</Button>}
            onTest={() => Promise.resolve({ ok: true, message: "Fine." })} />
        );
      }
    `);
    expect(result.container.textContent).toContain("Test");
    result.unmount();
  });
});
