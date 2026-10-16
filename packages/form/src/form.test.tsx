import { afterEach, describe, expect, jest, mock, test } from "bun:test";
import { For, type Incoming, createRoot, createSignal, flush } from "@barqjs/core";

import {
  type AnyFieldApi,
  type AnyFormApi,
  type AnyFormState,
  type StandardSchemaV1,
  createField,
  createForm,
  formOptions,
  mergeForm,
} from "./index.ts";
import { blur, click, drain, fakeClock, mount, realClock, settle, type } from "./test-helpers.ts";

afterEach(() => {
  document.body.innerHTML = "";
});

function errorsOf(field: AnyFieldApi): string {
  return field.state.meta.errors.join("|");
}

describe("a field renders from the form's own state", () => {
  test("value and meta follow input, blur and programmatic writes", () => {
    let form!: ReturnType<typeof build>;
    const build = () =>
      createForm(() => ({ defaultValues: { name: "salama", email: "salama@example.com" } }));

    const view = mount(() => {
      form = build();
      return (
        <form.Field name="name">
          {(field) => (
            <label>
              <input
                id="name"
                value={field().state.value}
                onInput={(event) => field().handleChange(event.currentTarget.value)}
                onBlur={() => field().handleBlur()}
              />
              <span id="touched">{`${field().state.meta.isTouched}`}</span>
              <span id="blurred">{`${field().state.meta.isBlurred}`}</span>
              <span id="dirty">{`${field().state.meta.isDirty}`}</span>
              <span id="pristine">{`${field().state.meta.isPristine}`}</span>
            </label>
          )}
        </form.Field>
      );
    });

    expect(view.input("#name").value).toBe("salama");
    expect(view.text("#touched")).toBe("false");
    expect(view.text("#dirty")).toBe("false");

    type(view.input("#name"), "salama a");
    expect(form.state.values.name).toBe("salama a");
    expect(view.text("#touched")).toBe("true");
    expect(view.text("#dirty")).toBe("true");
    expect(view.text("#pristine")).toBe("false");
    expect(view.text("#blurred")).toBe("false");

    blur(view.input("#name"));
    expect(view.text("#blurred")).toBe("true");

    form.setFieldValue("name", "written from outside");
    flush();
    expect(view.input("#name").value).toBe("written from outside");
    view.dispose();
  });

  test("a write is readable from the field in the same tick, before any flush", () => {
    createRoot((dispose) => {
      const form = createForm(() => ({ defaultValues: { name: "salama" } }));
      const field = createField(() => ({ form, name: "name" }));
      field().handleChange("changed");
      expect(field().state.value).toBe("changed");
      expect(form.useSelector((state) => state.values.name)()).toBe("changed");
      dispose();
    });
  });

  test("a field-level default value seeds the form when the field mounts", () => {
    let form!: ReturnType<typeof build>;
    const build = () => createForm(() => ({ defaultValues: {} as { nickname?: string } }));
    let seededBeforeRender: string | undefined;
    const view = mount(() => {
      form = build();
      return (
        <form.Field name="nickname" defaultValue="sal">
          {(field) => {
            seededBeforeRender = form.state.values.nickname;
            return <span id="nick">{field().state.value}</span>;
          }}
        </form.Field>
      );
    });
    expect(seededBeforeRender).toBe("sal");
    expect(view.text("#nick")).toBe("sal");
    expect(form.state.values.nickname).toBe("sal");
    view.dispose();
  });

  test("disposing the tree unmounts the field and stops following the store", () => {
    let form!: ReturnType<typeof build>;
    const build = () => createForm(() => ({ defaultValues: { name: "salama" } }));
    let reads = 0;
    const unmounted = mock(() => {});
    const view = mount(() => {
      form = build();
      return (
        <form.Field name="name" listeners={{ onUnmount: unmounted }}>
          {(field) => <span id="value">{(reads += 1) && field().state.value}</span>}
        </form.Field>
      );
    });
    expect(form.getFieldInfo("name").instance).not.toBeNull();
    const before = reads;

    view.dispose();
    expect(unmounted).toHaveBeenCalledTimes(1);
    expect(form.getFieldInfo("name").instance).toBeNull();

    form.setFieldValue("name", "after dispose");
    flush();
    expect(reads).toBe(before);
  });
});

