import {
  type Accessor,
  type Child,
  type Context,
  type Incoming,
  type JSXElement,
  cell,
  createContext,
  merge,
  provide,
  untrack,
  useContext,
} from "@barqjs/core";
import type {
  AnyFieldApi,
  AnyFormApi,
  BaseFormOptions,
  DeepKeysOfType,
  FieldApi,
  FieldsMap,
  FormOptions,
} from "@tanstack/form-core";

import type { FieldComponent } from "./createField.ts";
import { type AppFieldExtendedBarqFieldGroupApi, createFieldGroup } from "./createFieldGroup.ts";
import { type BarqFormExtendedApi, createForm } from "./createForm.ts";
import { type Slots, renderSlot } from "./internal.ts";
import type { Loose, MaybeFormAsyncValidator, MaybeFormValidator } from "./types.ts";

/** No props of its own: an empty object, with no index signature to collide with `form`. */
type NoProps = Record<never, never>;

export type Components = Record<string, (props: never) => JSXElement>;

/**
 * A type parameter nothing was inferred for stays at its constraint, and a form
 * built elsewhere would not be assignable to it. Those slots are opened up; an
 * inferred one is kept exact.
 */
type UnwrapOrLoose<T> = [unknown] extends [T] ? Loose : T;
type UnwrapDefaultOrLoose<DefaultT, T> = [DefaultT] extends [T]
  ? [T] extends [DefaultT]
    ? Loose
    : T
  : T;

function cells(values: Record<string, unknown> | undefined): Slots {
  const out: Slots = {};
  if (values === undefined) return out;
  for (const key of Object.keys(values)) out[key] = cell(values[key]);
  return out;
}

export function createFormHookContexts() {
  const fieldContext = createContext<AnyFieldApi>(undefined, "barq-form-field");

  function useFieldContext<TData>() {
    let field: Accessor<AnyFieldApi>;
    try {
      field = useContext(fieldContext);
    } catch (cause) {
      throw new Error(
        "`fieldContext` only works when within a `fieldComponent` passed to `createFormHook`",
        { cause },
      );
    }
    return field as Accessor<
      FieldApi<
        Loose,
        string,
        TData,
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
        Loose,
        Loose,
        Loose,
        Loose,
        Loose,
        Loose,
        Loose,
        Loose,
        Loose,
        Loose
      >
    >;
  }

  const formContext = createContext<AnyFormApi>(undefined, "barq-form");

  function useFormContext() {
    let form: Accessor<AnyFormApi>;
    try {
      form = useContext(formContext);
    } catch (cause) {
      throw new Error(
        "`formContext` only works when within a `formComponent` passed to `createFormHook`",
        { cause },
      );
    }
    // Typed without the form's data: a component that needs it takes the form
    // through `withForm` instead.
    return form() as BarqFormExtendedApi<
      Record<string, never>,
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
      Loose
    >;
  }

  return { fieldContext, useFieldContext, useFormContext, formContext };
}

export interface CreateFormHookProps<
  TFieldComponents extends Components,
  TFormComponents extends Components,
> {
  fieldComponents: TFieldComponents;
  fieldContext: Context<AnyFieldApi>;
  formComponents: TFormComponents;
  formContext: Context<AnyFormApi>;
}

/**
 * @private
 */
export type AppFieldExtendedBarqFormApi<
  TFormData,
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
> = BarqFormExtendedApi<
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
  TSubmitMeta
> &
  NoInfer<TFormComponents> & {
    AppField: FieldComponent<
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
      NoInfer<TFieldComponents>
    >;
    AppForm: (props: Incoming<{ children?: Child }>) => JSXElement;
  };

export interface WithFormProps<
  TFormData,
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
  TRenderProps extends Record<string, unknown> = NoProps,
> extends FormOptions<
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
  TSubmitMeta
> {
  props?: TRenderProps;
  render: (
    props: Incoming<
      NoInfer<TRenderProps> & {
        form: AppFieldExtendedBarqFormApi<
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
        >;
        children?: Child;
      }
    >,
  ) => JSXElement;
}

export interface WithFieldGroupProps<
  TFieldGroupData,
  TFieldComponents extends Components,
  TFormComponents extends Components,
  TSubmitMeta,
  TRenderProps extends Record<string, unknown> = NoProps,
> extends BaseFormOptions<TFieldGroupData, TSubmitMeta> {
  props?: TRenderProps;
  render: (
    props: Incoming<
      NoInfer<TRenderProps> & {
        group: AppFieldExtendedBarqFieldGroupApi<
          unknown,
          TFieldGroupData,
          string | FieldsMap<unknown, TFieldGroupData>,
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
          // `never` in the render prop, so an untyped meta cannot be handed to
          // `handleSubmit` by accident.
          unknown extends TSubmitMeta ? never : TSubmitMeta,
          TFieldComponents,
          TFormComponents
        >;
        children?: Child;
      }
    >,
  ) => JSXElement;
}

/**
 * Binds a set of field and form components to `createForm`, so a form built
 * with `useAppForm` reaches them as `field.TextField` and `form.SubmitButton`.
 */
export function createFormHook<
  const TComponents extends Components,
  const TFormComponents extends Components,
