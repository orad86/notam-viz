import { Minus, TrendingDown, TrendingUp } from 'lucide-react';

const fmt = new Intl.NumberFormat('en-US');

export default function KpiTile({
  label,
  value,
  note,
  changePct,
}: {
  label: string;
  value: number;
  note: string;
  changePct?: number | null;
}) {
  const Icon =
    changePct == null || Math.abs(changePct) < 0.5
      ? Minus
      : changePct > 0
        ? TrendingUp
        : TrendingDown;
  return (
    <div className="rounded-md border border-rule bg-paper-raised p-4 shadow-sm md:p-5">
      <p className="plate-label">{label}</p>
      <p className="mt-2 font-display text-3xl font-semibold tabular-nums">{fmt.format(value)}</p>
      <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-2">
        {changePct !== undefined && <Icon className="size-3.5 text-ink-3" aria-hidden />}
        <span>
          {changePct === undefined
            ? note
            : changePct === null
              ? `No launches in the previous ${note}`
              : `${changePct > 0 ? '+' : ''}${Math.round(changePct)}% vs previous ${note}`}
        </span>
      </p>
    </div>
  );
}