describe("validators", () => {
  test("onChange, onBlur and onSubmit each run at their own moment", async () => {
    let form!: ReturnType<typeof build>;
    const build = () => createForm(() => ({ defaultValues: { name: "" } }));
    const view = mount(() => {
      form = build();
      return (
        <form.Field
          name="name"
          validators={{
            onChange: ({ value }) => (value.includes(" ") ? "no spaces" : undefined),
            onBlur: ({ value }) => (value.length < 3 ? "too short" : undefined),
            onSubmit: ({ value }) => (value === "admin" ? "reserved" : undefined),
          }}
        >
          {(field) => (
            <label>
              <input
                id="name"
                value={field().state.value}
                onInput={(event) => field().handleChange(event.currentTarget.value)}
                onBlur={() => field().handleBlur()}
              />
              <em id="errors">{errorsOf(field())}</em>
              <em id="valid">{`${field().state.meta.isValid}`}</em>
            </label>
          )}
        </form.Field>
      );
    });

    type(view.input("#name"), "a b");
    expect(view.text("#errors")).toBe("no spaces");
    expect(view.text("#valid")).toBe("false");

    type(view.input("#name"), "ab");
    expect(view.text("#errors")).toBe("");

    blur(view.input("#name"));
    expect(view.text("#errors")).toBe("too short");

    type(view.input("#name"), "admin");
    blur(view.input("#name"));
    expect(view.text("#errors")).toBe("");

    await form.handleSubmit();
    flush();
    expect(view.text("#errors")).toBe("reserved");
    view.dispose();
  });

  test("an async validator is debounced, and reports while it is running", async () => {
    await fakeClock();
    try {
      const calls: string[] = [];
      const answer = Promise.withResolvers<void>();
      const view = mount(() => {
        const form = createForm(() => ({ defaultValues: { handle: "" } }));
        return (
          <form.Field
            name="handle"
            validators={{
              onChangeAsyncDebounceMs: 30,
              onChangeAsync: async ({ value }) => {
                calls.push(value);
                await answer.promise;
                return value === "taken" ? "already taken" : undefined;
              },
            }}
          >
            {(field) => (
              <label>
                <input
                  id="handle"
                  value={field().state.value}
                  onInput={(event) => field().handleChange(event.currentTarget.value)}
                />
                <em id="errors">{errorsOf(field())}</em>
                <em id="validating">{`${field().state.meta.isValidating}`}</em>
              </label>
            )}
          </form.Field>
        );
      });

      type(view.input("#handle"), "t");
      type(view.input("#handle"), "ta");
      type(view.input("#handle"), "taken");
      await drain();
      expect(calls).toEqual([]);
      expect(view.text("#validating")).toBe("true");

      jest.advanceTimersByTime(29);
      await drain();
      expect(calls, "a millisecond before the debounce ends").toEqual([]);

      jest.advanceTimersByTime(1);
      await drain();
      expect(calls).toEqual(["taken"]);
      expect(view.text("#validating")).toBe("true");

      answer.resolve();
      await drain();
      expect(view.text("#validating")).toBe("false");
      expect(view.text("#errors")).toBe("already taken");
      view.dispose();
    } finally {
      await realClock();
    }
  });

  test("a newer change aborts the validation still in flight", async () => {
    await fakeClock();
    try {
      const signals: AbortSignal[] = [];
      const answers: PromiseWithResolvers<void>[] = [];
      const view = mount(() => {
        const form = createForm(() => ({ defaultValues: { handle: "" } }));
        return (
          <form.Field
            name="handle"
            validators={{
              onChangeAsync: async ({ value, signal }) => {
                signals.push(signal);
                const answer = Promise.withResolvers<void>();
                answers.push(answer);
                await answer.promise;
                return value === "taken" ? "already taken" : undefined;
              },
            }}
          >
            {(field) => (
              <label>
                <input
                  id="handle"
                  value={field().state.value}
                  onInput={(event) => field().handleChange(event.currentTarget.value)}
                />
                <em id="errors">{errorsOf(field())}</em>
              </label>
            )}
          </form.Field>
        );
      });

      type(view.input("#handle"), "taken");
      await drain();
      jest.runOnlyPendingTimers();
      await drain();
      expect(signals).toHaveLength(1);
      expect(signals[0]?.aborted).toBe(false);

      type(view.input("#handle"), "free");
      await drain();
      jest.runOnlyPendingTimers();
      await drain();
      expect(signals).toHaveLength(2);
      expect(signals[0]?.aborted).toBe(true);
      expect(signals[1]?.aborted).toBe(false);

      // The aborted call answers last, so its stale error would be the one left
      // standing if the abort were ignored.
      answers[1]?.resolve();
      await drain();
      answers[0]?.resolve();
      await drain();
      expect(view.text("#errors")).toBe("");
      view.dispose();
    } finally {
      await realClock();
    }
  });

  test("a validator option that reads a signal is re-applied when it changes", () => {
    const [minimum, setMinimum] = createSignal(5);
    const view = mount(() => {
      const form = createForm(() => ({ defaultValues: { name: "" } }));
      return (
        <form.Field
          name="name"
          validators={{
            onChange: ({ value }) => (value.length < minimum() ? `min ${minimum()}` : undefined),
          }}
        >
          {(field) => (
            <label>
              <input
                id="name"
                value={field().state.value}
                onInput={(event) => field().handleChange(event.currentTarget.value)}
              />
              <em id="errors">{errorsOf(field())}</em>
            </label>
          )}
        </form.Field>
      );
    });

    type(view.input("#name"), "sal");
    expect(view.text("#errors")).toBe("min 5");
    setMinimum(2);
    flush();
    type(view.input("#name"), "sala");
    expect(view.text("#errors")).toBe("");
    view.dispose();
  });

  test("a form-level validator maps its errors onto fields", () => {
    const view = mount(() => {
      const form = createForm(() => ({
        defaultValues: { email: "", confirm: "" },
        validators: {
          onChange: ({ value }) => {
            if (value.email === "") return "email is required";
            return value.email === value.confirm
              ? undefined
              : { form: "fix the fields below", fields: { confirm: "does not match" } };
          },
        },
      }));
      return (
        <div>
          <form.Field name="email">
            {(field) => (
              <input
                id="email"
                value={field().state.value}
                onInput={(event) => field().handleChange(event.currentTarget.value)}
              />
            )}
          </form.Field>
          <form.Field name="confirm">
            {(field) => (
              <label>
                <input
                  id="confirm"
                  value={field().state.value}
                  onInput={(event) => field().handleChange(event.currentTarget.value)}
                />
                <em id="confirm-errors">{errorsOf(field())}</em>
              </label>
            )}
          </form.Field>
          <form.Subscribe selector={(state) => state.errors}>
            {(errors) => <em id="form-errors">{errors().join("|")}</em>}
          </form.Subscribe>
        </div>
      );
    });

    type(view.input("#confirm"), "x");
    expect(view.text("#form-errors")).toBe("email is required");
    expect(view.text("#confirm-errors")).toBe("");

    type(view.input("#email"), "salama@example.com");
    expect(view.text("#form-errors")).toBe("fix the fields below");
    expect(view.text("#confirm-errors")).toBe("does not match");

    type(view.input("#confirm"), "salama@example.com");
    expect(view.text("#form-errors")).toBe("");
    expect(view.text("#confirm-errors")).toBe("");
    view.dispose();
  });

  test("a linked field re-validates when the field it listens to changes", () => {
    const view = mount(() => {
      const form = createForm(() => ({ defaultValues: { password: "", confirm: "" } }));
      return (
        <div>
          <form.Field name="password">
            {(field) => (
              <input
                id="password"
                value={field().state.value}
                onInput={(event) => field().handleChange(event.currentTarget.value)}
              />
            )}
          </form.Field>
          <form.Field
            name="confirm"
            validators={{
              onChangeListenTo: ["password"],
              onChange: ({ value, fieldApi }) =>
                value === fieldApi.form.getFieldValue("password") ? undefined : "does not match",
            }}
          >
            {(field) => (
              <label>
                <input
                  id="confirm"
                  value={field().state.value}
                  onInput={(event) => field().handleChange(event.currentTarget.value)}
                />
                <em id="errors">{errorsOf(field())}</em>
              </label>
            )}
          </form.Field>
        </div>
      );
    });

    type(view.input("#confirm"), "secret");
    expect(view.text("#errors")).toBe("does not match");
    type(view.input("#password"), "secret");
    expect(view.text("#errors")).toBe("");
    type(view.input("#password"), "secret2");
    expect(view.text("#errors")).toBe("does not match");
    view.dispose();
  });

  test("a Standard Schema validates a field, and a form-level one maps issues by path", () => {
    const emailSchema: StandardSchemaV1<string> = {
      "~standard": {
        version: 1,
        vendor: "test",
        validate: (value) =>
          typeof value === "string" && value.includes("@")
            ? { value }
            : { issues: [{ message: "must be an email" }] },
      },
    };
    const accountSchema: StandardSchemaV1<{ email: string; age: number }> = {
      "~standard": {
        version: 1,
        vendor: "test",
        validate: (value) => {
          const account = value as { email: string; age: number };
          return account.age >= 18
            ? { value: account }
            : { issues: [{ message: "must be an adult", path: ["age"] }] };
        },
      },
    };

    const view = mount(() => {
      const form = createForm(() => ({
        defaultValues: { email: "", age: 30 },
        validators: { onChange: accountSchema },
      }));
      return (
        <div>
          <form.Field name="email" validators={{ onChange: emailSchema }}>
            {(field) => (
              <label>
                <input
                  id="email"
                  value={field().state.value}
                  onInput={(event) => field().handleChange(event.currentTarget.value)}
                />
                <em id="email-errors">
                  {field()
                    .state.meta.errors.map((issue) => issue?.message)
                    .join("|")}
                </em>
              </label>
            )}
          </form.Field>
          <form.Field name="age">
            {(field) => (
              <label>
                <input
                  id="age"
                  value={`${field().state.value}`}
                  onInput={(event) => field().handleChange(Number(event.currentTarget.value))}
                />
                <em id="age-errors">
                  {field()
                    .state.meta.errors.map((issue) => issue?.message)
                    .join("|")}
                </em>
              </label>
            )}
          </form.Field>
        </div>
      );
    });

    type(view.input("#email"), "salama");
    expect(view.text("#email-errors")).toBe("must be an email");
    type(view.input("#email"), "salama@example.com");
    expect(view.text("#email-errors")).toBe("");

    type(view.input("#age"), "12");
    expect(view.text("#age-errors")).toBe("must be an adult");
    type(view.input("#age"), "21");
    expect(view.text("#age-errors")).toBe("");
    view.dispose();
  });
});

