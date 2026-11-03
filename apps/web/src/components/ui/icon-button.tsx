import type { ReactElement } from 'react';
import { Tooltip } from 'radix-ui';
import { Button, type ButtonProps } from './button';
import { cn } from '@/lib/utils';

export function ActionTooltip({ label, children }: { label: string; children: ReactElement }) {
  return (
    <Tooltip.Provider delayDuration={250}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content className="action-tooltip" sideOffset={8} collisionPadding={8}>
            {label}
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}

/** Compact familiar actions retain a name and a pointer/keyboard explanation. */
export function IconButton({
  label,
  tooltip = label,
  className,
  children,
  showLabel = false,
  type = 'button',
  ...props
}: ButtonProps & { label: string; tooltip?: string; showLabel?: boolean }) {
  return (
    <ActionTooltip label={tooltip}>
      <Button
        {...props}
        type={type}
        size={showLabel ? 'default' : 'icon'}
        aria-label={label}
        className={cn(!showLabel && 'ui-icon-button', className)}
      >
        {children}
        {showLabel && <span>{label}</span>}
      </Button>
    </ActionTooltip>
  );
}
