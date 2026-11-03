import type { ReactNode } from 'react';

export default function Panel({
  label,
  title,
  aside,
  children,
}: {
  label: string;
  title: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-md border border-rule bg-paper-raised p-4 shadow-sm md:p-5">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="plate-label">{label}</p>
          <h2 className="mt-0.5 text-lg font-semibold">{title}</h2>
        </div>
        {aside}
      </header>
      {children}
    </section>
  );
}
