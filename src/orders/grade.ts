import { GRADE } from '../config';

/** How well a pizza meets its order: each named part from 0 to 1, and their total. */
export type Score = { parts: { name: string; score: number }[]; total: number };

/** A total score (0 to 1) as a school grade, A+ down to F. */
export function gradeOf(total: number): string {
  const grades: [string, number][] = [
    ['A+', GRADE.aPlus],
    ['A', GRADE.a],
    ['B', GRADE.b],
    ['C', GRADE.c],
    ['D', GRADE.d],
  ];
  return grades.find(([, from]) => total >= from)?.[0] ?? 'F';
}
