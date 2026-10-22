/*! Adapted from Kokonut UI SmoothTab 2.0.0, b7bb822. Copyright (c) 2025 kokonutUI. MIT: /licenses/kokonut-ui-MIT.txt */
import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export type SelectionItem = { id: string; title: string; icon?: ReactNode };

/** Controlled selection strip. Filters share one result list, so they are toggle buttons rather than separate tab panels. */
export default function SmoothTab({
  items,
  value,
  onChange,
  label,
  className,
}: {
  items: SelectionItem[];
  value: string;
  onChange: (id: string) => void;
  label: string;
  className?: string;
}) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  function navigate(event: KeyboardEvent, index: number) {
    if (event.key === 'Enter' || event.key === ' ') {
      (event.currentTarget as HTMLElement).scrollIntoView({ block: 'nearest', inline: 'nearest' });
      return;
    }
    let next = index;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % items.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp')
      next = (index - 1 + items.length) % items.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = items.length - 1;
    else return;
    event.preventDefault();
    buttons.current[next]?.focus();
    onChange(items[next].id);
  }
  return (
    <div className={cn('kokonut-tabs', className)} role="group" aria-label={label}>
      {items.map((item, index) => (
        <Button
          key={item.id}
          type="button"
          variant="unstyled"
          ref={(node) => {
            buttons.current[index] = node;
          }}
          className={cn('kokonut-tab', value === item.id && 'is-selected')}
          aria-pressed={value === item.id}
          onClick={() => onChange(item.id)}
          onKeyDown={(event) => navigate(event, index)}
        >
          {item.icon}
          <span>{item.title}</span>
        </Button>
      ))}
    </div>
  );
}
