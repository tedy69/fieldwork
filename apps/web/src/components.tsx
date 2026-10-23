import {
  Empty as EmptyRoot,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from './components/ui/empty';
export function PageHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="page-heading">
      <span className="eyebrow">{eyebrow}</span>
      <h1>{title}</h1>
      <p>{description}</p>
    </div>
  );
}
export function Empty({ title, description }: { title: string; description: string }) {
  return (
    <EmptyRoot className="empty">
      <span className="empty-mark" aria-hidden="true">
        /
      </span>
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </EmptyRoot>
  );
}
