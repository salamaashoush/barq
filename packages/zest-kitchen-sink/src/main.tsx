/**
 * Zest Kitchen Sink - Test all features
 */

import { QueryClient } from "@tanstack/query-core";
import { render } from "@barqjs/core";
import { Router, css, defineRoutes, globalCss, setQueryClient } from "@barqjs/extra";

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
setQueryClient(queryClient);

// Routes
const routes = defineRoutes([
  {
    path: "/",
    component: () => <App />,
  },
]);

// Mount app
const container = document.getElementById("app");
if (container) {
  render(
    <Router config={{ routes }}>
      <App />
    </Router>,
    container,
  );
}

console.log("Zest Kitchen Sink mounted");
