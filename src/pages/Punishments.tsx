import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { PunishmentCategoryCard } from '../components/PunishmentCategoryCard';
import { PunishmentCompletionModal } from '../components/PunishmentCompletionModal';
import { PunishmentListRow } from '../components/PunishmentListRow';
import { useAppStore } from '../hooks/useAppStore';
import { isPunishmentSessionInProgress } from '../hooks/usePunishmentCompletion';
import { usePunishmentCooldowns } from '../hooks/usePunishmentCooldowns';
import { isCategoryImagePreview } from '../lib/categoryImage';
import {
  categoryDifficulty,
  groupPunishmentsByDifficultyAndCategory,
  PUNISHMENT_DIFFICULTY_LABELS,
  PUNISHMENT_DIFFICULTY_ORDER,
  resolvePunishmentCategoryId,
  resolvePunishmentDifficulty,
  templatesForCategory,
} from '../lib/gameLogic';
import { getSupabase } from '../lib/supabase';
import { fetchUserThronePunishmentPending } from '../lib/throneDb';
import type {
  PunishmentCategory,
  PunishmentDifficulty,
  PunishmentTemplate,
  ThronePaymentPending,
} from '../types';

const UNCATEGORIZED_PREFIX = '__uncategorized__';

const TIER_COPY: Record<PunishmentDifficulty, { icon: string; hint: string }> = {
  easy: { icon: '💗', hint: 'Softer relief' },
  medium: { icon: '⚡', hint: 'Standard heat' },
  hard: { icon: '🔥', hint: 'Serious atonement' },
};

function uncategorizedCategoryId(difficulty: PunishmentDifficulty): string {
  return `${UNCATEGORIZED_PREFIX}:${difficulty}`;
}

function parseUncategorizedDifficulty(
  categoryId: string,
): PunishmentDifficulty | null {
  if (!categoryId.startsWith(`${UNCATEGORIZED_PREFIX}:`)) return null;
  const tier = categoryId.split(':')[1];
  if (tier === 'easy' || tier === 'medium' || tier === 'hard') return tier;
  return null;
}

function parseDifficulty(raw: string | null): PunishmentDifficulty | null {
  if (raw === 'easy' || raw === 'medium' || raw === 'hard') return raw;
  return null;
}

