import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ArrowsFromAxisHorizontal(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M12 16v6" />
      <path d="M12 2v6" />
      <path d="m15 19-3 3-3-3" />
      <path d="m15 5-3-3-3 3" />
      <path d="M22 12H2" />
    </svg>
  );
}
