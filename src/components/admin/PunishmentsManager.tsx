import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { CategoryImagePicker } from '../CategoryImagePicker';
import { PunishmentCategoryCard } from '../PunishmentCategoryCard';
import { PunishmentListRow } from '../PunishmentListRow';
import { useAppStore } from '../../hooks/useAppStore';
import { isCategoryImagePreview } from '../../lib/categoryImage';
import {
  categoryDifficulty,
  groupCategoriesByDifficulty,
  PUNISHMENT_DIFFICULTY_LABELS,
  PUNISHMENT_DIFFICULTY_ORDER,
  templatesForCategory,
} from '../../lib/gameLogic';
import {
  formatThroneAmountEur,
  isValidOpenUrl,
  parsePhrasesFromText,
  parseThroneAmountEurToCents,
  phrasesToText,
} from '../../lib/punishmentRequirements';
import { getThroneUsername } from '../../lib/throne';
import {
  fetchThroneGifts,
  formatThroneGiftOptionLabel,
  type ThroneGiftCatalogItem,
} from '../../lib/throneGifts';
import type {
  PunishmentCategory,
  PunishmentDifficulty,
  PunishmentTemplate,
} from '../../types';

type EditorPanel = 'idle' | 'category' | 'punishment';

function emptyCategoryDraft(difficulty: PunishmentDifficulty): PunishmentCategory {
  return { id: '', name: '', description: '', sortOrder: 0, difficulty };
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

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="field">
      {htmlFor ? (
        <label htmlFor={htmlFor}>{label}</label>
      ) : (
        <span>{label}</span>
      )}
      {hint && <p className="muted field__hint">{hint}</p>}
      {children}
    </div>
  );
}

function FormBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="admin-form-block">
      <h4 className="section-title">{title}</h4>
      {children}
    </div>
  );
}

