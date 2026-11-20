import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Share(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M12 2v13" />
      <path d="m16 6-4-4-4 4" />
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
    </svg>
  );
}
