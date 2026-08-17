/**
 * Barq Kitchen Sink - Test all features
 */

import { QueryClient } from "@tanstack/query-core";
import { render } from "@barqjs/core";
import { QueryClientProvider } from "@barqjs/extra";
import {
  globalCss,
} from "./styles";

import { App } from "./App";

// Global styles
globalCss`
  * {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  body {
    font-family: system-ui, -apple-system, sans-serif;
    background: #0f172a;
    color: #e2e8f0;
    line-height: 1.6;
  }

  a {
    color: #60a5fa;
    text-decoration: none;
  }

  a:hover {
    text-decoration: underline;
  }

  code {
    background: #1e293b;
    padding: 2px 6px;
    border-radius: 4px;
    font-family: "Fira Code", monospace;
  }

  pre {
    background: #1e293b;
    padding: 16px;
    border-radius: 8px;
    overflow-x: auto;
  }

  button {
    cursor: pointer;
    font-family: inherit;
  }

  input, select, textarea {
    font-family: inherit;
  }
`;

// Setup QueryClient
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5000,
      retry: 1,
    },
  },
});

// Mount app (App component contains its own Router).
//
// Written as the plain JSX argument, which is the whole point of O5 closing at
// M12: `scope` wraps a bare JSX argument in `render`'s first position into
// `(_s$) => …`, so this and the hand-written Block form are ONE program. Until
// then this file had to spell the Block out, because the argument form built
// the tree BEFORE `render` was entered and the root never owned it.
const container = document.getElementById("app");
if (!container) {
  throw new Error("[barq] #app is missing, so there is nowhere to mount");
}

// A mount that fails must SAY so. The previous entry point had no `try`, so a
// throw during construction left `#app` empty with nothing in the console —
// which is the failure a green test suite did not catch.
try {
  render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>,
    container,
  );
  console.log("Barq Kitchen Sink mounted");
} catch (error) {
  console.error("[barq] mount failed:", error);
  container.textContent = `Mount failed: ${String(error)}`;
  throw error;
}
