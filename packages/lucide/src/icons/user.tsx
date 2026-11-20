import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function User(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}
