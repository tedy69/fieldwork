/*! Adapted from shadcn/ui, 3d98900. MIT: /licenses/shadcn-ui-MIT.txt. */
import type { ComponentProps } from 'react';
import { CaretDownIcon } from '@phosphor-icons/react/dist/csr/CaretDown';
import { cn } from '@/lib/utils';

export function NativeSelect({
  className,
  size = 'default',
  ...props
}: Omit<ComponentProps<'select'>, 'size'> & { size?: 'sm' | 'default' }) {
  return (
    <div data-slot="native-select-wrapper" className="ui-native-select">
      <select
        data-slot="native-select"
        data-size={size}
        className={cn('ui-select', className)}
        {...props}
      />
      <CaretDownIcon data-slot="native-select-icon" aria-hidden="true" />
    </div>
  );
}
export function NativeSelectOption(props: ComponentProps<'option'>) {
  return <option data-slot="native-select-option" {...props} />;
}
