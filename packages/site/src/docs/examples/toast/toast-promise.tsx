import { Button } from "@barqjs/ui";
import { Toaster, createToastManager } from "@barqjs/ui/toast";

const toast = createToastManager();

export default function ToastPromise() {
  function showToast() {
    void toast.promise(
      new Promise<{ name: string }>((resolve) => {
        setTimeout(() => resolve({ name: "Event" }), 2000);
      }),
      {
        loading: "Creating event…",
        success: (data: { name: string }) => `${data.name} created.`,
        error: "Could not create event.",
      },
    );
  }

  return (
    <>
      <Toaster toastManager={toast} />
      <Button variant="outline" onPress={showToast}>
        Create Event
      </Button>
    </>
  );
}
