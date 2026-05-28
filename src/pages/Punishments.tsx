import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CategoryImagePicker } from '../components/CategoryImagePicker';
import { useAppStore } from '../hooks/useAppStore';
import { isCategoryImagePreview } from '../lib/categoryImage';
import {
  groupCategoriesByDifficulty,
  groupPunishmentsByCategory,
  PUNISHMENT_DIFFICULTY_LABELS,
  PUNISHMENT_DIFFICULTY_ORDER,
  templatesForCategory,
} from '../lib/gameLogic';
import type {
  PunishmentCategory,
  PunishmentDifficulty,
  PunishmentTemplate,
} from '../types';

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

function PunishmentCategoryHero({ category }: { category: PunishmentCategory }) {
  return (
    <div className="punishment-category-hero category-card__image-wrap">
      {category.imageUrl ? (
        <img src={category.imageUrl} alt="" className="category-card__image" />
      ) : (
        <div className="category-card__placeholder" aria-hidden>
          <span className="category-card__icon">⚡</span>
        </div>
      )}
    </div>
  );
}

function PunishmentCategoryCard({
  category,
  selected,
  punishmentCount,
  onSelect,
}: {
  category: PunishmentCategory;
  selected: boolean;
  punishmentCount: number;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={`category-card punishment-category-card${selected ? ' punishment-category-card--selected' : ''}`}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <div className="category-card__image-wrap">
        {category.imageUrl ? (
          <img src={category.imageUrl} alt="" className="category-card__image" />
        ) : (
          <div className="category-card__placeholder" aria-hidden>
            <span className="category-card__icon">⚡</span>
          </div>
        )}
      </div>
      <div className="category-card__body">
        <span className="category-card__name">{category.name}</span>
        <span className="category-card__meta muted">
          {punishmentCount} {punishmentCount === 1 ? 'punishment' : 'punishments'}
        </span>
      </div>
    </button>
  );
}

