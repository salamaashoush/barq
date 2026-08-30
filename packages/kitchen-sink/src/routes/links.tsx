/**
 * `/links` — the `<Link>` prop surface, exercised in a browser.
 *
 * Each anchor here is one of the props that had no counterpart before: a
 * fragment, a query written as a function of the current one, a pinned `from`,
 * a refused click, and a click handed back to the browser.
 */

import { Link, NavLink, createFileRoute } from "@barqjs/router";

function Links() {
  return (
    <section>
      <h2>Links</h2>
      <Link to="/about" hash="team" id="with-hash">
        about, at #team
      </Link>
      <Link
        to="/links"
        search={(current: Record<string, string>) => ({ ...current, page: "2" })}
        id="edits-query"
      >
        next page, keeping the rest of the query
      </Link>
      <Link to="/about" disabled id="refused">
        refused
      </Link>
      <Link to="/about" reloadDocument id="full-load">
        full document load
      </Link>
      <NavLink
        to="/links"
        search={{ tab: "a" }}
        activeOptions={{ includeSearch: true }}
        activeClass="on"
        id="tab-a"
      >
        tab a
      </NavLink>
      <NavLink
        to="/links"
        search={{ tab: "b" }}
        activeOptions={{ includeSearch: true }}
        activeClass="on"
        id="tab-b"
      >
        tab b
      </NavLink>
    </section>
  );
}

export const Route = createFileRoute("/links")({ component: Links });
