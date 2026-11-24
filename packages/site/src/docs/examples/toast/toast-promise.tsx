import { Button } from "@barqjs/ui";
import { Toaster, createToastManager } from "@barqjs/ui/toast";

const toast = createToastManager();

interface Saved {
  name: string;
}

export default function ToastPromise() {
  function showToast() {
    void toast.promise(
      new Promise<Saved>((resolve) => {
        setTimeout(() => resolve({ name: "Event" }), 2000);
      }),
      {
        loading: "Creating event…",
        success: (data: Saved) => `${data.name} created.`,
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