export function Punishments() {
  const [searchParams, setSearchParams] = useSearchParams();
  const manageFromUrl = searchParams.get('manage') === '1';
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

  useEffect(() => {
    if (manageFromUrl && isAdmin) setManageMode(true);
  }, [manageFromUrl, isAdmin]);

  const setManage = (on: boolean) => {
    setManageMode(on);
    if (on) {
      setSearchParams({ manage: '1' }, { replace: true });
    } else {
      setSearchParams({}, { replace: true });
    }
  };

  const malus = state.progress.malusPoints;
  const reliefTemplates = state.punishmentTemplates.filter(
    (t) => t.trigger.type === 'malus_relief' || t.malusPointsRelieved > 0,
  );
  const categoriesByDifficulty = useMemo(
    () => groupCategoriesByDifficulty(state.punishmentCategories),
    [state.punishmentCategories],
  );
  const hasCategories = state.punishmentCategories.length > 0;
  const history = state.punishments
    .filter((p) => p.trigger.type === 'malus_relief')
    .slice(-10)
    .reverse();

  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  useEffect(() => {
    if (!hasCategories) {
      setSelectedCategoryId(null);
      return;
    }
    if (
      !selectedCategoryId ||
      !state.punishmentCategories.some((c) => c.id === selectedCategoryId)
    ) {
      const first =
        PUNISHMENT_DIFFICULTY_ORDER.map((d) => categoriesByDifficulty[d][0]).find(
          Boolean,
        ) ?? state.punishmentCategories[0];
      setSelectedCategoryId(first?.id ?? null);
    }
  }, [hasCategories, selectedCategoryId, state.punishmentCategories, categoriesByDifficulty]);

  const selectedCategory = state.punishmentCategories.find(
    (c) => c.id === selectedCategoryId,
  );
  const selectedTemplates = useMemo(
    () =>
      selectedCategoryId
        ? templatesForCategory(
            reliefTemplates,
            state.punishmentCategories,
            selectedCategoryId,
          )
        : [],
    [reliefTemplates, state.punishmentCategories, selectedCategoryId],
  );

  const countInCategory = (categoryId: string) =>
    templatesForCategory(reliefTemplates, state.punishmentCategories, categoryId)
      .length;

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
              Incomplete started or daily tasks add malus at day end. Pick a category,
              then accept a punishment to reduce your malus balance.
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

      {!hasCategories && (
        <section className="card">
          <p className="muted">
            No punishment categories yet.
            {isAdmin ? (
              <>
                {' '}
                <button
                  type="button"
                  className="btn btn--ghost btn--small"
                  onClick={() => setManage(true)}
                >
                  Add categories
                </button>
              </>
            ) : (
              ' Ask an admin to add categories and punishments.'
            )}
          </p>
        </section>
      )}

      {hasCategories && (
        <div className="punishment-tiers">
          {PUNISHMENT_DIFFICULTY_ORDER.map((difficulty) => {
            const cats = categoriesByDifficulty[difficulty];
            if (cats.length === 0) return null;
            return (
              <section key={difficulty} className="punishment-difficulty-section">
                <h3 className="punishment-difficulty-heading">
                  {PUNISHMENT_DIFFICULTY_LABELS[difficulty]}
                </h3>
                <div className="punishment-category-grid">
                  {cats.map((category) => (
                    <PunishmentCategoryCard
                      key={category.id}
                      category={category}
                      selected={selectedCategoryId === category.id}
                      punishmentCount={countInCategory(category.id)}
                      onSelect={() => setSelectedCategoryId(category.id)}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {selectedCategory && (
        <section className="card punishment-selected-panel">
          <h3 className="section-title">{selectedCategory.name}</h3>
          <PunishmentCategoryHero category={selectedCategory} />
          {selectedCategory.description && (
            <p className="muted punishment-category-desc">{selectedCategory.description}</p>
          )}
          {selectedTemplates.length === 0 ? (
            <p className="muted">No punishments in this category yet.</p>
          ) : (
            <ul className="punishment-list">
              {selectedTemplates.map((tpl) => (
                <li key={tpl.id} className="punishment-item punishment-item--template">
                  <h4>{tpl.title}</h4>
                  <p>{tpl.description}</p>
                  <p className="punishment-points">
                    Clears up to {tpl.malusPointsRelieved} malus
                  </p>
                  <button
                    type="button"
                    className="btn btn--primary btn--small"
                    disabled={malus <= 0}
                    onClick={() => acceptPunishment(tpl.id)}
                  >
                    Accept punishment
                  </button>
                </li>
              ))}
            </ul>
          )}
          {malus <= 0 && selectedTemplates.length > 0 && (
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
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [imageMessage, setImageMessage] = useState('');

  const imagePreview = isCategoryImagePreview(catDraft.imageUrl)
    ? catDraft.imageUrl
    : null;

  const manageCategory =
    state.punishmentCategories.find((c) => c.id === manageCategoryId) ?? null;

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
    setCatDraft(emptyCategoryDraft());
    setImageMessage('');
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
    const payload: PunishmentTemplate = {
      ...tplDraft,
      id: tplDraft.id || '',
      title: tplDraft.title.trim(),
      categoryId,
      trigger: { type: 'malus_relief' },
      malusPointsRelieved: tplDraft.malusPointsRelieved || 1,
    };
    const result = tplDraft.id
      ? await updatePunishmentTemplate(payload)
      : await addPunishmentTemplate(payload);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setTplDraft(emptyTemplateDraft(categoryId));
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
      setTplDraft(emptyTemplateDraft(manageCategoryId ?? ''));
    }
    setMessage('Punishment deleted.');
  };

  const selectCategoryForManage = (c: PunishmentCategory) => {
    setManageCategoryId(c.id);
    setCatDraft(c);
    setImageMessage('');
    setTplDraft(emptyTemplateDraft(c.id));
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
                    {cats.map((c) => (
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
                    ))}
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
              onClick={() => setTplDraft(emptyTemplateDraft(manageCategory.id))}
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
              return <p className="muted">No punishments in this category yet.</p>;
            }
            return (
              <ul className="admin-library punishment-manage-list">
                {templates.map((t) => (
                  <li key={t.id} className="admin-library-item">
                    <button
                      type="button"
                      className="admin-library-item__main"
                      onClick={() => setTplDraft(t)}
                    >
                      <strong>{t.title}</strong>
                      <span className="muted">clears {t.malusPointsRelieved} malus</span>
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
