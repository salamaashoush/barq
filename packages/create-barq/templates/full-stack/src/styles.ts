/**
 * The application's styles. Compiled away: `css` returns a class name and each
 * block becomes a rule in a stylesheet the build emits, so nothing of these
 * calls reaches the bundle.
 */

import { css, globalCss } from "@barqjs/css";

globalCss`
  :root {
    color-scheme: light dark;
    --text: light-dark(#18181b, #fafafa);
    --muted: light-dark(#71717a, #a1a1aa);
    --surface: light-dark(#ffffff, #09090b);
    --border: light-dark(#e4e4e7, #27272a);
    --accent: light-dark(#18181b, #fafafa);
    --on-accent: light-dark(#fafafa, #18181b);
  }
  body {
    margin: 0;
    font-family: system-ui, sans-serif;
    line-height: 1.6;
    color: var(--text);
    background: var(--surface);
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
    border-bottom: 1px solid var(--border);
  }

  nav a {
    color: var(--muted);
    text-decoration: none;
  }

  nav a:hover,
  nav a.active {
    color: var(--text);
  }

  h1 {
    margin: 0 0 0.25rem;
    font-size: 2rem;
    letter-spacing: -0.02em;
  }

  p {
    margin: 0 0 1.5rem;
    color: var(--muted);
  }

  code {
    font-size: 0.875em;
    padding: 0.125rem 0.375rem;
    border-radius: 0.375rem;
    background: var(--border);
  }
`;

export const button = css`
  padding: 0.5rem 0.875rem;
  border: 1px solid var(--border);
  border-radius: 0.5rem;
  font: inherit;
  font-weight: 500;
  color: var(--on-accent);
  background: var(--accent);
  cursor: pointer;

  &:hover {
    opacity: 0.9;
  }

  &:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
`;
