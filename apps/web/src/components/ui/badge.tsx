/*! Adapted from Kokonut UI's shadcn primitives. MIT notices: /licenses/kokonut-ui-MIT.txt and /licenses/shadcn-ui-MIT.txt. */
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export function Badge({ className, ...props }: ComponentProps<'span'>) {
  return (
    <span
      data-slot="badge"
      className={cn(
        'ui-badge inline-flex items-center gap-2 rounded-md border text-xs font-semibold',
        className,
      )}
      {...props}
    />
  );
}
