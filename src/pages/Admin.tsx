import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type {
  Category,
  ContentTier,
  PatreonMemberTier,
  PatreonStatus,
  Reward,
  RewardTrigger,
  Task,
  TaskFrequency,
  TaskScope,
  Video,
  VideoCategory,
} from '../types';
import {
  fetchAdminProfiles,
  updateProfilePatreon,
  type AdminProfileRow,
} from '../lib/profileDb';
import {
  PATREON_MEMBER_TIER_OPTIONS,
  tierAccessHint,
  VIDEO_ACCESS_CUMULATIVE_NOTE,
  VIDEO_ACCESS_OPTIONS,
} from '../lib/tiers';
import { TierBadge } from '../components/TierBadge';
import {
  formatMb,
  formatVideoSizeError,
  MAX_VIDEO_BYTES,
  MAX_VIDEO_SIZE_LABEL,
} from '../lib/videoStorage';
import { CategoryImagePicker } from '../components/CategoryImagePicker';
import { useAppStore } from '../hooks/useAppStore';
import { getStageLabel, USER_STAGE_OPTIONS, type TaskUserStage } from '../lib/levels';
import { TASK_SCOPE_LABELS, TASK_SCOPE_OPTIONS } from '../lib/taskScope';
import {
  isCategoryImagePreview,
  MAX_CATEGORY_IMAGE_BYTES,
  resolveCategoryImageUrl,
} from '../lib/categoryImage';

const ADMIN_SECTIONS = [
  {
    id: 'categories' as const,
    label: 'Categories',
    icon: '📁',
    hint: 'Icons, colors, images',
  },
  {
    id: 'tasks' as const,
    label: 'Tasks',
    icon: '✓',
    hint: 'Library by category',
  },
  {
    id: 'rewards' as const,
    label: 'Rewards',
    icon: '🏆',
    hint: 'Shop & badges',
  },
  {
    id: 'punishments' as const,
    label: 'Punishments',
    icon: '⚡',
    hint: 'Categories & templates',
  },
  {
    id: 'users' as const,
    label: 'Users',
    icon: '👤',
    hint: 'New accounts',
  },
  {
    id: 'videos' as const,
    label: 'Videos',
    icon: '🎬',
    hint: 'Categories & uploads',
  },
];

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

const FREQUENCIES: { value: TaskFrequency; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'once', label: 'One-time' },
];

type AdminSectionId = (typeof ADMIN_SECTIONS)[number]['id'];

export function Admin() {
  const [section, setSection] = useState<AdminSectionId>('categories');
  const active = ADMIN_SECTIONS.find((s) => s.id === section)!;

  return (
    <div className="page page--admin">
      <header className="page-header">
        <h2>Admin</h2>
        <p className="muted">
          Manage categories, tasks, rewards, punishments, videos, and users.
        </p>
      </header>

      <div className="admin-layout">
        <nav className="admin-nav" aria-label="Admin sections">
          {ADMIN_SECTIONS.map(({ id, label, icon, hint }) => (
            <button
              key={id}
              type="button"
              className={
                section === id
                  ? 'admin-nav-card admin-nav-card--active'
                  : 'admin-nav-card'
              }
              aria-current={section === id ? 'page' : undefined}
              onClick={() => setSection(id)}
            >
              <span className="admin-nav-card__icon" aria-hidden="true">
                {icon}
              </span>
              <span className="admin-nav-card__body">
                <span className="admin-nav-card__label">{label}</span>
                <span className="admin-nav-card__hint">{hint}</span>
              </span>
            </button>
          ))}
        </nav>

        <div
          className="admin-content"
          role="region"
          aria-label={active.label}
        >
          {section === 'categories' && <CategoryAdmin />}
          {section === 'tasks' && <TaskAdmin />}
          {section === 'rewards' && <RewardAdmin />}
          {section === 'punishments' && <PunishmentsAdminLink />}
          {section === 'users' && <UserAdmin />}
          {section === 'videos' && <VideosAdmin />}
        </div>
      </div>

      <div className="btn-row">
        <Link to="/" className="btn btn--ghost btn--block">
          Back to app
        </Link>
      </div>
    </div>
  );
}

function AdminSection({ list, form }: { list?: ReactNode; form: ReactNode }) {
  return (
    <div className="admin-section">
      {list}
      {form}
    </div>
  );
}

function AdminListCard({
  title,
  count,
  intro,
  search,
  onSearchChange,
  filter,
  children,
}: {
  title: string;
  count: number;
  intro?: string;
  search: string;
  onSearchChange: (v: string) => void;
  filter?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="card admin-list-card">
      <header className="admin-list-card__header">
        <div className="admin-list-card__title-row">
          <h3 className="section-title">{title}</h3>
          <span className="admin-count" aria-live="polite">
            {count}
          </span>
        </div>
        {intro && <p className="muted admin-list-card__intro">{intro}</p>}
        <label className="field admin-list-card__search">
          <span className="visually-hidden">Search {title.toLowerCase()}</span>
          <input
            type="search"
            placeholder="Search…"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            aria-label={`Search ${title.toLowerCase()}`}
          />
        </label>
        {filter}
      </header>
      {children}
    </section>
  );
}

function AdminEmpty({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="admin-empty">
      <p className="admin-empty__title">{title}</p>
      <p className="admin-empty__hint muted">{hint}</p>
    </div>
  );
}

