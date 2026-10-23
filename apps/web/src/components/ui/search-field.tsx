import { useRef, type ComponentProps, type RefObject } from 'react';
import { XIcon } from '@phosphor-icons/react/dist/csr/X';
import { Input } from './input';
import { Button } from './button';

export function SearchField({
  value,
  onValueChange,
  inputRef,
  ...props
}: Omit<ComponentProps<'input'>, 'value' | 'onChange' | 'type' | 'ref'> & {
  value: string;
  onValueChange: (value: string) => void;
  inputRef?: RefObject<HTMLInputElement | null>;
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
          aria-label="Clear search"
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
