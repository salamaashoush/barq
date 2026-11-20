import { atoms, css } from "@barqjs/css";

const panel = css`
  color: green;
`;

const red = atoms({ color: "red" });

export function show(): void {
  const element = document.createElement("p");
  element.id = "lazy";
  element.className = `${panel} ${red}`;
  element.textContent = "lazy";
  document.querySelector("#app")?.append(element);
}
