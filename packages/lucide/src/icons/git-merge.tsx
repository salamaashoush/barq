import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function GitMerge(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <circle cx="18" cy="18" r="3" />
      <circle cx="6" cy="6" r="3" />
      <path d="M6 21V9a9 9 0 0 0 9 9" />
    </svg>
  );
}