describe("array fields", () => {
  interface Person {
    name: string;
  }

  function NameInput(props: Incoming<{ value: string; onChange: (value: string) => void }>) {
    return (
      <input
        value={props.value()}
        onInput={(event) => props.onChange()(event.currentTarget.value)}
      />
    );
  }

  test("push, insert, swap, move and remove re-render the rows", () => {
    let form!: ReturnType<typeof build>;
    const build = () =>
      createForm(() => ({ defaultValues: { people: [{ name: "salama" }] as Person[] } }));

    const view = mount(() => {
      form = build();
      return (
        <form.Field name="people" mode="array">
          {(people) => (
            <ul>
              <For each={people().state.value} keyed={false}>
                {(_person: () => Person, index: number) => (
                  <form.Field name={`people[${index}].name`}>
                    {(field) => (
                      <li>
                        <NameInput
                          value={field().state.value}
                          onChange={(value) => field().handleChange(value)}
                        />
                      </li>
                    )}
                  </form.Field>
                )}
              </For>
            </ul>
          )}
        </form.Field>
      );
    });

    const names = (): string[] =>
      [...view.host.querySelectorAll("input")].map((input) => input.value);

    expect(names()).toEqual(["salama"]);

    form.pushFieldValue("people", { name: "b" });
    form.pushFieldValue("people", { name: "c" });
    flush();
    expect(names()).toEqual(["salama", "b", "c"]);

    void form.insertFieldValue("people", 1, { name: "a" });
    flush();
    expect(names()).toEqual(["salama", "a", "b", "c"]);

    form.swapFieldValues("people", 0, 3);
    flush();
    expect(names()).toEqual(["c", "a", "b", "salama"]);

    form.moveFieldValues("people", 3, 0);
    flush();
    expect(names()).toEqual(["salama", "c", "a", "b"]);

    void form.removeFieldValue("people", 1);
    flush();
    expect(names()).toEqual(["salama", "a", "b"]);

    const second = view.host.querySelectorAll("input")[1];
    if (second === undefined) throw new Error("the second row is missing");
    type(second, "edited");
    expect(form.state.values.people).toEqual([
      { name: "salama" },
      { name: "edited" },
      { name: "b" },
    ]);
    view.dispose();
  });

  test("editing a row does not wake the array field itself", () => {
    let listReads = 0;
    const view = mount(() => {
      const form = createForm(() => ({
        defaultValues: { people: [{ name: "salama" }, { name: "b" }] as Person[] },
      }));
      return (
        <form.Field name="people" mode="array">
          {(people) => (
            <div>
              <span id="count">{(listReads += 1) && people().state.value.length}</span>
              <form.Field name="people[0].name">
                {(field) => (
                  <input
                    id="first"
                    value={field().state.value}
                    onInput={(event) => field().handleChange(event.currentTarget.value)}
                  />
                )}
              </form.Field>
              <button type="button" id="add" onClick={() => people().pushValue({ name: "c" })}>
                add
              </button>
            </div>
          )}
        </form.Field>
      );
    });

    const before = listReads;
    type(view.input("#first"), "edited");
    expect(listReads).toBe(before);

    click(view.host.querySelector("#add") as Element);
    expect(listReads).toBe(before + 1);
    expect(view.text("#count")).toBe("3");
    view.dispose();
  });
});

