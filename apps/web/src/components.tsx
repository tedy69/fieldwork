import {
  Empty as EmptyRoot,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from './components/ui/empty';
import type { ReactNode } from 'react';
export function PageHeading({ title, description }: { title: string; description?: string }) {
  return (
    <div className="page-heading">
      <h1>{title}</h1>
      {description && <p>{description}</p>}
    </div>
  );
}
export function PanelHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="panel-header">
      <div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {actions && <ActionGroup>{actions}</ActionGroup>}
    </header>
  );
}
export function ActionGroup({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`action-group ${className}`}>{children}</div>;
}
export function Empty({ title, description }: { title: string; description: string }) {
  return (
    <EmptyRoot className="empty">
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </EmptyRoot>
  );
}
