import type { Category, UniversityClass } from '../types';

/** A category belongs to at most one University class (`classId`). Null = unclassified. */

export function categoriesInClass(
  categories: Category[],
  classId: string,
): Category[] {
  return categories.filter((category) => category.classId === classId);
}

export function unclassifiedCategories(categories: Category[]): Category[] {
  return categories.filter((category) => !category.classId);
}

export function emptyUniversityClass(): UniversityClass {
  return {
    id: '',
    name: '',
    description: '',
    icon: '🎓',
    color: '#c084fc',
    sortOrder: 0,
  };
}
