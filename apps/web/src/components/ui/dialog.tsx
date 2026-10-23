/*! Adapted from shadcn/ui, 3d98900. MIT: /licenses/shadcn-ui-MIT.txt. */
import type { ComponentProps } from 'react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { XIcon } from '@phosphor-icons/react/dist/csr/X';
import { cn } from '@/lib/utils';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({
  className,
  children,
  showCloseButton = true,
  size = 'form',
  ...props
}: ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean;
  size?: 'form' | 'directory' | 'compare' | 'finder';
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay data-slot="dialog-overlay" className="ui-dialog-overlay" />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        data-size={size}
        className={cn('ui-dialog', className)}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            type="button"
            className="ui-button ui-button-outline quiet ui-dialog-close"
            aria-label="Close dialog"
          >
            <XIcon aria-hidden="true" />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
export function DialogHeader({ className, ...props }: ComponentProps<'header'>) {
  return (
    <header data-slot="dialog-header" className={cn('ui-dialog-header', className)} {...props} />
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
