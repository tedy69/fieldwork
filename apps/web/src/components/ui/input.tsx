/*! Adapted from Kokonut UI's shadcn primitives. MIT notices: /licenses/kokonut-ui-MIT.txt and /licenses/shadcn-ui-MIT.txt. */
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export function Input({ className, type, ...props }: ComponentProps<'input'>) {
  return <input data-slot="input" type={type} className={cn('ui-input', className)} {...props} />;
}
