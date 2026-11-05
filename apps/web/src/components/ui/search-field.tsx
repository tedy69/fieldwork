import { useRef, type ComponentProps, type RefObject } from 'react';
import { XIcon } from '@phosphor-icons/react/dist/csr/X';
import { Input } from './input';
import { Button } from './button';

export function SearchField({
  value,
  onValueChange,
  inputRef,
  clearLabel = 'Clear search',
  ...props
}: Omit<ComponentProps<'input'>, 'value' | 'onChange' | 'type' | 'ref'> & {
  value: string;
  onValueChange: (value: string) => void;
  inputRef?: RefObject<HTMLInputElement | null>;
  clearLabel?: string;
}) {
  const fallback = useRef<HTMLInputElement>(null);
  const input = inputRef ?? fallback;
  return (
    <span className="input-with-action">
      <Input
        {...props}
        ref={input}
        type="search"
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
      />
      {value && (
        <Button
          type="button"
          variant="ghost"
          aria-label={clearLabel}
          onClick={(event) => {
            event.preventDefault();
            onValueChange('');
            input.current?.focus();
          }}
        >
          <XIcon aria-hidden="true" />
        </Button>
      )}
    </span>
  );
}
