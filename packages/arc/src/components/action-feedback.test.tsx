import { describe, expect, test } from "bun:test";
import { ariaViolations, render, screen, user } from "@barqjs/testing";
import { Button } from "@barqjs/ui/button";
import { toast } from "@barqjs/ui/sonner";

import { hydrates, settle } from "../test-arc.ts";
import { ActionError, type ActionState, useAction } from "./action-feedback.tsx";

describe("useAction", () => {
  test("pending while it runs, then a success toast worded from its result", async () => {
    const running = Promise.withResolvers<string>();
    const refreshed: string[] = [];
    let action: ActionState<string, string> | undefined;
    function Page() {
      action = useAction((name: string) => running.promise.then((id) => `${name}:${id}`), {
        success: (output) => `${output} saved`,
        onSuccess: (output) => {
          refreshed.push(output);
        },
      });
      return (
        <Button isPending={action.pending()} onPress={() => void action?.run("BASE_URL")}>
          Save
        </Button>
      );
    }
    render(() => <Page />);
    const save = screen.getByRole("button", { name: "Save" });
    save.focus();
    await user.keyboard("{Enter}");
    await settle();
    expect(action?.pending()).toBe(true);
    running.resolve("7");
    await settle();
    await settle();
    expect(action?.pending()).toBe(false);
    expect(refreshed).toEqual(["BASE_URL:7"]);
    expect(toast.getHistory().at(-1)?.title).toBe("BASE_URL:7 saved");
  });

  test("a failure is a toast with the server's words as a sentence; run never throws", async () => {
    let action: ActionState<void, unknown> | undefined;
    function Page() {
      action = useAction(async () => {
        throw new Error("webhook URLs must use https");
      });
      return <p>page</p>;
    }
    render(() => <Page />);
    expect(await action?.run()).toBeUndefined();
    const last = toast.getHistory().at(-1);
    expect(last?.title).toBe("That did not work. Try again.");
    expect(last?.description).toBe("Webhook URLs must use https.");
  });

  test("an inline failure shows where it happened, and goes with the next run", async () => {
    let attempts = 0;
    function Page() {
      const save = useAction(
        async () => {
          attempts++;
          if (attempts === 1)
            throw { status: 422, error: { code: "invalid", message: "name is taken" } };
        },
        { inline: true },
      );
      return (
        <form>
          <ActionError action={save} title="Not saved" class="mine" />
          <Button onPress={() => void save.run()}>Save</Button>
        </form>
      );
    }
    render(() => <Page />);
    user.tap(screen.getByRole("button", { name: "Save" }));
    await settle();
    await settle();
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Not saved");
    expect(alert.textContent).toContain("Name is taken.");
    expect(alert.classList.contains("mine")).toBe(true);
    expect(await ariaViolations(document.body)).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Save" }));
    await settle();
    await settle();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  test("a server's page with an action error, none yet, is hydrated in place", async () => {
    const result = await hydrates(`
      import { ActionError, useAction } from "<arc>";
      export function Page() {
        const save = useAction(async () => {}, { inline: true });
        return <section><ActionError action={save} /><p>Form</p></section>;
      }
    `);
    expect(result.container.textContent).toBe("Form");
    result.unmount();
  });
});
