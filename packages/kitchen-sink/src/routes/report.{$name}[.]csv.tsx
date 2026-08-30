/**
 * `/report/{$name}.csv` — a parameter carrying literal text.
 *
 * The suffix is REQUIRED and stripped, so this route owns `/report/q3.csv` and
 * not `/report/q3`. `[.]` in the filename escapes the dot that would otherwise
 * separate two segments.
 */

import { createFileRoute, useParams } from "@barqjs/router";

function Report() {
  const params = useParams();
  return <p id="report">report: {() => params().name}</p>;
}

export const Route = createFileRoute("/report/{$name}.csv")({ component: Report });
