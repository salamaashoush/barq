import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function GitMergeConflict(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M12 6h4a2 2 0 0 1 2 2v7" />
      <path d="M6 12v9" />
      <path d="m8.5 3.5-5 5" />
      <path d="m8.5 8.5-5-5" />
      <circle cx="18" cy="18" r="3" />
    </svg>
  );
}
