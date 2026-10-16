import { CategoryCard } from './CategoryCard';
import { useAppStore } from '../hooks/useAppStore';
import { categoryDisplayIcon } from '../lib/categoryIcon';
import {
  categoriesInFamily,
  themeCompletionStats,
} from '../lib/universityFamilies';
import type { Category, UniversityFamily } from '../types';

export function UniversityFamilyCard({
  item,
  categories,
}: {
  item: UniversityFamily;
  categories: Category[];
}) {
  const { state } = useAppStore();
  const members = categoriesInFamily(categories, item.id);
  const stats = themeCompletionStats(state, item.id);
  const joined = members.some((category) =>
    state.joinedCategoryIds.includes(category.id),
  );
  const cover = members.find((category) => category.imageUrl);
  const category: Category = {
    id: item.id,
    name: item.name,
    icon: categoryDisplayIcon(item.name, item.icon || cover?.icon),
    color: item.color,
    description: item.description,
    imageUrl: cover?.imageUrl,
  };

  return (
    <CategoryCard
      category={category}
      taskCount={stats.total}
      completionPercent={stats.percent}
      completedCount={stats.completed}
      isUnlocked
      isMember={joined}
      to={`/university/theme/${item.id}`}
    />
  );
}
