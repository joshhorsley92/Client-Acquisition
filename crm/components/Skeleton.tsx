import { cn } from '@/lib/cn';

interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  className?: string;
}

export function Skeleton({ width = '100%', height = 14, className }: SkeletonProps) {
  return (
    <div
      className={cn('tkbs-skeleton', className)}
      aria-hidden="true"
      style={{ width, height }}
    />
  );
}

interface SkeletonRowsProps {
  rows?: number;
  height?: number;
  gap?: number;
  className?: string;
}

export function SkeletonRows({ rows = 4, height = 14, gap = 12, className }: SkeletonRowsProps) {
  return (
    <div className={cn('flex flex-col', className)} style={{ gap }}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} height={height} width={i === rows - 1 ? '60%' : '100%'} />
      ))}
    </div>
  );
}

interface SpinnerProps {
  size?: number;
  className?: string;
}

export function Spinner({ size = 16, className }: SpinnerProps) {
  return (
    <span
      className={cn('tkbs-spinner', className)}
      role="status"
      aria-label="Loading"
      style={{
        width: size,
        height: size,
        borderWidth: Math.max(2, Math.round(size / 8)),
      }}
    />
  );
}
