import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { CategoryImagePicker } from '../CategoryImagePicker';
import { useAppStore } from '../../hooks/useAppStore';
import { isCategoryImagePreview } from '../../lib/categoryImage';
import {
  categoryDifficulty,
  groupCategoriesByDifficulty,
  PUNISHMENT_DIFFICULTY_LABELS,
  PUNISHMENT_DIFFICULTY_ORDER,
  resolvePunishmentDifficulty,
  templatesForCategory,
} from '../../lib/gameLogic';
import {
  formatThroneAmountEur,
  getPhraseRepeatCount,
  getRequiredPhrases,
  isValidOpenUrl,
  parsePhrasesFromText,
  parseThroneAmountEurToCents,
  phrasesToText,
  punishmentHasOpenUrl,
  punishmentHasPhrase,
  punishmentHasThronePayment,
  punishmentHasTimer,
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
  PunishmentTrigger,
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

function snippet(text: string, max = 140): string {
  const trimmed = text.trim().replace(/\s+/g, ' ');
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max).trimEnd()}…`;
}

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  if (minutes > 0 && rest > 0) return `${minutes}m ${rest}s`;
  if (minutes > 0) return `${minutes}m`;
  return `${rest}s`;
}

function triggerLabel(type: PunishmentTrigger['type']): string {
  if (type === 'malus_relief') return 'Malus relief';
  if (type === 'quota_miss') return 'Quota miss';
  return 'Manual';
}

function linkRuleLabel(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return host ? `Link · ${host}` : 'Open link';
  } catch {
    return 'Open link';
  }
}

function phraseRuleLabel(template: PunishmentTemplate): string {
  const count = getRequiredPhrases(template).length;
  const repeats = getPhraseRepeatCount(template);
  const noun = count === 1 ? 'phrase' : 'phrases';
  if (repeats > 1) return `${count} ${noun} ×${repeats}`;
  return `${count} ${noun}`;
}

function ruleChips(template: PunishmentTemplate): { key: string; label: string }[] {
  const chips: { key: string; label: string }[] = [];
  if (punishmentHasThronePayment(template)) {
    chips.push({
      key: 'throne',
      label:
        template.throneAmountCents != null
          ? `Throne €${formatThroneAmountEur(template.throneAmountCents)}`
          : 'Throne payment',
    });
  }
  if (punishmentHasPhrase(template)) {
    chips.push({ key: 'phrase', label: phraseRuleLabel(template) });
  }
  if (punishmentHasOpenUrl(template)) {
    chips.push({
      key: 'url',
      label: linkRuleLabel(template.openUrl?.trim() || ''),
    });
  }
  return chips;
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
      {htmlFor ? <label htmlFor={htmlFor}>{label}</label> : <span>{label}</span>}
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

function Alerts({ message, error }: { message: string; error: string }) {
  return (
    <>
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
    </>
  );
}

function PunishmentFacts({
  template,
  categories,
  draft = false,
}: {
  template: PunishmentTemplate;
  categories: PunishmentCategory[];
  draft?: boolean;
}) {
  const difficulty = resolvePunishmentDifficulty(template, categories);
  const severity =
    draft && !template.categoryId
      ? 'No category'
      : PUNISHMENT_DIFFICULTY_LABELS[difficulty];
  const rules = ruleChips(template);
  const timer = punishmentHasTimer(template);

  return (
    <>
      <span className="admin-punish-row__stats">
        <span className="admin-punish-stat">{severity}</span>
        <span className="admin-punish-stat admin-punish-stat--muted">
          {triggerLabel(template.trigger.type)}
        </span>
        <span className="admin-punish-stat admin-punish-stat--point">
          {template.malusPointsRelieved || 0} malus
        </span>
        {timer && (
          <span className="admin-punish-stat">
            {formatDuration(template.timerSeconds ?? 0)} timer
          </span>
        )}
      </span>
      {rules.length > 0 ? (
        <span className="admin-punish-rules">
          {rules.map((rule) => (
            <span key={rule.key} className="admin-punish-rule">
              {rule.label}
            </span>
          ))}
        </span>
      ) : !timer ? (
        <span className="admin-punish-rules">
          <span className="admin-punish-rule admin-punish-rule--quiet">
            No extra rules
          </span>
        </span>
      ) : null}
    </>
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

  const editorRef = useRef<HTMLElement>(null);
  const editorWasOpen = useRef(false);

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
  const [throneGiftsWarning, setThroneGiftsWarning] = useState<string | null>(
    null,
  );
  const [timerMinutes, setTimerMinutes] = useState('');
  const [timerSecondsPart, setTimerSecondsPart] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [imageMessage, setImageMessage] = useState('');

  const catalog = useMemo(() => {
    const byDifficulty = groupCategoriesByDifficulty(state.punishmentCategories);
    const placed = new Set<string>();
    const tiers = PUNISHMENT_DIFFICULTY_ORDER.map((difficulty) => {
      const categories = byDifficulty[difficulty].map((category) => {
        const templates = templatesForCategory(
          state.punishmentTemplates,
          state.punishmentCategories,
          category.id,
        );
        for (const template of templates) placed.add(template.id);
        return { category, templates };
      });
      return { difficulty, categories };
    });
    const uncategorized = state.punishmentTemplates.filter(
      (template) => !placed.has(template.id),
    );
    return { tiers, uncategorized };
  }, [state.punishmentTemplates, state.punishmentCategories]);

  const imagePreview = isCategoryImagePreview(catDraft.imageUrl)
    ? catDraft.imageUrl
    : null;
  const throneUsername = getThroneUsername();
  const editorOpen = editorPanel !== 'idle';

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
      malusPointsRelieved: tplDraft.malusPointsRelieved || 0,
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
    const open = editorPanel !== 'idle';
    if (open && !editorWasOpen.current) {
      editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    editorWasOpen.current = open;
  }, [editorPanel]);

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

  const showError = (text: string) => {
    setMessage('');
    setError(text);
    editorRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

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
    const gift = throneGifts.find((item) => item.id === giftId);
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

  const startNewCategory = (difficulty: PunishmentDifficulty = 'easy') => {
    setError('');
    setMessage('');
    setImageMessage('');
    setManageCategoryId(null);
    setSelectedDifficulty(difficulty);
    setCatDraft(emptyCategoryDraft(difficulty));
    setEditorPanel('category');
    syncTemplateDraft(emptyTemplateDraft(''));
  };

  const startEditCategory = (category: PunishmentCategory) => {
    setError('');
    setMessage('');
    setImageMessage('');
    setManageCategoryId(category.id);
    setCatDraft(category);
    setSelectedDifficulty(categoryDifficulty(category));
    setEditorPanel('category');
    syncTemplateDraft(emptyTemplateDraft(category.id));
  };

  const startNewPunishment = (category?: PunishmentCategory) => {
    setError('');
    setMessage('');
    setImageMessage('');
    if (!category && state.punishmentCategories.length === 0) {
      setEditorPanel('idle');
      setError('Create a category first.');
      return;
    }
    setEditorPanel('punishment');
    if (category) {
      setManageCategoryId(category.id);
      setSelectedDifficulty(categoryDifficulty(category));
      syncTemplateDraft(emptyTemplateDraft(category.id));
      return;
    }
    setManageCategoryId(null);
    syncTemplateDraft(emptyTemplateDraft(''));
  };

  const startEditPunishment = (template: PunishmentTemplate) => {
    setError('');
    setMessage('');
    setImageMessage('');
    setEditorPanel('punishment');
    const categoryId = template.categoryId ?? null;
    setManageCategoryId(categoryId);
    if (categoryId) {
      const category = state.punishmentCategories.find((item) => item.id === categoryId);
      if (category) setSelectedDifficulty(categoryDifficulty(category));
    }
    syncTemplateDraft(template);
  };

  const closeEditor = () => {
    setEditorPanel('idle');
    setImageMessage('');
    setError('');
    setManageCategoryId(null);
    setCatDraft(emptyCategoryDraft(selectedDifficulty));
    syncTemplateDraft(emptyTemplateDraft(''));
  };

  const saveCategory = async () => {
    setError('');
    setMessage('');
    if (!catDraft.name.trim()) {
      showError('Category name is required.');
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
      showError(result.error);
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
        setManageCategoryId(null);
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
    if (
      !window.confirm(
        'Delete this category? Punishments in it become uncategorized.',
      )
    ) {
      return;
    }
    setError('');
    setMessage('');
    const result = await deletePunishmentCategory(id);
    if (!result.ok) {
      showError(result.error);
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
      showError('Punishment title is required.');
      return;
    }
    const categoryId = tplDraft.categoryId || manageCategoryId;
    if (!categoryId) {
      showError('Select a category first.');
      return;
    }
    const openUrl = tplDraft.openUrl?.trim();
    if (openUrl && !isValidOpenUrl(openUrl)) {
      showError('Open URL must start with http:// or https://.');
      return;
    }
    const thronePayment = Boolean(tplDraft.thronePayment);
    const throneAmountCents = thronePayment
      ? parseThroneAmountEurToCents(throneAmountEur)
      : null;
    if (thronePayment && !throneAmountCents) {
      showError('Enter a valid Throne gift amount in EUR (e.g. 5, 25, 125).');
      return;
    }
    if (thronePayment && !openUrl) {
      showError('Throne payment punishments need an Open URL (Throne gift link).');
      return;
    }
    const requiredPhrases = parsePhrasesFromText(phrasesText);
    const mins = Number(timerMinutes) || 0;
    const secs = Number(timerSecondsPart) || 0;
    const timerTotal = mins * 60 + secs;
    const category =
      state.punishmentCategories.find((item) => item.id === categoryId) ?? null;
    const payload: PunishmentTemplate = {
      ...tplDraft,
      id: tplDraft.id || '',
      title: tplDraft.title.trim(),
      categoryId,
      trigger: { type: 'malus_relief' },
      malusPointsRelieved: tplDraft.malusPointsRelieved || 1,
      difficulty:
        tplDraft.difficulty ??
        (category ? categoryDifficulty(category) : 'medium'),
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
      showError(result.error);
      return;
    }
    syncTemplateDraft(emptyTemplateDraft(categoryId));
    setManageCategoryId(categoryId);
    setEditorPanel('punishment');
    setMessage('Punishment saved. Add another, or click a row to edit.');
  };

  const removeTemplate = async (id: string) => {
    if (!window.confirm('Delete this punishment template?')) return;
    setError('');
    setMessage('');
    const result = await deletePunishmentTemplate(id);
    if (!result.ok) {
      showError(result.error);
      return;
    }
    if (tplDraft.id === id) {
      syncTemplateDraft(emptyTemplateDraft(manageCategoryId ?? ''));
      setEditorPanel('idle');
    }
    setMessage('Punishment deleted.');
  };

  const renderPunishmentList = (templates: PunishmentTemplate[]) => (
    <ul className="admin-library">
      {templates.map((template) => {
        const selected =
          editorPanel === 'punishment' && tplDraft.id === template.id;
        return (
          <li
            key={template.id}
            className={
              selected
                ? 'admin-library-item admin-library-item--selected'
                : 'admin-library-item'
            }
          >
            <button
              type="button"
              className="admin-library-item__main"
              aria-current={selected ? 'true' : undefined}
              onClick={() => startEditPunishment(template)}
            >
              <span className="admin-library-item__title">{template.title}</span>
              <PunishmentFacts
                template={template}
                categories={state.punishmentCategories}
              />
              {template.description.trim() ? (
                <span className="admin-punish-desc">
                  {snippet(template.description)}
                </span>
              ) : null}
            </button>
            <div className="admin-library-item__actions">
              <button
                type="button"
                className="btn btn--ghost btn--small"
                onClick={() => startEditPunishment(template)}
              >
                Edit
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );

  const alerts = <Alerts message={message} error={error} />;

  return (
    <div className="admin-punishments">
      {!editorOpen && alerts}

      <div className="admin-punish-toolbar">
        <p className="muted admin-punish-toolbar__note">
          Grouped by difficulty, then category. Each row shows severity, type,
          malus, duration, and rules. The list stays on screen while you edit.
        </p>
        <div className="btn-row">
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => startNewCategory('easy')}
          >
            New category
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => startNewPunishment()}
          >
            New punishment
          </button>
        </div>
      </div>

      <div
        className={
          editorOpen
            ? 'admin-punishments-workspace admin-punishments-workspace--editing'
            : 'admin-punishments-workspace'
        }
      >
        <div className="admin-punishments-catalog">
          {catalog.tiers.map(({ difficulty, categories }) => {
            const label = PUNISHMENT_DIFFICULTY_LABELS[difficulty];
            const punishmentCount = categories.reduce(
              (total, group) => total + group.templates.length,
              0,
            );
            const tierEmpty = categories.length === 0;

            return (
              <section key={difficulty} className="card admin-punish-tier">
                <div className="admin-list-card__title-row">
                  <div className="admin-punish-tier__title">
                    <h3 className="section-title">{label}</h3>
                    <span className="admin-count">{punishmentCount}</span>
                  </div>
                  <button
                    type="button"
                    className="btn btn--ghost btn--small"
                    onClick={() => startNewCategory(difficulty)}
                  >
                    New category
                  </button>
                </div>
                <p className="muted admin-punish-tier__meta">
                  {countLabel(categories.length, 'category', 'categories')}
                  {' · '}
                  {countLabel(punishmentCount, 'punishment', 'punishments')}
                </p>

                {tierEmpty ? (
                  <div className="admin-empty">
                    <p className="admin-empty__title">No categories in {label}</p>
                    <p className="muted">
                      Create a category, then add punishments under it.
                    </p>
                    <button
                      type="button"
                      className="btn btn--primary btn--small"
                      onClick={() => startNewCategory(difficulty)}
                    >
                      New category
                    </button>
                  </div>
                ) : (
                  <div className="admin-punish-tier__groups">
                    {categories.map(({ category, templates }) => {
                      const thumb = isCategoryImagePreview(category.imageUrl)
                        ? category.imageUrl
                        : null;
                      const groupActive =
                        (editorPanel === 'category' &&
                          catDraft.id === category.id) ||
                        (editorPanel === 'punishment' &&
                          (tplDraft.categoryId || manageCategoryId) ===
                            category.id);
                      return (
                        <article
                          key={category.id}
                          className={
                            groupActive
                              ? 'admin-punish-group admin-punish-group--active'
                              : 'admin-punish-group'
                          }
                        >
                          <header className="admin-punish-group__head">
                            <div className="admin-punish-group__identity">
                              {thumb ? (
                                <img
                                  src={thumb}
                                  alt=""
                                  className="admin-punish-group__thumb"
                                />
                              ) : (
                                <span
                                  className="admin-punish-group__thumb admin-punish-group__thumb--empty"
                                  aria-hidden="true"
                                >
                                  {(category.name.trim().charAt(0) || '?').toUpperCase()}
                                </span>
                              )}
                              <div className="admin-punish-group__copy">
                                <h4 className="admin-punish-group__name">
                                  {category.name}
                                </h4>
                                <p className="admin-punish-row__stats">
                                  <span className="admin-punish-stat">{label}</span>
                                  <span className="admin-punish-stat">
                                    {countLabel(
                                      templates.length,
                                      'punishment',
                                      'punishments',
                                    )}
                                  </span>
                                  <span className="admin-punish-stat admin-punish-stat--muted">
                                    Order {category.sortOrder}
                                  </span>
                                </p>
                                {category.description?.trim() ? (
                                  <p className="admin-punish-desc">
                                    {snippet(category.description)}
                                  </p>
                                ) : null}
                              </div>
                            </div>
                            <div className="admin-library-item__actions">
                              <button
                                type="button"
                                className="btn btn--ghost btn--small"
                                onClick={() => startEditCategory(category)}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="btn btn--primary btn--small"
                                onClick={() => startNewPunishment(category)}
                              >
                                New punishment
                              </button>
                            </div>
                          </header>
                          {templates.length === 0 ? (
                            <div className="admin-empty">
                              <p className="admin-empty__title">
                                No punishments yet
                              </p>
                              <p className="muted">This category is empty.</p>
                              <button
                                type="button"
                                className="btn btn--primary btn--small"
                                onClick={() => startNewPunishment(category)}
                              >
                                New punishment
                              </button>
                            </div>
                          ) : (
                            renderPunishmentList(templates)
                          )}
                        </article>
                      );
                    })}

                  </div>
                )}
              </section>
            );
          })}
          {catalog.uncategorized.length > 0 && (
            <section className="card admin-punish-tier">
              <div className="admin-punish-tier__title">
                <h3 className="section-title">Uncategorized</h3>
                <span className="admin-count">{catalog.uncategorized.length}</span>
              </div>
              <p className="muted admin-punish-tier__meta">
                These punishments are not in a category. Edit one and choose a
                category to file it.
              </p>
              <div className="admin-punish-tier__groups">
                {renderPunishmentList(catalog.uncategorized)}
              </div>
            </section>
          )}
        </div>

        {editorOpen && (
          <section
            ref={editorRef}
            className="card admin-punishments-editor"
            aria-label={
              editorPanel === 'category' ? 'Category editor' : 'Punishment editor'
            }
          >
            {alerts}
            {editorPanel === 'category' ? (
              <>
                <h3 className="section-title">
                  {catDraft.id ? 'Edit category' : 'New category'}
                </h3>
                <FormBlock title="Basics">
                  <Field label="Difficulty">
                    <div
                      className="chip-row"
                      role="group"
                      aria-label="Difficulty"
                    >
                      {PUNISHMENT_DIFFICULTY_ORDER.map((difficulty) => {
                        const active =
                          (catDraft.difficulty ?? selectedDifficulty) ===
                          difficulty;
                        return (
                          <button
                            key={difficulty}
                            type="button"
                            className={active ? 'chip chip--active' : 'chip'}
                            aria-pressed={active}
                            onClick={() =>
                              setCatDraft({ ...catDraft, difficulty })
                            }
                          >
                            {PUNISHMENT_DIFFICULTY_LABELS[difficulty]}
                          </button>
                        );
                      })}
                    </div>
                  </Field>
                  <Field label="Name" htmlFor="pcat-name">
                    <input
                      id="pcat-name"
                      value={catDraft.name}
                      onChange={(event) =>
                        setCatDraft({ ...catDraft, name: event.target.value })
                      }
                    />
                  </Field>
                  <Field label="Description" htmlFor="pcat-desc">
                    <textarea
                      id="pcat-desc"
                      rows={2}
                      value={catDraft.description ?? ''}
                      onChange={(event) =>
                        setCatDraft({
                          ...catDraft,
                          description: event.target.value,
                        })
                      }
                    />
                  </Field>
                  <Field
                    label="Sort order"
                    htmlFor="pcat-order"
                    hint="Lower numbers appear first."
                  >
                    <input
                      id="pcat-order"
                      type="number"
                      value={catDraft.sortOrder}
                      onChange={(event) =>
                        setCatDraft({
                          ...catDraft,
                          sortOrder: Number(event.target.value),
                        })
                      }
                    />
                  </Field>
                </FormBlock>
                <FormBlock title="Picture">
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
                    onClick={closeEditor}
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
                <div className="admin-punish-draft">
                  <p className="admin-punishments-preview-label">On the list</p>
                  <p className="admin-library-item__title">
                    {draftPreviewTemplate.title}
                  </p>
                  <PunishmentFacts
                    template={draftPreviewTemplate}
                    categories={state.punishmentCategories}
                    draft
                  />
                </div>
                <FormBlock title="Basics">
                  <Field label="Category" htmlFor="ptpl-category">
                    <select
                      id="ptpl-category"
                      value={tplDraft.categoryId ?? ''}
                      onChange={(event) => {
                        const categoryId = event.target.value;
                        setManageCategoryId(categoryId || null);
                        const category = state.punishmentCategories.find(
                          (item) => item.id === categoryId,
                        );
                        if (category) {
                          setSelectedDifficulty(categoryDifficulty(category));
                        }
                        setTplDraft({
                          ...tplDraft,
                          categoryId: categoryId || null,
                          difficulty: category
                            ? categoryDifficulty(category)
                            : tplDraft.difficulty,
                        });
                      }}
                    >
                      <option value="">Choose a category…</option>
                      {catalog.tiers.map(({ difficulty, categories: groups }) => {
                        if (groups.length === 0) return null;
                        return (
                          <optgroup
                            key={difficulty}
                            label={PUNISHMENT_DIFFICULTY_LABELS[difficulty]}
                          >
                            {groups.map(({ category }) => (
                              <option key={category.id} value={category.id}>
                                {category.name}
                              </option>
                            ))}
                          </optgroup>
                        );
                      })}
                    </select>
                  </Field>
                  <Field label="Title" htmlFor="ptpl-title">
                    <input
                      id="ptpl-title"
                      value={tplDraft.title}
                      onChange={(event) =>
                        setTplDraft({ ...tplDraft, title: event.target.value })
                      }
                    />
                  </Field>
                  <Field label="Description" htmlFor="ptpl-desc">
                    <textarea
                      id="ptpl-desc"
                      rows={3}
                      value={tplDraft.description}
                      onChange={(event) =>
                        setTplDraft({
                          ...tplDraft,
                          description: event.target.value,
                        })
                      }
                    />
                  </Field>
                  <Field label="Malus points relieved" htmlFor="ptpl-malus">
                    <input
                      id="ptpl-malus"
                      type="number"
                      min={1}
                      value={tplDraft.malusPointsRelieved}
                      onChange={(event) =>
                        setTplDraft({
                          ...tplDraft,
                          malusPointsRelieved: Number(event.target.value),
                        })
                      }
                    />
                  </Field>
                </FormBlock>
                <FormBlock title="How they finish">
                  <div className="field">
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={Boolean(tplDraft.thronePayment)}
                        onChange={(event) =>
                          setTplDraft({
                            ...tplDraft,
                            thronePayment: event.target.checked,
                          })
                        }
                      />
                      Throne payment (webhook verifies gift amount)
                    </label>
                    {tplDraft.thronePayment && (
                      <p className="muted field__hint">
                        Recommended tiers: €5 → 1 malus, €25 → 10 malus, €125 →
                        50 malus. Pick a gift below or enter amount/URL manually
                        if fetch fails.
                      </p>
                    )}
                  </div>
                  {tplDraft.thronePayment && (
                    <Field label="Select Throne gift" htmlFor="ptpl-throne-gift">
                      <div className="field-row">
                        <select
                          id="ptpl-throne-gift"
                          value={selectedThroneGiftId}
                          disabled={throneGiftsLoading || throneGifts.length === 0}
                          onChange={(event) =>
                            applyThroneGiftSelection(event.target.value)
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
                        onChange={(event) => {
                          setThroneAmountEur(event.target.value);
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
                      onChange={(event) => setPhrasesText(event.target.value)}
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
                      onChange={(event) =>
                        setTplDraft({
                          ...tplDraft,
                          requiredPhraseRepeatCount: Math.max(
                            1,
                            Number(event.target.value) || 1,
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
                        onChange={(event) => setTimerMinutes(event.target.value)}
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
                        onChange={(event) =>
                          setTimerSecondsPart(event.target.value)
                        }
                      />
                    </div>
                  </Field>
                  <Field label="Site to open (http or https)" htmlFor="ptpl-url">
                    <input
                      id="ptpl-url"
                      type="url"
                      value={tplDraft.openUrl ?? ''}
                      placeholder="https://example.com"
                      onChange={(event) =>
                        setTplDraft({
                          ...tplDraft,
                          openUrl: event.target.value.trim() || undefined,
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
                    onClick={closeEditor}
                  >
                    Cancel
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
    </div>
  );
}