describe("listeners", () => {
  test("field listeners fire on mount, change and blur, and can write other fields", () => {
    const events: string[] = [];
    let form!: ReturnType<typeof build>;
    const build = () => createForm(() => ({ defaultValues: { country: "", province: "ON" } }));
    const view = mount(() => {
      form = build();
      return (
        <div>
          <form.Field
            name="country"
            listeners={{
              onMount: () => events.push("mount"),
              onChange: ({ value }) => {
                events.push(`change:${value}`);
                form.setFieldValue("province", "");
              },
              onBlur: () => events.push("blur"),
            }}
          >
            {(field) => (
              <input
                id="country"
                value={field().state.value}
                onInput={(event) => field().handleChange(event.currentTarget.value)}
                onBlur={() => field().handleBlur()}
              />
            )}
          </form.Field>
          <form.Field name="province">
            {(field) => <span id="province">{field().state.value}</span>}
          </form.Field>
        </div>
      );
    });

    expect(events).toEqual(["mount"]);
    expect(view.text("#province")).toBe("ON");

    type(view.input("#country"), "CA");
    blur(view.input("#country"));
    expect(events).toEqual(["mount", "change:CA", "blur"]);
    expect(view.text("#province")).toBe("");
    view.dispose();
  });

  test("form listeners see every field's change", () => {
    const changed: string[] = [];
    const view = mount(() => {
      const form = createForm(() => ({
        defaultValues: { name: "", email: "" },
        listeners: {
          onChange: ({ fieldApi }) => changed.push(String(fieldApi.name)),
        },
      }));
      return (
        <div>
          <form.Field name="name">
            {(field) => (
              <input
                id="name"
                value={field().state.value}
                onInput={(event) => field().handleChange(event.currentTarget.value)}
              />
            )}
          </form.Field>
          <form.Field name="email">
            {(field) => (
              <input
                id="email"
                value={field().state.value}
                onInput={(event) => field().handleChange(event.currentTarget.value)}
              />
            )}
          </form.Field>
        </div>
      );
    });

    type(view.input("#name"), "salama");
    type(view.input("#email"), "salama@example.com");
    expect(changed).toEqual(["name", "email"]);
    view.dispose();
  });
});