function AdminLibraryItem({
  selected,
  title,
  meta,
  onEdit,
  onDelete,
  deleteLabel,
  hideEdit,
}: {
  selected?: boolean;
  title: string;
  meta?: ReactNode;
  onEdit: () => void;
  onDelete: () => void;
  deleteLabel?: string;
  hideEdit?: boolean;
}) {
  const main = (
    <>
      <strong className="admin-library-item__title">{title}</strong>
      {meta && <span className="admin-library-item__meta muted">{meta}</span>}
    </>
  );

  return (
    <li
      className={
        selected
          ? 'admin-library-item admin-library-item--selected'
          : 'admin-library-item'
      }
    >
      {hideEdit ? (
        <div className="admin-library-item__main">{main}</div>
      ) : (
        <button
          type="button"
          className="admin-library-item__main"
          onClick={onEdit}
          aria-pressed={selected}
        >
          {main}
        </button>
      )}
      <div className="admin-library-item__actions">
        {!hideEdit && (
          <button
            type="button"
            className="btn btn--ghost btn--small"
            onClick={onEdit}
          >
            Edit
          </button>
        )}
        <button
          type="button"
          className="btn btn--ghost btn--small btn--danger-text"
          onClick={onDelete}
        >
          {deleteLabel ?? 'Delete'}
        </button>
      </div>
    </li>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  required,
  error,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  required?: boolean;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className={`field${error ? ' field--error' : ''}`}>
      <label htmlFor={htmlFor}>
        <span>
          {label}
          {required && (
            <span className="field__required" aria-hidden="true">
              {' '}
              *
            </span>
          )}
        </span>
      </label>
      {hint && <p className="muted field__hint">{hint}</p>}
      {children}
      {error && (
        <p className="login-error" role="alert">
          {error}
        </p>
      )}
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

function ChipSelect<T extends string | number>({
  label,
  options,
  value,
  onChange,
  scroll,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  scroll?: boolean;
}) {
  return (
    <div
      className={scroll ? 'chip-row chip-row--scroll' : 'chip-row'}
      role="group"
      aria-label={label}
    >
      {options.map((opt) => (
        <button
          key={String(opt.value)}
          type="button"
          className={value === opt.value ? 'chip chip--active' : 'chip'}
          aria-pressed={value === opt.value}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function CategoryChips({
  categories,
  value,
  onChange,
  includeAll,
  disabled,
  label = 'Category',
}: {
  categories: Category[];
  value: string;
  onChange: (categoryId: string) => void;
  includeAll?: boolean;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <div
      className="chip-row chip-row--scroll category-chip-row"
      role="group"
      aria-label={label}
    >
      {includeAll && (
        <button
          type="button"
          className={value === '' ? 'chip chip--active' : 'chip'}
          aria-pressed={value === ''}
          disabled={disabled}
          onClick={() => onChange('')}
        >
          All categories
        </button>
      )}
      {categories.map((c) => (
        <button
          key={c.id}
          type="button"
          className={
            value === c.id
              ? 'chip chip--active category-chip'
              : 'chip category-chip'
          }
          style={{ '--chip-accent': c.color } as CSSProperties}
          aria-pressed={value === c.id}
          disabled={disabled}
          onClick={() => onChange(c.id)}
        >
          <span className="category-chip__icon" aria-hidden="true">
            {c.icon}
          </span>
          <span className="category-chip__name">{c.name}</span>
        </button>
      ))}
    </div>
  );
}

function ChoiceRow<T extends string>({
  label,
  name,
  options,
  value,
  onChange,
}: {
  label: string;
  name: string;
  options: { value: T; label: string; hint?: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="choice-list" role="radiogroup" aria-label={label}>
      {options.map((opt) => (
        <label key={opt.value} className="choice">
          <input
            type="radio"
            name={name}
            value={opt.value}
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
          />
          <span className="choice__label">{opt.label}</span>
          {opt.hint && <span className="choice__hint muted">{opt.hint}</span>}
        </label>
      ))}
    </div>
  );
}

function FormActions({
  editing,
  entityLabel,
  onSubmit,
  onClear,
  disabled,
}: {
  editing: boolean;
  entityLabel: string;
  onSubmit: () => void;
  onClear: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="btn-row admin-form-actions">
      <button
        type="button"
        className="btn btn--primary"
        onClick={onSubmit}
        disabled={disabled}
      >
        {editing ? `Save ${entityLabel}` : `Create ${entityLabel}`}
      </button>
      <button type="button" className="btn btn--ghost" onClick={onClear}>
        {editing ? 'Cancel' : 'Clear'}
      </button>
    </div>
  );
}

function StatusMessage({
  message,
  variant,
}: {
  message: string;
  variant?: 'ok' | 'err';
}) {
  if (!message) return null;
  if (variant === 'err') {
    return (
      <p className="login-error" role="alert">
        {message}
      </p>
    );
  }
  return (
    <p className="notice admin-notice" role="status">
      {message}
    </p>
  );
}

function emptyCategoryDraft(): Category {
  return {
    id: '',
    name: '',
    icon: '✨',
    color: '#f9a8d4',
    description: '',
    imageUrl: undefined,
    requiredStage: null,
  };
}

function CategoryAdmin() {
  const { state, addCategory, updateCategory, deleteCategory } = useAppStore();
  const [draft, setDraft] = useState<Category>(emptyCategoryDraft());
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('');
  const [imageMessage, setImageMessage] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return state.categories;
    return state.categories.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q),
    );
  }, [state.categories, search]);

  const validate = () => {
    const next: Record<string, string> = {};
    if (!draft.name.trim()) next.name = 'Name is required.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const clearForm = () => {
    setDraft(emptyCategoryDraft());
    setErrors({});
    setImageMessage('');
  };

  const submit = async () => {
    if (!validate()) return;
    setMessage('');
    const categoryId = draft.id || crypto.randomUUID();
    const imageResult = await resolveCategoryImageUrl(
      categoryId,
      draft.imageUrl,
      'category-image.jpg',
    );
    if (!imageResult.ok) {
      setImageMessage(imageResult.error);
      return;
    }
    const cat: Category = {
      ...draft,
      id: categoryId,
      imageUrl: imageResult.url,
    };
    const result = draft.id ? await updateCategory(cat) : await addCategory(cat);
    if (!result.ok) {
      setImageMessage(result.error);
      return;
    }
    clearForm();
    setMessage('Category saved.');
  };

  const remove = async (id: string) => {
    if (!window.confirm('Delete this category and all its tasks?')) return;
    const result = await deleteCategory(id);
    if (!result.ok) {
      setImageMessage(result.error);
      return;
    }
    if (draft.id === id) clearForm();
    setMessage('Category deleted.');
  };

  const imagePreview = isCategoryImagePreview(draft.imageUrl) ? draft.imageUrl : null;

  const list = (
    <AdminListCard
      title="Categories"
      count={filtered.length}
      search={search}
      onSearchChange={setSearch}
    >
      {filtered.length === 0 ? (
        <AdminEmpty
          title={search ? 'No matches' : 'No categories yet'}
          hint={
            search
              ? 'Try a different search term.'
              : 'Use the form below to create your first category.'
          }
        />
      ) : (
        <ul className="admin-library">
          {filtered.map((c) => (
            <AdminLibraryItem
              key={c.id}
              selected={draft.id === c.id}
              title={`${c.icon} ${c.name}`}
              meta={c.description || 'No description'}
              onEdit={() => {
                setDraft(c);
                setErrors({});
                setImageMessage('');
              }}
              onDelete={() => remove(c.id)}
            />
          ))}
        </ul>
      )}
    </AdminListCard>
  );

  const form = (
    <section className="card">
      <h3 className="section-title">
        {draft.id ? 'Edit category' : 'New category'}
      </h3>
      <StatusMessage message={message} />

      <FormBlock title="Identity">
        <Field label="Name" htmlFor="cat-name" required error={errors.name}>
          <input
            id="cat-name"
            value={draft.name}
            onChange={(e) => {
              setDraft({ ...draft, name: e.target.value });
              if (errors.name) setErrors((p) => ({ ...p, name: '' }));
            }}
          />
        </Field>
        <Field label="Icon" htmlFor="cat-icon" hint="Emoji shown in lists and navigation.">
          <input
            id="cat-icon"
            value={draft.icon}
            onChange={(e) => setDraft({ ...draft, icon: e.target.value })}
            maxLength={4}
          />
        </Field>
        <Field label="Color" hint="Pick a preset or use the custom picker.">
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
              onChange={(e) => setDraft({ ...draft, color: e.target.value })}
            />
          </div>
        </Field>
      </FormBlock>

      <FormBlock title="Details">
        <Field label="Description" htmlFor="cat-desc">
          <textarea
            id="cat-desc"
            rows={3}
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          />
        </Field>
        <Field
          label="Minimum stage to join"
          hint="Leave empty for anyone. Users must reach this stage before they can join."
        >
          <select
            aria-label="Required stage to join"
            value={draft.requiredStage ?? ''}
            onChange={(e) =>
              setDraft({
                ...draft,
                requiredStage: (e.target.value || null) as Category['requiredStage'],
              })
            }
          >
            <option value="">Anyone</option>
            {USER_STAGE_OPTIONS.filter((o) => o.value !== 'any').map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Presentation image"
          hint={`Optional. Choose a file (max ${Math.round(MAX_CATEGORY_IMAGE_BYTES / 1024)} KB) or paste a URL. Uploaded to Supabase when you save.`}
        >
          {imageMessage && <StatusMessage message={imageMessage} variant="err" />}
          <CategoryImagePicker
            idPrefix="cat"
            urlInputId="cat-image"
            previewUrl={imagePreview}
            urlValue={draft.imageUrl?.startsWith('http') ? draft.imageUrl : ''}
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
        </Field>
      </FormBlock>

      <FormActions
        editing={!!draft.id}
        entityLabel="category"
        onSubmit={submit}
        onClear={() => {
          clearForm();
          setMessage('');
        }}
      />
    </section>
  );

  return <AdminSection list={list} form={form} />;
}

function emptyTaskDraft(categoryId: string): Task {
  return {
    id: '',
    title: '',
    description: '',
    taskScope: 'category',
    categoryId,
    assignedUserId: null,
    userStage: 'any',
    xpReward: 10,
    frequency: 'daily',
    malusPointsOnFail: 0,
  };
}

function TaskAdmin() {
  const { state, addTask, updateTask, deleteTask } = useAppStore();
  const defaultCat = state.categories[0]?.id ?? '';
  const [draft, setDraft] = useState<Task>(() => emptyTaskDraft(defaultCat));
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [profiles, setProfiles] = useState<AdminProfileRow[]>([]);

  useEffect(() => {
    void (async () => {
      const result = await fetchAdminProfiles();
      if (result.ok) setProfiles(result.profiles);
    })();
  }, []);

  const taskScope = draft.taskScope ?? 'category';

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return state.tasks.filter((t) => {
      if (filterCategory && t.categoryId !== filterCategory) return false;
      if (!q) return true;
      return (
        t.title.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q)
      );
    });
  }, [state.tasks, search, filterCategory]);

  const categoryName = (id: string | null | undefined) =>
    id ? state.categories.find((c) => c.id === id)?.name ?? 'Unknown' : '—';

  const profileName = (id: string | null | undefined) =>
    id ? profiles.find((p) => p.id === id)?.username ?? 'Unknown user' : '—';

  const resolvedCategoryId =
    taskScope === 'category'
      ? draft.categoryId || state.categories[0]?.id || ''
      : null;

  const validate = () => {
    const next: Record<string, string> = {};
    if (!draft.title.trim()) next.title = 'Title is required.';
    if (taskScope === 'category' && !resolvedCategoryId) {
      next.categoryId = 'Select a category.';
    }
    if (taskScope === 'custom' && !draft.assignedUserId) {
      next.assignedUserId = 'Select a user.';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const clearForm = () => {
    setDraft(emptyTaskDraft(state.categories[0]?.id ?? ''));
    setErrors({});
  };

  const submit = async () => {
    if (!validate()) return;
    setMessage('');
    const task: Task = {
      ...draft,
      id: draft.id || '',
      taskScope,
      categoryId: taskScope === 'category' ? resolvedCategoryId : null,
      assignedUserId: taskScope === 'custom' ? draft.assignedUserId ?? null : null,
    };
    const result = draft.id ? await updateTask(task) : await addTask(task);
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    clearForm();
    setMessage('Task saved.');
  };

  const remove = async (id: string) => {
    if (!window.confirm('Delete this task?')) return;
    const result = await deleteTask(id);
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    if (draft.id === id) clearForm();
    setMessage('Task deleted.');
  };

  const list = (
    <AdminListCard
      title="Tasks"
      count={filtered.length}
      search={search}
      onSearchChange={setSearch}
      filter={
        state.categories.length > 0 ? (
          <CategoryChips
            label="Filter by category"
            categories={state.categories}
            value={filterCategory}
            onChange={setFilterCategory}
            includeAll
            disabled={state.categories.length === 0}
          />
        ) : null
      }
    >
      {state.categories.length === 0 && (
        <StatusMessage
          message="Create at least one category before category-scoped tasks can be saved."
          variant="err"
        />
      )}
      {filtered.length === 0 ? (
        <AdminEmpty
          title={search || filterCategory ? 'No matches' : 'No tasks yet'}
          hint={
            search || filterCategory
              ? 'Adjust search or category filter.'
              : 'Use the form below to add a task to the library.'
          }
        />
      ) : (
        <ul className="admin-library">
          {filtered.map((t) => (
            <AdminLibraryItem
              key={t.id}
              selected={draft.id === t.id}
              title={t.title}
              meta={`${TASK_SCOPE_LABELS[t.taskScope ?? 'category']}${(t.taskScope ?? 'category') === 'category' ? ` · ${categoryName(t.categoryId)}` : ''}${(t.taskScope ?? 'category') === 'custom' ? ` · ${profileName(t.assignedUserId)}` : ''} · ${getStageLabel(t.userStage ?? 'any')} · ${t.xpReward} XP · malus ${t.malusPointsOnFail ?? 0} · ${t.frequency}${t.timerSeconds ? ` · timer ${t.timerSeconds}s` : ''}${t.durationSeconds ? ` · duration ${t.durationSeconds}s` : ''}${t.openUrl ? ' · URL' : ''}${t.requiredPhrase ? ` · phrase${(t.requiredPhraseRepeatCount ?? 1) > 1 ? ` ×${t.requiredPhraseRepeatCount}` : ''}` : ''}`}
              onEdit={() => {
                setDraft(t);
                setErrors({});
              }}
              onDelete={() => remove(t.id)}
            />
          ))}
        </ul>
      )}
    </AdminListCard>
  );

  const form = (
    <section className="card">
      <h3 className="section-title">{draft.id ? 'Edit task' : 'New task'}</h3>
      <StatusMessage message={message} />

      <FormBlock title="Basics">
        <Field
          label="Task type"
          hint="Category tasks appear on category pages. Daily tasks appear on the home daily plan. Custom tasks are assigned to one user."
        >
          <ChipSelect
            label="Task type"
            options={TASK_SCOPE_OPTIONS}
            value={taskScope}
            onChange={(scope) => {
              const nextScope = scope as TaskScope;
              setDraft({
                ...draft,
                taskScope: nextScope,
                categoryId:
                  nextScope === 'category'
                    ? draft.categoryId || state.categories[0]?.id || ''
                    : null,
                assignedUserId:
                  nextScope === 'custom' ? draft.assignedUserId ?? null : null,
              });
              setErrors({});
            }}
          />
        </Field>
        <Field label="Title" htmlFor="task-title" required error={errors.title}>
          <input
            id="task-title"
            value={draft.title}
            onChange={(e) => {
              setDraft({ ...draft, title: e.target.value });
              if (errors.title) setErrors((p) => ({ ...p, title: '' }));
            }}
          />
        </Field>
        <Field label="Description" htmlFor="task-desc">
          <textarea
            id="task-desc"
            rows={3}
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          />
        </Field>
        {taskScope === 'category' && (
          <Field
            label="Category"
            required
            error={errors.categoryId}
            hint={
              state.categories.length === 0
                ? 'Create a category first.'
                : 'Scroll and tap a category to assign this task.'
            }
          >
            {state.categories.length === 0 ? (
              <p className="muted">No categories available.</p>
            ) : (
              <CategoryChips
                label="Task category"
                categories={state.categories}
                value={resolvedCategoryId ?? ''}
                disabled={state.categories.length === 0}
                onChange={(categoryId) => {
                  setDraft({ ...draft, categoryId });
                  if (errors.categoryId) setErrors((p) => ({ ...p, categoryId: '' }));
                }}
              />
            )}
          </Field>
        )}
        {taskScope === 'custom' && (
          <Field
            label="Assigned user"
            required
            error={errors.assignedUserId}
            hint="This task appears only on that user's home daily plan."
          >
            {profiles.length === 0 ? (
              <p className="muted">No users found.</p>
            ) : (
              <ChipSelect
                label="Assigned user"
                scroll
                options={profiles.map((p) => ({
                  value: p.id,
                  label: `${p.username} (${p.role})`,
                }))}
                value={draft.assignedUserId ?? ''}
                onChange={(userId) => {
                  setDraft({ ...draft, assignedUserId: userId || null });
                  if (errors.assignedUserId) {
                    setErrors((p) => ({ ...p, assignedUserId: '' }));
                  }
                }}
              />
            )}
          </Field>
        )}
      </FormBlock>

      <FormBlock title="Rules">
        <Field
          label="User stage"
          hint="Who this task is for. Daily plans include tasks for the user's current stage or All users."
        >
          <ChipSelect
            label="User stage"
            scroll
            options={USER_STAGE_OPTIONS.map((opt) => ({
              value: opt.value,
              label: opt.label,
            }))}
            value={draft.userStage ?? 'any'}
            onChange={(userStage) =>
              setDraft({ ...draft, userStage: userStage as TaskUserStage })
            }
          />
        </Field>
        <Field label="XP reward" htmlFor="task-xp">
          <input
            id="task-xp"
            type="number"
            min={5}
            value={draft.xpReward}
            onChange={(e) =>
              setDraft({ ...draft, xpReward: Number(e.target.value) })
            }
          />
        </Field>
        <Field
          label="Malus if not completed"
          htmlFor="task-malus"
          hint="Added at day end if the task is on the plan (daily/custom) or was started (category)."
        >
          <input
            id="task-malus"
            type="number"
            min={0}
            value={draft.malusPointsOnFail ?? 0}
            onChange={(e) =>
              setDraft({
                ...draft,
                malusPointsOnFail: Number(e.target.value),
              })
            }
          />
        </Field>
        <Field label="Frequency">
          <ChoiceRow
            label="Task frequency"
            name="task-frequency"
            options={FREQUENCIES}
            value={draft.frequency}
            onChange={(frequency) => setDraft({ ...draft, frequency })}
          />
        </Field>
        <Field
          label="Duration (minutes)"
          htmlFor="task-duration"
          hint="Optional. For timed activities."
        >
          <input
            id="task-duration"
            type="number"
            min={1}
            placeholder="Optional"
            value={draft.durationMinutes ?? ''}
            onChange={(e) =>
              setDraft({
                ...draft,
                durationMinutes: e.target.value
                  ? Number(e.target.value)
                  : undefined,
              })
            }
          />
        </Field>
      </FormBlock>

      <FormBlock title="Completion requirements">
        <p className="muted" style={{ marginTop: 0 }}>
          Optional. Players must satisfy all configured requirements before marking
          complete.
        </p>
        <Field
          label="Timer (resets on leave)"
          hint="Player clicks Start timer. Countdown resets if they leave this page before completing. Runs while the tab is hidden."
        >
          <div className="form-inline">
            <input
              type="number"
              min={0}
              placeholder="Min"
              aria-label="Timer minutes"
              value={
                draft.timerSeconds != null
                  ? Math.floor(draft.timerSeconds / 60)
                  : ''
              }
              onChange={(e) => {
                const mins = e.target.value ? Number(e.target.value) : 0;
                const secs =
                  draft.timerSeconds != null ? draft.timerSeconds % 60 : 0;
                const total = mins * 60 + secs;
                setDraft({
                  ...draft,
                  timerSeconds: total > 0 ? total : undefined,
                });
              }}
            />
            <input
              type="number"
              min={0}
              max={59}
              placeholder="Sec"
              aria-label="Timer seconds"
              value={
                draft.timerSeconds != null ? draft.timerSeconds % 60 : ''
              }
              onChange={(e) => {
                const secs = e.target.value ? Number(e.target.value) : 0;
                const mins =
                  draft.timerSeconds != null
                    ? Math.floor(draft.timerSeconds / 60)
                    : 0;
                const total = mins * 60 + secs;
                setDraft({
                  ...draft,
                  timerSeconds: total > 0 ? total : undefined,
                });
              }}
            />
          </div>
        </Field>
        <Field
          label="Duration (persists)"
          hint="Player clicks Start duration. Countdown continues after closing the browser until it finishes or the task is completed."
        >
          <div className="form-inline">
            <input
              type="number"
              min={0}
              placeholder="Min"
              aria-label="Duration minutes"
              value={
                draft.durationSeconds != null
                  ? Math.floor(draft.durationSeconds / 60)
                  : ''
              }
              onChange={(e) => {
                const mins = e.target.value ? Number(e.target.value) : 0;
                const secs =
                  draft.durationSeconds != null ? draft.durationSeconds % 60 : 0;
                const total = mins * 60 + secs;
                setDraft({
                  ...draft,
                  durationSeconds: total > 0 ? total : undefined,
                });
              }}
            />
            <input
              type="number"
              min={0}
              max={59}
              placeholder="Sec"
              aria-label="Duration seconds"
              value={
                draft.durationSeconds != null ? draft.durationSeconds % 60 : ''
              }
              onChange={(e) => {
                const secs = e.target.value ? Number(e.target.value) : 0;
                const mins =
                  draft.durationSeconds != null
                    ? Math.floor(draft.durationSeconds / 60)
                    : 0;
                const total = mins * 60 + secs;
                setDraft({
                  ...draft,
                  durationSeconds: total > 0 ? total : undefined,
                });
              }}
            />
          </div>
        </Field>
        <Field
          label="Page URL"
          htmlFor="task-open-url"
          hint="Player must open this link before completing."
        >
          <input
            id="task-open-url"
            type="url"
            placeholder="https://…"
            value={draft.openUrl ?? ''}
            onChange={(e) =>
              setDraft({
                ...draft,
                openUrl: e.target.value.trim() || undefined,
              })
            }
          />
        </Field>
        <Field
          label="Required phrase"
          htmlFor="task-phrase"
          hint="Exact match (case-sensitive). Leading and trailing spaces are ignored."
        >
          <input
            id="task-phrase"
            value={draft.requiredPhrase ?? ''}
            onChange={(e) =>
              setDraft({
                ...draft,
                requiredPhrase: e.target.value || undefined,
              })
            }
            placeholder="Phrase to type"
          />
        </Field>
        <Field
          label="Times to write"
          htmlFor="task-phrase-repeat"
          hint="How many times the player must type the phrase correctly (min 1)."
        >
          <input
            id="task-phrase-repeat"
            type="number"
            min={1}
            value={draft.requiredPhraseRepeatCount ?? 1}
            onChange={(e) =>
              setDraft({
                ...draft,
                requiredPhraseRepeatCount: Math.max(1, Number(e.target.value) || 1),
              })
            }
          />
        </Field>
      </FormBlock>

      <FormActions
        editing={!!draft.id}
        entityLabel="task"
        onSubmit={submit}
        disabled={state.categories.length === 0}
        onClear={() => {
          clearForm();
          setMessage('');
        }}
      />
    </section>
  );

  return <AdminSection list={list} form={form} />;
}

type RewardKind = 'shop' | 'badge';
type BadgeUnlock = 'streak' | 'level';

function emptyRewardDraft(): Reward {
  return {
    id: '',
    title: '',
    description: '',
    cost: 50,
  };
}

function RewardAdmin() {
  const { state, addReward, updateReward, deleteReward } = useAppStore();
  const [draft, setDraft] = useState<Reward>(emptyRewardDraft());
  const [kind, setKind] = useState<RewardKind>('shop');
  const [badgeUnlock, setBadgeUnlock] = useState<BadgeUnlock>('streak');
  const [streakDays, setStreakDays] = useState(7);
  const [levelTarget, setLevelTarget] = useState(2);
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return state.rewards;
    return state.rewards.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q),
    );
  }, [state.rewards, search]);

  const loadDraft = (reward: Reward) => {
    setDraft(reward);
    if (reward.autoTrigger?.type === 'streak') {
      setKind('badge');
      setBadgeUnlock('streak');
      setStreakDays(reward.autoTrigger.days);
    } else if (reward.autoTrigger?.type === 'level') {
      setKind('badge');
      setBadgeUnlock('level');
      setLevelTarget(reward.autoTrigger.level);
    } else {
      setKind('shop');
    }
    setErrors({});
  };

  const buildReward = (): Reward => {
    const base: Reward = {
      id: draft.id || '',
      title: draft.title.trim(),
      description: draft.description.trim(),
    };
    if (kind === 'shop') {
      return { ...base, cost: draft.cost ?? 50, autoTrigger: undefined };
    }
    const trigger: RewardTrigger =
      badgeUnlock === 'streak'
        ? { type: 'streak', days: streakDays }
        : { type: 'level', level: levelTarget };
    return { ...base, cost: undefined, autoTrigger: trigger };
  };

  const validate = () => {
    const next: Record<string, string> = {};
    if (!draft.title.trim()) next.title = 'Title is required.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const clearForm = () => {
    setDraft(emptyRewardDraft());
    setKind('shop');
    setBadgeUnlock('streak');
    setStreakDays(7);
    setLevelTarget(2);
    setErrors({});
  };

  const submit = async () => {
    if (!validate()) return;
    setMessage('');
    const reward = { ...buildReward(), id: draft.id || '' };
    const result = draft.id ? await updateReward(reward) : await addReward(reward);
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    clearForm();
    setMessage('Reward saved.');
  };

  const remove = async (id: string) => {
    if (!window.confirm('Delete this reward from the catalog?')) return;
    const result = await deleteReward(id);
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    if (draft.id === id) clearForm();
    setMessage('Reward deleted.');
  };

  const rewardMeta = (r: Reward) => {
    if (r.cost != null) return `${r.cost} points · Shop`;
    if (r.autoTrigger?.type === 'streak')
      return `Badge · ${r.autoTrigger.days}-day streak`;
    if (r.autoTrigger?.type === 'level')
      return `Badge · Level ${r.autoTrigger.level}`;
    return 'Badge';
  };

  const list = (
    <AdminListCard
      title="Rewards"
      count={filtered.length}
      intro="Shop rewards cost points; badges unlock from streaks or levels."
      search={search}
      onSearchChange={setSearch}
    >
      {filtered.length === 0 ? (
        <AdminEmpty
          title={search ? 'No matches' : 'No rewards yet'}
          hint={
            search
              ? 'Try a different search term.'
              : 'Create shop items or automatic badges in the form below.'
          }
        />
      ) : (
        <ul className="admin-library">
          {filtered.map((r) => (
            <AdminLibraryItem
              key={r.id}
              selected={draft.id === r.id}
              title={r.title}
              meta={rewardMeta(r)}
              onEdit={() => loadDraft(r)}
              onDelete={() => remove(r.id)}
            />
          ))}
        </ul>
      )}
    </AdminListCard>
  );

  const form = (
    <section className="card">
      <h3 className="section-title">{draft.id ? 'Edit reward' : 'New reward'}</h3>
      <StatusMessage message={message} />

      <FormBlock title="Basics">
        <Field label="Title" htmlFor="reward-title" required error={errors.title}>
          <input
            id="reward-title"
            value={draft.title}
            onChange={(e) => {
              setDraft({ ...draft, title: e.target.value });
              if (errors.title) setErrors((p) => ({ ...p, title: '' }));
            }}
          />
        </Field>
        <Field label="Description" htmlFor="reward-desc">
          <textarea
            id="reward-desc"
            rows={3}
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          />
        </Field>
      </FormBlock>

      <FormBlock title="Type">
        <Field label="Reward type">
          <ChoiceRow
            label="Reward type"
            name="reward-kind"
            options={[
              { value: 'shop' as const, label: 'Shop', hint: 'Costs points' },
              {
                value: 'badge' as const,
                label: 'Badge',
                hint: 'Unlocks automatically',
              },
            ]}
            value={kind}
            onChange={setKind}
          />
        </Field>
        {kind === 'shop' ? (
          <Field label="Point cost" htmlFor="reward-cost">
            <input
              id="reward-cost"
              type="number"
              min={1}
              value={draft.cost ?? 50}
              onChange={(e) =>
                setDraft({ ...draft, cost: Number(e.target.value) })
              }
            />
          </Field>
        ) : (
          <>
            <Field label="Unlock condition">
              <ChoiceRow
                label="Badge unlock"
                name="badge-unlock"
                options={[
                  { value: 'streak' as const, label: 'Streak' },
                  { value: 'level' as const, label: 'Level' },
                ]}
                value={badgeUnlock}
                onChange={setBadgeUnlock}
              />
            </Field>
            {badgeUnlock === 'streak' ? (
              <Field label="Streak days" htmlFor="reward-streak">
                <input
                  id="reward-streak"
                  type="number"
                  min={1}
                  value={streakDays}
                  onChange={(e) => setStreakDays(Number(e.target.value))}
                />
              </Field>
            ) : (
              <Field label="Target level">
                <input
                  id="reward-level"
                  type="number"
                  min={1}
                  value={levelTarget}
                  onChange={(e) => setLevelTarget(Number(e.target.value) || 1)}
                />
              </Field>
            )}
          </>
        )}
      </FormBlock>

      <FormActions
        editing={!!draft.id}
        entityLabel="reward"
        onSubmit={submit}
        onClear={() => {
          clearForm();
          setMessage('');
        }}
      />
    </section>
  );

  return <AdminSection list={list} form={form} />;
}

