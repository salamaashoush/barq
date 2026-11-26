import { createSignal } from "@barqjs/core";
import {
  type Address,
  AddressFields,
  Grid,
  Stack,
  type StoredFile,
  SubmitButton,
  Text,
  type UploadContext,
  useArcForm,
} from "@barqjs/arc";

const HOME: Address = {
  country: "US",
  line1: "500 Market Street",
  line2: "Suite 200",
  city: "San Francisco",
  region: "CA",
  postalCode: "94105",
};

const OFFICE: Address = {
  country: "JP",
  line1: "1-1 Marunouchi",
  line2: "",
  city: "Chiyoda",
  region: "Tokyo",
  postalCode: "100-0005",
};

const CAIRO: Address = {
  country: "EG",
  line1: "١٥ شارع التحرير",
  line2: "",
  city: "القاهرة",
  region: "القاهرة",
  postalCode: "11511",
};

let uploads = 0;

/** Sends a file nowhere, slowly, reporting progress, as a real upload would. */
function upload(file: File, context: UploadContext): Promise<StoredFile> {
  return new Promise((resolve, reject) => {
    let done = 0;
    const timer = setInterval(() => {
      done += 0.2;
      context.onProgress(Math.min(done, 1));
      if (done >= 1) {
        clearInterval(timer);
        if (file.name.includes("fail")) reject(new Error("The server refused this file."));
        else {
          uploads += 1;
          resolve({
            id: `file-${String(uploads)}`,
            name: file.name,
            size: file.size,
            type: file.type,
          });
        }
      }
    }, 300);
    context.signal.addEventListener("abort", () => clearInterval(timer));
  });
}

interface ReportValues {
  files: StoredFile[];
}

export default function AddressFiles() {
  const [sent, setSent] = createSignal("");
  const defaults: ReportValues = {
    files: [{ id: "file-0", name: "term-1-report.pdf", size: 482_000, type: "application/pdf" }],
  };
  const form = useArcForm(() => ({
    defaultValues: defaults,
    onSubmit: ({ value }) => setSent(value.files.map((file) => file.name).join(", ")),
  }));
  return (
    <Stack gap={8}>
      <Grid columns={{ base: 1, md: 2 }} gap={6}>
        <AddressFields label="Billing address" section="billing" defaultValue={HOME} />
        <AddressFields label="Office" section="office" defaultValue={OFFICE} />
      </Grid>
      <div dir="rtl" lang="ar">
        <AddressFields label="العنوان" countries={["EG", "SA", "AE", "JO"]} defaultValue={CAIRO} />
      </div>
      <form.AppForm>
        <form
          onSubmit={(event: Event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          <Stack gap={4}>
            <form.AppField name="files">
              {(field) => (
                <field.FileField
                  label="Reports"
                  description="A file named with “fail” is refused, to show Retry."
                  accept={[".pdf", "image/*"]}
                  maxSize={10_000_000}
                  upload={upload}
                />
              )}
            </form.AppField>
            <SubmitButton>Send reports</SubmitButton>
            <Text size="xs" color="muted">
              {sent() === "" ? "Submit waits for every upload to finish." : `Sent ${sent()}`}
            </Text>
          </Stack>
        </form>
      </form.AppForm>
    </Stack>
  );
}
