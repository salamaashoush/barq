import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Ban(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <circle cx="12" cy="12" r="10" />
      <path d="M4.929 4.929 19.07 19.071" />
    </svg>
  );
}