function PunishmentsAdminLink() {
  const { state } = useAppStore();
  const categoryCount = state.punishmentCategories.length;
  const templateCount = state.punishmentTemplates.length;

  return (
    <section className="card">
      <h3 className="section-title">Punishments catalog</h3>
      <p className="muted">
        Manage punishment categories under Easy, Medium, and Hard, and add
        punishments inside each category on the Punishments page.
      </p>
      <p className="muted">
        {categoryCount} categor{categoryCount === 1 ? 'y' : 'ies'} · {templateCount}{' '}
        punishment{templateCount === 1 ? '' : 's'}
      </p>
      <div className="btn-row">
        <Link to="/punishments?manage=1" className="btn btn--primary">
          Open punishments manager
        </Link>
      </div>
    </section>
  );
}

function UserAdmin() {
  const { createAppUser } = useAppStore();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [profiles, setProfiles] = useState<AdminProfileRow[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(true);
  const [profilesError, setProfilesError] = useState('');
  const [tierMessage, setTierMessage] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [editTier, setEditTier] = useState<PatreonMemberTier | ''>('');
  const [editStatus, setEditStatus] = useState<PatreonStatus>('none');

  const loadProfiles = async () => {
    setProfilesLoading(true);
    setProfilesError('');
    const result = await fetchAdminProfiles();
    setProfilesLoading(false);
    if (!result.ok) {
      setProfilesError(result.error);
      return;
    }
    setProfiles(result.profiles);
  };

  useEffect(() => {
    void loadProfiles();
  }, []);

  const submit = async () => {
    setError('');
    setMessage('');
    const result = await createAppUser(username, password, 'user');
    if (result.ok) {
      setMessage(`User "${username.trim()}" created. They can sign in with ${username.includes('@') ? username.trim() : `${username.trim()}@local.app`}.`);
      setUsername('');
      setPassword('');
      void loadProfiles();
    } else {
      setError(result.error);
    }
  };

  const selectUserForTier = (row: AdminProfileRow) => {
    setSelectedUserId(row.id);
    setEditTier(row.patreonTier ?? '');
    setEditStatus(row.patreonStatus);
    setTierMessage('');
  };

  const savePatreonTier = async () => {
    if (!selectedUserId) return;
    setTierMessage('');
    const tier = editTier === '' ? null : editTier;
    const status: PatreonStatus =
      tier != null ? 'active' : editStatus === 'active' ? 'none' : editStatus;
    const result = await updateProfilePatreon(
      selectedUserId,
      tier,
      tier != null ? 'active' : status,
    );
    if (!result.ok) {
      setTierMessage(result.error);
      return;
    }
    setTierMessage('Patreon tier saved.');
    void loadProfiles();
  };

  const list = (
    <AdminListCard
      title="Users & Patreon tiers"
      count={profiles.length}
      intro="Assign Sweetie / Princess / Slut manually until OAuth is live. Set status to Active for tier access."
      search=""
      onSearchChange={() => {}}
    >
      {profilesLoading && <p className="muted">Loading users…</p>}
      <StatusMessage message={profilesError} variant="err" />
      {!profilesLoading && profiles.length === 0 && (
        <AdminEmpty title="No users" hint="Create a user below or in Supabase Auth." />
      )}
      <ul className="admin-library">
        {profiles.map((p) => (
          <AdminLibraryItem
            key={p.id}
            selected={selectedUserId === p.id}
            title={p.username}
            meta={`${p.role} · Patreon: ${p.patreonTier ?? 'none'} (${p.patreonStatus})`}
            onEdit={() => selectUserForTier(p)}
            onDelete={() =>
              window.alert('Remove users from Supabase Dashboard → Authentication.')
            }
            deleteLabel="—"
          />
        ))}
      </ul>
    </AdminListCard>
  );

  const form = (
    <>
      <section className="card">
        <h3 className="section-title">Manual Patreon tier</h3>
        <p className="muted">
          Until Patreon OAuth is connected, set each user&apos;s membership tier here.
          They must sign out and back in (or refresh) to see updated video access.
        </p>
        <StatusMessage message={tierMessage} />
        {!selectedUserId ? (
          <p className="muted">Select a user from the list to assign a tier.</p>
        ) : (
          <>
            <Field label="Patreon tier">
              <ChipSelect
                label="Patreon tier"
                options={PATREON_MEMBER_TIER_OPTIONS.map((o) => ({
                  value: o.value,
                  label: o.label,
                }))}
                value={editTier}
                onChange={(v) => {
                  setEditTier(v);
                  if (v) setEditStatus('active');
                }}
              />
            </Field>
            <div className="btn-row">
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => void savePatreonTier()}
              >
                Save Patreon tier
              </button>
            </div>
          </>
        )}
      </section>

      <section className="card">
        <h3 className="section-title">New user</h3>
        <p className="muted">
          Create regular user accounts. For admins, use Supabase Dashboard →
          Authentication, then set <code>profiles.role</code> to{' '}
          <code>admin</code>.
        </p>
        <StatusMessage message={error} variant="err" />
        <StatusMessage message={message} />

        <FormBlock title="Account">
          <Field label="Username" htmlFor="user-name" required>
            <input
              id="user-name"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </Field>
          <Field
            label="Password"
            htmlFor="user-pass"
            hint="At least 6 characters."
            required
          >
            <input
              id="user-pass"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
        </FormBlock>

        <FormActions
          editing={false}
          entityLabel="user"
          onSubmit={submit}
          onClear={() => {
            setUsername('');
            setPassword('');
            setMessage('');
            setError('');
          }}
        />
      </section>
    </>
  );

  return <AdminSection list={list} form={form} />;
}

