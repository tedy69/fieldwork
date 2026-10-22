/*! Adapted from Kokonut UI's shadcn primitives. MIT notices: /licenses/kokonut-ui-MIT.txt and /licenses/shadcn-ui-MIT.txt. */
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export function Card({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="card" className={cn('ui-card rounded-lg border', className)} {...props} />;
}
export function CardHeader({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-header"
      className={cn('ui-card-header flex flex-col gap-1.5', className)}
      {...props}
    />
  );
}
export function CardContent({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="card-content" className={cn('ui-card-content', className)} {...props} />;
}
