import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Plug2(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M9 2v6" />
      <path d="M15 2v6" />
      <path d="M12 17v5" />
      <path d="M5 8h14" />
      <path d="M6 11V8h12v3a6 6 0 1 1-12 0Z" />
    </svg>
  );
}
