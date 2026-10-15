import { type Accessor, type Child, type Incoming, type JSXElement, untrack } from "@barqjs/core";
import {
  type AnyFieldApi,
  type DeepKeys,
  type DeepValue,
  FieldApi,
  type FieldValidators,
} from "@tanstack/form-core";

import { type Slots, mountWith, optionsOf, renderSlot, updateWith } from "./internal.ts";
import type {
  CreateFieldOptions,
  CreateFieldOptionsBound,
  MaybeFieldAsyncValidator,
  FieldOptionsMode,
  MaybeFieldValidator,
  MaybeFormAsyncValidator,
  MaybeFormValidator,
} from "./types.ts";
import { useSelector } from "./useStore.ts";

/**
 * The field as an accessor that notifies when what a field renders from moves:
 * its value (its array version in `array` mode, so an edit to one row does not
 * wake the list) and each piece of meta.
 */
function reactiveField(api: AnyFieldApi, mode: FieldOptionsMode["mode"]): Accessor<AnyFieldApi> {
  const track = useSelector(api.store, (state) => [
    mode === "array" ? state.meta._arrayVersion || 0 : (state.value as unknown),
    state.meta.isTouched,
    state.meta.isBlurred,
    state.meta.isDirty,
    state.meta.errorMap,
    state.meta.errorSourceMap,
    state.meta.isValidating,
  ]);
  return () => {
    track();
    return api;
  };
}

function fieldOf(opts: () => AnyFieldApi["options"] & FieldOptionsMode): Accessor<AnyFieldApi> {
  const options = untrack(opts);
  const api: AnyFieldApi = new FieldApi(options);

  mountWith(api);
  updateWith(opts, api.update);

  return reactiveField(api, options.mode);
}

export function createField<
  TParentData,
  TName extends DeepKeys<TParentData>,
  TData extends DeepValue<TParentData, TName>,
  TOnMount extends MaybeFieldValidator<TParentData, TName, TData>,
  TOnChange extends MaybeFieldValidator<TParentData, TName, TData>,
  TOnChangeAsync extends MaybeFieldAsyncValidator<TParentData, TName, TData>,
  TOnBlur extends MaybeFieldValidator<TParentData, TName, TData>,
  TOnBlurAsync extends MaybeFieldAsyncValidator<TParentData, TName, TData>,
  TOnSubmit extends MaybeFieldValidator<TParentData, TName, TData>,
  TOnSubmitAsync extends MaybeFieldAsyncValidator<TParentData, TName, TData>,
  TOnDynamic extends MaybeFieldValidator<TParentData, TName, TData>,
  TOnDynamicAsync extends MaybeFieldAsyncValidator<TParentData, TName, TData>,
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
  TParentSubmitMeta,
>(
  opts: () => CreateFieldOptions<
    TParentData,
    TName,
    TData,
    TOnMount,
    TOnChange,
    TOnChangeAsync,
    TOnBlur,
    TOnBlurAsync,
    TOnSubmit,
    TOnSubmitAsync,
    TOnDynamic,
    TOnDynamicAsync,
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
    TParentSubmitMeta
  >,
): Accessor<
  FieldApi<
    TParentData,
    TName,
    TData,
    TOnMount,
    TOnChange,
    TOnChangeAsync,
    TOnBlur,
    TOnBlurAsync,
    TOnSubmit,
    TOnSubmitAsync,
    TOnDynamic,
    TOnDynamicAsync,
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
    TParentSubmitMeta
  >
> {
  return fieldOf(opts as never) as never;
}

/**
 * `children` is declared with its parameter rather than through `Incoming`: a
 * JSX call site keeps a prop that takes arguments exactly as written, which is
 * what lets the callback infer the field it is handed.
 */
export type FieldComponentBoundProps<
  TParentData,
  TName extends DeepKeys<TParentData>,
  TData extends DeepValue<TParentData, TName>,
  TOnMount extends MaybeFieldValidator<TParentData, TName, TData>,
  TOnChange extends MaybeFieldValidator<TParentData, TName, TData>,
  TOnChangeAsync extends MaybeFieldAsyncValidator<TParentData, TName, TData>,
  TOnBlur extends MaybeFieldValidator<TParentData, TName, TData>,
  TOnBlurAsync extends MaybeFieldAsyncValidator<TParentData, TName, TData>,
  TOnSubmit extends MaybeFieldValidator<TParentData, TName, TData>,
  TOnSubmitAsync extends MaybeFieldAsyncValidator<TParentData, TName, TData>,
  TOnDynamic extends MaybeFieldValidator<TParentData, TName, TData>,
  TOnDynamicAsync extends MaybeFieldAsyncValidator<TParentData, TName, TData>,
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
  TParentSubmitMeta,
  ExtendedApi = unknown,
