import { Button } from "@barqjs/ui";
import { Toaster, createToastManager } from "@barqjs/ui/toast";

const toast = createToastManager();

export default function ToastDemo() {
  function showToast() {
    const id = toast.add({
      title: "Event created",
      description: "Sunday, December 3 at 9:00 AM",
      actionProps: {
        children: "Undo",
        onClick() {
          toast.close(id);
        },
      },
    });
  }

  return (
    <>
      <Toaster toastManager={toast} />
      <Button variant="outline" onPress={showToast}>
        Show Toast
      </Button>
    </>
  );
}