function emptyVideoCategoryDraft(): VideoCategory {
  return {
    id: '',
    name: '',
    description: '',
    color: '#c084fc',
    icon: '🎬',
  };
}

function VideoCategoryAdmin() {
  const { state, addVideoCategory, updateVideoCategory, deleteVideoCategory } =
    useAppStore();
  const [draft, setDraft] = useState<VideoCategory>(emptyVideoCategoryDraft());
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return state.videoCategories;
    return state.videoCategories.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.description ?? '').toLowerCase().includes(q),
    );
  }, [state.videoCategories, search]);

  const validate = () => {
    const next: Record<string, string> = {};
    if (!draft.name.trim()) next.name = 'Name is required.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const clearForm = () => {
    setDraft(emptyVideoCategoryDraft());
    setErrors({});
  };

  const submit = async () => {
    if (!validate()) return;
    setMessage('');
    const cat = { ...draft, id: draft.id || '' };
    const result = draft.id ? await updateVideoCategory(cat) : await addVideoCategory(cat);
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    clearForm();
    setMessage('Video category saved.');
  };

  const remove = async (id: string) => {
    if (!window.confirm('Delete this category and all its videos?')) return;
    const result = await deleteVideoCategory(id);
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    if (draft.id === id) clearForm();
    setMessage('Video category deleted.');
  };

  const list = (
    <AdminListCard
      title="Video categories"
      count={filtered.length}
      search={search}
      onSearchChange={setSearch}
    >
      {filtered.length === 0 ? (
        <AdminEmpty
          title={search ? 'No matches' : 'No video categories yet'}
          hint={
            search
              ? 'Try a different search term.'
              : 'Use the form below to create your first video category.'
          }
        />
      ) : (
        <ul className="admin-library">
          {filtered.map((c) => (
            <AdminLibraryItem
              key={c.id}
              selected={draft.id === c.id}
              title={`${c.icon ?? '🎬'} ${c.name}`}
              meta={c.description || 'No description'}
              onEdit={() => {
                setDraft(c);
                setErrors({});
              }}
              onDelete={() => remove(c.id)}
            />
          ))}
        </ul>
      )}
    </AdminListCard>
  );

  const form = (
    <section className="card">
      <h3 className="section-title">
        {draft.id ? 'Edit video category' : 'New video category'}
      </h3>
      <StatusMessage message={message} />

      <FormBlock title="Identity">
        <Field label="Name" htmlFor="vcat-name" required error={errors.name}>
          <input
            id="vcat-name"
            value={draft.name}
            onChange={(e) => {
              setDraft({ ...draft, name: e.target.value });
              if (errors.name) setErrors((p) => ({ ...p, name: '' }));
            }}
          />
        </Field>
        <Field label="Icon" htmlFor="vcat-icon" hint="Emoji shown on category cards.">
          <input
            id="vcat-icon"
            value={draft.icon ?? ''}
            onChange={(e) => setDraft({ ...draft, icon: e.target.value })}
            maxLength={4}
          />
        </Field>
        <Field label="Color" hint="Accent color for category cards.">
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
                  onClick={() => setDraft({ ...draft, color })}
                />
              ))}
            </div>
            <input
              type="color"
              value={draft.color ?? '#c084fc'}
              onChange={(e) => setDraft({ ...draft, color: e.target.value })}
              aria-label="Custom color"
            />
          </div>
        </Field>
        <Field label="Description" htmlFor="vcat-desc">
          <textarea
            id="vcat-desc"
            rows={2}
            value={draft.description ?? ''}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          />
        </Field>
        <Field
          label="Who can watch? (category default)"
          hint={`Optional default for videos in this category. ${VIDEO_ACCESS_CUMULATIVE_NOTE}`}
        >
          <ChipSelect
            label="Category default access"
            options={[
              { value: '' as const, label: 'Public (everyone)' },
              ...VIDEO_ACCESS_OPTIONS.filter((o) => o.value !== 'public'),
            ]}
            value={draft.requiredTier ?? ''}
            onChange={(v) =>
              setDraft({
                ...draft,
                requiredTier: v === '' ? undefined : v,
              })
            }
          />
        </Field>
      </FormBlock>

      <FormActions
        editing={!!draft.id}
        entityLabel="category"
        onSubmit={submit}
        onClear={clearForm}
      />
    </section>
  );

  return <AdminSection list={list} form={form} />;
}

