import type { Predicate } from './types.js';

/** Returns true if two predicate arrays contain the same strings (order-independent). */
export const samePredicate = (a: Predicate = [], b: Predicate = []): boolean => {
  if (a.length === b.length) {
    const sortedA = a.sort();
    const sortedB = b.sort();
    return sortedA.every((val, index) => val === sortedB[index]);
  }
  return false;
};
