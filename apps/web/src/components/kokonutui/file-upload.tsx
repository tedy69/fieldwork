/*! Adapted from Kokonut UI FileUpload 2.0.0, b7bb822. Copyright (c) 2025 kokonutUI. MIT: /licenses/kokonut-ui-MIT.txt */
import { useEffect, useRef, useState } from 'react';
import { UploadSimpleIcon } from '@phosphor-icons/react/dist/csr/UploadSimple';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

function isFileDrag(event: { dataTransfer: DataTransfer | null }) {
  return event.dataTransfer?.types.includes('Files') ?? false;
}

/** Files enter Fieldwork's durable draft; this component never simulates an upload or submits a report. */
export default function FileUpload({
  onFiles,
  disabled,
  busy,
}: {
  onFiles: (files: File[]) => Promise<void>;
  disabled: boolean;
  busy: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const pending = useRef(false);
  const [over, setOver] = useState(false);
  useEffect(() => {
    const preventFileNavigation = (event: DragEvent) => {
      if (isFileDrag(event)) event.preventDefault();
    };
    window.addEventListener('dragover', preventFileNavigation);
    window.addEventListener('drop', preventFileNavigation);
    return () => {
      window.removeEventListener('dragover', preventFileNavigation);
      window.removeEventListener('drop', preventFileNavigation);
    };
  }, []);
  async function add(files: File[]) {
    if (disabled || pending.current || !files.length) return;
    pending.current = true;
    try {
      await onFiles(files);
    } finally {
      pending.current = false;
    }
  }
  return (
    <div
      className={cn('kokonut-upload', over && !disabled && 'is-dragging')}
      role="group"
      aria-label="Site photo attachments"
      aria-busy={busy}
      onDragOver={(event) => {
        if (isFileDrag(event)) {
          event.preventDefault();
          setOver(true);
        }
      }}
      onDragLeave={(event) => {
        if (
          !(event.relatedTarget instanceof Node) ||
          !event.currentTarget.contains(event.relatedTarget)
        )
          setOver(false);
      }}
      onDrop={(event) => {
        if (!isFileDrag(event)) return;
        event.preventDefault();
        setOver(false);
        void add(Array.from(event.dataTransfer.files));
      }}
    >
      <UploadSimpleIcon aria-hidden="true" size={24} />
      <div>
        <strong>{busy ? 'Saving photos on this device…' : 'Drop site photos here'}</strong>
        <p>JPEG, PNG, or WebP. Up to 3 photos, 2 MB each.</p>
        <p className="muted">Photos stay in your draft until you submit the inspection.</p>
      </div>
      <Input
        ref={input}
        aria-label="Attach site photos"
        className="sr-only"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        disabled={disabled}
        onChange={(event) => {
          void add(Array.from(event.currentTarget.files ?? []));
          event.currentTarget.value = '';
        }}
      />
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        onClick={() => input.current?.click()}
      >
        Choose photos
      </Button>
    </div>
  );
}