> = Incoming<
  CreateFieldOptionsBound<
    TParentData,
    TName,
    TData,
    TOnMount,
    TOnChange,
    TOnChangeAsync,
    TOnBlur,
    TOnBlurAsync,
    TOnSubmit,
    TOnSubmitAsync,
    TOnDynamic,
    TOnDynamicAsync
  >
> & {
  children: (
    field: Accessor<
      FieldApi<
        TParentData,
        TName,
        TData,
        TOnMount,
        TOnChange,
        TOnChangeAsync,
        TOnBlur,
        TOnBlurAsync,
        TOnSubmit,
        TOnSubmitAsync,
        TOnDynamic,
        TOnDynamicAsync,
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
        TParentSubmitMeta
      >
    > &
      ExtendedApi,
  ) => Child;
};

export type FieldComponent<
  in out TParentData,
  in out TFormOnMount extends MaybeFormValidator<TParentData>,
  in out TFormOnChange extends MaybeFormValidator<TParentData>,
  in out TFormOnChangeAsync extends MaybeFormAsyncValidator<TParentData>,
  in out TFormOnBlur extends MaybeFormValidator<TParentData>,
  in out TFormOnBlurAsync extends MaybeFormAsyncValidator<TParentData>,
  in out TFormOnSubmit extends MaybeFormValidator<TParentData>,
  in out TFormOnSubmitAsync extends MaybeFormAsyncValidator<TParentData>,
  in out TFormOnDynamic extends MaybeFormValidator<TParentData>,
  in out TFormOnDynamicAsync extends MaybeFormAsyncValidator<TParentData>,
  in out TFormOnServer extends MaybeFormAsyncValidator<TParentData>,
  in out TParentSubmitMeta,
  in out ExtendedApi = unknown,
> = <
  const TName extends DeepKeys<TParentData>,
  TData extends DeepValue<TParentData, TName>,
  TOnMount extends MaybeFieldValidator<TParentData, TName, TData>,
  TOnChange extends MaybeFieldValidator<TParentData, TName, TData>,
  TOnChangeAsync extends MaybeFieldAsyncValidator<TParentData, TName, TData>,
  TOnBlur extends MaybeFieldValidator<TParentData, TName, TData>,
  TOnBlurAsync extends MaybeFieldAsyncValidator<TParentData, TName, TData>,
  TOnSubmit extends MaybeFieldValidator<TParentData, TName, TData>,
  TOnSubmitAsync extends MaybeFieldAsyncValidator<TParentData, TName, TData>,
  TOnDynamic extends MaybeFieldValidator<TParentData, TName, TData>,
  TOnDynamicAsync extends MaybeFieldAsyncValidator<TParentData, TName, TData>,
>(
  props: FieldComponentBoundProps<
    TParentData,
    TName,
    TData,
    TOnMount,
    TOnChange,
    TOnChangeAsync,
    TOnBlur,
    TOnBlurAsync,
    TOnSubmit,
    TOnSubmitAsync,
    TOnDynamic,
    TOnDynamicAsync,
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
    TParentSubmitMeta,
    ExtendedApi
  >,
) => JSXElement;

export type FieldComponentProps<
  TParentData,
  TName extends DeepKeys<TParentData>,
  TData extends DeepValue<TParentData, TName>,
  TOnMount extends MaybeFieldValidator<TParentData, TName, TData>,
  TOnChange extends MaybeFieldValidator<TParentData, TName, TData>,
  TOnChangeAsync extends MaybeFieldAsyncValidator<TParentData, TName, TData>,
  TOnBlur extends MaybeFieldValidator<TParentData, TName, TData>,
  TOnBlurAsync extends MaybeFieldAsyncValidator<TParentData, TName, TData>,
  TOnSubmit extends MaybeFieldValidator<TParentData, TName, TData>,
  TOnSubmitAsync extends MaybeFieldAsyncValidator<TParentData, TName, TData>,
  TOnDynamic extends MaybeFieldValidator<TParentData, TName, TData>,
  TOnDynamicAsync extends MaybeFieldAsyncValidator<TParentData, TName, TData>,
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
  TParentSubmitMeta,
> = Incoming<
  CreateFieldOptions<
    TParentData,
    TName,
    TData,
    TOnMount,
    TOnChange,
    TOnChangeAsync,
    TOnBlur,
    TOnBlurAsync,
    TOnSubmit,
    TOnSubmitAsync,
    TOnDynamic,
    TOnDynamicAsync,
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
    TParentSubmitMeta
  >
