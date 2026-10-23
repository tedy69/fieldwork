/*! Adapted from Kokonut UI's shadcn primitives. MIT notices: /licenses/kokonut-ui-MIT.txt and /licenses/shadcn-ui-MIT.txt. */
import type { ComponentProps } from 'react';
import { Slot } from 'radix-ui';
import { cn } from '@/lib/utils';

export type ButtonProps = ComponentProps<'button'> & {
  asChild?: boolean;
  variant?: 'default' | 'secondary' | 'outline' | 'ghost' | 'link' | 'unstyled';
  size?: 'default' | 'sm' | 'icon';
};

export function Button({
  className,
  variant = 'secondary',
  size = 'default',
  asChild = false,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : 'button';
  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(
        'ui-button',
        `ui-button-${variant}`,
        variant !== 'unstyled' &&
          'inline-flex items-center justify-center gap-2 rounded-md font-medium text-sm disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
        className,
      )}
      {...props}
    />
  );
}