export function Punishments() {
  const { pathname } = useLocation();
  const embedded = pathname.startsWith('/university');
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedCategoryId = searchParams.get('category');
  const {
    state,
    session,
    refresh,
    acceptPunishment,
    isEffectiveAdmin,
  } = useAppStore();

  const isAdmin = isEffectiveAdmin;
  const [completingTemplate, setCompletingTemplate] =
    useState<PunishmentTemplate | null>(null);
  const [completionError, setCompletionError] = useState<string | null>(null);
  const [thronePending, setThronePending] = useState<ThronePaymentPending[]>([]);

  const userId = session?.userId;
  const thronePendingForTemplate = useMemo(() => {
    if (!completingTemplate) return null;
    const rows = thronePending.filter(
      (p) => p.punishmentTemplateId === completingTemplate.id,
    );
    return (
      rows.find((p) => p.status === 'waiting') ??
      rows.find((p) => p.status === 'completed') ??
      null
    );
  }, [thronePending, completingTemplate]);

  const loadThronePending = useCallback(async () => {
    if (!userId) {
      setThronePending([]);
      return;
    }
    const result = await fetchUserThronePunishmentPending(userId);
    if (result.ok) setThronePending(result.pending);
  }, [userId]);

  useEffect(() => {
    void loadThronePending();
  }, [loadThronePending]);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase || !userId) return;

    const channel = supabase
      .channel(`punishments-throne:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'throne_payment_pending',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          void loadThronePending();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, loadThronePending]);

  const setPath = (difficulty: PunishmentDifficulty | null, categoryId: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (difficulty) next.set('difficulty', difficulty);
    else next.delete('difficulty');
    if (categoryId) next.set('category', categoryId);
    else next.delete('category');
    setSearchParams(next, { replace: true });
  };

  const malus = state.progress.malusPoints;
  const reliefTemplates = state.punishmentTemplates.filter(
    (t) => t.trigger.type === 'malus_relief' || t.malusPointsRelieved > 0,
  );
  const punishmentsByDifficultyAndCategory = useMemo(
    () =>
      groupPunishmentsByDifficultyAndCategory(
        reliefTemplates,
        state.punishmentCategories,
        { includeEmptyCategories: true },
      ),
    [reliefTemplates, state.punishmentCategories],
  );
  const hasPunishments = reliefTemplates.length > 0;
  const hasCategories = state.punishmentCategories.length > 0;
  const showPunishmentLibrary = hasCategories || hasPunishments;
  const hiddenTemplateCount = state.punishmentTemplates.length - reliefTemplates.length;
  const history = state.punishments
    .filter((p) => p.trigger.type === 'malus_relief')
    .slice(-10)
    .reverse();

  const selectedCategory = useMemo(() => {
    if (!selectedCategoryId) return null;
    const uncategorizedTier = parseUncategorizedDifficulty(selectedCategoryId);
    if (uncategorizedTier) {
      return {
        id: selectedCategoryId,
        name: 'Other',
        description: 'Punishments not assigned to a category in this tier.',
        sortOrder: 9999,
        difficulty: uncategorizedTier,
      } satisfies PunishmentCategory;
    }
    return state.punishmentCategories.find((c) => c.id === selectedCategoryId) ?? null;
  }, [selectedCategoryId, state.punishmentCategories]);

  const inferredDifficulty = useMemo<PunishmentDifficulty | null>(() => {
    const fromUrl = parseDifficulty(searchParams.get('difficulty'));
    if (fromUrl) return fromUrl;
    if (selectedCategory) {
      const uncategorizedTier = parseUncategorizedDifficulty(selectedCategory.id);
      if (uncategorizedTier) return uncategorizedTier;
      return categoryDifficulty(selectedCategory);
    }
    return null;
  }, [searchParams, selectedCategory]);

  const firstAvailableDifficulty = useMemo<PunishmentDifficulty>(() => {
    for (const difficulty of PUNISHMENT_DIFFICULTY_ORDER) {
      const tier = punishmentsByDifficultyAndCategory[difficulty];
      if (tier.categories.length > 0 || tier.uncategorized.length > 0) {
        return difficulty;
      }
    }
    return 'easy';
  }, [punishmentsByDifficultyAndCategory]);

  const selectedDifficulty = inferredDifficulty ?? firstAvailableDifficulty;
  const selectedTier = punishmentsByDifficultyAndCategory[selectedDifficulty];

  const selectedTemplates = useMemo(() => {
    if (!selectedCategoryId) return [];
    const uncategorizedTier = parseUncategorizedDifficulty(selectedCategoryId);
    if (uncategorizedTier) {
      return punishmentsByDifficultyAndCategory[uncategorizedTier].uncategorized;
    }
    return templatesForCategory(
      reliefTemplates,
      state.punishmentCategories,
      selectedCategoryId,
    );
  }, [
    selectedCategoryId,
    reliefTemplates,
    state.punishmentCategories,
    punishmentsByDifficultyAndCategory,
  ]);

  const cooldownTemplateIds = useMemo(
    () => reliefTemplates.map((template) => template.id),
    [reliefTemplates],
  );
  const { getCooldownLabel, isOnCooldown, markTemplateCompleted } =
    usePunishmentCooldowns(
      cooldownTemplateIds,
      state.punishments,
      session != null,
    );

  const inProgressIds = useMemo(() => {
    const ids = new Set<string>();
    for (const pending of thronePending) {
      if (pending.status === 'waiting' && pending.punishmentTemplateId) {
        ids.add(pending.punishmentTemplateId);
      }
    }
    for (const template of reliefTemplates) {
      if (isPunishmentSessionInProgress(template.id)) ids.add(template.id);
    }
    return ids;
  }, [thronePending, reliefTemplates]);

  const activePunishment = useMemo(() => {
    const waiting = thronePending.find(
      (pending) => pending.status === 'waiting' && pending.punishmentTemplateId,
    );
    if (waiting?.punishmentTemplateId) {
      const template = reliefTemplates.find((t) => t.id === waiting.punishmentTemplateId);
      if (template) {
        return { template, reason: 'throne' as const };
      }
    }
    const sessionTemplate = reliefTemplates.find((template) =>
      isPunishmentSessionInProgress(template.id),
    );
    if (sessionTemplate) {
      return { template: sessionTemplate, reason: 'session' as const };
    }
    return null;
  }, [thronePending, reliefTemplates]);

  const handleAcceptClick = (template: PunishmentTemplate) => {
    if (malus <= 0 || isOnCooldown(template.id)) return;
    setCompletionError(null);
    setCompletingTemplate(template);
  };

  const continueActivePunishment = (template: PunishmentTemplate) => {
    const categoryId =
      resolvePunishmentCategoryId(template, state.punishmentCategories) ??
      uncategorizedCategoryId(
        resolvePunishmentDifficulty(template, state.punishmentCategories),
      );
    setPath(
      resolvePunishmentDifficulty(template, state.punishmentCategories),
      categoryId,
    );
    setCompletionError(null);
    setCompletingTemplate(template);
  };

  const handleCompletionDone = async (templateId: string) => {
    const result = await acceptPunishment(templateId);
    if (!result.ok) {
      setCompletionError(result.error);
      return;
    }
    markTemplateCompleted(templateId);
    setCompletionError(null);
    setCompletingTemplate(null);
  };

  const handleThroneVerified = async () => {
    if (!completingTemplate) return;
    await refresh();
    markTemplateCompleted(completingTemplate.id);
    setCompletionError(null);
    setCompletingTemplate(null);
  };

  return (
    <div className={embedded ? 'university-punishments' : 'page page--punishments'}>
      <header className={embedded ? 'university-punishments__head' : 'page-header punishments-hero'}>
        <div className="punishments-hero__copy">
          {embedded ? null : <p className="punishments-hero__kicker">Pay the debt</p>}
          <h2>{embedded ? 'Punishments' : 'Punishments'}</h2>
          <p className="muted">
            Incomplete tasks add malus at day end. Pick a difficulty, choose a
            category, then accept a punishment to unlock your tasks again.
          </p>
        </div>
        <div className="punishments-hero__aside">
          {embedded ? null : (
            <div
              className={`punishments-malus-pill${
                malus > 0 ? ' punishments-malus-pill--hot' : ' punishments-malus-pill--clear'
              }`}
            >
              <span className="punishments-malus-pill__gem" aria-hidden>
                {malus > 0 ? '⚡' : '✓'}
              </span>
              <div>
                <strong className="punishments-malus-pill__value">{malus}</strong>
                <span className="punishments-malus-pill__label">malus</span>
              </div>
            </div>
          )}
          {isAdmin && (
            <Link to="/admin?section=punishments" className="btn btn--ghost btn--small">
              Manage in Admin
            </Link>
          )}
        </div>
      </header>

      <section
        className={`card punishments-balance${
          malus > 0 ? ' card--warn' : ' card--success'
        }`}
      >
        {malus > 0 ? (
          <>
            <h3 className="section-title">Tasks are locked</h3>
            <p>
              You have <strong>{malus}</strong> malus point{malus === 1 ? '' : 's'}.
              Clear them here before you can start or complete tasks.
            </p>
          </>
        ) : (
          <>
            <h3 className="section-title">All clear</h3>
            <p>No malus points. Keep completing your tasks!</p>
          </>
        )}
      </section>

      {activePunishment && (
        <section className="card punishments-active">
          <div className="punishments-active__copy">
            <p className="punishments-hero__kicker">Active punishment</p>
            <h3>{activePunishment.template.title}</h3>
            <p className="muted">
              {activePunishment.reason === 'throne'
                ? 'Waiting for your Throne gift to land. Continue to finish it.'
                : 'You already started the gates. Continue to finish and clear malus.'}
            </p>
          </div>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => continueActivePunishment(activePunishment.template)}
          >
            Continue
          </button>
        </section>
      )}

      {!showPunishmentLibrary && (
        <section className="card">
          <p className="muted">
            No punishments available yet.
            {isAdmin ? (
              <>
                {' '}
                <Link to="/admin?section=punishments" className="btn btn--ghost btn--small">
                  Add punishments
                </Link>
              </>
            ) : (
              ' Ask an admin to add punishments.'
            )}
          </p>
          {isAdmin && hiddenTemplateCount > 0 && (
            <p className="muted punishment-hidden-hint">
              {hiddenTemplateCount} punishment template
              {hiddenTemplateCount === 1 ? ' is' : 's are'} hidden because{' '}
              {hiddenTemplateCount === 1 ? 'it is' : 'they are'} not set up for malus
              relief. Edit them in Admin and set a malus relief value.
            </p>
          )}
        </section>
      )}

      {showPunishmentLibrary && (
        <>
          <section className="punishments-tiers" aria-label="Difficulty">
            <p className="item-shop-shelf__kicker">Choose your heat</p>
            <div className="punishments-tier-grid" role="tablist" aria-label="Difficulty">
              {PUNISHMENT_DIFFICULTY_ORDER.map((difficulty) => {
                const tier = punishmentsByDifficultyAndCategory[difficulty];
                const count =
                  tier.categories.reduce(
                    (sum, group) => sum + group.templates.length,
                    0,
                  ) + tier.uncategorized.length;
                const categoryCount =
                  tier.categories.length + (tier.uncategorized.length > 0 ? 1 : 0);
                const active = selectedDifficulty === difficulty && !selectedCategory;
                const onPath = selectedDifficulty === difficulty;
                return (
                  <button
                    key={difficulty}
                    type="button"
                    role="tab"
                    aria-selected={onPath}
                    className={`punishments-tier${
                      onPath ? ' punishments-tier--active' : ''
                    }${active ? ' punishments-tier--current' : ''} punishments-tier--${difficulty}`}
                    onClick={() => setPath(difficulty, null)}
                  >
                    <span className="punishments-tier__icon" aria-hidden>
                      {TIER_COPY[difficulty].icon}
                    </span>
                    <span className="punishments-tier__name">
                      {PUNISHMENT_DIFFICULTY_LABELS[difficulty]}
                    </span>
                    <span className="punishments-tier__hint">
                      {TIER_COPY[difficulty].hint}
                    </span>
                    <span className="punishments-tier__count">
                      {categoryCount} {categoryCount === 1 ? 'path' : 'paths'}
                      {count > 0 ? ` · ${count}` : ''}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {!selectedCategory && (
            <section className="card punishments-categories">
              <header className="item-shop-shelf__header">
                <p className="item-shop-shelf__kicker">
                  {PUNISHMENT_DIFFICULTY_LABELS[selectedDifficulty]}
                </p>
                <h3 className="item-shop-shelf__title">Pick a category</h3>
              </header>
              <div className="category-grid">
                {selectedTier.categories.map(({ category, templates }) => (
                  <PunishmentCategoryCard
                    key={category.id}
                    category={category}
                    count={templates.length}
                    onSelect={() => setPath(selectedDifficulty, category.id)}
                  />
                ))}
                {selectedTier.uncategorized.length > 0 && (
                  <PunishmentCategoryCard
                    category={{
                      id: uncategorizedCategoryId(selectedDifficulty),
                      name: 'Other',
                      description: 'Punishments without a category',
                      sortOrder: 9999,
                      difficulty: selectedDifficulty,
                    }}
                    count={selectedTier.uncategorized.length}
                    onSelect={() =>
                      setPath(
                        selectedDifficulty,
                        uncategorizedCategoryId(selectedDifficulty),
                      )
                    }
                  />
                )}
              </div>
              {selectedTier.categories.length === 0 &&
                selectedTier.uncategorized.length === 0 && (
                  <p className="muted punishment-selected-hint">
                    No {PUNISHMENT_DIFFICULTY_LABELS[selectedDifficulty].toLowerCase()}{' '}
                    categories yet.
                  </p>
                )}
              {hasPunishments && malus <= 0 && (
                <p className="muted punishment-selected-hint">
                  You need malus points before you can accept a punishment.
                </p>
              )}
              {isAdmin && hiddenTemplateCount > 0 && (
                <p className="muted punishment-hidden-hint">
                  {hiddenTemplateCount} punishment template
                  {hiddenTemplateCount === 1 ? ' is' : 's are'} hidden because{' '}
                  {hiddenTemplateCount === 1 ? 'it is' : 'they are'} not set up for malus
                  relief. Edit them in Admin and set a malus relief value.
                </p>
              )}
            </section>
          )}

          {selectedCategory && (
            <section className="card punishment-selected-panel punishments-path-panel">
              <div className="page-header__row">
                <button
                  type="button"
                  className="btn btn--ghost btn--small"
                  onClick={() => setPath(selectedDifficulty, null)}
                >
                  ← {PUNISHMENT_DIFFICULTY_LABELS[selectedDifficulty]} categories
                </button>
              </div>
              {isCategoryImagePreview(selectedCategory.imageUrl) && (
                <div className="punishment-category-hero">
                  <img
                    src={selectedCategory.imageUrl}
                    alt=""
                    className="category-card__image"
                  />
                </div>
              )}
              <p className="item-shop-shelf__kicker">
                {PUNISHMENT_DIFFICULTY_LABELS[selectedDifficulty]}
              </p>
              <h3 className="item-shop-shelf__title">{selectedCategory.name}</h3>
              {selectedCategory.description && (
                <p className="punishment-category-desc muted">
                  {selectedCategory.description}
                </p>
              )}
              {selectedTemplates.length === 0 ? (
                <p className="muted punishment-category-empty">
                  No punishments in this category yet.
                </p>
              ) : (
                <ol className="category-task-path punishment-path">
                  {selectedTemplates.map((tpl, index) => (
                    <li key={tpl.id} className="category-task-path__item">
                      <PunishmentListRow
                        template={tpl}
                        malus={malus}
                        cooldownLabel={getCooldownLabel(tpl.id)}
                        imageUrl={selectedCategory.imageUrl}
                        stepNumber={index + 1}
                        inProgress={inProgressIds.has(tpl.id)}
                        onAccept={() =>
                          inProgressIds.has(tpl.id)
                            ? continueActivePunishment(tpl)
                            : handleAcceptClick(tpl)
                        }
                      />
                    </li>
                  ))}
                </ol>
              )}
              {selectedTemplates.length > 0 && malus <= 0 && (
                <p className="muted punishment-selected-hint">
                  You need malus points before you can accept a punishment.
                </p>
              )}
            </section>
          )}
        </>
      )}

      {history.length > 0 && (
        <section className="card punishments-history">
          <header className="item-shop-shelf__header">
            <p className="item-shop-shelf__kicker">Cleared</p>
            <h3 className="item-shop-shelf__title">Recent history</h3>
          </header>
          <ul className="punishments-history-list">
            {history.map((p) => (
              <li key={p.id}>
                <span className="punishments-history-list__title">{p.title}</span>
                <span className="muted">{p.date}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {completionError && (
        <p className="login-error punishment-completion-error" role="alert">
          {completionError}
        </p>
      )}

      <PunishmentCompletionModal
        template={completingTemplate}
        open={completingTemplate != null}
        malus={malus}
        userId={userId}
        thronePending={thronePendingForTemplate}
        onThronePendingChange={(pending) => {
          if (!completingTemplate) return;
          setThronePending((prev) => {
            const rest = prev.filter(
              (p) => p.punishmentTemplateId !== completingTemplate.id,
            );
            return pending ? [...rest, pending] : rest;
          });
        }}
        onThroneVerified={() => void handleThroneVerified()}
        onClose={() => {
          setCompletionError(null);
          setCompletingTemplate(null);
        }}
        onComplete={handleCompletionDone}
      />
    </div>
  );
}
