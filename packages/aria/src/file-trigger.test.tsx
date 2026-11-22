import { describe, expect, test } from "bun:test";
import { flush } from "@barqjs/core";
import { render, screen, user } from "@barqjs/testing";
import { Button } from "./button.tsx";
import { FileTrigger, useFileTrigger } from "./file-trigger.tsx";

function fileInput(): HTMLInputElement {
  const input = document.querySelector('input[type="file"]');
  if (!(input instanceof HTMLInputElement)) throw new Error("no file input");
  return input;
}

/** What a picker hands back: a `FileList` the input reports in `change`. */
function choose(input: HTMLInputElement, files: File[]): void {
  const list = Object.assign([...files], {
    item: (index: number) => files[index] ?? null,
  }) as unknown as FileList;
  Object.defineProperty(input, "files", { configurable: true, value: list });
  input.dispatchEvent(new Event("change", { bubbles: true }));
  flush();
}

describe("FileTrigger", () => {
  test("renders the control it was given and a hidden file input", () => {
    render(() => (
      <FileTrigger>
        <Button>Upload</Button>
      </FileTrigger>
    ));

    expect(screen.getByRole("button", { name: "Upload" })).not.toBeNull();
    const input = fileInput();
    expect(input.style.display).toBe("none");
    expect(input.hasAttribute("multiple")).toBe(false);
    expect(input.hasAttribute("webkitdirectory")).toBe(false);
  });

  test("pressing the button clicks the input", () => {
    render(() => (
      <FileTrigger>
        <Button>Upload</Button>
      </FileTrigger>
    ));
    let clicks = 0;
    fileInput().addEventListener("click", () => clicks++);

    user.click(screen.getByRole("button"));
    flush();

    expect(clicks).toBe(1);
  });

  test("the keyboard opens it too", () => {
    render(() => (
      <FileTrigger>
        <Button>Upload</Button>
      </FileTrigger>
    ));
    let clicks = 0;
    fileInput().addEventListener("click", () => clicks++);

    user.focus(screen.getByRole("button"));
    user.key("Enter");
    flush();

    expect(clicks).toBe(1);
  });

  test("the input's click does not bubble past the trigger", () => {
    let outer = 0;
    render(() => (
      <div onClick={() => outer++}>
        <FileTrigger>
          <Button>Upload</Button>
        </FileTrigger>
      </div>
    ));
    const before = outer;

    fileInput().click();
    flush();

    expect(outer).toBe(before);
  });

  test("a choice is reported with the files picked", () => {
    const picked: (FileList | null)[] = [];
    render(() => (
      <FileTrigger onSelect={(files) => picked.push(files)}>
        <Button>Upload</Button>
      </FileTrigger>
    ));
    const file = new File(["hello"], "salama.png", { type: "image/png" });

    choose(fileInput(), [file]);

    expect(picked).toHaveLength(1);
    expect(picked[0]?.[0]).toBe(file);
    expect(picked[0]?.item(0)).toBe(file);
  });

  test("the input is emptied before each press, so the same file can be picked twice", () => {
    render(() => (
      <FileTrigger>
        <Button>Upload</Button>
      </FileTrigger>
    ));
    const input = fileInput();
    let valueAtClick = "unread" as string;
    input.addEventListener("click", () => {
      valueAtClick = input.value;
    });
    Object.defineProperty(input, "value", {
      configurable: true,
      get: () => stored,
      set: (next: string) => {
        stored = next;
      },
    });
    let stored = "C:\\fakepath\\salama.png";

    user.click(screen.getByRole("button"));
    flush();

    expect(valueAtClick).toBe("");
  });

  test("accepted types, multiple, camera and directory reach the input", () => {
    render(() => (
      <FileTrigger
        acceptedFileTypes={["image/png", ".jpg"]}
        allowsMultiple
        defaultCamera="environment"
        acceptDirectory
      >
        <Button>Upload</Button>
      </FileTrigger>
    ));

    const input = fileInput();
    expect(input.getAttribute("accept")).toBe("image/png,.jpg");
    expect(input.hasAttribute("multiple")).toBe(true);
    expect(input.getAttribute("capture")).toBe("environment");
    expect(input.hasAttribute("webkitdirectory")).toBe(true);
  });

  test("the ref and data attributes land on the input", () => {
    let held: HTMLInputElement | null = null;
    render(() => (
      <FileTrigger
        data-testid="acme-upload"
        ref={(element) => {
          held = element;
        }}
      >
        <Button>Upload</Button>
      </FileTrigger>
    ));

    const input = screen.getByTestId("acme-upload");
    expect(input).toBe(fileInput());
    expect(held === input).toBe(true);
  });

  test("a control of the caller's own opens it through the context", () => {
    function Custom() {
      const trigger = useFileTrigger();
      return (
        <span role="button" tabIndex={0} onClick={() => trigger?.open()}>
          Choose
        </span>
      );
    }
    render(() => (
      <FileTrigger>
        <Custom />
      </FileTrigger>
    ));
    let clicks = 0;
    fileInput().addEventListener("click", () => clicks++);

    screen.getByRole("button").click();
    flush();

    expect(clicks).toBe(1);
  });

  test("a sibling outside the trigger is not made into one", () => {
    render(() => (
      <>
        <FileTrigger>
          <Button>Upload</Button>
        </FileTrigger>
        <Button>Cancel</Button>
      </>
    ));
    let clicks = 0;
    fileInput().addEventListener("click", () => clicks++);

    user.click(screen.getByRole("button", { name: "Cancel" }));
    flush();

    expect(clicks).toBe(0);
  });
});
