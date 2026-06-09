import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CategoryImagePicker } from '../components/CategoryImagePicker';
import { PunishmentCategoryCard } from '../components/PunishmentCategoryCard';
import { PunishmentCompletionModal } from '../components/PunishmentCompletionModal';
import { useAppStore } from '../hooks/useAppStore';
import { usePunishmentCooldowns } from '../hooks/usePunishmentCooldowns';
import { isCategoryImagePreview } from '../lib/categoryImage';
import {
  categoryDifficulty,
  groupCategoriesByDifficulty,
  groupPunishmentsByCategory,
  groupPunishmentsByDifficultyAndCategory,
  PUNISHMENT_DIFFICULTY_LABELS,
  PUNISHMENT_DIFFICULTY_ORDER,
  templatesForCategory,
} from '../lib/gameLogic';
import {
  isValidOpenUrl,
  parsePhrasesFromText,
  phrasesToText,
  punishmentHasRequirements,
} from '../lib/punishmentRequirements';
import type {
  PunishmentCategory,
  PunishmentDifficulty,
  PunishmentTemplate,
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

function emptyCategoryDraft(): PunishmentCategory {
  return { id: '', name: '', description: '', sortOrder: 0, difficulty: 'medium' };
}

function emptyTemplateDraft(categoryId: string): PunishmentTemplate {
  return {
    id: '',
    title: '',
    description: '',
    trigger: { type: 'malus_relief' },
    categoryId,
    malusPointsRelieved: 15,
  };
}

function PunishmentListRow({
  template,
  malus,
  cooldownLabel,
  onAccept,
}: {
  template: PunishmentTemplate;
  malus: number;
  cooldownLabel: string | null;
  onAccept: () => void;
}) {
  const requirementBadges: string[] = [];
  if ((template.timerSeconds ?? 0) > 0) requirementBadges.push('Timer');
  if (template.openUrl?.trim()) requirementBadges.push('Open site');
  if ((template.requiredPhrases?.length ?? 0) > 0) requirementBadges.push('Phrase');
  const onCooldown = cooldownLabel != null;
  const disabled = malus <= 0 || onCooldown;

  return (
    <div className="task-list-row punishment-list-row">
      <div className="task-list-row__main">
        <h3 className="task-list-row__title">{template.title}</h3>
        {template.description && (
          <p className="task-list-row__desc">{template.description}</p>
        )}
        <div className="task-list-row__meta">
          <span className="punishment-points">
            Clears up to {template.malusPointsRelieved} malus
          </span>
          {requirementBadges.length > 0 && (
            <span className="muted"> · {requirementBadges.join(' · ')}</span>
          )}
          {onCooldown && (
            <span className="muted punishment-cooldown"> · {cooldownLabel}</span>
          )}
        </div>
      </div>
      <div className="task-list-row__aside">
        <button
          type="button"
          className="btn btn--primary btn--small"
          disabled={disabled}
          onClick={onAccept}
          title={onCooldown ? cooldownLabel ?? undefined : undefined}
        >
          {onCooldown ? 'On cooldown' : 'Accept'}
        </button>
      </div>
    </div>
  );
}

export function Punishments() {
  const [searchParams, setSearchParams] = useSearchParams();
  const manageFromUrl = searchParams.get('manage') === '1';
  const selectedCategoryId = searchParams.get('category');
  const {
    state,
    session,
    acceptPunishment,
    addPunishmentCategory,
    updatePunishmentCategory,
    deletePunishmentCategory,
    addPunishmentTemplate,
    updatePunishmentTemplate,
    deletePunishmentTemplate,
  } = useAppStore();

  const isAdmin = session?.role === 'admin';
  const [manageMode, setManageMode] = useState(manageFromUrl && isAdmin);
  const [completingTemplate, setCompletingTemplate] =
    useState<PunishmentTemplate | null>(null);
  const [completionError, setCompletionError] = useState<string | null>(null);

  useEffect(() => {
    if (manageFromUrl && isAdmin) setManageMode(true);
  }, [manageFromUrl, isAdmin]);

  const setManage = (on: boolean) => {
    setManageMode(on);
    const next = new URLSearchParams(searchParams);
    if (on) {
      next.set('manage', '1');
      next.delete('category');
    } else {
      next.delete('manage');
    }
    setSearchParams(next, { replace: true });
  };

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

  if (manageMode && isAdmin) {
    return (
      <PunishmentsManage
        state={state}
        onExitManage={() => setManage(false)}
        addPunishmentCategory={addPunishmentCategory}
        updatePunishmentCategory={updatePunishmentCategory}
        deletePunishmentCategory={deletePunishmentCategory}
        addPunishmentTemplate={addPunishmentTemplate}
        updatePunishmentTemplate={updatePunishmentTemplate}
        deletePunishmentTemplate={deletePunishmentTemplate}
      />
    );
  }

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
            <button
              type="button"
              className="btn btn--ghost btn--small"
              onClick={() => setManage(true)}
            >
              Manage
            </button>
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
                <button
                  type="button"
                  className="btn btn--ghost btn--small"
                  onClick={() => setManage(true)}
                >
                  Add punishments
                </button>
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
              relief. Edit them in Admin or Manage and set a malus relief value.
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
              relief. Edit them in Admin or Manage and set a malus relief value.
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
        onClose={() => {
          setCompletionError(null);
          setCompletingTemplate(null);
        }}
        onComplete={handleCompletionDone}
      />
    </div>
  );
}

