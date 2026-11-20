import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function GitBranch(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M15 6a9 9 0 0 0-9 9V3" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
    </svg>
  );
}
