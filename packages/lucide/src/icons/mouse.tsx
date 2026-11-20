import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Mouse(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <rect x="5" y="2" width="14" height="20" rx="7" />
      <path d="M12 6v4" />
    </svg>
  );
}
