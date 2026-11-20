import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Form(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M4 14h6" />
      <path d="M4 2h10" />
      <rect x="4" y="18" width="16" height="4" rx="1" />
      <rect x="4" y="6" width="16" height="4" rx="1" />
    </svg>
  );
}
