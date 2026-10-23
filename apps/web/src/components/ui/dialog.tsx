/*! Adapted from shadcn/ui, 3d98900. MIT: /licenses/shadcn-ui-MIT.txt. */
import type { ComponentProps } from 'react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { XIcon } from '@phosphor-icons/react/dist/csr/X';
import { cn } from '@/lib/utils';
import { Button } from './button';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content> & { showCloseButton?: boolean }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay data-slot="dialog-overlay" className="ui-dialog-overlay" />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn('ui-dialog', className)}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close asChild>
            <Button type="button" className="quiet ui-dialog-close" aria-label="Close dialog">
              <XIcon aria-hidden="true" />
            </Button>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
export function DialogTitle({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn('ui-dialog-title', className)}
      {...props}
    />
  );
}
export function DialogDescription({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn('muted', className)}
      {...props}
    />
  );
}
