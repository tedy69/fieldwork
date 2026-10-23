import { useId, useRef, useState, type ComponentProps, type SubmitEvent } from 'react';
import { Alert } from './alert';

type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
export function Form({ children, onSubmit, onInput, ...props }: ComponentProps<'form'>) {
  const summary = useId();
  const invalid = useRef<Control[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  function clear() {
    for (const field of invalid.current) {
      field.removeAttribute('aria-invalid');
      const descriptions = field
        .getAttribute('aria-describedby')
        ?.split(' ')
        .filter((id) => id !== summary);
      if (descriptions?.length) field.setAttribute('aria-describedby', descriptions.join(' '));
      else field.removeAttribute('aria-describedby');
    }
    invalid.current = [];
    setErrors([]);
  }
  function submit(event: SubmitEvent<HTMLFormElement>) {
    clear();
    const fields = Array.from(event.currentTarget.elements).filter(
      (field): field is Control =>
        (field instanceof HTMLInputElement ||
          field instanceof HTMLSelectElement ||
          field instanceof HTMLTextAreaElement) &&
        field.willValidate &&
        !field.validity.valid,
    );
    if (fields.length) {
      event.preventDefault();
      invalid.current = fields;
      setErrors(
        fields.map((field) => {
          field.setAttribute('aria-invalid', 'true');
          field.setAttribute(
            'aria-describedby',
            [field.getAttribute('aria-describedby'), summary].filter(Boolean).join(' '),
          );
          const label =
            field.getAttribute('aria-label') ||
            field.labels?.[0]?.textContent?.trim() ||
            'This field';
          if (field.validity.valueMissing) return `${label}: enter a value.`;
          if (field.validity.typeMismatch)
            return `${label}: enter a valid ${field.type === 'email' ? 'email address' : 'value'}.`;
          if (field.validity.rangeUnderflow)
            return `${label}: use ${field.getAttribute('min')} or more.`;
          if (field.validity.rangeOverflow)
            return `${label}: use ${field.getAttribute('max')} or less.`;
          if (field.validity.tooShort)
            return `${label}: enter at least ${field.getAttribute('minlength')} characters.`;
          return `${label}: check the value and try again.`;
        }),
      );
      fields[0].focus();
      return;
    }
    onSubmit?.(event);
  }
  return (
    <form
      {...props}
      noValidate
      onSubmit={submit}
      onInput={(event) => {
        if (errors.length) clear();
        onInput?.(event);
      }}
    >
      {errors.length > 0 && (
        <Alert id={summary} className="form-validation error">
          <strong>Check these fields</strong>
          <ul>
            {errors.map((error, index) => (
              <li key={index}>{error}</li>
            ))}
          </ul>
        </Alert>
      )}
      {children}
    </form>
  );
}
