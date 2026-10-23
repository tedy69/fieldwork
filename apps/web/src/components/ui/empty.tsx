/*! Adapted from shadcn/ui, 3d98900. MIT: /licenses/shadcn-ui-MIT.txt. */
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export function Empty({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="empty" className={cn('ui-empty', className)} {...props} />;
}
export function EmptyHeader(props: ComponentProps<'div'>) {
  return <div data-slot="empty-header" {...props} />;
}
export function EmptyTitle(props: ComponentProps<'h2'>) {
  return <h2 data-slot="empty-title" {...props} />;
}
export function EmptyDescription(props: ComponentProps<'p'>) {
  return <p data-slot="empty-description" {...props} />;
}
