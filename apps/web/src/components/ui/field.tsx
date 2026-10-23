/*! Adapted from shadcn/ui, 3d98900. MIT: /licenses/shadcn-ui-MIT.txt. */
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export function FieldSet({ className, ...props }: ComponentProps<'fieldset'>) {
  return <fieldset data-slot="field-set" className={cn('ui-field-set', className)} {...props} />;
}
export function FieldLegend({ className, ...props }: ComponentProps<'legend'>) {
  return (
    <legend data-slot="field-legend" className={cn('ui-field-legend', className)} {...props} />
  );
}
export function FieldError({ className, children, ...props }: ComponentProps<'div'>) {
  if (!children) return null;
  return (
    <div
      role="alert"
      data-slot="field-error"
      className={cn('ui-field-error error', className)}
      {...props}
    >
      {children}
    </div>
  );
}
