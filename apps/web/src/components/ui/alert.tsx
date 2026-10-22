/*! Adapted from Kokonut UI's shadcn primitives. MIT notices: /licenses/kokonut-ui-MIT.txt and /licenses/shadcn-ui-MIT.txt. */
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export function Alert({ className, role = 'alert', ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert"
      role={role}
      className={cn('ui-alert rounded-lg border px-4 py-3 text-sm', className)}
      {...props}
    />
  );
}