describe("submitting", () => {
  test("canSubmit gates the handler, and isSubmitting brackets it", async () => {
    let release!: () => void;
    const saveUser = mock(
      (_user: { name: string }) =>
        new Promise<{ ok: true }>((resolve) => {
          release = () => resolve({ ok: true });
        }),
    );

    const view = mount(() => {
      const form = createForm(() => ({
        defaultValues: { name: "" },
        onSubmit: async ({ value }) => {
          await saveUser(value);
        },
      }));
      return (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          <form.Field
            name="name"
            validators={{
              onChange: ({ value }) => (value === "" ? "required" : undefined),
            }}
          >
            {(field) => (
              <input
                id="name"
                value={field().state.value}
                onInput={(event) => field().handleChange(event.currentTarget.value)}
              />
            )}
          </form.Field>
          <form.Subscribe
            selector={(state) => ({
              canSubmit: state.canSubmit,
              isSubmitting: state.isSubmitting,
              isSubmitted: state.isSubmitted,
            })}
          >
            {(state) => (
              <button type="submit" id="submit" disabled={!state().canSubmit}>
                {state().isSubmitting ? "saving" : state().isSubmitted ? "saved" : "save"}
              </button>
            )}
          </form.Subscribe>
        </form>
      );
    });

    const submit = (): void => {
      view.host
        .querySelector("form")
        ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      flush();
    };
    const button = (): HTMLButtonElement => view.host.querySelector("#submit") as HTMLButtonElement;

    expect(button().disabled).toBe(false);

    type(view.input("#name"), "x");
    type(view.input("#name"), "");
    expect(button().disabled).toBe(true);
    submit();
    await settle();
    expect(saveUser).not.toHaveBeenCalled();

    type(view.input("#name"), "salama");
    expect(button().disabled).toBe(false);
    submit();
    await settle();
    expect(saveUser).toHaveBeenCalledTimes(1);
    expect(saveUser.mock.calls[0]?.[0]).toEqual({ name: "salama" });
    expect(button().textContent).toBe("saving");
    expect(button().disabled).toBe(true);

    release();
    await settle();
    expect(button().textContent).toBe("saved");
    expect(button().disabled).toBe(false);
    view.dispose();
  });

  test("errors a server function returns are merged into the form and its fields", async () => {
    type ServerState = Partial<AnyFormState>;
    const initialFormState: ServerState = { errorMap: { onServer: undefined } };
    const noServerErrors: ServerState = { errorMap: { onServer: { fields: {} } } };

    const registerUser = mock(async (user: { email: string }): Promise<ServerState> =>
      user.email === "taken@example.com"
        ? {
            errorMap: {
              onServer: { form: "could not register", fields: { email: "already registered" } },
            },
          }
        : noServerErrors,
    );

    const options = formOptions({ defaultValues: { email: "" } });

    const view = mount(() => {
      const [serverState, setServerState] = createSignal(initialFormState);
      const form = createForm(() => {
        const fromServer = serverState();
        return {
          ...options,
          transform: (base: unknown) => mergeForm(base as AnyFormApi, fromServer),
          onSubmit: async ({ value }: { value: { email: string } }) => {
            setServerState(await registerUser(value));
          },
        };
      });
      return (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          <form.Field name="email" listeners={{ onChange: () => setServerState(noServerErrors) }}>
            {(field) => (
              <label>
                <input
                  id="email"
                  value={field().state.value}
                  onInput={(event) => field().handleChange(event.currentTarget.value)}
                />
                <em id="email-errors">{errorsOf(field())}</em>
              </label>
            )}
          </form.Field>
          <form.Subscribe selector={(state) => state.errors}>
            {(errors) => <em id="form-errors">{errors().join("|")}</em>}
          </form.Subscribe>
        </form>
      );
    });

    const submit = async (): Promise<void> => {
      view.host
        .querySelector("form")
        ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await settle();
      await settle();
    };

    type(view.input("#email"), "taken@example.com");
    await submit();
    expect(registerUser).toHaveBeenCalledTimes(1);
    expect(view.text("#form-errors")).toBe("could not register");
    expect(view.text("#email-errors")).toBe("already registered");

    type(view.input("#email"), "salama@example.com");
    expect(view.text("#form-errors")).toBe("");
    expect(view.text("#email-errors")).toBe("");

    await submit();
    expect(registerUser).toHaveBeenCalledTimes(2);
    expect(registerUser.mock.calls[1]?.[0]).toEqual({ email: "salama@example.com" });
    expect(view.text("#form-errors")).toBe("");
    view.dispose();
  });
});

