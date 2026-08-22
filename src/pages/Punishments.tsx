import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PunishmentCategoryCard } from '../components/PunishmentCategoryCard';
import { PunishmentCompletionModal } from '../components/PunishmentCompletionModal';
import { PunishmentListRow } from '../components/PunishmentListRow';
import { useAppStore } from '../hooks/useAppStore';
import { usePunishmentCooldowns } from '../hooks/usePunishmentCooldowns';
import { isCategoryImagePreview } from '../lib/categoryImage';
import {
  groupPunishmentsByDifficultyAndCategory,
  PUNISHMENT_DIFFICULTY_LABELS,
  PUNISHMENT_DIFFICULTY_ORDER,
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

const UNCategorized_PREFIX = '__uncategorized__';

function uncategorizedCategoryId(difficulty: PunishmentDifficulty): string {
  return `${UNCategorized_PREFIX}:${difficulty}`;
}

function parseUncategorizedDifficulty(
  categoryId: string,
): PunishmentDifficulty | null {
  if (!categoryId.startsWith(`${UNCategorized_PREFIX}:`)) return null;
  const tier = categoryId.split(':')[1];
  if (tier === 'easy' || tier === 'medium' || tier === 'hard') return tier;
  return null;
}

export function Punishments() {
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

  const selectCategory = (categoryId: string | null) => {
    const next = new URLSearchParams(searchParams);
    next.delete('manage');
    if (categoryId) {
      next.set('category', categoryId);
    } else {
      next.delete('category');
    }
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
    () => selectedTemplates.map((template) => template.id),
    [selectedTemplates],
  );
  const { getCooldownLabel, isOnCooldown, markTemplateCompleted } =
    usePunishmentCooldowns(
      cooldownTemplateIds,
      state.punishments,
      session != null,
    );

  const handleAcceptClick = (template: PunishmentTemplate) => {
    if (malus <= 0 || isOnCooldown(template.id)) return;
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
    <div className="page">
      <header className="page-header">
        <div className="page-header__row">
          <div>
            <h2>Punishments</h2>
            <p className="muted">
              Incomplete started or daily tasks add malus at day end. Choose a
              category, then accept a punishment to reduce your malus balance.
            </p>
          </div>
          {isAdmin && (
            <Link to="/admin?section=punishments" className="btn btn--ghost btn--small">
              Manage in Admin
            </Link>
          )}
        </div>
      </header>

      <section className={`card${malus > 0 ? ' card--warn' : ' card--success'}`}>
        <h3 className="section-title">Malus balance</h3>
        {malus > 0 ? (
          <p className="punishment-malus-balance">
            You have <strong>{malus}</strong> malus point{malus === 1 ? '' : 's'}.
          </p>
        ) : (
          <p>No malus points. Keep completing your tasks!</p>
        )}
      </section>

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

      {showPunishmentLibrary && !selectedCategory && (
        <>
          {PUNISHMENT_DIFFICULTY_ORDER.map((difficulty) => {
            const tier = punishmentsByDifficultyAndCategory[difficulty];
            const hasTierContent =
              tier.categories.length > 0 || tier.uncategorized.length > 0;
            if (!hasTierContent) return null;
            return (
              <section key={difficulty} className="card category-tier">
                <h3 className="section-title">
                  {PUNISHMENT_DIFFICULTY_LABELS[difficulty]}
                </h3>
                <div className="category-grid">
                  {tier.categories.map(({ category }) => (
                    <PunishmentCategoryCard
                      key={category.id}
                      category={category}
                      onSelect={() => selectCategory(category.id)}
                    />
                  ))}
                  {tier.uncategorized.length > 0 && (
                    <PunishmentCategoryCard
                      category={{
                        id: uncategorizedCategoryId(difficulty),
                        name: 'Other',
                        description: 'Punishments without a category',
                        sortOrder: 9999,
                        difficulty,
                      }}
                      onSelect={() =>
                        selectCategory(uncategorizedCategoryId(difficulty))
                      }
                    />
                  )}
                </div>
              </section>
            );
          })}
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
        </>
      )}

      {showPunishmentLibrary && selectedCategory && (
        <section className="card punishment-selected-panel">
          <div className="page-header__row">
            <button
              type="button"
              className="btn btn--ghost btn--small"
              onClick={() => selectCategory(null)}
            >
              ← All categories
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
          <h3 className="section-title">{selectedCategory.name}</h3>
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
            <ul className="task-list">
              {selectedTemplates.map((tpl) => (
                <li key={tpl.id}>
                  <PunishmentListRow
                    template={tpl}
                    malus={malus}
                    cooldownLabel={getCooldownLabel(tpl.id)}
                    onAccept={() => handleAcceptClick(tpl)}
                  />
                </li>
              ))}
            </ul>
          )}
          {selectedTemplates.length > 0 && malus <= 0 && (
            <p className="muted punishment-selected-hint">
              You need malus points before you can accept a punishment.
            </p>
          )}
        </section>
      )}

      {history.length > 0 && (
        <section className="card">
          <h3 className="section-title">Recent history</h3>
          <ul className="history-list">
            {history.map((p) => (
              <li key={p.id}>
                <span>{p.title}</span>
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
