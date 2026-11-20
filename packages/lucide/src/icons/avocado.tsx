import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Avocado(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M13.465 3.464a5 5 0 017.07 0 5 5 0 010 7.072c-1.204 1.203-2.38 2.89-2.614 4.577A8 8 0 118.886 6.08c1.687-.235 3.375-1.41 4.579-2.615" />
      <circle cx="10" cy="14" r="3" />
    </svg>
  );
}
