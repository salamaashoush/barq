import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function UserExclamationPoint(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M15 15H9a4 4 0 00-4 4v2" />
      <path d="M18.988 13v4" />
      <path d="M18.988 21h.01" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}
