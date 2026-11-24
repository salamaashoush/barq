import { Button, Inline, toast } from "@barqjs/arc";

function publish(): Promise<string> {
  return new Promise((resolve, reject) => {
    setTimeout(
      () => (Math.random() < 0.75 ? resolve("v2.4.1") : reject(new Error("Build failed"))),
      1500,
    );
  });
}

export default function Toasts() {
  return (
    <Inline gap={2} wrap>
      <Button variant="outline" onPress={() => toast("Draft saved")}>
        Default
      </Button>
      <Button
        variant="outline"
        onPress={() =>
          toast.success("Invoice #1043 sent", {
            description: "billing@acme.example.com will get a copy.",
          })
        }
      >
        Success
      </Button>
      <Button
        variant="outline"
        onPress={() =>
          toast.info("Maintenance tonight", { description: "eu-west-1, 02:00 to 02:30 UTC." })
        }
      >
        Info
      </Button>
      <Button
        variant="outline"
        onPress={() =>
          toast.warning("Storage is 90% full", { description: "Acme has 4.5 GB of 5 GB left." })
        }
      >
        Warning
      </Button>
      <Button
        variant="outline"
        onPress={() =>
          toast.error("Payment declined", { description: "The card ending 4242 was refused." })
        }
      >
        Error
      </Button>
      <Button
        variant="outline"
        onPress={() => {
          const id = toast.loading("Exporting 1,284 rows");
          setTimeout(
            () => toast.success("Export ready", { id, description: "acme-customers.csv" }),
            1800,
          );
        }}
      >
        Loading
      </Button>
      <Button
        variant="outline"
        onPress={() =>
          toast("Project archived", {
            description: "Status page moved to the archive.",
            action: { label: "Undo", onAction: () => toast.success("Status page restored") },
          })
        }
      >
        With an action
      </Button>
      <Button
        variant="outline"
        onPress={() =>
          void toast.promise(publish, {
            loading: "Publishing api-gateway",
            success: (version) => `api-gateway ${version} is live`,
            error: (reason) => (reason instanceof Error ? reason.message : "Publishing failed"),
          })
        }
      >
        Promise
      </Button>
      <Button variant="ghost" onPress={() => toast.dismiss()}>
        Dismiss all
      </Button>
    </Inline>
  );
}
