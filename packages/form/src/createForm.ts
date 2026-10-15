import {
  type Accessor,
  type Child,
  type Incoming,
  type JSXElement,
  cell,
  createRenderEffect,
  createUniqueId,
  merge,
  readSlot,
  untrack,
} from "@barqjs/core";
import { FormApi, type FormOptions, type FormState, mergeAndUpdate } from "@tanstack/form-core";

import { Field, type FieldComponent } from "./createField.ts";
import { FormGroup, type FormGroupComponent } from "./createFormGroup.ts";
import { type Slots, mountWith, renderSlot, updateWith } from "./internal.ts";
import type { MaybeFormAsyncValidator, MaybeFormValidator } from "./types.ts";
import { useSelector } from "./useStore.ts";

export interface BarqFormApi<
  TParentData,
  TFormOnMount extends MaybeFormValidator<TParentData>,
  TFormOnChange extends MaybeFormValidator<TParentData>,
  TFormOnChangeAsync extends MaybeFormAsyncValidator<TParentData>,
  TFormOnBlur extends MaybeFormValidator<TParentData>,
  TFormOnBlurAsync extends MaybeFormAsyncValidator<TParentData>,
  TFormOnSubmit extends MaybeFormValidator<TParentData>,
  TFormOnSubmitAsync extends MaybeFormAsyncValidator<TParentData>,
  TFormOnDynamic extends MaybeFormValidator<TParentData>,
  TFormOnDynamicAsync extends MaybeFormAsyncValidator<TParentData>,
  TFormOnServer extends MaybeFormAsyncValidator<TParentData>,
  TSubmitMeta,
> {
  Field: FieldComponent<
    TParentData,
    TFormOnMount,
    TFormOnChange,
    TFormOnChangeAsync,
    TFormOnBlur,
    TFormOnBlurAsync,
    TFormOnSubmit,
    TFormOnSubmitAsync,
    TFormOnDynamic,
    TFormOnDynamicAsync,
    TFormOnServer,
    TSubmitMeta
  >;
  FormGroup: FormGroupComponent<
    TParentData,
    TFormOnMount,
    TFormOnChange,
    TFormOnChangeAsync,
    TFormOnBlur,
    TFormOnBlurAsync,
    TFormOnSubmit,
    TFormOnSubmitAsync,
    TFormOnDynamic,
    TFormOnDynamicAsync,
    TFormOnServer,
    TSubmitMeta
  >;
  useSelector: <
    TSelected = NoInfer<
      FormState<
        TParentData,
        TFormOnMount,
        TFormOnChange,
        TFormOnChangeAsync,
        TFormOnBlur,
        TFormOnBlurAsync,
        TFormOnSubmit,
        TFormOnSubmitAsync,
        TFormOnDynamic,
        TFormOnDynamicAsync,
        TFormOnServer
      >
    >,
  >(
    selector?: (
      state: NoInfer<
        FormState<
          TParentData,
          TFormOnMount,
          TFormOnChange,
          TFormOnChangeAsync,
          TFormOnBlur,
          TFormOnBlurAsync,
          TFormOnSubmit,
          TFormOnSubmitAsync,
          TFormOnDynamic,
          TFormOnDynamicAsync,
          TFormOnServer
        >
      >,
    ) => TSelected,
  ) => Accessor<TSelected>;
  /**
   * @deprecated Use `form.useSelector` instead.
   */
  useStore: <
    TSelected = NoInfer<
      FormState<
        TParentData,
        TFormOnMount,
        TFormOnChange,
        TFormOnChangeAsync,
        TFormOnBlur,
        TFormOnBlurAsync,
        TFormOnSubmit,
        TFormOnSubmitAsync,
        TFormOnDynamic,
        TFormOnDynamicAsync,
        TFormOnServer
      >
    >,
  >(
    selector?: (
      state: NoInfer<
        FormState<
          TParentData,
          TFormOnMount,
          TFormOnChange,
          TFormOnChangeAsync,
          TFormOnBlur,
          TFormOnBlurAsync,
          TFormOnSubmit,
          TFormOnSubmitAsync,
          TFormOnDynamic,
          TFormOnDynamicAsync,
          TFormOnServer
        >
      >,
    ) => TSelected,
  ) => Accessor<TSelected>;
  Subscribe: <
    TSelected = NoInfer<
      FormState<
        TParentData,
        TFormOnMount,
        TFormOnChange,
        TFormOnChangeAsync,
        TFormOnBlur,
        TFormOnBlurAsync,
        TFormOnSubmit,
        TFormOnSubmitAsync,
        TFormOnDynamic,
        TFormOnDynamicAsync,
        TFormOnServer
      >
    >,
  >(
    props: Incoming<{
      selector?: (
        state: NoInfer<
          FormState<
            TParentData,
            TFormOnMount,
            TFormOnChange,
            TFormOnChangeAsync,
            TFormOnBlur,
            TFormOnBlurAsync,
            TFormOnSubmit,
            TFormOnSubmitAsync,
            TFormOnDynamic,
            TFormOnDynamicAsync,
            TFormOnServer
          >
        >,
      ) => TSelected;
    }> & {
      children: (state: Accessor<NoInfer<TSelected>>) => Child;
    },
  ) => JSXElement;
}

