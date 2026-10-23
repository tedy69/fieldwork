/*! Adapted from shadcn/ui, 3d98900. MIT: /licenses/shadcn-ui-MIT.txt. */
import { Children, cloneElement, isValidElement, useId, type ComponentProps } from 'react';
import { Label as LabelPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';

export function Label({
  className,
  children,
  ...props
}: ComponentProps<typeof LabelPrimitive.Root>) {
  const generated = useId();
  const parts = Children.toArray(children);
  const control = parts.find(
    (child) =>
      isValidElement<Record<string, unknown>>(child) &&
      (child.props.type === 'password' || typeof child.props.onValueChange === 'function'),
  );
  if (isValidElement<Record<string, unknown>>(control)) {
    const id = control.props.id ?? props.htmlFor ?? `${generated}-input`;
    const labelId = props.id ?? `${generated}-label`;
    return (
      <div className={cn('ui-label ui-field-label', className)}>
        <LabelPrimitive.Root {...props} data-slot="label" id={labelId} htmlFor={String(id)}>
          {parts.filter((part) => part !== control)}
        </LabelPrimitive.Root>
        {cloneElement(control, {
          id,
          'aria-labelledby': control.props['aria-labelledby'] ?? labelId,
        })}
      </div>
    );
  }
  return (
    <LabelPrimitive.Root data-slot="label" className={cn('ui-label', className)} {...props}>
      {children}
    </LabelPrimitive.Root>
  );
}