describe("reset and default values", () => {
  test("reset restores the defaults, or the values it is given", () => {
    let form!: ReturnType<typeof build>;
    const build = () => createForm(() => ({ defaultValues: { name: "salama" } }));
    const view = mount(() => {
      form = build();
      return (
        <form.Field name="name">
          {(field) => (
            <label>
              <input
                id="name"
                value={field().state.value}
                onInput={(event) => field().handleChange(event.currentTarget.value)}
              />
              <em id="dirty">{`${field().state.meta.isDirty}`}</em>
            </label>
          )}
        </form.Field>
      );
    });

    type(view.input("#name"), "changed");
    expect(view.text("#dirty")).toBe("true");

    form.reset();
    flush();
    expect(view.input("#name").value).toBe("salama");
    expect(view.text("#dirty")).toBe("false");

    form.reset({ name: "another" });
    flush();
    expect(view.input("#name").value).toBe("another");
    view.dispose();
  });

  test("default values read from a signal update an untouched form, and leave a touched one alone", () => {
    const [loaded, setLoaded] = createSignal({ name: "", email: "" });
    const view = mount(() => {
      const form = createForm(() => ({ defaultValues: loaded() }));
      return (
        <form.Field name="name">
          {(field) => (
            <input
              id="name"
              value={field().state.value}
              onInput={(event) => field().handleChange(event.currentTarget.value)}
            />
          )}
        </form.Field>
      );
    });

    expect(view.input("#name").value).toBe("");
    setLoaded({ name: "salama", email: "salama@example.com" });
    flush();
    expect(view.input("#name").value).toBe("salama");

    type(view.input("#name"), "typed");
    setLoaded({ name: "late", email: "late@example.com" });
    flush();
    expect(view.input("#name").value).toBe("typed");
    view.dispose();
  });
});