>(opts: CreateFormHookProps<TComponents, TFormComponents>) {
  function useAppForm<
    TFormData,
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
  >(
    props: Accessor<
      FormOptions<
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
        TSubmitMeta
      >
    >,
  ): AppFieldExtendedBarqFormApi<
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
    TComponents,
    TFormComponents
  > {
    const form = createForm(props);
    const field = form.Field as unknown as (fieldProps: Slots) => JSXElement;

    const AppForm = (formProps: Slots): JSXElement =>
      provide(opts.formContext, cell(form as unknown as AnyFormApi), () =>
        renderSlot(formProps.children),
      );

    const AppField = (fieldProps: Slots): JSXElement =>
      field(
        merge(fieldProps, {
          children: (api: Accessor<AnyFieldApi>) =>
            provide(opts.fieldContext, api, () =>
              renderSlot(fieldProps.children, Object.assign(api, opts.fieldComponents)),
            ),
        }),
      );

    return Object.assign(form, { AppField, AppForm }, opts.formComponents) as never;
  }

  function withForm<
    TFormData,
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
    TRenderProps extends Record<string, unknown> = NoProps,
  >({
    render,
    props,
  }: WithFormProps<
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
    TComponents,
    TFormComponents,
    TRenderProps
  >): (
    props: Incoming<
      Partial<TRenderProps> & {
        form: AppFieldExtendedBarqFormApi<
          UnwrapOrLoose<TFormData>,
          UnwrapDefaultOrLoose<MaybeFormValidator<TFormData>, TOnMount>,
          UnwrapDefaultOrLoose<MaybeFormValidator<TFormData>, TOnChange>,
          UnwrapDefaultOrLoose<MaybeFormAsyncValidator<TFormData>, TOnChangeAsync>,
          UnwrapDefaultOrLoose<MaybeFormValidator<TFormData>, TOnBlur>,
          UnwrapDefaultOrLoose<MaybeFormAsyncValidator<TFormData>, TOnBlurAsync>,
          UnwrapDefaultOrLoose<MaybeFormValidator<TFormData>, TOnSubmit>,
          UnwrapDefaultOrLoose<MaybeFormAsyncValidator<TFormData>, TOnSubmitAsync>,
          UnwrapDefaultOrLoose<MaybeFormValidator<TFormData>, TOnDynamic>,
          UnwrapDefaultOrLoose<MaybeFormAsyncValidator<TFormData>, TOnDynamicAsync>,
          UnwrapDefaultOrLoose<MaybeFormAsyncValidator<TFormData>, TOnServer>,
          UnwrapOrLoose<TSubmitMeta>,
          UnwrapOrLoose<TComponents>,
          UnwrapOrLoose<TFormComponents>
        >;
        children?: Child;
      }
    >,
  ) => JSXElement {
    const defaults = cells(props);
    return (innerProps) => render(merge(defaults, innerProps) as never);
  }

  function withFieldGroup<
    TFieldGroupData,
    TSubmitMeta,
    TRenderProps extends Record<string, unknown> = NoProps,
  >({
    render,
    props,
    defaultValues,
  }: WithFieldGroupProps<
    TFieldGroupData,
    TComponents,
    TFormComponents,
    TSubmitMeta,
    TRenderProps
  >): <
    TFormData,
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
    TFormSubmitMeta,
  >(
    params: Incoming<
      Partial<NoInfer<TRenderProps>> & {
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
              unknown extends TSubmitMeta ? TFormSubmitMeta : TSubmitMeta,
              TComponents,
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
              unknown extends TSubmitMeta ? TFormSubmitMeta : TSubmitMeta,
              TComponents,
              TFormComponents
            >;
        fields:
          | DeepKeysOfType<TFormData, TFieldGroupData | null | undefined>
          | FieldsMap<TFormData, TFieldGroupData>;
        children?: Child;
      }
    >,
  ) => JSXElement {
    const defaults = cells(props);
    return (innerProps) => {
      const groupOptions = {
        form: untrack(innerProps.form),
        fields: untrack(innerProps.fields),
        defaultValues,
        formComponents: opts.formComponents,
      };
      const group = createFieldGroup(() => groupOptions as never);
      return render(merge(defaults, innerProps, { group: cell(group) }) as never);
    };
  }

  /**
   * The form `<form.AppForm>` provides, typed from the options it was built
   * with. Prefer `withForm`: nothing checks that the options here are the ones
   * the provided form was created from.
   */
  function useTypedAppFormContext<
    TFormData,
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
  >(
    _props: FormOptions<
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
      TSubmitMeta
    >,
  ): AppFieldExtendedBarqFormApi<
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
    TComponents,
    TFormComponents
  > {
    try {
      return useContext(opts.formContext)() as never;
    } catch (cause) {
      throw new Error(
        "`formContext` only works when within a `formComponent` passed to `createFormHook`",
        { cause },
      );
    }
  }

  function extendForm<
    const TNewField extends Components & {
      [
        K in keyof TComponents
      ]?: "Error: field component names must be unique, this key already exists in the base form";
    },
    const TNewForm extends Components & {
      [
        K in keyof TFormComponents
      ]?: "Error: form component names must be unique, this key already exists in the base form";
    },
  >(extension: { fieldComponents?: TNewField; formComponents?: TNewForm }) {
    return createFormHook({
      fieldContext: opts.fieldContext,
      formContext: opts.formContext,
      fieldComponents: {
        ...opts.fieldComponents,
        ...extension.fieldComponents,
      } as TComponents & TNewField,
      formComponents: {
        ...opts.formComponents,
        ...extension.formComponents,
      } as TFormComponents & TNewForm,
    });
  }

  return {
    useAppForm,
    withForm,
    withFieldGroup,
    useTypedAppFormContext,
    extendForm,
  };
}