function DifficultyPicker({
  value,
  onChange,
  idPrefix,
}: {
  value: PunishmentDifficulty;
  onChange: (d: PunishmentDifficulty) => void;
  idPrefix: string;
}) {
  return (
    <div className="chip-row chip-row--scroll" role="group" aria-label="Difficulty tier">
      {PUNISHMENT_DIFFICULTY_ORDER.map((d) => (
        <button
          key={d}
          id={`${idPrefix}-${d}`}
          type="button"
          className={value === d ? 'chip chip--active' : 'chip'}
          aria-pressed={value === d}
          onClick={() => onChange(d)}
        >
          {PUNISHMENT_DIFFICULTY_LABELS[d]}
        </button>
      ))}
    </div>
  );
}

function PunishmentsManage({
  state,
  onExitManage,
  addPunishmentCategory,
  updatePunishmentCategory,
  deletePunishmentCategory,
  addPunishmentTemplate,
  updatePunishmentTemplate,
  deletePunishmentTemplate,
}: {
  state: ReturnType<typeof useAppStore>['state'];
  onExitManage: () => void;
  addPunishmentCategory: ReturnType<typeof useAppStore>['addPunishmentCategory'];
  updatePunishmentCategory: ReturnType<typeof useAppStore>['updatePunishmentCategory'];
  deletePunishmentCategory: ReturnType<typeof useAppStore>['deletePunishmentCategory'];
  addPunishmentTemplate: ReturnType<typeof useAppStore>['addPunishmentTemplate'];
  updatePunishmentTemplate: ReturnType<typeof useAppStore>['updatePunishmentTemplate'];
  deletePunishmentTemplate: ReturnType<typeof useAppStore>['deletePunishmentTemplate'];
}) {
  const categoriesByDifficulty = useMemo(
    () => groupCategoriesByDifficulty(state.punishmentCategories),
    [state.punishmentCategories],
  );

  const [catDraft, setCatDraft] = useState<PunishmentCategory>(emptyCategoryDraft());
  const [manageCategoryId, setManageCategoryId] = useState<string | null>(null);
  const [tplDraft, setTplDraft] = useState<PunishmentTemplate>(() =>
    emptyTemplateDraft(''),
  );
  const [phrasesText, setPhrasesText] = useState('');
  const [timerMinutes, setTimerMinutes] = useState('');
  const [timerSecondsPart, setTimerSecondsPart] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [imageMessage, setImageMessage] = useState('');

  const imagePreview = isCategoryImagePreview(catDraft.imageUrl)
    ? catDraft.imageUrl
    : null;

  const manageCategory =
    state.punishmentCategories.find((c) => c.id === manageCategoryId) ?? null;

  const syncTemplateDraft = (template: PunishmentTemplate) => {
    setTplDraft(template);
    setPhrasesText(phrasesToText(template.requiredPhrases));
    const totalSeconds = template.timerSeconds ?? 0;
    if (totalSeconds > 0) {
      setTimerMinutes(String(Math.floor(totalSeconds / 60)));
      setTimerSecondsPart(String(totalSeconds % 60));
    } else {
      setTimerMinutes('');
      setTimerSecondsPart('');
    }
  };

  useEffect(() => {
    if (manageCategoryId && manageCategory) {
      setTplDraft((d) => ({ ...d, categoryId: manageCategory.id }));
    }
  }, [manageCategoryId, manageCategory]);

  const templatesByCategory = useMemo(
    () =>
      groupPunishmentsByCategory(
        state.punishmentTemplates,
        state.punishmentCategories,
        { includeEmpty: true },
      ),
    [state.punishmentTemplates, state.punishmentCategories],
  );

  const saveCategory = async () => {
    setError('');
    setMessage('');
    if (!catDraft.name.trim()) {
      setError('Category name is required.');
      return;
    }
    const payload: PunishmentCategory = {
      ...catDraft,
      id: catDraft.id || '',
      name: catDraft.name.trim(),
      sortOrder: catDraft.sortOrder ?? 0,
      difficulty: catDraft.difficulty ?? 'medium',
    };
    const result = catDraft.id
      ? await updatePunishmentCategory(payload)
      : await addPunishmentCategory(payload);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const savedId = result.id ?? catDraft.id;
    setCatDraft(emptyCategoryDraft());
    setImageMessage('');
    if (savedId) {
      setManageCategoryId(savedId);
      syncTemplateDraft(emptyTemplateDraft(savedId));
    }
    setMessage(
      savedId
        ? 'Category saved. Add punishments in the section below.'
        : 'Category saved.',
    );
  };

  const removeCategory = async (id: string) => {
    if (!window.confirm('Delete this category? Punishments in it become uncategorized.')) {
      return;
    }
    const result = await deletePunishmentCategory(id);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (catDraft.id === id) setCatDraft(emptyCategoryDraft());
    if (manageCategoryId === id) setManageCategoryId(null);
    setMessage('Category deleted.');
  };

  const saveTemplate = async () => {
    setError('');
    setMessage('');
    if (!tplDraft.title.trim()) {
      setError('Punishment title is required.');
      return;
    }
    const categoryId = tplDraft.categoryId || manageCategoryId;
    if (!categoryId) {
      setError('Select a category first.');
      return;
    }
    const openUrl = tplDraft.openUrl?.trim();
    if (openUrl && !isValidOpenUrl(openUrl)) {
      setError('Open URL must start with http:// or https://.');
      return;
    }
    const requiredPhrases = parsePhrasesFromText(phrasesText);
    const mins = Number(timerMinutes) || 0;
    const secs = Number(timerSecondsPart) || 0;
    const timerTotal = mins * 60 + secs;
    const category =
      state.punishmentCategories.find((c) => c.id === categoryId) ?? null;
    const payload: PunishmentTemplate = {
      ...tplDraft,
      id: tplDraft.id || '',
      title: tplDraft.title.trim(),
      categoryId,
      trigger: { type: 'malus_relief' },
      malusPointsRelieved: tplDraft.malusPointsRelieved || 1,
      difficulty:
        tplDraft.difficulty ?? (category ? categoryDifficulty(category) : 'medium'),
      requiredPhrases: requiredPhrases.length > 0 ? requiredPhrases : undefined,
      requiredPhraseRepeatCount:
        requiredPhrases.length > 0
          ? Math.max(1, tplDraft.requiredPhraseRepeatCount ?? 1)
          : undefined,
      timerSeconds: timerTotal > 0 ? timerTotal : undefined,
      openUrl: openUrl || undefined,
    };
    const result = tplDraft.id
      ? await updatePunishmentTemplate(payload)
      : await addPunishmentTemplate(payload);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    syncTemplateDraft(emptyTemplateDraft(categoryId));
    setMessage('Punishment saved.');
  };

  const removeTemplate = async (id: string) => {
    if (!window.confirm('Delete this punishment template?')) return;
    const result = await deletePunishmentTemplate(id);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (tplDraft.id === id) {
      syncTemplateDraft(emptyTemplateDraft(manageCategoryId ?? ''));
    }
    setMessage('Punishment deleted.');
  };

  const selectCategoryForManage = (c: PunishmentCategory) => {
    setManageCategoryId(c.id);
    setCatDraft(c);
    setImageMessage('');
    syncTemplateDraft(emptyTemplateDraft(c.id));
  };

  const requirementSummary = (t: PunishmentTemplate): string => {
    const parts: string[] = [];
    if ((t.timerSeconds ?? 0) > 0) parts.push(`timer ${t.timerSeconds}s`);
    if (t.openUrl?.trim()) parts.push('URL');
    if ((t.requiredPhrases?.length ?? 0) > 0) {
      parts.push(
        `${t.requiredPhrases!.length} phrase${t.requiredPhrases!.length === 1 ? '' : 's'}`,
      );
    }
    return parts.length > 0 ? ` · ${parts.join(', ')}` : '';
  };

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-header__row">
          <div>
            <h2>Manage punishments</h2>
            <p className="muted">
              Add categories under Easy, Medium, or Hard. Select a category to add
              punishments inside it.
            </p>
          </div>
          <button type="button" className="btn btn--ghost btn--small" onClick={onExitManage}>
            Back to punishments
          </button>
        </div>
      </header>

      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="login-error" role="alert">
          {error}
        </p>
      )}

      <section className="card">
        <h3 className="section-title">
          {catDraft.id ? 'Edit category' : 'New category'}
        </h3>
        <div className="field">
          <span>Difficulty section</span>
          <DifficultyPicker
            idPrefix="pcat-diff"
            value={catDraft.difficulty ?? 'medium'}
            onChange={(difficulty) => setCatDraft({ ...catDraft, difficulty })}
          />
        </div>
        <div className="field">
          <label htmlFor="pcat-name">Name</label>
          <input
            id="pcat-name"
            value={catDraft.name}
            onChange={(e) => setCatDraft({ ...catDraft, name: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="pcat-desc">Description</label>
          <textarea
            id="pcat-desc"
            rows={2}
            value={catDraft.description ?? ''}
            onChange={(e) => setCatDraft({ ...catDraft, description: e.target.value })}
          />
        </div>
        <div className="field">
          <span>Category image</span>
          <CategoryImagePicker
            idPrefix="pcat"
            urlInputId="pcat-image"
            previewUrl={imagePreview}
            urlValue={catDraft.imageUrl?.startsWith('http') ? catDraft.imageUrl : ''}
            onUrlChange={(value) => {
              setImageMessage('');
              const trimmed = value.trim();
              if (trimmed) {
                setCatDraft({ ...catDraft, imageUrl: trimmed });
              } else {
                setCatDraft({
                  ...catDraft,
                  imageUrl: catDraft.imageUrl?.startsWith('data:')
                    ? catDraft.imageUrl
                    : undefined,
                });
              }
            }}
            onFileSelect={(dataUrl) => {
              setImageMessage('');
              setCatDraft({ ...catDraft, imageUrl: dataUrl });
            }}
            onFileError={setImageMessage}
          />
          {imageMessage && (
            <p className="login-error" role="alert">
              {imageMessage}
            </p>
          )}
        </div>
        <div className="field">
          <label htmlFor="pcat-order">Sort order</label>
          <input
            id="pcat-order"
            type="number"
            value={catDraft.sortOrder}
            onChange={(e) =>
              setCatDraft({ ...catDraft, sortOrder: Number(e.target.value) })
            }
          />
        </div>
        <div className="btn-row">
          <button type="button" className="btn btn--primary" onClick={() => void saveCategory()}>
            {catDraft.id ? 'Save category' : 'Create category'}
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => {
              setCatDraft(emptyCategoryDraft());
              setManageCategoryId(null);
            }}
          >
            {catDraft.id ? 'Cancel' : 'Clear'}
          </button>
        </div>
      </section>

      <section className="card">
        <h3 className="section-title">Categories by difficulty</h3>
        {state.punishmentCategories.length === 0 ? (
          <p className="muted">No categories yet. Create one above.</p>
        ) : (
          <div className="punishment-tiers">
            {PUNISHMENT_DIFFICULTY_ORDER.map((difficulty) => {
              const cats = categoriesByDifficulty[difficulty];
              if (cats.length === 0) return null;
              return (
                <div key={difficulty} className="punishment-difficulty-section">
                  <h4 className="punishment-difficulty-heading">
                    {PUNISHMENT_DIFFICULTY_LABELS[difficulty]}
                  </h4>
                  <ul className="admin-library">
                    {cats.map((c) => {
                      const punishmentCount = templatesForCategory(
                        state.punishmentTemplates,
                        state.punishmentCategories,
                        c.id,
                      ).length;
                      return (
                        <li key={c.id} className="admin-library-item">
                          <button
                            type="button"
                            className={`admin-library-item__main${manageCategoryId === c.id ? ' admin-library-item__main--active' : ''}`}
                            onClick={() => selectCategoryForManage(c)}
                          >
                            <strong>{c.name}</strong>
                            <span className="muted">
                              order {c.sortOrder}
                              {c.imageUrl ? ' · image' : ''}
                              {punishmentCount === 0
                                ? ' · no punishments yet'
                                : ` · ${punishmentCount} punishment${punishmentCount === 1 ? '' : 's'}`}
                              {c.description ? ` · ${c.description}` : ''}
                            </span>
                          </button>
                          <div className="admin-library-item__actions">
                            <button
                              type="button"
                              className="btn btn--ghost btn--small btn--danger-text"
                              onClick={() => void removeCategory(c.id)}
                            >
                              Delete
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {manageCategory && (
        <section className="card">
          <h3 className="section-title">
            Punishments in {manageCategory.name}
            {tplDraft.id ? ' (editing)' : ''}
          </h3>
          <div className="field">
            <label htmlFor="ptpl-title">Title</label>
            <input
              id="ptpl-title"
              value={tplDraft.title}
              onChange={(e) => setTplDraft({ ...tplDraft, title: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="ptpl-desc">Description</label>
            <textarea
              id="ptpl-desc"
              rows={3}
              value={tplDraft.description}
              onChange={(e) => setTplDraft({ ...tplDraft, description: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="ptpl-malus">Malus points relieved</label>
            <input
              id="ptpl-malus"
              type="number"
              min={1}
              value={tplDraft.malusPointsRelieved}
              onChange={(e) =>
                setTplDraft({
                  ...tplDraft,
                  malusPointsRelieved: Number(e.target.value),
                })
              }
            />
          </div>
          <div className="field">
            <label htmlFor="ptpl-phrases">Required phrases (one per line)</label>
            <textarea
              id="ptpl-phrases"
              rows={3}
              value={phrasesText}
              placeholder="Optional — user must type each phrase to complete"
              onChange={(e) => setPhrasesText(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="ptpl-phrase-repeat">Times each phrase must be typed</label>
            <input
              id="ptpl-phrase-repeat"
              type="number"
              min={1}
              value={tplDraft.requiredPhraseRepeatCount ?? 1}
              onChange={(e) =>
                setTplDraft({
                  ...tplDraft,
                  requiredPhraseRepeatCount: Math.max(1, Number(e.target.value) || 1),
                })
              }
            />
          </div>
          <div className="field">
            <span>Timer before completion</span>
            <div className="field-row">
              <label className="sr-only" htmlFor="ptpl-timer-min">
                Minutes
              </label>
              <input
                id="ptpl-timer-min"
                type="number"
                min={0}
                placeholder="Min"
                value={timerMinutes}
                onChange={(e) => setTimerMinutes(e.target.value)}
              />
              <label className="sr-only" htmlFor="ptpl-timer-sec">
                Seconds
              </label>
              <input
                id="ptpl-timer-sec"
                type="number"
                min={0}
                max={59}
                placeholder="Sec"
                value={timerSecondsPart}
                onChange={(e) => setTimerSecondsPart(e.target.value)}
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="ptpl-url">Site to open (http or https)</label>
            <input
              id="ptpl-url"
              type="url"
              value={tplDraft.openUrl ?? ''}
              placeholder="https://example.com"
              onChange={(e) =>
                setTplDraft({
                  ...tplDraft,
                  openUrl: e.target.value.trim() || undefined,
                })
              }
            />
          </div>
          <div className="btn-row">
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => void saveTemplate()}
            >
              {tplDraft.id ? 'Save punishment' : 'Add punishment'}
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => syncTemplateDraft(emptyTemplateDraft(manageCategory.id))}
            >
              {tplDraft.id ? 'Cancel' : 'Clear'}
            </button>
          </div>
          {(() => {
            const group = templatesByCategory.find(
              (g) => g.category.id === manageCategory.id,
            );
            const templates = group?.templates ?? [];
            if (templates.length === 0) {
              return (
                <p className="muted">
                  No punishments in this category yet. Fill in the form above and click Add
                  punishment — they will appear on the Punishments page under{' '}
                  {PUNISHMENT_DIFFICULTY_LABELS[manageCategory.difficulty ?? 'medium']}.
                </p>
              );
            }
            return (
              <ul className="admin-library punishment-manage-list">
                {templates.map((t) => (
                  <li key={t.id} className="admin-library-item">
                    <button
                      type="button"
                      className="admin-library-item__main"
                      onClick={() => syncTemplateDraft(t)}
                    >
                      <strong>{t.title}</strong>
                      <span className="muted">
                        clears {t.malusPointsRelieved} malus
                        {requirementSummary(t)}
                        {punishmentHasRequirements(t) ? '' : ' · no extra requirements'}
                      </span>
                    </button>
                    <div className="admin-library-item__actions">
                      <button
                        type="button"
                        className="btn btn--ghost btn--small btn--danger-text"
                        onClick={() => void removeTemplate(t.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            );
          })()}
        </section>
      )}

      {!manageCategory && state.punishmentCategories.length > 0 && (
        <p className="muted">Select a category above to add or edit punishments.</p>
      )}

      <div className="btn-row">
        <Link to="/admin" className="btn btn--ghost btn--block">
          Admin home
        </Link>
      </div>
    </div>
  );
}