function VideoUploadAdmin() {
  const { state, addVideo, deleteVideo } = useAppStore();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [requiredTier, setRequiredTier] = useState<ContentTier>('sweetie');
  const [file, setFile] = useState<File | null>(null);
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return state.videos;
    return state.videos.filter(
      (v) =>
        v.title.toLowerCase().includes(q) ||
        (v.description ?? '').toLowerCase().includes(q),
    );
  }, [state.videos, search]);

  const categoryName = (id: string) =>
    state.videoCategories.find((c) => c.id === id)?.name ?? 'Unknown';

  const submit = async () => {
    setError('');
    setMessage('');
    if (!title.trim()) {
      setError('Title is required.');
      return;
    }
    if (!categoryId) {
      setError('Pick a video category.');
      return;
    }
    if (!file) {
      setError('Choose a video file.');
      return;
    }
    if (file.size > MAX_VIDEO_BYTES) {
      setError(formatVideoSizeError(file.size));
      return;
    }

    const video: Video = {
      id: '',
      categoryId,
      title: title.trim(),
      description: description.trim() || undefined,
      storagePath: '',
      mimeType: file.type || 'video/mp4',
      sizeBytes: file.size,
      createdAt: new Date().toISOString(),
      requiredTier,
    };

    setUploading(true);
    const result = await addVideo(video, file, file.name);
    setUploading(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    setTitle('');
    setDescription('');
    setFile(null);
    setMessage(`Video uploaded (${formatMb(file.size)}).`);
  };

  const remove = async (id: string) => {
    if (!window.confirm('Delete this video?')) return;
    const result = await deleteVideo(id);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setMessage('Video deleted.');
  };

  const list = (
    <AdminListCard
      title="Uploaded videos"
      count={filtered.length}
      intro={`Max ${MAX_VIDEO_SIZE_LABEL} per file (client limit). Files are stored in Supabase Storage — free tier often caps uploads around 50 MB.`}
      search={search}
      onSearchChange={setSearch}
    >
      {state.videoCategories.length === 0 ? (
        <AdminEmpty
          title="Create a category first"
          hint="Add at least one video category above before uploading."
        />
      ) : filtered.length === 0 ? (
        <AdminEmpty
          title={search ? 'No matches' : 'No videos yet'}
          hint={
            search
              ? 'Try a different search term.'
              : 'Use the form below to upload a video.'
          }
        />
      ) : (
        <ul className="admin-library">
          {filtered.map((v) => (
            <AdminLibraryItem
              key={v.id}
              selected={false}
              title={v.title}
              meta={
                <>
                  {categoryName(v.categoryId)} ·{' '}
                  <TierBadge tier={v.requiredTier ?? 'sweetie'} accessStyle /> ·{' '}
                  {formatMb(v.sizeBytes)}
                </>
              }
              onEdit={() => {}}
              onDelete={() => remove(v.id)}
              hideEdit
            />
          ))}
        </ul>
      )}
    </AdminListCard>
  );

  const form = (
    <section className="card">
      <h3 className="section-title">Upload video</h3>
      <StatusMessage message={error} variant="err" />
      <StatusMessage message={message} />

      <FormBlock title="Details">
        <Field label="Title" htmlFor="vid-title" required>
          <input
            id="vid-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>
        <Field label="Category" htmlFor="vid-cat" required>
          <select
            id="vid-cat"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <option value="">Select category…</option>
            {state.videoCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon ?? '🎬'} {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Description" htmlFor="vid-desc">
          <textarea
            id="vid-desc"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <Field
          label="Who can watch?"
          hint={VIDEO_ACCESS_CUMULATIVE_NOTE}
        >
          <ChipSelect
            label="Minimum Patreon tier"
            options={VIDEO_ACCESS_OPTIONS}
            value={requiredTier}
            onChange={setRequiredTier}
          />
          <p className="muted tier-access-hint" aria-live="polite">
            {tierAccessHint(requiredTier)}
          </p>
        </Field>
        <Field
          label="Video file"
          htmlFor="vid-file"
          hint={`accept video/* · max ${MAX_VIDEO_SIZE_LABEL}`}
          required
        >
          <input
            id="vid-file"
            type="file"
            accept="video/*"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          {file && (
            <p className="muted">
              {file.name} ({formatMb(file.size)})
            </p>
          )}
        </Field>
      </FormBlock>

      <FormActions
        editing={false}
        entityLabel="video"
        onSubmit={() => void submit()}
        onClear={() => {
          setTitle('');
          setDescription('');
          setCategoryId('');
          setRequiredTier('sweetie');
          setFile(null);
          setError('');
          setMessage('');
        }}
        disabled={uploading}
      />
    </section>
  );

  return <AdminSection list={list} form={form} />;
}

function VideosAdmin() {
  const [tab, setTab] = useState<'categories' | 'uploads'>('categories');

  return (
    <div className="admin-videos">
      <div className="admin-videos-tabs" role="tablist" aria-label="Videos admin">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'categories'}
          className={
            tab === 'categories'
              ? 'admin-videos-tab admin-videos-tab--active'
              : 'admin-videos-tab'
          }
          onClick={() => setTab('categories')}
        >
          Categories
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'uploads'}
          className={
            tab === 'uploads'
              ? 'admin-videos-tab admin-videos-tab--active'
              : 'admin-videos-tab'
          }
          onClick={() => setTab('uploads')}
        >
          Uploads
        </button>
      </div>
      {tab === 'categories' ? <VideoCategoryAdmin /> : <VideoUploadAdmin />}
    </div>
  );
}
