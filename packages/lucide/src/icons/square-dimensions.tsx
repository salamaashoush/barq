import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function SquareDimensions(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M12 7H7v5" />
      <path d="M12 17h5v-5" />
    </svg>
  );
}
