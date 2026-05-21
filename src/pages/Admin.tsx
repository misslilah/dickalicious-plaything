import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type {
  Category,
  ContentTier,
  PatreonMemberTier,
  PatreonStatus,
  PunishmentTemplate,
  PunishmentTrigger,
  Reward,
  RewardTrigger,
  Task,
  TaskFrequency,
  UserRole,
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
  TIER_CHIP_OPTIONS,
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
    hint: 'Auto templates',
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

const LEVELS = [1, 2, 3, 4, 5] as const;
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
          {section === 'punishments' && <PunishmentTemplateAdmin />}
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
    categoryId,
    minLevel: 1,
    xpReward: 10,
    frequency: 'daily',
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

  const categoryName = (id: string) =>
    state.categories.find((c) => c.id === id)?.name ?? 'Unknown';

  const resolvedCategoryId =
    draft.categoryId || state.categories[0]?.id || '';

  const validate = () => {
    const next: Record<string, string> = {};
    if (!draft.title.trim()) next.title = 'Title is required.';
    if (!resolvedCategoryId) next.categoryId = 'Select a category.';
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
    const task = {
      ...draft,
      id: draft.id || '',
      categoryId: resolvedCategoryId,
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
          message="Create at least one category before tasks can be saved."
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
              meta={`${categoryName(t.categoryId)} · L${t.minLevel} · ${t.xpReward} XP · ${t.frequency}`}
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
              value={resolvedCategoryId}
              disabled={state.categories.length === 0}
              onChange={(categoryId) => {
                setDraft({ ...draft, categoryId });
                if (errors.categoryId) setErrors((p) => ({ ...p, categoryId: '' }));
              }}
            />
          )}
        </Field>
      </FormBlock>

      <FormBlock title="Rules">
        <Field label="Minimum level" hint="Players must reach this level to unlock the task.">
          <ChipSelect
            label="Minimum level"
            scroll
            options={LEVELS.map((n) => ({ value: n, label: `L${n}` }))}
            value={draft.minLevel}
            onChange={(minLevel) => setDraft({ ...draft, minLevel })}
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
                <ChipSelect
                  label="Target level"
                  options={LEVELS.map((n) => ({ value: n, label: `Level ${n}` }))}
                  value={levelTarget}
                  onChange={setLevelTarget}
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

function emptyPunishmentDraft(): PunishmentTemplate {
  return {
    id: '',
    title: '',
    description: '',
    trigger: { type: 'quota_miss' },
    pointsLost: 10,
  };
}

function PunishmentTemplateAdmin() {
  const {
    state,
    addPunishmentTemplate,
    updatePunishmentTemplate,
    deletePunishmentTemplate,
  } = useAppStore();
  const [draft, setDraft] = useState<PunishmentTemplate>(emptyPunishmentDraft());
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return state.punishmentTemplates;
    return state.punishmentTemplates.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q),
    );
  }, [state.punishmentTemplates, search]);

  const validate = () => {
    const next: Record<string, string> = {};
    if (!draft.title.trim()) next.title = 'Title is required.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const clearForm = () => {
    setDraft(emptyPunishmentDraft());
    setErrors({});
  };

  const submit = async () => {
    if (!validate()) return;
    setMessage('');
    const tpl = { ...draft, id: draft.id || '' };
    const result = draft.id
      ? await updatePunishmentTemplate(tpl)
      : await addPunishmentTemplate(tpl);
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    clearForm();
    setMessage('Punishment template saved.');
  };

  const remove = async (id: string) => {
    if (!window.confirm('Delete this punishment template?')) return;
    const result = await deletePunishmentTemplate(id);
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    if (draft.id === id) clearForm();
    setMessage('Punishment template deleted.');
  };

  const triggerLabel = (trigger: PunishmentTrigger) =>
    trigger.type === 'quota_miss' ? 'Daily quota miss' : 'Manual';

  const list = (
    <AdminListCard
      title="Punishments"
      count={filtered.length}
      intro='Applied when the daily quota is missed (up to 2 per day). Titles with "bonus" add an extra task.'
      search={search}
      onSearchChange={setSearch}
    >
      {filtered.length === 0 ? (
        <AdminEmpty
          title={search ? 'No matches' : 'No templates yet'}
          hint={
            search
              ? 'Try a different search term.'
              : 'Define templates that copy into active punishments.'
          }
        />
      ) : (
        <ul className="admin-library">
          {filtered.map((t) => (
            <AdminLibraryItem
              key={t.id}
              selected={draft.id === t.id}
              title={t.title}
              meta={`−${t.pointsLost} pts · ${triggerLabel(t.trigger)}`}
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
      <h3 className="section-title">
        {draft.id ? 'Edit template' : 'New template'}
      </h3>
      <StatusMessage message={message} />

      <FormBlock title="Basics">
        <Field
          label="Title"
          htmlFor="pun-title"
          required
          error={errors.title}
        >
          <input
            id="pun-title"
            value={draft.title}
            onChange={(e) => {
              setDraft({ ...draft, title: e.target.value });
              if (errors.title) setErrors((p) => ({ ...p, title: '' }));
            }}
          />
        </Field>
        <Field label="Description" htmlFor="pun-desc">
          <textarea
            id="pun-desc"
            rows={3}
            value={draft.description}
            onChange={(e) =>
              setDraft({ ...draft, description: e.target.value })
            }
          />
        </Field>
      </FormBlock>

      <FormBlock title="Rules">
        <Field label="Trigger" hint="When this template can be applied.">
          <ChoiceRow
            label="Punishment trigger"
            name="pun-trigger"
            options={[
              {
                value: 'quota_miss' as const,
                label: 'Quota miss',
                hint: 'Auto on missed daily quota',
              },
              {
                value: 'manual' as const,
                label: 'Manual',
                hint: 'Assigned by admin flow',
              },
            ]}
            value={draft.trigger.type}
            onChange={(type) =>
              setDraft({ ...draft, trigger: { type } as PunishmentTrigger })
            }
          />
        </Field>
        <Field label="Points lost" htmlFor="pun-points">
          <input
            id="pun-points"
            type="number"
            min={0}
            value={draft.pointsLost}
            onChange={(e) =>
              setDraft({ ...draft, pointsLost: Number(e.target.value) })
            }
          />
        </Field>
      </FormBlock>

      <FormActions
        editing={!!draft.id}
        entityLabel="template"
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

function UserAdmin() {
  const { createAppUser } = useAppStore();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('user');
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
    const result = await createAppUser(username, password, role);
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
          Create accounts for regular users or additional admins.
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
          <Field label="Role">
            <ChipSelect
              label="User role"
              options={[
                { value: 'user' as const, label: 'User' },
                { value: 'admin' as const, label: 'Admin' },
              ]}
              value={role}
              onChange={setRole}
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
            setRole('user');
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
