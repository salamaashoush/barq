import { describe, expect, test } from "bun:test";
import { type ParentProps, createSignal } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, render, screen, user } from "@barqjs/testing";

import { hydrates, settle } from "../test-arc.ts";
import {
  type DocumentStage,
  DocumentWorkflowBar,
  type SavedStage,
  useDocumentWorkflow,
} from "./document-workflow.tsx";

function disabled(name: string): boolean {
  const button = screen.getByRole("button", { name });
  return button.hasAttribute("disabled") || button.getAttribute("aria-disabled") === "true";
}

function choose(stage: SavedStage): void {
  const select = screen.getByRole<HTMLSelectElement>("combobox", { name: "Review state" });
  select.value = stage;
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

interface Harness {
  stage: () => DocumentStage;
  saves: SavedStage[];
  published: () => number;
}

function mount(initial: DocumentStage, edited = false): Harness {
  const [stage, setStage] = createSignal<DocumentStage>(initial);
  const [dirty] = createSignal(edited);
  const saves: SavedStage[] = [];
  let published = 0;
  function Page() {
    const workflow = useDocumentWorkflow({ stage, dirty });
    return (
      <>
        <DocumentWorkflowBar
          workflow={workflow}
          onSave={(next) => {
            saves.push(next);
            setStage(next);
          }}
          onPublish={() => published++}
        />
        <textarea aria-label="Body" readOnly={workflow.locked()} />
      </>
    );
  }
  render(() => <Page />);
  return { stage, saves, published: () => published };
}

describe("DocumentWorkflowBar", () => {
  test("Start while there is none, which saves a draft", async () => {
    const page = mount("none");
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByRole("button", { name: /Publish/ })).toBeNull();
    const start = screen.getByRole("button", { name: "Start" });
    start.focus();
    await user.keyboard("{Enter}");
    await settle();
    expect(page.saves).toEqual(["draft"]);
    expect(screen.getByRole("combobox", { name: "Review state" })).toBeDefined();
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("completing locks the document and says so; setting it back unlocks it", async () => {
    const page = mount("review");
    expect(disabled("Save")).toBe(true);
    choose("completed");
    await settle();
    expect(disabled("Save")).toBe(false);
    user.tap(screen.getByRole("button", { name: "Save" }));
    await settle();
    expect(page.saves).toEqual(["completed"]);
    expect(screen.getByRole("textbox", { name: "Body" }).hasAttribute("readonly")).toBe(true);
    expect(document.querySelector('[data-slot="document-workflow-locked"]')?.textContent).toContain(
      "Set it back to draft or in review",
    );
    choose("draft");
    await settle();
    expect(screen.getByRole("textbox", { name: "Body" }).hasAttribute("readonly")).toBe(false);
  });

  test("publishing waits for the changes to be saved, and says why", async () => {
    const page = mount("draft", true);
    expect(disabled("Publish")).toBe(true);
    const publish = screen.getByRole("button", { name: "Publish" });
    const held = document.getElementById(publish.getAttribute("aria-describedby") ?? "");
    expect(held?.textContent).toBe("Save the changes before publishing.");
    expect(page.published()).toBe(0);
  });

  test("a saved document publishes, in a right-to-left page", async () => {
    function Rtl(props: ParentProps) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    const [stage] = createSignal<DocumentStage>("review");
    let published = 0;
    function Page() {
      const workflow = useDocumentWorkflow({ stage });
      return (
        <Rtl>
          <DocumentWorkflowBar
            workflow={workflow}
            onSave={() => {}}
            onPublish={() => published++}
            class="mine"
          />
        </Rtl>
      );
    }
    render(() => <Page />);
    await user.click(screen.getByRole("button", { name: "Publish" }));
    await settle();
    expect(published).toBe(1);
    expect(
      document.querySelector('[data-slot="document-workflow"]')?.classList.contains("mine"),
    ).toBe(true);
  });

  test("a server's workflow bar is hydrated in place", async () => {
    const result = await hydrates(`
      import { DocumentWorkflowBar, useDocumentWorkflow } from "<arc>";
      export function Page() {
        const workflow = useDocumentWorkflow({ stage: () => "completed" });
        return <DocumentWorkflowBar workflow={workflow} onSave={() => {}} />;
      }
    `);
    expect(result.container.textContent).toContain("Completed, so it cannot be changed.");
    result.unmount();
  });
});
