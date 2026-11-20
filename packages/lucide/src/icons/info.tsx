import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Info(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  );
}
