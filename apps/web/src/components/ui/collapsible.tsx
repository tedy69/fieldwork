/*! shadcn/ui composition over Radix Collapsible. MIT: /licenses/shadcn-ui-MIT.txt and /licenses/radix-ui-MIT.txt. */
import { Collapsible as CollapsiblePrimitive } from 'radix-ui';
import { Button, type ButtonProps } from './button';

export const Collapsible = CollapsiblePrimitive.Root;
export const CollapsibleContent = CollapsiblePrimitive.Content;

export function CollapsibleTrigger(props: Omit<ButtonProps, 'asChild'>) {
  return (
    <CollapsiblePrimitive.Trigger asChild>
      <Button type="button" {...props} onClick={props.onClick} />
    </CollapsiblePrimitive.Trigger>
  );
}
