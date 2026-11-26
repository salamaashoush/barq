import { describe, expect, test } from "bun:test";
import { type ParentProps } from "@barqjs/core";
import { provideLocale } from "@barqjs/aria/i18n";
import { ariaViolations, render, screen, user } from "@barqjs/testing";

import { hydrates } from "../test-arc.ts";
import { ErrorPage, NotFoundPage, StatusPage } from "./status-page.tsx";

function page(): HTMLElement {
  return document.querySelector('[data-slot="status-page"]') as HTMLElement;
}

class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

describe("StatusPage", () => {
  test("not found: the code, a first heading, and the way home", async () => {
    render(() => <StatusPage kind="not-found" homeHref="/app" />);
    expect(page().getAttribute("data-kind")).toBe("not-found");
    expect(document.querySelector('[data-slot="status-page-code"]')?.textContent).toBe("404");
    expect(screen.getByRole("heading", { level: 1, name: "Nothing here" })).toBeDefined();
    expect(screen.getByRole("link", { name: "Go home" }).getAttribute("href")).toBe("/app");
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(await ariaViolations(document.body)).toEqual([]);
  });

  test("a failure offers Try again, by keyboard and by tap, and keeps its details to hand", async () => {
    let retried = 0;
    let back = 0;
    render(() => (
      <StatusPage
        kind="failed"
        onRetry={() => retried++}
        onBack={() => back++}
        problemCode="db_timeout"
        details="query timed out after 30s"
      />
    ));
    const retry = screen.getByRole("button", { name: "Try again" });
    retry.focus();
    await user.keyboard("{Enter}");
    user.tap(retry);
    expect(retried).toBe(2);
    await user.click(screen.getByRole("button", { name: "Go back" }));
    expect(back).toBe(1);
    expect(screen.getByText("db_timeout").getAttribute("translate")).toBe("no");
    const details = document.querySelector(
      '[data-slot="status-page-details"]',
    ) as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(details.textContent).toContain("query timed out after 30s");
    expect(screen.getByRole("link", { name: "Go home" })).toBeDefined();
  });

  test("an ended session offers signing in; offline has no code; words can be the caller's", () => {
    render(() => (
      <>
        <StatusPage kind="signed-out" signInHref="/sign-in?next=%2F" />
        <StatusPage kind="offline" heading="No connection" code={null} />
      </>
    ));
    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe(
      "/sign-in?next=%2F",
    );
    const [, offline] = [...document.querySelectorAll('[data-slot="status-page"]')];
    expect(offline?.querySelector('[data-slot="status-page-code"]')).toBeNull();
    expect(screen.getByRole("heading", { name: "No connection" })).toBeDefined();
  });

  test("right to left, with a class per part", () => {
    function Rtl(props: ParentProps) {
      provideLocale("ar-EG");
      return <div dir="rtl">{props.children}</div>;
    }
    render(() => (
      <Rtl>
        <StatusPage kind="forbidden" heading="ممنوع" class="mine" classes={{ code: "c" }} />
      </Rtl>
    ));
    expect(page().classList.contains("mine")).toBe(true);
    expect(document.querySelector('[data-slot="status-page-code"]')?.classList.contains("c")).toBe(
      true,
    );
    expect(screen.getByRole("heading", { name: "ممنوع" })).toBeDefined();
  });
});

describe("ErrorPage", () => {
  test("reads the kind and the code off the error", () => {
    render(() => (
      <>
        <ErrorPage error={new ApiError(403, "forbidden", "not a member")} />
        <ErrorPage error={new ApiError(500, "db_timeout", "query timed out")} reset={() => {}} />
        <ErrorPage error={new Error("Bad Gateway")} />
      </>
    ));
    const kinds = [...document.querySelectorAll('[data-slot="status-page"]')].map((one) =>
      one.getAttribute("data-kind"),
    );
    expect(kinds).toEqual(["forbidden", "failed", "unreachable"]);
    expect(screen.getByText("db_timeout")).toBeDefined();
    expect(screen.getByText("query timed out")).toBeDefined();
    expect(screen.getAllByRole("button", { name: "Try again" })).toHaveLength(2);
  });

  test("NotFoundPage, and a server's status page hydrated in place", async () => {
    render(() => <NotFoundPage />);
    expect(screen.getByRole("heading", { name: "Nothing here" })).toBeDefined();
    const result = await hydrates(`
      import { StatusPage } from "<arc>";
      export function Page() {
        return <StatusPage kind="failed" onRetry={() => {}} problemCode="e1" details="boom" />;
      }
    `);
    expect(result.container.textContent).toContain("500");
    result.unmount();
  });
});
