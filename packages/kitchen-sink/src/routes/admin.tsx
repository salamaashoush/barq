/**
 * `/admin` — the route whose middleware the build enforces on its actions.
 *
 * `middleware` is NOT a guard and the router never runs it. It is a BUILD-time
 * claim: "every server function reachable from this route carries this chain".
 * `barqStart({ verify })` checks it against what each function actually carries
 * and fails the build when they disagree.
 *
 * Not prerendered, and it must not be: a page behind a session is the one page
 * that must never be a file on a CDN.
 */

import { Loading } from "@barqjs/core";
import type { RouteProps } from "@barqjs/router";

import { requireSession } from "../auth.ts";
import { type AdminStats, adminStats } from "../data/admin.ts";

export const middleware = [requireSession];

export const head = {
  title: "Admin — Barq Kitchen Sink",
  meta: [
    { name: "description", content: "The route-action chain check, armed." },
    // A page behind a session is not for an index, whatever the crawler thinks.
    { name: "robots", content: "noindex,nofollow" },
  ],
};

export const loader = async (): Promise<AdminStats> => adminStats(undefined);

export const Pending = (): unknown => <p>Loading admin…</p>;

export default function Admin(props: RouteProps<AdminStats | undefined>) {
  return (
    <section>
      <h2>Admin</h2>
      <p>
        This route declares <code>middleware: [requireSession]</code>, and the
        build refuses to ship unless every server function it can reach carries
        the same closure. Remove <code>.middleware([requireSession])</code> from{" "}
        <code>data/admin.ts</code> and <code>vite build</code> fails naming both.
      </p>
      <Loading fallback={<p>Loading admin…</p>}>
        <dl>
          <dt>users</dt>
          <dd>{() => props.data()?.users ?? "—"}</dd>
          <dt>sessions</dt>
          <dd>{() => props.data()?.sessions ?? "—"}</dd>
        </dl>
      </Loading>
    </section>
  );
}
