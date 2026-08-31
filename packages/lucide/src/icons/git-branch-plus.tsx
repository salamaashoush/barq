import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function GitBranchPlus(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M6 3v12" />
      <path d="M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
      <path d="M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
      <path d="M15 6a9 9 0 0 0-9 9" />
      <path d="M18 15v6" />
      <path d="M21 18h-6" />
    </svg>
  );
}
