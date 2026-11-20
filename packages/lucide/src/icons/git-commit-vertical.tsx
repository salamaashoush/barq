import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function GitCommitVertical(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M12 3v6" />
      <circle cx="12" cy="12" r="3" />
      <path d="M12 15v6" />
    </svg>
  );
}