> & {
  children: (
    field: Accessor<
      FieldApi<
        TParentData,
        TName,
        TData,
        TOnMount,
        TOnChange,
        TOnChangeAsync,
        TOnBlur,
        TOnBlurAsync,
        TOnSubmit,
        TOnSubmitAsync,
        TOnDynamic,
        TOnDynamicAsync,
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
        TParentSubmitMeta
      >
    >,
  ) => Child;
};

/**
 * A field component for a field group, where names are relative to the group's
 * data and resolve to the form's own paths at run time.
 */
export type LensFieldComponent<
  in out TLensData,
  in out TParentSubmitMeta,
  in out ExtendedApi = unknown,
> = <
  const TName extends DeepKeys<TLensData>,
  TData extends DeepValue<TLensData, TName>,
  TOnMount extends MaybeFieldValidator<unknown, string, TData>,
  TOnChange extends MaybeFieldValidator<unknown, string, TData>,
  TOnChangeAsync extends MaybeFieldAsyncValidator<unknown, string, TData>,
  TOnBlur extends MaybeFieldValidator<unknown, string, TData>,
  TOnBlurAsync extends MaybeFieldAsyncValidator<unknown, string, TData>,
  TOnSubmit extends MaybeFieldValidator<unknown, string, TData>,
  TOnSubmitAsync extends MaybeFieldAsyncValidator<unknown, string, TData>,
  TOnDynamic extends MaybeFieldValidator<unknown, string, TData>,
  TOnDynamicAsync extends MaybeFieldAsyncValidator<unknown, string, TData>,
>(
  props: Omit<
    FieldComponentBoundProps<
      unknown,
      string,
      TData,
      TOnMount,
      TOnChange,
      TOnChangeAsync,
      TOnBlur,
      TOnBlurAsync,
      TOnSubmit,
      TOnSubmitAsync,
      TOnDynamic,
      TOnDynamicAsync,
      MaybeFormValidator<unknown>,
      MaybeFormValidator<unknown>,
      MaybeFormAsyncValidator<unknown>,
      MaybeFormValidator<unknown>,
      MaybeFormAsyncValidator<unknown>,
      MaybeFormValidator<unknown>,
      MaybeFormAsyncValidator<unknown>,
      MaybeFormValidator<unknown>,
      MaybeFormAsyncValidator<unknown>,
      MaybeFormAsyncValidator<unknown>,
      TParentSubmitMeta,
      ExtendedApi
    >,
    "name" | "validators"
  > &
    Incoming<{
      name: TName;
      validators?: Omit<
        FieldValidators<
          unknown,
          string,
          TData,
          TOnMount,
          TOnChange,
          TOnChangeAsync,
          TOnBlur,
          TOnBlurAsync,
          TOnSubmit,
          TOnSubmitAsync,
          TOnDynamic,
          TOnDynamicAsync
        >,
        "onChangeListenTo" | "onBlurListenTo"
      > & {
        onChangeListenTo?: DeepKeys<TLensData>[];
        onBlurListenTo?: DeepKeys<TLensData>[];
      };
    }>,
) => JSXElement;

export function Field<
  TParentData,
  TName extends DeepKeys<TParentData>,
  TData extends DeepValue<TParentData, TName>,
  TOnMount extends MaybeFieldValidator<TParentData, TName, TData>,
  TOnChange extends MaybeFieldValidator<TParentData, TName, TData>,
  TOnChangeAsync extends MaybeFieldAsyncValidator<TParentData, TName, TData>,
  TOnBlur extends MaybeFieldValidator<TParentData, TName, TData>,
  TOnBlurAsync extends MaybeFieldAsyncValidator<TParentData, TName, TData>,
  TOnSubmit extends MaybeFieldValidator<TParentData, TName, TData>,
  TOnSubmitAsync extends MaybeFieldAsyncValidator<TParentData, TName, TData>,
  TOnDynamic extends MaybeFieldValidator<TParentData, TName, TData>,
  TOnDynamicAsync extends MaybeFieldAsyncValidator<TParentData, TName, TData>,
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
  TParentSubmitMeta,
>(
  props: FieldComponentProps<
    TParentData,
    TName,
    TData,
    TOnMount,
    TOnChange,
    TOnChangeAsync,
    TOnBlur,
    TOnBlurAsync,
    TOnSubmit,
    TOnSubmitAsync,
    TOnDynamic,
    TOnDynamicAsync,
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
    TParentSubmitMeta
  >,
): JSXElement {
  const slots: Slots = props;
  const field = fieldOf(() => optionsOf(slots, "Field") as never);
  return renderSlot(slots.children, field);
}