export type BarqFormExtendedApi<
  TParentData,
  TFormOnMount extends MaybeFormValidator<TParentData>,
  TFormOnChange extends MaybeFormValidator<TParentData>,
  TFormOnChangeAsync extends MaybeFormAsyncValidator<TParentData>,
  TFormOnBlur extends MaybeFormValidator<TParentData>,
  TFormOnBlurAsync extends MaybeFormAsyncValidator<TParentData>,
  TFormOnSubmit extends MaybeFormValidator<TParentData>,
  TFormOnSubmitAsync extends MaybeFormAsyncValidator<TParentData>,
  TFormOnDynamic extends MaybeFormValidator<TParentData>,
  TFormOnDynamicAsync extends MaybeFormAsyncValidator<TParentData>,
  TFormOnServer extends MaybeFormAsyncValidator<TParentData>,
  TSubmitMeta,
> = FormApi<
  TParentData,
  TFormOnMount,
  TFormOnChange,
  TFormOnChangeAsync,
  TFormOnBlur,
  TFormOnBlurAsync,
  TFormOnSubmit,
  TFormOnSubmitAsync,
  TFormOnDynamic,
  TFormOnDynamicAsync,
  TFormOnServer,
  TSubmitMeta
> &
  BarqFormApi<
    TParentData,
    TFormOnMount,
    TFormOnChange,
    TFormOnChangeAsync,
    TFormOnBlur,
    TFormOnBlurAsync,
    TFormOnSubmit,
    TFormOnSubmitAsync,
    TFormOnDynamic,
    TFormOnDynamicAsync,
    TFormOnServer,
    TSubmitMeta
  >;

/**
 * Creates the form. Options are a function so they can read signals: a change
 * re-applies them through `FormApi.update`.
 */
export function createForm<
  TParentData,
  TFormOnMount extends MaybeFormValidator<TParentData>,
  TFormOnChange extends MaybeFormValidator<TParentData>,
  TFormOnChangeAsync extends MaybeFormAsyncValidator<TParentData>,
  TFormOnBlur extends MaybeFormValidator<TParentData>,
  TFormOnBlurAsync extends MaybeFormAsyncValidator<TParentData>,
  TFormOnSubmit extends MaybeFormValidator<TParentData>,
  TFormOnSubmitAsync extends MaybeFormAsyncValidator<TParentData>,
  TFormOnDynamic extends MaybeFormValidator<TParentData>,
  TFormOnDynamicAsync extends MaybeFormAsyncValidator<TParentData>,
  TFormOnServer extends MaybeFormAsyncValidator<TParentData>,
  TSubmitMeta,
>(
  opts?: () => FormOptions<
    TParentData,
    TFormOnMount,
    TFormOnChange,
    TFormOnChangeAsync,
    TFormOnBlur,
    TFormOnBlurAsync,
    TFormOnSubmit,
    TFormOnSubmitAsync,
    TFormOnDynamic,
    TFormOnDynamicAsync,
    TFormOnServer,
    TSubmitMeta
  >,
): BarqFormExtendedApi<
  TParentData,
  TFormOnMount,
  TFormOnChange,
  TFormOnChangeAsync,
  TFormOnBlur,
  TFormOnBlurAsync,
  TFormOnSubmit,
  TFormOnSubmitAsync,
  TFormOnDynamic,
  TFormOnDynamicAsync,
  TFormOnServer,
  TSubmitMeta
> {
  const options = opts === undefined ? undefined : untrack(opts);
  // The core's own fallback is a random id, which a server render and the
  // client that hydrates it would not agree on.
  const fallbackFormId = createUniqueId();
  const api = new FormApi<
    TParentData,
    TFormOnMount,
    TFormOnChange,
    TFormOnChangeAsync,
    TFormOnBlur,
    TFormOnBlurAsync,
    TFormOnSubmit,
    TFormOnSubmitAsync,
    TFormOnDynamic,
    TFormOnDynamicAsync,
    TFormOnServer,
    TSubmitMeta
  >({ ...options, formId: options?.formId ?? fallbackFormId });
  const extended = api as BarqFormExtendedApi<
    TParentData,
    TFormOnMount,
    TFormOnChange,
    TFormOnChangeAsync,
    TFormOnBlur,
    TFormOnBlurAsync,
    TFormOnSubmit,
    TFormOnSubmitAsync,
    TFormOnDynamic,
    TFormOnDynamicAsync,
    TFormOnServer,
    TSubmitMeta
  >;

  const bound = { form: cell(api) };
  extended.Field = (props: Slots) => Field(merge(props, bound) as never);
  extended.FormGroup = (props: Slots) => FormGroup(merge(props, bound) as never);
  extended.useSelector = (selector) => useSelector(api.store, selector);
  extended.useStore = extended.useSelector;
  extended.Subscribe = (props: Slots) => {
    const selector = untrack(() => readSlot(props.selector, "Subscribe.selector"));
    return renderSlot(props.children, useSelector(api.store, selector as never));
  };

  mountWith(api);
  if (opts !== undefined) {
    updateWith(opts, api.update);
    // The constructor has applied the first `transform`; a later one (server
    // state arriving after a submit) is merged into the live form.
    createRenderEffect(
      () => opts().transform,
      (transform) => {
        mergeAndUpdate(api, transform as never);
      },
      { defer: true },
    );
  }

  return extended;
}
