import { UniversityCategoryGrid } from './UniversityCategoryGrid';
import { useAppStore } from '../hooks/useAppStore';
import {
  CATEGORY_GROUP_ICONS,
  CATEGORY_GROUP_LABELS,
  getCategoryGroup,
  getPreviousTierGroup,
  getTierGroupStats,
  getTierUnlockProgressLabel,
  isTierGroupUnlocked,
  TIER_UNLOCK_PERCENT,
  UNIVERSITY_CATEGORY_GROUPS,
} from '../lib/categoryProgression';
import type { Category, UniversityFamily } from '../types';

function FamilyChunks({
  categories,
  families,
  tutorialCategoryId,
}: {
  categories: Category[];
  families: UniversityFamily[];
  tutorialCategoryId?: string | null;
}) {
  const grouped = [
    ...families.flatMap((family) =>
      categories.filter((category) => category.familyId === family.id),
    ),
    ...categories.filter((category) => !category.familyId),
  ];

  if (categories.length === 0) {
    return <p className="muted">No categories in this level yet.</p>;
  }

  return (
    <UniversityCategoryGrid
      categories={grouped}
      tutorialCategoryId={tutorialCategoryId}
    />
  );
}

export function UniversityCategoryTiers({
  categories,
  families,
  tutorialCategoryId,
}: {
  categories: Category[];
  families: UniversityFamily[];
  tutorialCategoryId?: string | null;
}) {
  const { state } = useAppStore();
  const extraAll = categories.filter((category) => getCategoryGroup(category) === 'all');

  return (
    <>
      {extraAll.length > 0 ? (
        <section
          className="card category-tier university-tier"
          data-tutorial={
            extraAll.some((category) => category.id === tutorialCategoryId)
              ? 'category-card'
              : undefined
          }
        >
          <h3 className="section-title">
            <span aria-hidden>{CATEGORY_GROUP_ICONS.all} </span>
            {CATEGORY_GROUP_LABELS.all}
          </h3>
          <FamilyChunks
            categories={extraAll}
            families={families}
            tutorialCategoryId={tutorialCategoryId}
          />
        </section>
      ) : null}

      {UNIVERSITY_CATEGORY_GROUPS.map((group) => {
        const cats = categories.filter((category) => getCategoryGroup(category) === group);
        const tierLocked = !isTierGroupUnlocked(state, group);
        const prevGroup = getPreviousTierGroup(group);

        return (
          <section
            key={group}
            className={
              tierLocked
                ? 'card category-tier university-tier category-tier--locked'
                : 'card category-tier university-tier'
            }
            data-tutorial={
              cats.some((category) => category.id === tutorialCategoryId)
                ? 'category-card'
                : undefined
            }
          >
            <h3 className="section-title">
              <span aria-hidden>{CATEGORY_GROUP_ICONS[group]} </span>
              {CATEGORY_GROUP_LABELS[group]}
            </h3>
            {tierLocked && prevGroup ? (
              <p className="muted category-tier__hint">
                Complete at least {TIER_UNLOCK_PERCENT}% of{' '}
                {CATEGORY_GROUP_LABELS[prevGroup]} categories to unlock this level.
                {' '}
                {getTierUnlockProgressLabel(state, group)}
              </p>
            ) : null}
            {!tierLocked && group !== 'beginner' && prevGroup ? (
              <p className="muted category-tier__hint">
                {getTierUnlockProgressLabel(state, group) ??
                  `${getTierGroupStats(state, prevGroup).percent}% of ${CATEGORY_GROUP_LABELS[prevGroup]} categories completed.`}
              </p>
            ) : null}
            <FamilyChunks
              categories={cats}
              families={families}
              tutorialCategoryId={tutorialCategoryId}
            />
          </section>
        );
      })}
    </>
  );
}
