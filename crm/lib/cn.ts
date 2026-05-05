import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Tailwind class helper: merges conditional classes (clsx) and resolves
// conflicts (tailwind-merge), so `cn('p-2', condition && 'p-4')` ends up
// with just `p-4`, not both. Use everywhere instead of raw template strings.
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
