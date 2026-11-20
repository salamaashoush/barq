import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function AzerbaijaniManat(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M12 4v16" />
      <path d="M18 20v-8a6 6 0 00-12 0v8" />
    </svg>
  );
}
