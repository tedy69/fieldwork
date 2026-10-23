/*! Adapted from shadcn/ui, 3d98900. MIT: /licenses/shadcn-ui-MIT.txt. */
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn('ui-textarea resize-none', className)}
      {...props}
    />
  );
}
