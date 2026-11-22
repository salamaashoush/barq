/**
 * The application's styles. Compiled away: `css` returns a class name and each
 * block becomes a rule in a stylesheet the build emits, so nothing of these
 * calls reaches the bundle.
 */

import { css, globalCss } from "@barqjs/css";

// The colours are read from the names the barq-ui theme defines, each with a
// light fallback. Before `barq-ui init` the fallbacks draw the page; after it
// the page and the components share one theme, dark mode included.
globalCss`
  body {
    margin: 0;
    font-family: system-ui, sans-serif;
    line-height: 1.6;
    color: var(--foreground, #18181b);
    background: var(--background, #ffffff);
  }
`;

export const layout = css`
  max-width: 48rem;
  margin: 0 auto;
  padding: 2rem 1.5rem 4rem;

  nav {
    display: flex;
    gap: 1.25rem;
    padding-bottom: 1rem;
    margin-bottom: 2.5rem;
    border-bottom: 1px solid var(--border, #e4e4e7);
  }

  nav a {
    color: var(--muted-foreground, #71717a);
    text-decoration: none;
  }

  nav a:hover,
  nav a.active {
    color: var(--foreground, #18181b);
  }

  h1 {
    margin: 0 0 0.25rem;
    font-size: 2rem;
    font-weight: 600;
    letter-spacing: -0.02em;
  }

  p {
    margin: 0 0 1.5rem;
    color: var(--muted-foreground, #71717a);
  }

  code {
    font-size: 0.875em;
    padding: 0.125rem 0.375rem;
    border-radius: 0.375rem;
    background: var(--muted, #f4f4f5);
  }
`;

export const button = css`
  padding: 0.5rem 0.875rem;
  border: 1px solid var(--border, #e4e4e7);
  border-radius: 0.5rem;
  font: inherit;
  font-weight: 500;
  color: var(--primary-foreground, #fafafa);
  background: var(--primary, #18181b);
  cursor: pointer;

  &:hover {
    opacity: 0.9;
  }

  &:focus-visible {
    outline: 2px solid var(--ring, #18181b);
    outline-offset: 2px;
  }
`;
