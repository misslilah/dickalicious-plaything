import type { AppState, Category, CategoryGroup, UniversityFamily } from '../types';
import {
  getCategoryCompletionStats,
  getCategoryGroup,
  UNIVERSITY_CATEGORY_GROUPS,
} from './categoryProgression';

/** A category belongs to at most one theme (`familyId`). Null = unlinked. */

export function emptyUniversityFamily(): UniversityFamily {
  return {
    id: '',
    name: '',
    description: '',
    icon: '📚',
    color: '#c084fc',
    sortOrder: 0,
  };
}

export function categoriesInFamily(
  categories: Category[],
  familyId: string,
): Category[] {
  return categories.filter((category) => category.familyId === familyId);
}

export function unlinkedCategories(categories: Category[]): Category[] {
  return categories.filter((category) => !category.familyId);
}

export function familyLevelMap(
  categories: Category[],
  familyId: string,
): Partial<Record<CategoryGroup, Category>> {
  const map: Partial<Record<CategoryGroup, Category>> = {};
  for (const category of categoriesInFamily(categories, familyId)) {
    const group = getCategoryGroup(category);
    if (!map[group]) map[group] = category;
  }
  return map;
}

export function linkedLevelCount(categories: Category[], familyId: string): number {
  return UNIVERSITY_CATEGORY_GROUPS.filter(
    (group) => familyLevelMap(categories, familyId)[group],
  ).length;
}

export function categoriesInFamilyOrdered(
  categories: Category[],
  familyId: string,
): Category[] {
  const order = [...UNIVERSITY_CATEGORY_GROUPS, 'all' as const];
  return categoriesInFamily(categories, familyId).sort((a, b) => {
    const ia = order.indexOf(getCategoryGroup(a));
    const ib = order.indexOf(getCategoryGroup(b));
    if (ia !== ib) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    return a.name.localeCompare(b.name);
  });
}

export function themeCompletionStats(
  state: AppState,
  familyId: string,
): { completed: number; total: number; percent: number } {
  let completed = 0;
  let total = 0;
  for (const category of categoriesInFamily(state.categories, familyId)) {
    const stats = getCategoryCompletionStats(state, category.id);
    completed += stats.completed;
    total += stats.total;
  }
  return {
    completed,
    total,
    percent: total === 0 ? 0 : Math.round((completed / total) * 100),
  };
}

export function categoryIdsForClassPicker(
  categories: Category[],
  selectedFamilyIds: string[],
  selectedUnlinkedIds: string[],
): string[] {
  const selected = new Set(selectedUnlinkedIds);
  for (const category of categories) {
    if (category.familyId && selectedFamilyIds.includes(category.familyId)) {
      selected.add(category.id);
    }
  }
  return [...selected];
}

/** A theme is ticked if any of its linked categories already sit in this class. */
export function selectedFamilyIdsForClass(
  categories: Category[],
  classId: string | null | undefined,
): string[] {
  if (!classId) return [];
  const ids = new Set<string>();
  for (const category of categories) {
    if (category.classId === classId && category.familyId) {
      ids.add(category.familyId);
    }
  }
  return [...ids];
}

export function selectedUnlinkedIdsForClass(
  categories: Category[],
  classId: string | null | undefined,
): string[] {
  if (!classId) return [];
  return unlinkedCategories(categories)
    .filter((category) => category.classId === classId)
    .map((category) => category.id);
}

export function familiesInClass(
  families: UniversityFamily[],
  categories: Category[],
  classId: string,
): UniversityFamily[] {
  const selected = new Set(selectedFamilyIdsForClass(categories, classId));
  return families.filter((family) => selected.has(family.id));
}
