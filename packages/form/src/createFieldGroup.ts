import { type Incoming, type JSXElement, merge, readSlot, untrack } from "@barqjs/core";
import {
  type AnyFieldGroupApi,
  type DeepKeysOfType,
  FieldGroupApi,
  type FieldGroupState,
  type FieldsMap,
} from "@tanstack/form-core";

import type { LensFieldComponent } from "./createField.ts";
import type { SubscribeChildren } from "./createForm.ts";
import type { AppFieldExtendedBarqFormApi, AppFormProps, Components } from "./createFormHook.ts";
import { type Slots, mountWith, renderSlot } from "./internal.ts";
import type { Loose, MaybeFormAsyncValidator, MaybeFormValidator } from "./types.ts";
import { useSelector } from "./useStore.ts";

export interface FieldGroupSubscribeOptions<TFieldGroupData, TSelected> {
  selector?: (state: NoInfer<FieldGroupState<TFieldGroupData>>) => TSelected;
}

/**
 * @private
 */
export type AppFieldExtendedBarqFieldGroupApi<
  TFormData,
  TFieldGroupData,
  TFields extends
    | DeepKeysOfType<TFormData, TFieldGroupData | null | undefined>
    | FieldsMap<TFormData, TFieldGroupData>,
  TOnMount extends MaybeFormValidator<TFormData>,
  TOnChange extends MaybeFormValidator<TFormData>,
  TOnChangeAsync extends MaybeFormAsyncValidator<TFormData>,
  TOnBlur extends MaybeFormValidator<TFormData>,
  TOnBlurAsync extends MaybeFormAsyncValidator<TFormData>,
  TOnSubmit extends MaybeFormValidator<TFormData>,
  TOnSubmitAsync extends MaybeFormAsyncValidator<TFormData>,
  TOnDynamic extends MaybeFormValidator<TFormData>,
  TOnDynamicAsync extends MaybeFormAsyncValidator<TFormData>,
  TOnServer extends MaybeFormAsyncValidator<TFormData>,
  TSubmitMeta,
  TFieldComponents extends Components,
  TFormComponents extends Components,
> = FieldGroupApi<
  TFormData,
  TFieldGroupData,
  TFields,
  TOnMount,
  TOnChange,
  TOnChangeAsync,
  TOnBlur,
  TOnBlurAsync,
  TOnSubmit,
  TOnSubmitAsync,
  TOnDynamic,
  TOnDynamicAsync,
  TOnServer,
  TSubmitMeta
> &
  NoInfer<TFormComponents> & {
    AppField: LensFieldComponent<TFieldGroupData, TSubmitMeta, NoInfer<TFieldComponents>>;
    AppForm: (props: Incoming<AppFormProps>) => JSXElement;
    Field: LensFieldComponent<TFieldGroupData, TSubmitMeta>;
    Subscribe: <TSelected = NoInfer<FieldGroupState<TFieldGroupData>>>(
      props: Incoming<FieldGroupSubscribeOptions<TFieldGroupData, TSelected>> &
        SubscribeChildren<TSelected>,
    ) => JSXElement;
  };

interface AppFormLike {
  AppForm: (props: Slots) => JSXElement;
  AppField: (props: Slots) => JSXElement;
  Field: (props: Slots) => JSXElement;
}

export interface CreateFieldGroupOptions<
  TFormData,
  TFieldGroupData,
  TFields extends
    | DeepKeysOfType<TFormData, TFieldGroupData | null | undefined>
    | FieldsMap<TFormData, TFieldGroupData>,
  TOnMount extends MaybeFormValidator<TFormData>,
  TOnChange extends MaybeFormValidator<TFormData>,
  TOnChangeAsync extends MaybeFormAsyncValidator<TFormData>,
  TOnBlur extends MaybeFormValidator<TFormData>,
  TOnBlurAsync extends MaybeFormAsyncValidator<TFormData>,
  TOnSubmit extends MaybeFormValidator<TFormData>,
  TOnSubmitAsync extends MaybeFormAsyncValidator<TFormData>,
  TOnDynamic extends MaybeFormValidator<TFormData>,
  TOnDynamicAsync extends MaybeFormAsyncValidator<TFormData>,
  TOnServer extends MaybeFormAsyncValidator<TFormData>,
  TFieldComponents extends Components,
  TFormComponents extends Components,
  TSubmitMeta,
