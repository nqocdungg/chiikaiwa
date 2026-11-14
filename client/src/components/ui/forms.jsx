import { useId, useState } from 'react';
import { IconButton } from './controls.jsx';

/**
 * @param {{
 * label: string,
 * htmlFor?: string,
 * helperText?: string,
 * error?: string,
 * required?: boolean,
 * children: import('react').ReactNode,
 * className?: string,
 * }} props
 */
export function FormField({
  label,
  htmlFor,
  helperText,
  error,
  required = false,
  children,
  className = '',
}) {
  return (
    <div className={`ck-field ${className}`.trim()}>
      <label className="ck-field__label" htmlFor={htmlFor}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>
      {children}
      {error ? (
        <p
          id={`${htmlFor}-error`}
          className="ck-field__message ck-field__message--error"
        >
          {error}
        </p>
      ) : helperText ? (
        <p id={`${htmlFor}-helper`} className="ck-field__message">
          {helperText}
        </p>
      ) : null}
    </div>
  );
}

/**
 * @param {import('react').InputHTMLAttributes<HTMLInputElement> & {
 * label: string,
 * helperText?: string,
 * error?: string,
 * fieldClassName?: string,
 * }} props
 */
export function Input({
  id: providedId,
  label,
  helperText,
  error,
  required,
  className = '',
  fieldClassName = '',
  ...inputProps
}) {
  const generatedId = useId();
  const id = providedId ?? `ck-input-${generatedId}`;
  const describedBy = error
    ? `${id}-error`
    : helperText
      ? `${id}-helper`
      : undefined;

  return (
    <FormField
      label={label}
      htmlFor={id}
      helperText={helperText}
      error={error}
      required={required}
      className={fieldClassName}
    >
      <input
        {...inputProps}
        id={id}
        className={`ck-input ${className}`.trim()}
        required={required}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy}
      />
    </FormField>
  );
}

/**
 * @param {Omit<import('react').InputHTMLAttributes<HTMLInputElement>, 'type'> & {
 * label: string,
 * helperText?: string,
 * error?: string,
 * fieldClassName?: string,
 * showLabel?: string,
 * hideLabel?: string,
 * }} props
 */
export function PasswordInput({
  id: providedId,
  label,
  helperText,
  error,
  required,
  fieldClassName = '',
  showLabel = 'Hiện mật khẩu',
  hideLabel = 'Ẩn mật khẩu',
  ...inputProps
}) {
  const generatedId = useId();
  const id = providedId ?? `ck-password-${generatedId}`;
  const [visible, setVisible] = useState(false);
  const describedBy = error
    ? `${id}-error`
    : helperText
      ? `${id}-helper`
      : undefined;

  return (
    <FormField
      label={label}
      htmlFor={id}
      helperText={helperText}
      error={error}
      required={required}
      className={fieldClassName}
    >
      <div className="ck-field__control-wrap">
        <input
          {...inputProps}
          id={id}
          type={visible ? 'text' : 'password'}
          className="ck-input ck-input--with-action"
          required={required}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={describedBy}
        />
        <IconButton
          className="ck-field__action"
          name={visible ? 'eyeOff' : 'eye'}
          label={visible ? hideLabel : showLabel}
          pressed={visible}
          onClick={() => setVisible((current) => !current)}
        />
      </div>
    </FormField>
  );
}
