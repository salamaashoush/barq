/**
 * What more than one demo file needs, so a change to the row's gap is one edit.
 *
 * Upstream's demos are one file each under `registry/new-york-v4/examples`, and
 * each one repeats `flex items-center gap-2` in its own class list. These three
 * are that, named.
 */

import { css } from "@barqjs/css";

export const row = css`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: calc(var(--spacing) * 2);
`;

export const stack = css`
  display: flex;
  width: 100%;
  max-width: 22rem;
  flex-direction: column;
  gap: calc(var(--spacing) * 4);
`;

export const wide = css`
  display: flex;
  width: 100%;
  flex-direction: column;
  gap: calc(var(--spacing) * 4);
`;
