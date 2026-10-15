import type {
  AnyFormApi,
  DeepKeys,
  DeepValue,
  FieldApiOptions,
  FieldAsyncValidateOrFn,
  FieldOptions,
  FieldValidateOrFn,
  FormAsyncValidateOrFn,
  FormGroupAsyncValidateOrFn,
  FormGroupValidateOrFn,
  FormValidateOrFn,
} from "@tanstack/form-core";

export type MaybeFormValidator<TFormData> = undefined | FormValidateOrFn<TFormData>;
export type MaybeFormAsyncValidator<TFormData> = undefined | FormAsyncValidateOrFn<TFormData>;

export type MaybeFieldValidator<
  TParentData,
  TName extends DeepKeys<TParentData>,
  TData extends DeepValue<TParentData, TName>,
> = undefined | FieldValidateOrFn<TParentData, TName, TData>;

export type MaybeFieldAsyncValidator<
  TParentData,
  TName extends DeepKeys<TParentData>,
  TData extends DeepValue<TParentData, TName>,
> = undefined | FieldAsyncValidateOrFn<TParentData, TName, TData>;

export type MaybeGroupValidator<
  TParentData,
  TName extends DeepKeys<TParentData>,
  TData extends DeepValue<TParentData, TName>,
> = undefined | FormGroupValidateOrFn<TParentData, TName, TData>;

export type MaybeGroupAsyncValidator<
  TParentData,
  TName extends DeepKeys<TParentData>,
  TData extends DeepValue<TParentData, TName>,
> = undefined | FormGroupAsyncValidateOrFn<TParentData, TName, TData>;

/**
 * The type argument form-core builds its own `AnyFormApi` from. The core's
 * classes are invariant in every parameter, so a slot that has to admit any
 * form, whatever its validators, has no narrower spelling.
 */
export type Loose = NonNullable<AnyFormApi["options"]["defaultValues"]>;

/**
 * @private
 */
export interface FieldOptionsMode {
  mode?: "value" | "array";
}

export interface CreateFieldOptions<
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
  TSubmitMeta,
>
  extends
    FieldApiOptions<
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
      TSubmitMeta
    >,
    FieldOptionsMode {}

export interface CreateFieldOptionsBound<
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
>
  extends
    FieldOptions<
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
    >,
    FieldOptionsMode {}
