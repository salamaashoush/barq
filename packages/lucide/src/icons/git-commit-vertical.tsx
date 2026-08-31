import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function GitCommitVertical(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M12 3v6" />
      <circle cx="12" cy="12" r="3" />
      <path d="M12 15v6" />
    </svg>
  );
}
