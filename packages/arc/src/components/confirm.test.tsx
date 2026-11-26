import { describe, expect, test } from "bun:test";
import { type ParentProps } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, render, screen, user } from "@barqjs/testing";

import { hydrates, settle } from "../test-arc.ts";
import { ConfirmHost, type DependentsCheck, confirm } from "./confirm.tsx";
import { provideArcMessages } from "./messages.ts";

function deferred<T>() {
  return Promise.withResolvers<T>();
}

function button(name: string): HTMLButtonElement {
  return screen.getByRole<HTMLButtonElement>("button", { name });
}

function disabled(name: string): boolean {
  const element = button(name);
  return element.disabled || element.getAttribute("aria-disabled") === "true";
}

async function type(element: HTMLElement, text: string): Promise<void> {
  await user.type(element, text);
  await settle();
}

describe("confirm", () => {
  test("resolves true when the reader confirms, and closes", async () => {
    render(() => <ConfirmHost />);
    const answer = confirm({
      title: "Delete the check?",
      description: "Its history goes with it.",
      confirmLabel: "Delete",
      tone: "danger",
    });
    await settle();
    expect(screen.getByRole("alertdialog")).toBeDefined();
    expect(screen.getByText("Its history goes with it.")).toBeDefined();
    await user.click(button("Delete"));
    expect(await answer).toBe(true);
    await settle();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  test("resolves false on cancel, and on Escape", async () => {
    render(() => <ConfirmHost />);
    const first = confirm({ title: "Leave without saving?" });
    await settle();
    await user.click(button("Cancel"));
    expect(await first).toBe(false);
    await settle();
    const second = confirm({ title: "Leave without saving?" });
    await settle();
    await user.keyboard("{Escape}");
    expect(await second).toBe(false);
  });

  test("answers an open question false when a second one is asked", async () => {
    render(() => <ConfirmHost />);
    const first = confirm({ title: "First?" });
    await settle();
    const second = confirm({ title: "Second?" });
    expect(await first).toBe(false);
    await settle();
    expect(screen.getByText("Second?")).toBeDefined();
    await user.click(button("Continue"));
    expect(await second).toBe(true);
  });

  test("an alert dialog named by its title and described, with no violations", async () => {
    render(() => <ConfirmHost />);
    void confirm({
      title: "Archive the project?",
      description: "Nothing in it runs while it is archived.",
      field: { kind: "checkbox", label: "Tell its members" },
      typeToConfirm: "acme-web",
    });
    await settle();
    const dialog = screen.getByRole("alertdialog");
    expect(dialog.getAttribute("aria-labelledby")).not.toBeNull();
    expect(dialog.getAttribute("aria-describedby")).not.toBeNull();
    expect(await ariaViolations(document.body)).toEqual([]);
  });
});

describe("confirm with a field", () => {
  test("a checkbox answers with whether it was ticked", async () => {
    render(() => <ConfirmHost />);
    const answer = confirm({
      title: "Delete the location?",
      tone: "danger",
      confirmLabel: "Delete",
      field: { kind: "checkbox", label: "Also delete its runners" },
    });
    await settle();
    const box = screen.getByRole("checkbox", { name: "Also delete its runners" });
    await user.click(box);
    await settle();
    await user.click(button("Delete"));
    expect(await answer).toEqual({ value: true });
  });

  test("cancelling a question with a field answers null", async () => {
    render(() => <ConfirmHost />);
    const answer = confirm({
      title: "Delete the location?",
      field: { kind: "checkbox", label: "Also delete its runners", defaultValue: true },
    });
    await settle();
    await user.click(button("Cancel"));
    expect(await answer).toBeNull();
  });

  test("a required reason holds the button until there are words, and submitting sends them", async () => {
    render(() => <ConfirmHost />);
    const answer = confirm({
      title: "Change the grade?",
      confirmLabel: "Change",
      field: { kind: "text", label: "Why", description: "Kept in the audit log." },
    });
    await settle();
    expect(disabled("Change")).toBe(true);
    const why = screen.getByRole("textbox", { name: "Why" });
    expect(why.getAttribute("aria-describedby")).not.toBeNull();
    await type(why, "   ");
    expect(disabled("Change")).toBe(true);
    await type(why, "Marked twice");
    expect(disabled("Change")).toBe(false);
    // What Enter in the field does in a browser; happy-dom has no implicit submission.
    (why as HTMLInputElement).form?.requestSubmit();
    expect(await answer).toEqual({ value: "   Marked twice" });
  });

  test("a choice answers with the value picked", async () => {
    render(() => <ConfirmHost />);
    const answer = confirm({
      title: "Delete the role?",
      confirmLabel: "Delete",
      field: {
        kind: "select",
        label: "Move its holders to",
        options: [
          { value: "member", label: "Member" },
          { value: "viewer", label: "Viewer" },
        ],
      },
    });
    await settle();
    expect(disabled("Delete")).toBe(true);
    const select = screen.getByRole<HTMLSelectElement>("combobox", { name: "Move its holders to" });
    select.value = "viewer";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await settle();
    await user.click(button("Delete"));
    expect(await answer).toEqual({ value: "viewer" });
  });
});

describe("type to confirm", () => {
  test("the button waits for the exact name, which is set apart in the label", async () => {
    render(() => <ConfirmHost />);
    const answer = confirm({
      title: "Delete acme-web?",
      tone: "danger",
      confirmLabel: "Delete",
      typeToConfirm: "acme-web",
    });
    await settle();
    expect(document.querySelector('[data-slot="confirm-typed"]')?.textContent).toBe("acme-web");
    const input = screen.getByRole("textbox", { name: "To confirm, type acme-web" });
    expect(disabled("Delete")).toBe(true);
    await type(input, "acme-we");
    expect(disabled("Delete")).toBe(true);
    (input as HTMLInputElement).form?.requestSubmit();
    await settle();
    expect(screen.getByRole("alertdialog")).toBeDefined();
    await type(input, "b");
    expect(disabled("Delete")).toBe(false);
    await user.click(button("Delete"));
    expect(await answer).toBe(true);
  });

  test("the words follow the provider, wherever the language puts the name", async () => {
    function Arabic(props: ParentProps) {
      provideLocale("ar-EG");
      provideArcMessages(() => ({ typeToConfirm: (text) => `اكتب ${text} للتأكيد` }));
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => (
      <Arabic>
        <ConfirmHost />
      </Arabic>
    ));
    void confirm({ title: "حذف؟", typeToConfirm: "acme" });
    await settle();
    const label = document.querySelector('[data-slot="confirm-type"] label');
    expect(label?.textContent).toBe("اكتب acme للتأكيد");
    expect(label?.querySelector('[data-slot="confirm-typed"]')?.textContent).toBe("acme");
  });
});

describe("an action inside the confirmation", () => {
  test("holds the dialog pending while it runs, then resolves", async () => {
    render(() => <ConfirmHost />);
    const running = deferred<void>();
    let ran = 0;
    const answer = confirm({
      title: "Archive the project?",
      confirmLabel: "Archive",
      action: () => {
        ran++;
        return running.promise;
      },
    });
    await settle();
    await user.click(button("Archive"));
    await settle();
    expect(ran).toBe(1);
    expect(disabled("Cancel")).toBe(true);
    await user.keyboard("{Escape}");
    await settle();
    expect(screen.getByRole("alertdialog")).toBeDefined();
    running.resolve();
    expect(await answer).toBe(true);
  });

  test("a failure stays inside as a sentence, and a second try can succeed", async () => {
    render(() => <ConfirmHost />);
    let calls = 0;
    const answer = confirm({
      title: "Delete the key?",
      confirmLabel: "Delete",
      field: { kind: "checkbox", label: "Revoke its sessions" },
      action: (revoke) => {
        calls++;
        expect(revoke).toBe(false);
        if (calls === 1) throw new Error("key is in use by a running job");
      },
    });
    await settle();
    await user.click(button("Delete"));
    await settle();
    expect(screen.getByRole("alert").textContent).toContain("Key is in use by a running job.");
    expect(screen.getByRole("alertdialog")).toBeDefined();
    await user.click(button("Delete"));
    expect(await answer).toEqual({ value: false });
  });

  test("details are drawn inside the dialog", async () => {
    render(() => <ConfirmHost />);
    void confirm({
      title: "Delete the project?",
      details: () => (
        <ul>
          <li>12 checks with 3,400 runs</li>
        </ul>
      ),
    });
    await settle();
    expect(screen.getByText("12 checks with 3,400 runs")).toBeDefined();
  });
});

describe("dependency-aware delete", () => {
  test("says it is checking, then refuses with the blockers, their links and the rest counted", async () => {
    render(() => <ConfirmHost />);
    const loading = deferred<DependentsCheck>();
    const answer = confirm({
      title: "Delete the tunnel?",
      tone: "danger",
      confirmLabel: "Delete",
      dependents: () => loading.promise,
    });
    await settle();
    expect(screen.getByRole("status").getAttribute("aria-busy")).toBe("true");
    expect(screen.getByText("Checking what depends on it…")).toBeDefined();
    expect(disabled("Delete")).toBe(true);
    loading.resolve({
      blockers: [
        { id: "c1", label: "Homepage", href: "/checks/c1" },
        { id: "c2", label: "Checkout", href: "/checks/c2", description: "Runs every minute" },
      ],
      blockerCount: 12,
    });
    await settle();
    expect(screen.getByRole("heading", { name: "This can't be deleted yet" })).toBeDefined();
    expect(screen.getByRole("link", { name: "Homepage" }).getAttribute("href")).toBe("/checks/c1");
    expect(screen.getByText("and 10 more")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
    await user.click(button("Close"));
    expect(await answer).toBe(false);
  });

  test("with nothing blocking, names the affected and the fallback, then confirms", async () => {
    render(() => <ConfirmHost />);
    const answer = confirm({
      title: "Delete BASE_URL?",
      confirmLabel: "Delete",
      dependents: async () => ({
        affected: [{ id: "c1", label: "Homepage" }],
        fallback: "They read the project's value instead.",
      }),
    });
    await settle();
    await settle();
    expect(screen.getByText("1 item depends on it:")).toBeDefined();
    expect(screen.getByText("They read the project's value instead.")).toBeDefined();
    await user.click(button("Delete"));
    expect(await answer).toBe(true);
  });

  test("a check that fails says so and can be tried again", async () => {
    render(() => <ConfirmHost />);
    let calls = 0;
    void confirm({
      title: "Delete the profile?",
      confirmLabel: "Delete",
      dependents: async () => {
        calls++;
        if (calls === 1) throw new Error("service unavailable");
        return {};
      },
    });
    await settle();
    await settle();
    expect(screen.getByRole("alert").textContent).toContain("Service unavailable.");
    expect(disabled("Delete")).toBe(true);
    await user.click(button("Retry"));
    await settle();
    await settle();
    expect(disabled("Delete")).toBe(false);
  });
});

describe("ConfirmHost", () => {
  test("takes a class per part", async () => {
    render(() => <ConfirmHost class="mine" classes={{ body: "b", footer: "f", action: "a" }} />);
    void confirm({ title: "Sure?", field: { kind: "checkbox", label: "Also" } });
    await settle();
    expect(screen.getByRole("alertdialog").closest(".mine")).not.toBeNull();
    expect(document.querySelector('[data-slot="confirm-body"]')?.classList.contains("b")).toBe(
      true,
    );
    expect(button("Continue").classList.contains("a")).toBe(true);
  });

  test("a server's page with the host hydrates in place", async () => {
    const result = await hydrates(`
      import { ConfirmHost } from "<arc>";
      export function Page() {
        return <main><p>Settings</p><ConfirmHost /></main>;
      }
    `);
    expect(result.container.textContent).toContain("Settings");
    result.unmount();
  });
});
