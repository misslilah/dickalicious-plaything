import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { CategoryCard } from '../CategoryCard';
import { CategoryImagePicker } from '../CategoryImagePicker';
import { useAppStore } from '../../hooks/useAppStore';
import {
  CATEGORY_GROUP_LABELS,
  CATEGORY_GROUP_ORDER,
  getCategoryGroup,
  getCategoryTasks,
} from '../../lib/categoryProgression';
import {
  isCategoryImagePreview,
  MAX_CATEGORY_IMAGE_BYTES,
  resolveCategoryImageUrl,
} from '../../lib/categoryImage';
import { USER_STAGE_OPTIONS } from '../../lib/levels';
import type { Category, CategoryGroup } from '../../types';

const CATEGORY_COLORS = [
  '#f9a8d4',
  '#e879f9',
  '#c084fc',
  '#a78bfa',
  '#818cf8',
  '#4ade80',
  '#fb923c',
  '#f87171',
];

function emptyCategoryDraft(group: CategoryGroup): Category {
  return {
    id: '',
    name: '',
    icon: '✨',
    color: '#f9a8d4',
    description: '',
    imageUrl: undefined,
    requiredStage: null,
    categoryGroup: group,
    unlockAfterCategoryId: null,
  };
}

export function CategoriesManager() {
  const { state, addCategory, updateCategory, deleteCategory } = useAppStore();
  const [selectedGroup, setSelectedGroup] = useState<CategoryGroup>('beginner');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    null,
  );
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState<Category>(() =>
    emptyCategoryDraft('beginner'),
  );
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [imageMessage, setImageMessage] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const target = editorOpen ? workspaceRef.current : pickerRef.current;
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [editorOpen, selectedGroup]);

  const categoriesByGroup = useMemo(() => {
    const grouped = Object.fromEntries(
      CATEGORY_GROUP_ORDER.map((group) => [group, [] as Category[]]),
    ) as Record<CategoryGroup, Category[]>;
    for (const category of state.categories) {
      grouped[getCategoryGroup(category)].push(category);
    }
    return grouped;
  }, [state.categories]);

  const taskCountByCategory = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const task of state.tasks) {
      if ((task.taskScope ?? 'category') !== 'category' || !task.categoryId) {
        continue;
      }
      counts[task.categoryId] = (counts[task.categoryId] ?? 0) + 1;
    }
    return counts;
  }, [state.tasks]);

  const groupCounts = useMemo(() => {
    const counts = Object.fromEntries(
      CATEGORY_GROUP_ORDER.map((group) => [group, 0]),
    ) as Record<CategoryGroup, number>;
    for (const category of state.categories) {
      counts[getCategoryGroup(category)] += 1;
    }
    return counts;
  }, [state.categories]);

  const groupCategories = categoriesByGroup[selectedGroup];
  const selectedCategory =
    state.categories.find((c) => c.id === selectedCategoryId) ?? null;
  const catalogTasks = selectedCategory
    ? getCategoryTasks(state, selectedCategory.id)
    : [];

  const previewCategory: Category = {
    ...draft,
    id: draft.id || '__draft__',
    name: draft.name.trim() || 'Untitled category',
    icon: draft.icon.trim() || '✨',
  };
  const previewTaskCount = draft.id
    ? (taskCountByCategory[draft.id] ?? 0)
    : 0;
  const imagePreview = isCategoryImagePreview(draft.imageUrl)
    ? draft.imageUrl
    : null;
  const unlockAfterName = draft.unlockAfterCategoryId
    ? state.categories.find((c) => c.id === draft.unlockAfterCategoryId)?.name
    : null;
  const requiredStageLabel = draft.requiredStage
    ? USER_STAGE_OPTIONS.find((o) => o.value === draft.requiredStage)?.label
    : null;

  const selectGroup = (group: CategoryGroup) => {
    setSelectedGroup(group);
    setMessage('');
    setError('');
    setImageMessage('');
    setErrors({});
    setSelectedCategoryId(null);
    setEditorOpen(false);
    setDraft(emptyCategoryDraft(group));
  };

  const selectCategory = (category: Category) => {
    setSelectedCategoryId(category.id);
    setSelectedGroup(getCategoryGroup(category));
    setDraft(category);
    setErrors({});
    setImageMessage('');
    setError('');
    setMessage('');
    setEditorOpen(true);
  };

  const startNewCategory = () => {
    setSelectedCategoryId(null);
    setDraft(emptyCategoryDraft(selectedGroup));
    setErrors({});
    setImageMessage('');
    setError('');
    setMessage('');
    setEditorOpen(true);
  };

  const backToGrid = () => {
    setSelectedCategoryId(null);
    setEditorOpen(false);
    setDraft(emptyCategoryDraft(selectedGroup));
    setErrors({});
    setImageMessage('');
    setError('');
    setMessage('');
  };

  const validate = () => {
    const next: Record<string, string> = {};
    if (!draft.name.trim()) next.name = 'Name is required.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async () => {
    if (!validate()) return;
    setSaving(true);
    setMessage('');
    setError('');
    const categoryId = draft.id || crypto.randomUUID();
    const imageResult = await resolveCategoryImageUrl(
      categoryId,
      draft.imageUrl,
      'category-image.jpg',
    );
    if (!imageResult.ok) {
      setSaving(false);
      setImageMessage(imageResult.error);
      return;
    }
    const cat: Category = {
      ...draft,
      id: categoryId,
      name: draft.name.trim(),
      imageUrl: imageResult.url,
      categoryGroup: draft.categoryGroup ?? selectedGroup,
    };
    const result = draft.id ? await updateCategory(cat) : await addCategory(cat);
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setDraft(cat);
    setSelectedCategoryId(cat.id);
    setSelectedGroup(getCategoryGroup(cat));
    setImageMessage('');
    setMessage('Category saved.');
  };

  const remove = async (id: string) => {
    if (!window.confirm('Delete this category and all its tasks?')) return;
    const result = await deleteCategory(id);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    backToGrid();
    setMessage('Category deleted.');
  };

  return (
    <div className="admin-categories">
      <p className="muted">
        Choose a stage, then a category. Cards match Home. Click one to edit it
        in the side panel.
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
        aria-label="Category stage"
      >
        {CATEGORY_GROUP_ORDER.map((group) => {
          const active = selectedGroup === group;
          return (
            <button
              key={group}
              type="button"
              role="tab"
              aria-selected={active}
              className={
                active
                  ? 'admin-minigames-tab admin-minigames-tab--active'
                  : 'admin-minigames-tab'
              }
              onClick={() => selectGroup(group)}
            >
              {CATEGORY_GROUP_LABELS[group]}
              <span className="admin-count">{groupCounts[group]}</span>
            </button>
          );
        })}
      </div>

      {!editorOpen && (
        <section ref={pickerRef} className="card">
          <div className="admin-list-card__title-row">
            <h3 className="section-title">
              {CATEGORY_GROUP_LABELS[selectedGroup]} categories
            </h3>
            <span className="admin-count">{groupCategories.length}</span>
          </div>
          <p className="muted punishment-selected-hint">
            Same cards as Home. Click a category to edit it.
          </p>
          <div className="category-grid">
            {groupCategories.map((category) => {
              const count = taskCountByCategory[category.id] ?? 0;
              return (
                <CategoryCard
                  key={category.id}
                  category={category}
                  taskCount={count}
                  completionPercent={0}
                  completedCount={0}
                  isUnlocked
                  onSelect={() => selectCategory(category)}
                  selected={selectedCategoryId === category.id}
                />
              );
            })}
            <button
              type="button"
              className="category-card punishment-category-card punishment-category-card--new"
              style={{ '--cat-color': 'var(--accent)' } as CSSProperties}
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
                  Add to {CATEGORY_GROUP_LABELS[selectedGroup]}
                </p>
              </div>
            </button>
          </div>
          {groupCategories.length === 0 && (
            <p className="muted punishment-selected-hint">
              No categories in {CATEGORY_GROUP_LABELS[selectedGroup]} yet.
              Create one to start adding tasks.
            </p>
          )}
        </section>
      )}

      {editorOpen && (
        <div
          ref={workspaceRef}
          className="admin-categories-workspace admin-categories-workspace--editing"
        >
          <section className="card admin-categories-catalog">
            <div className="page-header__row">
              <div>
                <nav
                  className="admin-tasks-breadcrumb"
                  aria-label="Selected category"
                >
                  <button
                    type="button"
                    className="back-link"
                    onClick={backToGrid}
                  >
                    ← {CATEGORY_GROUP_LABELS[selectedGroup]}
                  </button>
                  <span
                    className="admin-tasks-breadcrumb__sep"
                    aria-hidden="true"
                  >
                    /
                  </span>
                  <h3 className="section-title admin-tasks-breadcrumb__current">
                    {draft.id
                      ? draft.name.trim() || selectedCategory?.name || 'Category'
                      : 'New category'}
                  </h3>
                </nav>
                <p className="muted">
                  {previewTaskCount} {previewTaskCount === 1 ? 'task' : 'tasks'}
                  {unlockAfterName ? ` · Unlocks after ${unlockAfterName}` : ''}
                  {requiredStageLabel
                    ? ` · Join at ${requiredStageLabel}+`
                    : ''}
                </p>
              </div>
            </div>

            <p className="muted admin-punishments-preview-label">Home preview</p>
            <div className="admin-categories-preview">
              <CategoryCard
                category={previewCategory}
                taskCount={previewTaskCount}
                completionPercent={0}
                completedCount={0}
                isUnlocked
                preview
              />
            </div>
            {draft.description.trim() ? (
              <p className="punishment-category-desc muted">
                {draft.description}
              </p>
            ) : (
              <p className="muted punishment-category-empty">No description.</p>
            )}

            {draft.id ? (
              catalogTasks.length === 0 ? (
                <p className="muted punishment-category-empty">
                  No tasks in this category yet. Add them in Admin → Tasks.
                </p>
              ) : (
                <ul className="admin-categories-task-list">
                  {catalogTasks.map((task) => (
                    <li key={task.id}>
                      {task.title}
                      {task.isExamTask ? (
                        <span className="tag admin-categories-task-tag">Exam</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )
            ) : (
              <p className="muted punishment-category-empty">
                Save this category, then add tasks in Admin → Tasks.
              </p>
            )}
          </section>

          <section className="card admin-categories-editor">
            <h3 className="section-title">
              {draft.id ? 'Edit category' : 'New category'}
            </h3>

            <div className={`field${errors.name ? ' field--error' : ''}`}>
              <label htmlFor="cat-name">
                <span>
                  Name{' '}
                  <span className="field__required" aria-hidden="true">
                    *
                  </span>
                </span>
              </label>
              <input
                id="cat-name"
                value={draft.name}
                onChange={(e) => {
                  setDraft({ ...draft, name: e.target.value });
                  if (errors.name) setErrors((p) => ({ ...p, name: '' }));
                }}
              />
              {errors.name && (
                <p className="login-error" role="alert">
                  {errors.name}
                </p>
              )}
            </div>

            <div className="field">
              <label htmlFor="cat-icon">Icon</label>
              <p className="muted field__hint">
                Emoji shown in lists and navigation.
              </p>
              <input
                id="cat-icon"
                value={draft.icon}
                onChange={(e) => setDraft({ ...draft, icon: e.target.value })}
                maxLength={4}
              />
            </div>

            <div className="field">
              <span>Color</span>
              <p className="muted field__hint">
                Pick a preset or use the custom picker.
              </p>
              <div className="color-picker-row">
                <div className="color-swatches" role="group" aria-label="Color presets">
                  {CATEGORY_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className={
                        draft.color === color
                          ? 'color-swatch color-swatch--active'
                          : 'color-swatch'
                      }
                      style={{ background: color }}
                      aria-label={`Color ${color}`}
                      aria-pressed={draft.color === color}
                      onClick={() => setDraft({ ...draft, color })}
                    />
                  ))}
                </div>
                <input
                  type="color"
                  className="color-input-native"
                  aria-label="Custom color"
                  value={draft.color}
                  onChange={(e) =>
                    setDraft({ ...draft, color: e.target.value })
                  }
                />
              </div>
            </div>

            <div className="field">
              <label htmlFor="cat-desc">Description</label>
              <textarea
                id="cat-desc"
                rows={3}
                value={draft.description}
                onChange={(e) =>
                  setDraft({ ...draft, description: e.target.value })
                }
              />
            </div>

            <div className="field">
              <span>Tier group</span>
              <p className="muted field__hint">
                Home section: All appears first; other tiers unlock
                progressively.
              </p>
              <div
                className="chip-row chip-row--scroll"
                role="group"
                aria-label="Category tier group"
              >
                {CATEGORY_GROUP_ORDER.map((group) => (
                  <button
                    key={group}
                    type="button"
                    className={
                      (draft.categoryGroup ?? selectedGroup) === group
                        ? 'chip chip--active'
                        : 'chip'
                    }
                    aria-pressed={
                      (draft.categoryGroup ?? selectedGroup) === group
                    }
                    onClick={() =>
                      setDraft({ ...draft, categoryGroup: group })
                    }
                  >
                    {CATEGORY_GROUP_LABELS[group]}
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <label htmlFor="cat-unlock">Unlock after category</label>
              <p className="muted field__hint">
                Optional: player must 100% complete this category before joining.
              </p>
              <select
                id="cat-unlock"
                aria-label="Unlock after category"
                value={draft.unlockAfterCategoryId ?? ''}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    unlockAfterCategoryId: e.target.value || null,
                  })
                }
              >
                <option value="">None (tier rules only)</option>
                {state.categories
                  .filter((c) => c.id !== draft.id)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.icon} {c.name}
                    </option>
                  ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="cat-stage">Minimum stage to join</label>
              <p className="muted field__hint">
                Leave empty for anyone. Users must reach this stage before they
                can join.
              </p>
              <select
                id="cat-stage"
                aria-label="Required stage to join"
                value={draft.requiredStage ?? ''}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    requiredStage: (e.target.value ||
                      null) as Category['requiredStage'],
                  })
                }
              >
                <option value="">Anyone</option>
                {USER_STAGE_OPTIONS.filter((o) => o.value !== 'any').map(
                  (opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ),
                )}
              </select>
            </div>

            <div className="field">
              <span>Presentation image</span>
              <p className="muted field__hint">
                Optional. Choose a file (max{' '}
                {Math.round(MAX_CATEGORY_IMAGE_BYTES / 1024)} KB) or paste a
                URL. Uploaded to Supabase when you save.
              </p>
              {imageMessage && (
                <p className="login-error" role="alert">
                  {imageMessage}
                </p>
              )}
              <CategoryImagePicker
                idPrefix="cat"
                urlInputId="cat-image"
                previewUrl={imagePreview}
                urlValue={
                  draft.imageUrl?.startsWith('http') ? draft.imageUrl : ''
                }
                onUrlChange={(value) => {
                  setImageMessage('');
                  const trimmed = value.trim();
                  if (trimmed) {
                    setDraft({ ...draft, imageUrl: trimmed });
                  } else {
                    setDraft({
                      ...draft,
                      imageUrl: draft.imageUrl?.startsWith('data:')
                        ? draft.imageUrl
                        : undefined,
                    });
                  }
                }}
                onFileSelect={(dataUrl) => {
                  setImageMessage('');
                  setDraft({ ...draft, imageUrl: dataUrl });
                }}
                onFileError={setImageMessage}
              />
            </div>

            <div className="btn-row admin-form-actions">
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => void submit()}
                disabled={saving}
              >
                {saving
                  ? 'Saving…'
                  : draft.id
                    ? 'Save category'
                    : 'Create category'}
              </button>
              <button type="button" className="btn btn--ghost" onClick={backToGrid}>
                Cancel
              </button>
              {draft.id && (
                <button
                  type="button"
                  className="btn btn--ghost btn--danger-text"
                  onClick={() => void remove(draft.id)}
                >
                  Delete
                </button>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
