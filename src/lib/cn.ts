import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Conditional class names with conflict resolution.
 *
 * `clsx` flattens the conditional forms; `twMerge` then resolves Tailwind
 * conflicts so a caller-supplied class always beats the component default:
 *
 *   cn("px-3 py-2 bg-accent", className)   // className="bg-danger" wins
 *
 * Without the merge step both classes survive and the winner depends on
 * stylesheet order, which is why every primitive funnels its className
 * prop through here.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
