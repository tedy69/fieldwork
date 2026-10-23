/*! Adapted from Kokonut UI's shadcn primitives. MIT notices: /licenses/kokonut-ui-MIT.txt and /licenses/shadcn-ui-MIT.txt. */
import { useState, type ComponentProps } from 'react';
import { EyeIcon } from '@phosphor-icons/react/dist/csr/Eye';
import { EyeSlashIcon } from '@phosphor-icons/react/dist/csr/EyeSlash';
import { Button } from './button';
import { cn } from '@/lib/utils';

export function Input({ className, type, ...props }: ComponentProps<'input'>) {
  const [revealed, setRevealed] = useState(false);
  if (type === 'password')
    return (
      <span className="input-with-action">
        <input
          data-slot="input"
          type={revealed ? 'text' : 'password'}
          className={cn('ui-input', className)}
          {...props}
        />
        <Button
          type="button"
          variant="ghost"
          aria-label={revealed ? 'Hide password' : 'Show password'}
          aria-pressed={revealed}
          disabled={props.disabled}
          onClick={(event) => {
            event.preventDefault();
            setRevealed(!revealed);
          }}
        >
          {revealed ? <EyeSlashIcon aria-hidden="true" /> : <EyeIcon aria-hidden="true" />}
        </Button>
      </span>
    );
  return <input data-slot="input" type={type} className={cn('ui-input', className)} {...props} />;
}