> {
  form:
    | AppFieldExtendedBarqFormApi<
        TFormData,
        TOnMount,
        TOnChange,
        TOnChangeAsync,
        TOnBlur,
        TOnBlurAsync,
        TOnSubmit,
        TOnSubmitAsync,
        TOnDynamic,
        TOnDynamicAsync,
        TOnServer,
        TSubmitMeta,
        TFieldComponents,
        TFormComponents
      >
    | AppFieldExtendedBarqFieldGroupApi<
        unknown,
        TFormData,
        string | FieldsMap<unknown, TFormData>,
        Loose,
        Loose,
        Loose,
        Loose,
        Loose,
        Loose,
        Loose,
        Loose,
        Loose,
        Loose,
        TSubmitMeta,
        TFieldComponents,
        TFormComponents
      >;
  fields: TFields;
  defaultValues?: TFieldGroupData;
  onSubmitMeta?: TSubmitMeta;
  formComponents: TFormComponents;
}

/**
 * A reusable set of fields bound to part of a form: either one object path, or
 * a map from the group's keys to the form's own paths.
 */
export function createFieldGroup<
  TFormData,
  TFieldGroupData,
  TFields extends
    | DeepKeysOfType<TFormData, TFieldGroupData | null | undefined>
    | FieldsMap<TFormData, TFieldGroupData>,
  TOnMount extends MaybeFormValidator<TFormData>,
  TOnChange extends MaybeFormValidator<TFormData>,
  TOnChangeAsync extends MaybeFormAsyncValidator<TFormData>,
  TOnBlur extends MaybeFormValidator<TFormData>,
  TOnBlurAsync extends MaybeFormAsyncValidator<TFormData>,
  TOnSubmit extends MaybeFormValidator<TFormData>,
  TOnSubmitAsync extends MaybeFormAsyncValidator<TFormData>,
  TOnDynamic extends MaybeFormValidator<TFormData>,
  TOnDynamicAsync extends MaybeFormAsyncValidator<TFormData>,
  TOnServer extends MaybeFormAsyncValidator<TFormData>,
  TFieldComponents extends Components,
  TFormComponents extends Components,
  TSubmitMeta = never,
>(
  opts: () => CreateFieldGroupOptions<
    TFormData,
    TFieldGroupData,
    TFields,
    TOnMount,
    TOnChange,
    TOnChangeAsync,
    TOnBlur,
    TOnBlurAsync,
    TOnSubmit,
    TOnSubmitAsync,
    TOnDynamic,
    TOnDynamicAsync,
    TOnServer,
    TFieldComponents,
    TFormComponents,
    TSubmitMeta
  >,
): AppFieldExtendedBarqFieldGroupApi<
  TFormData,
  TFieldGroupData,
  TFields,
  TOnMount,
  TOnChange,
  TOnChangeAsync,
  TOnBlur,
  TOnBlurAsync,
  TOnSubmit,
  TOnSubmitAsync,
  TOnDynamic,
  TOnDynamicAsync,
  TOnServer,
  TSubmitMeta,
  TFieldComponents,
  TFormComponents
> {
  const options = untrack(opts);
  const api: AnyFieldGroupApi = new FieldGroupApi(options as never);
  const parent: unknown = options.form;
  const form = (parent instanceof FieldGroupApi ? parent.form : parent) as AppFormLike;

  function lens(props: Slots): Slots {
    function mapped() {
      return api.getFormFieldOptions({
        name: readSlot(props.name, "Field.name") as string,
        validators: readSlot(props.validators, "Field.validators") as never,
      });
    }
    return merge(props, { name: () => mapped().name, validators: () => mapped().validators });
  }

  mountWith(api);

  return Object.assign(
    api,
    {
      AppForm: (props: Slots) => form.AppForm(props),
      AppField: (props: Slots) => form.AppField(lens(props)),
      Field: (props: Slots) => form.Field(lens(props)),
      Subscribe: (props: Slots) => {
        const selector = untrack(() => readSlot(props.selector, "Subscribe.selector"));
        return renderSlot(props.children, useSelector(api.store, selector as never));
      },
    },
    options.formComponents,
  ) as never;
}
