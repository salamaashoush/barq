import { createRoot } from "@barqjs/core";
import { createForm } from "./createForm.ts";

createRoot((dispose) => {
  const form = createForm(() => ({ defaultValues: { name: "Salama" } }));
  form.setFieldValue("name", "Salama Ashoush");
  dispose();
});

console.log(JSON.stringify({ bus: "__TANSTACK_EVENT_TARGET__" in globalThis }));
