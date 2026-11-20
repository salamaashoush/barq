import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Kanban(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M5 3v14" />
      <path d="M12 3v8" />
      <path d="M19 3v18" />
    </svg>
  );
}