export function PunishmentsManager() {
  const {
    state,
    addPunishmentCategory,
    updatePunishmentCategory,
    deletePunishmentCategory,
    addPunishmentTemplate,
    updatePunishmentTemplate,
    deletePunishmentTemplate,
  } = useAppStore();

  const pickerRef = useRef<HTMLElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);

  const categoriesByDifficulty = useMemo(
    () => groupCategoriesByDifficulty(state.punishmentCategories),
    [state.punishmentCategories],
  );

  const [selectedDifficulty, setSelectedDifficulty] =
    useState<PunishmentDifficulty>('easy');
  const [catDraft, setCatDraft] = useState<PunishmentCategory>(() =>
    emptyCategoryDraft('easy'),
  );
  const [manageCategoryId, setManageCategoryId] = useState<string | null>(null);
  const [editorPanel, setEditorPanel] = useState<EditorPanel>('idle');
  const [tplDraft, setTplDraft] = useState<PunishmentTemplate>(() =>
    emptyTemplateDraft(''),
  );
  const [phrasesText, setPhrasesText] = useState('');
  const [throneAmountEur, setThroneAmountEur] = useState('');
  const [selectedThroneGiftId, setSelectedThroneGiftId] = useState('');
  const [throneGifts, setThroneGifts] = useState<ThroneGiftCatalogItem[]>([]);
  const [throneGiftsLoading, setThroneGiftsLoading] = useState(false);
  const [throneGiftsError, setThroneGiftsError] = useState<string | null>(null);
  const [throneGiftsWarning, setThroneGiftsWarning] = useState<string | null>(null);
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
  const difficultyCategories = categoriesByDifficulty[selectedDifficulty];
  const throneUsername = getThroneUsername();
  const editorOpen = editorPanel !== 'idle';
  const showPicker = manageCategory == null && editorPanel !== 'category';
  const showWorkspace = manageCategory != null || editorPanel === 'category';

  const previewCategory: PunishmentCategory = {
    ...catDraft,
    id: catDraft.id || '__draft__',
    name: catDraft.name.trim() || 'Untitled category',
    description: catDraft.description?.trim() || '',
    difficulty: catDraft.difficulty ?? selectedDifficulty,
  };

  const catalogCategory =
    editorPanel === 'category' ? previewCategory : manageCategory;

  const catalogTemplates = useMemo(() => {
    if (!manageCategory) return [];
    return templatesForCategory(
      state.punishmentTemplates,
      state.punishmentCategories,
      manageCategory.id,
    );
  }, [manageCategory, state.punishmentTemplates, state.punishmentCategories]);

  const draftPreviewTemplate = useMemo((): PunishmentTemplate => {
    const mins = Number(timerMinutes) || 0;
    const secs = Number(timerSecondsPart) || 0;
    const timerTotal = mins * 60 + secs;
    const phrases = parsePhrasesFromText(phrasesText);
    const thronePayment = Boolean(tplDraft.thronePayment);
    return {
      ...tplDraft,
      id: tplDraft.id || '__draft__',
      title: tplDraft.title.trim() || 'Untitled punishment',
      description: tplDraft.description.trim(),
      malusPointsRelieved: tplDraft.malusPointsRelieved || 1,
      requiredPhrases: phrases.length > 0 ? phrases : undefined,
      requiredPhraseRepeatCount:
        phrases.length > 0
          ? Math.max(1, tplDraft.requiredPhraseRepeatCount ?? 1)
          : undefined,
      timerSeconds: timerTotal > 0 ? timerTotal : undefined,
      openUrl: tplDraft.openUrl?.trim() || undefined,
      thronePayment: thronePayment || undefined,
      throneAmountCents: thronePayment
        ? parseThroneAmountEurToCents(throneAmountEur)
        : null,
    };
  }, [tplDraft, phrasesText, timerMinutes, timerSecondsPart, throneAmountEur]);

  useEffect(() => {
    const target = showWorkspace ? workspaceRef.current : pickerRef.current;
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [showWorkspace, selectedDifficulty, manageCategoryId]);

  const loadThroneGifts = useCallback(async () => {
    setThroneGiftsLoading(true);
    setThroneGiftsError(null);
    setThroneGiftsWarning(null);
    const result = await fetchThroneGifts(throneUsername);
    setThroneGiftsLoading(false);
    if (!result.ok) {
      setThroneGifts([]);
      setThroneGiftsError(`Failed to load gifts: ${result.error}`);
      if (result.fallback) setThroneGiftsWarning(result.fallback);
      return;
    }
    setThroneGifts(result.gifts);
    if (result.warning) setThroneGiftsWarning(result.warning);
  }, [throneUsername]);

  useEffect(() => {
    if (!tplDraft.thronePayment) return;
    void loadThroneGifts();
  }, [tplDraft.thronePayment, loadThroneGifts]);

  const syncTemplateDraft = (template: PunishmentTemplate) => {
    setTplDraft(template);
    setPhrasesText(phrasesToText(template.requiredPhrases));
    setSelectedThroneGiftId(template.throneGiftId ?? '');
    setThroneAmountEur(
      template.throneAmountCents != null
        ? formatThroneAmountEur(template.throneAmountCents)
        : '',
    );
    const totalSeconds = template.timerSeconds ?? 0;
    if (totalSeconds > 0) {
      setTimerMinutes(String(Math.floor(totalSeconds / 60)));
      setTimerSecondsPart(String(totalSeconds % 60));
    } else {
      setTimerMinutes('');
      setTimerSecondsPart('');
    }
  };

  const applyThroneGiftSelection = (giftId: string) => {
    setSelectedThroneGiftId(giftId);
    if (!giftId) return;
    const gift = throneGifts.find((g) => g.id === giftId);
    if (!gift) return;
    setThroneAmountEur(formatThroneAmountEur(gift.priceCents));
    setTplDraft((draft) => ({
      ...draft,
      openUrl: gift.url,
      throneAmountCents: gift.priceCents,
      throneGiftId: gift.id,
      title: draft.title.trim() ? draft.title : gift.title,
    }));
  };

  const selectDifficulty = (difficulty: PunishmentDifficulty) => {
    setSelectedDifficulty(difficulty);
    setError('');
    setMessage('');
    setManageCategoryId(null);
    setEditorPanel('idle');
    setCatDraft(emptyCategoryDraft(difficulty));
    syncTemplateDraft(emptyTemplateDraft(''));
  };

  const selectCategory = (category: PunishmentCategory) => {
    setError('');
    setMessage('');
    setImageMessage('');
    setManageCategoryId(category.id);
    setCatDraft(category);
    setSelectedDifficulty(categoryDifficulty(category));
    setEditorPanel('idle');
    syncTemplateDraft(emptyTemplateDraft(category.id));
  };

  const startNewCategory = () => {
    setError('');
    setMessage('');
    setImageMessage('');
    setManageCategoryId(null);
    setCatDraft(emptyCategoryDraft(selectedDifficulty));
    setEditorPanel('category');
    syncTemplateDraft(emptyTemplateDraft(''));
  };

  const startEditCategory = () => {
    if (!manageCategory) return;
    setError('');
    setMessage('');
    setImageMessage('');
    setCatDraft(manageCategory);
    setEditorPanel('category');
  };

  const startNewPunishment = () => {
    if (!manageCategory) return;
    setError('');
    setMessage('');
    setEditorPanel('punishment');
    syncTemplateDraft(emptyTemplateDraft(manageCategory.id));
  };

  const startEditPunishment = (template: PunishmentTemplate) => {
    setError('');
    setMessage('');
    setEditorPanel('punishment');
    syncTemplateDraft(template);
  };

  const backToCategories = () => {
    setError('');
    setMessage('');
    setImageMessage('');
    setManageCategoryId(null);
    setEditorPanel('idle');
    setCatDraft(emptyCategoryDraft(selectedDifficulty));
    syncTemplateDraft(emptyTemplateDraft(''));
  };

  const closeEditor = () => {
    setEditorPanel('idle');
    setImageMessage('');
    if (manageCategory) {
      setCatDraft(manageCategory);
      syncTemplateDraft(emptyTemplateDraft(manageCategory.id));
    } else {
      setCatDraft(emptyCategoryDraft(selectedDifficulty));
      syncTemplateDraft(emptyTemplateDraft(''));
    }
  };

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
      difficulty: catDraft.difficulty ?? selectedDifficulty,
    };
    const wasEdit = Boolean(catDraft.id);
    const result = catDraft.id
      ? await updatePunishmentCategory(payload)
      : await addPunishmentCategory(payload);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const savedId = result.id ?? catDraft.id;
    setImageMessage('');
    if (savedId) {
      setManageCategoryId(savedId);
      setSelectedDifficulty(payload.difficulty ?? selectedDifficulty);
      setCatDraft({ ...payload, id: savedId });
      if (wasEdit) {
        setEditorPanel('idle');
        syncTemplateDraft(emptyTemplateDraft(savedId));
        setMessage('Category saved.');
      } else {
        setEditorPanel('punishment');
        syncTemplateDraft(emptyTemplateDraft(savedId));
        setMessage('Category saved. Add the first punishment.');
      }
      return;
    }
    setCatDraft(emptyCategoryDraft(selectedDifficulty));
    setEditorPanel('idle');
    setMessage('Category saved.');
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
    setCatDraft(emptyCategoryDraft(selectedDifficulty));
    setManageCategoryId(null);
    setEditorPanel('idle');
    syncTemplateDraft(emptyTemplateDraft(''));
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
    const thronePayment = Boolean(tplDraft.thronePayment);
    const throneAmountCents = thronePayment
      ? parseThroneAmountEurToCents(throneAmountEur)
      : null;
    if (thronePayment && !throneAmountCents) {
      setError('Enter a valid Throne gift amount in EUR (e.g. 5, 25, 125).');
      return;
    }
    if (thronePayment && !openUrl) {
      setError('Throne payment punishments need an Open URL (Throne gift link).');
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
      thronePayment: thronePayment || undefined,
      throneAmountCents: thronePayment ? throneAmountCents : null,
      throneGiftId:
        thronePayment && selectedThroneGiftId.trim()
          ? selectedThroneGiftId.trim()
          : tplDraft.throneGiftId?.trim() || null,
    };
    const result = tplDraft.id
      ? await updatePunishmentTemplate(payload)
      : await addPunishmentTemplate(payload);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    syncTemplateDraft(emptyTemplateDraft(categoryId));
    setEditorPanel('punishment');
    setMessage('Punishment saved. Add another, or click a preview to edit.');
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

  return (
    <div className="admin-punishments">
      <p className="muted">
        Choose Easy, Medium, or Hard, then a category. Previews use the same
        cards as the Punishments tab. Click a punishment to edit it.
      </p>

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

      <div
        className="admin-minigames-tabs"
        role="tablist"
        aria-label="Difficulty"
      >
        {PUNISHMENT_DIFFICULTY_ORDER.map((difficulty) => {
          const count = categoriesByDifficulty[difficulty].length;
          const active = selectedDifficulty === difficulty;
          return (
            <button
              key={difficulty}
              type="button"
              role="tab"
              aria-selected={active}
              className={
                active
                  ? 'admin-minigames-tab admin-minigames-tab--active'
                  : 'admin-minigames-tab'
              }
              onClick={() => selectDifficulty(difficulty)}
            >
              {PUNISHMENT_DIFFICULTY_LABELS[difficulty]}
              <span className="admin-count">{count}</span>
            </button>
          );
        })}
      </div>

      {showPicker && (
        <section ref={pickerRef} className="card">
          <div className="admin-list-card__title-row">
            <h3 className="section-title">
              {PUNISHMENT_DIFFICULTY_LABELS[selectedDifficulty]} categories
            </h3>
            <span className="admin-count">{difficultyCategories.length}</span>
          </div>
          <p className="muted punishment-selected-hint">
            Same cards as the Punishments tab. Click a category to see its
            punishments.
          </p>
          <div className="category-grid">
            {difficultyCategories.map((category) => (
              <PunishmentCategoryCard
                key={category.id}
                category={category}
                selected={manageCategoryId === category.id}
                onSelect={() => selectCategory(category)}
              />
            ))}
            <button
              type="button"
              className="category-card punishment-category-card punishment-category-card--new"
              onClick={startNewCategory}
            >
              <div className="category-card__image-wrap">
                <div className="category-card__placeholder" aria-hidden>
                  <span className="category-card__icon">+</span>
                </div>
              </div>
              <div className="category-card__body">
                <h3 className="category-card__name">New category</h3>
                <p className="category-card__meta muted">
                  Add to {PUNISHMENT_DIFFICULTY_LABELS[selectedDifficulty]}
                </p>
              </div>
            </button>
          </div>
          {difficultyCategories.length === 0 && (
            <p className="muted punishment-selected-hint">
              No categories in {PUNISHMENT_DIFFICULTY_LABELS[selectedDifficulty]}{' '}
              yet. Create one to start adding punishments.
            </p>
          )}
        </section>
      )}

      {showWorkspace && catalogCategory && (
        <div
          ref={workspaceRef}
          className={
            editorOpen
              ? 'admin-punishments-workspace admin-punishments-workspace--editing'
              : 'admin-punishments-workspace'
          }
        >
          <section className="card punishment-selected-panel admin-punishments-catalog">
            <div className="page-header__row">
              <button
                type="button"
                className="btn btn--ghost btn--small"
                onClick={backToCategories}
              >
                ← All categories
              </button>
              {manageCategory && (
                <div className="btn-row">
                  <button
                    type="button"
                    className="btn btn--ghost btn--small"
                    onClick={startEditCategory}
                  >
                    Edit category
                  </button>
                  <button
                    type="button"
                    className="btn btn--primary btn--small"
                    onClick={startNewPunishment}
                  >
                    New punishment
                  </button>
                </div>
              )}
            </div>
            {isCategoryImagePreview(catalogCategory.imageUrl) && (
              <div className="punishment-category-hero">
                <img
                  src={catalogCategory.imageUrl}
                  alt=""
                  className="category-card__image"
                />
              </div>
            )}
            <h3 className="section-title">{catalogCategory.name}</h3>
            {catalogCategory.description ? (
              <p className="punishment-category-desc muted">
                {catalogCategory.description}
              </p>
            ) : null}
            {catalogTemplates.length === 0 ? (
              <p className="muted punishment-category-empty">
                {manageCategory
                  ? 'No punishments in this category yet.'
                  : 'Save this category, then add punishments.'}
              </p>
            ) : (
              <ul className="task-list">
                {catalogTemplates.map((template) => (
                  <li key={template.id}>
                    <PunishmentListRow
                      template={template}
                      preview
                      selected={
                        editorPanel === 'punishment' && tplDraft.id === template.id
                      }
                      onSelect={() => startEditPunishment(template)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>

          {editorOpen && (
            <section className="card admin-punishments-editor">
              {editorPanel === 'category' ? (
                <>
                  <h3 className="section-title">
                    {catDraft.id ? 'Edit category' : 'New category'}
                  </h3>
                  <p className="muted admin-punishments-preview-label">
                    User preview
                  </p>
                  <div className="admin-punishments-category-preview">
                    <PunishmentCategoryCard
                      category={previewCategory}
                      preview
                    />
                  </div>

                  <FormBlock title="Basics">
                    <Field label="Difficulty section">
                      <div
                        className="chip-row chip-row--scroll"
                        role="group"
                        aria-label="Difficulty tier"
                      >
                        {PUNISHMENT_DIFFICULTY_ORDER.map((difficulty) => (
                          <button
                            key={difficulty}
                            type="button"
                            className={
                              (catDraft.difficulty ?? selectedDifficulty) ===
                              difficulty
                                ? 'chip chip--active'
                                : 'chip'
                            }
                            aria-pressed={
                              (catDraft.difficulty ?? selectedDifficulty) ===
                              difficulty
                            }
                            onClick={() =>
                              setCatDraft({ ...catDraft, difficulty })
                            }
                          >
                            {PUNISHMENT_DIFFICULTY_LABELS[difficulty]}
                          </button>
                        ))}
                      </div>
                    </Field>
                    <Field label="Name" htmlFor="pcat-name">
                      <input
                        id="pcat-name"
                        value={catDraft.name}
                        onChange={(e) =>
                          setCatDraft({ ...catDraft, name: e.target.value })
                        }
                      />
                    </Field>
                    <Field label="Description" htmlFor="pcat-desc">
                      <textarea
                        id="pcat-desc"
                        rows={2}
                        value={catDraft.description ?? ''}
                        onChange={(e) =>
                          setCatDraft({
                            ...catDraft,
                            description: e.target.value,
                          })
                        }
                      />
                    </Field>
                    <Field label="Category image">
                      <CategoryImagePicker
                        idPrefix="pcat"
                        urlInputId="pcat-image"
                        previewUrl={imagePreview}
                        urlValue={
                          catDraft.imageUrl?.startsWith('http')
                            ? catDraft.imageUrl
                            : ''
                        }
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
                    </Field>
                    <Field label="Sort order" htmlFor="pcat-order">
                      <input
                        id="pcat-order"
                        type="number"
                        value={catDraft.sortOrder}
                        onChange={(e) =>
                          setCatDraft({
                            ...catDraft,
                            sortOrder: Number(e.target.value),
                          })
                        }
                      />
                    </Field>
                  </FormBlock>

                  <div className="btn-row admin-form-actions">
                    <button
                      type="button"
                      className="btn btn--primary"
                      onClick={() => void saveCategory()}
                    >
                      {catDraft.id ? 'Save category' : 'Create category'}
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost"
                      onClick={
                        catDraft.id ? closeEditor : backToCategories
                      }
                    >
                      Cancel
                    </button>
                    {catDraft.id && (
                      <button
                        type="button"
                        className="btn btn--ghost btn--danger-text"
                        onClick={() => void removeCategory(catDraft.id)}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <h3 className="section-title">
                    {tplDraft.id ? 'Edit punishment' : 'New punishment'}
                  </h3>
                  <p className="muted admin-punishments-preview-label">
                    User preview
                  </p>
                  <PunishmentListRow template={draftPreviewTemplate} preview />

                  <FormBlock title="Basics">
                    <Field label="Title" htmlFor="ptpl-title">
                      <input
                        id="ptpl-title"
                        value={tplDraft.title}
                        onChange={(e) =>
                          setTplDraft({ ...tplDraft, title: e.target.value })
                        }
                      />
                    </Field>
                    <Field label="Description" htmlFor="ptpl-desc">
                      <textarea
                        id="ptpl-desc"
                        rows={3}
                        value={tplDraft.description}
                        onChange={(e) =>
                          setTplDraft({
                            ...tplDraft,
                            description: e.target.value,
                          })
                        }
                      />
                    </Field>
                    <Field
                      label="Malus points relieved"
                      htmlFor="ptpl-malus"
                    >
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
                    </Field>
                  </FormBlock>

                  <FormBlock title="Completion requirements">
                    <div className="field">
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={Boolean(tplDraft.thronePayment)}
                          onChange={(e) =>
                            setTplDraft({
                              ...tplDraft,
                              thronePayment: e.target.checked,
                            })
                          }
                        />
                        Throne payment (webhook verifies gift amount)
                      </label>
                      {tplDraft.thronePayment && (
                        <p className="muted field__hint">
                          Recommended tiers: €5 → 1 malus, €25 → 10 malus, €125
                          → 50 malus. Pick a gift below or enter amount/URL
                          manually if fetch fails.
                        </p>
                      )}
                    </div>
                    {tplDraft.thronePayment && (
                      <Field
                        label="Select Throne gift"
                        htmlFor="ptpl-throne-gift"
                      >
                        <div className="field-row">
                          <select
                            id="ptpl-throne-gift"
                            value={selectedThroneGiftId}
                            disabled={
                              throneGiftsLoading || throneGifts.length === 0
                            }
                            onChange={(e) =>
                              applyThroneGiftSelection(e.target.value)
                            }
                          >
                            <option value="">
                              {throneGiftsLoading
                                ? 'Loading gifts from Throne…'
                                : throneGifts.length > 0
                                  ? 'Choose a gift…'
                                  : 'No gifts loaded — refresh or enter manually'}
                            </option>
                            {throneGifts.map((gift) => (
                              <option key={gift.id} value={gift.id}>
                                {formatThroneGiftOptionLabel(gift)}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className="btn btn--ghost btn--small"
                            disabled={throneGiftsLoading}
                            onClick={() => void loadThroneGifts()}
                          >
                            {throneGiftsLoading ? 'Refreshing…' : 'Refresh gifts'}
                          </button>
                        </div>
                        {throneUsername ? (
                          <p className="muted">
                            Throne profile: throne.com/u/{throneUsername}
                          </p>
                        ) : (
                          <p className="muted">
                            Set VITE_THRONE_URL=https://throne.com/u/your-username
                            in .env (and Vercel) to auto-load gifts, or set
                            THRONE_USERNAME in Supabase Edge Function secrets.
                          </p>
                        )}
                        {throneGiftsError && (
                          <p className="login-error" role="alert">
                            {throneGiftsError}
                          </p>
                        )}
                        {throneGiftsWarning && (
                          <p className="muted" role="status">
                            {throneGiftsWarning}
                          </p>
                        )}
                      </Field>
                    )}
                    {tplDraft.thronePayment && (
                      <Field
                        label="Throne gift amount (EUR) — manual fallback"
                        htmlFor="ptpl-throne-eur"
                        hint="Webhook matching uses this amount in cents. Prefer EUR gifts so it matches Throne checkout."
                      >
                        <input
                          id="ptpl-throne-eur"
                          type="number"
                          min={0.01}
                          step={0.01}
                          placeholder="e.g. 5, 25, 125"
                          value={throneAmountEur}
                          onChange={(e) => {
                            setThroneAmountEur(e.target.value);
                            setSelectedThroneGiftId('');
                            setTplDraft((draft) => ({
                              ...draft,
                              throneGiftId: null,
                            }));
                          }}
                        />
                      </Field>
                    )}
                    <Field
                      label="Required phrases (one per line)"
                      htmlFor="ptpl-phrases"
                    >
                      <textarea
                        id="ptpl-phrases"
                        rows={3}
                        value={phrasesText}
                        placeholder="Optional — user must type each phrase to complete"
                        onChange={(e) => setPhrasesText(e.target.value)}
                      />
                    </Field>
                    <Field
                      label="Times each phrase must be typed"
                      htmlFor="ptpl-phrase-repeat"
                    >
                      <input
                        id="ptpl-phrase-repeat"
                        type="number"
                        min={1}
                        value={tplDraft.requiredPhraseRepeatCount ?? 1}
                        onChange={(e) =>
                          setTplDraft({
                            ...tplDraft,
                            requiredPhraseRepeatCount: Math.max(
                              1,
                              Number(e.target.value) || 1,
                            ),
                          })
                        }
                      />
                    </Field>
                    <Field label="Timer before completion">
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
                    </Field>
                    <Field
                      label="Site to open (http or https)"
                      htmlFor="ptpl-url"
                    >
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
                    </Field>
                  </FormBlock>

                  <div className="btn-row admin-form-actions">
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
                      onClick={() => {
                        if (tplDraft.id) {
                          startNewPunishment();
                        } else {
                          closeEditor();
                        }
                      }}
                    >
                      {tplDraft.id ? 'New instead' : 'Cancel'}
                    </button>
                    {tplDraft.id && (
                      <button
                        type="button"
                        className="btn btn--ghost btn--danger-text"
                        onClick={() => void removeTemplate(tplDraft.id)}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
