import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  useAdminSection,
  usePersistedSearchParam,
  useRestoreAdminNavFromStorage,
} from '../hooks/usePersistedSearchParam';
import {
  ADMIN_REWARDS_TABS,
  ADMIN_VIDEOS_TABS,
} from '../lib/adminNavPersistence';
import type {
  Badge,
  BadgeRequirement,
  Category,
  CategoryGroup,
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
  isBadgeImagePreview,
  MAX_BADGE_IMAGE_BYTES,
  readBadgeImageFile,
  resolveBadgeImageUrl,
} from '../lib/badgeImage';
import { formatBadgeRequirementSummary } from '../lib/badgeRequirementFormat';
import {
  fetchAdminProfiles,
  updateProfilePatreon,
  type AdminProfileRow,
} from '../lib/profileDb';
import {
  AUDIO_PLAYLIST_TIER_OPTIONS,
  PATREON_MEMBER_TIER_OPTIONS,
  tierAccessHint,
  tierLabel,
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
import { CATEGORY_GROUP_LABELS, CATEGORY_GROUP_ORDER } from '../lib/categoryProgression';
import { getStageLabel, USER_STAGE_OPTIONS, type TaskUserStage } from '../lib/levels';
import { TASK_SCOPE_LABELS, TASK_SCOPE_OPTIONS } from '../lib/taskScope';
import {
  isCategoryImagePreview,
  MAX_CATEGORY_IMAGE_BYTES,
  resolveCategoryImageUrl,
} from '../lib/categoryImage';
import {
  appearancePartsToMs,
  deleteGifBankEntry,
  fetchGifBank,
  fetchGifBankAppearanceSettings,
  insertGifBankEntry,
  isFixedAppearanceInterval,
  MAX_GIF_BYTES,
  msToAppearanceParts,
  updateGifBankAppearanceSettings,
  validateAppearanceSettings,
  validateRotationOpacity,
  type GifAppearanceIntervalUnit,
  type GifBankAppearanceSettings,
  type GifBankEntry,
} from '../lib/gifBank';
import {
  clearGifBankPreview,
  previewGifAsBackground,
} from '../lib/gifBankPreview';
import type { AudioPlaylist, AudioPlaylistItem } from '../types';
import {
  AUDIO_ACCEPT,
  deleteAudioPlaylist,
  deleteAudioPlaylistItem,
  fetchAudioLibrary,
  insertAudioPlaylist,
  insertAudioPlaylistItem,
  itemsForPlaylist,
  MAX_AUDIO_BYTES,
  readAudioDuration,
  updateAudioPlaylist,
  updateAudioPlaylistOrder,
  updateAudioPlaylistsOrder,
} from '../lib/audioPlaylist';
import { MiniGamesAdmin } from '../components/admin/MiniGamesAdmin';
import { InteractiveVideoAdmin } from '../components/admin/InteractiveVideoAdmin';
import { UploadProgressBar } from '../components/UploadProgressBar';

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
  {
    id: 'gifbank' as const,
    label: 'GIF bank',
    icon: '🖼️',
    hint: 'Background GIFs',
  },
  {
    id: 'audio' as const,
    label: 'Audio playlist',
    icon: '🎧',
    hint: 'Multiple sequential playlists',
  },
  {
    id: 'minigames' as const,
    label: 'Mini games',
    icon: '🎮',
    hint: 'Game settings',
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

export function Admin() {
  useRestoreAdminNavFromStorage();
  const [section, setSection] = useAdminSection();
  const active = ADMIN_SECTIONS.find((s) => s.id === section)!;

  return (
    <div className="page page--admin">
      <header className="page-header">
        <h2>Admin</h2>
        <p className="muted">
          Manage categories, tasks, rewards, punishments, videos, audio playlist, mini games, and users.
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
          {section === 'rewards' && <RewardsAdmin />}
          {section === 'punishments' && <PunishmentsAdminLink />}
          {section === 'users' && <UserAdmin />}
          {section === 'videos' && <VideosAdmin />}
          {section === 'gifbank' && <GifBankAdmin />}
          {section === 'audio' && <AudioPlaylistAdmin />}
          {section === 'minigames' && <MiniGamesAdmin />}
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
  onMoveUp,
  onMoveDown,
  moveUpDisabled,
  moveDownDisabled,
}: {
  selected?: boolean;
  title: string;
  meta?: ReactNode;
  onEdit: () => void;
  onDelete: () => void;
  deleteLabel?: string;
  hideEdit?: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  moveUpDisabled?: boolean;
  moveDownDisabled?: boolean;
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
        {onMoveUp && (
          <button
            type="button"
            className="btn btn--ghost btn--small"
            disabled={moveUpDisabled}
            onClick={onMoveUp}
            aria-label="Move up"
          >
            ↑
          </button>
        )}
        {onMoveDown && (
          <button
            type="button"
            className="btn btn--ghost btn--small"
            disabled={moveDownDisabled}
            onClick={onMoveDown}
            aria-label="Move down"
          >
            ↓
          </button>
        )}
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
    categoryGroup: 'beginner',
    unlockAfterCategoryId: null,
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
              meta={`${CATEGORY_GROUP_LABELS[c.categoryGroup ?? 'beginner']}${c.unlockAfterCategoryId ? ' · chained unlock' : ''}${c.description ? ` · ${c.description}` : ' · No description'}`}
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
          label="Tier group"
          hint="Home section: All appears first; other tiers unlock progressively."
        >
          <select
            aria-label="Category tier group"
            value={draft.categoryGroup ?? 'beginner'}
            onChange={(e) =>
              setDraft({
                ...draft,
                categoryGroup: e.target.value as CategoryGroup,
              })
            }
          >
            {CATEGORY_GROUP_ORDER.map((group) => (
              <option key={group} value={group}>
                {CATEGORY_GROUP_LABELS[group]}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Unlock after category"
          hint="Optional: player must 100% complete this category before joining."
        >
          <select
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
    pointsReward: 0,
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
              meta={`${TASK_SCOPE_LABELS[t.taskScope ?? 'category']}${(t.taskScope ?? 'category') === 'category' ? ` · ${categoryName(t.categoryId)}` : ''}${(t.taskScope ?? 'category') === 'custom' ? ` · ${profileName(t.assignedUserId)}` : ''} · ${getStageLabel(t.userStage ?? 'any')} · ${t.xpReward} XP · ${t.pointsReward ?? 0} pts · malus ${t.malusPointsOnFail ?? 0} · ${t.frequency}${t.timerSeconds ? ` · timer ${t.timerSeconds}s` : ''}${t.durationSeconds ? ` · duration ${t.durationSeconds}s` : ''}${t.openUrl ? ' · URL' : ''}${t.requiredPhrase ? ` · phrase${(t.requiredPhraseRepeatCount ?? 1) > 1 ? ` ×${t.requiredPhraseRepeatCount}` : ''}` : ''}`}
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
          label="Points reward"
          htmlFor="task-points-reward"
          hint="Earned when task is completed; spend in Rewards shop"
        >
          <input
            id="task-points-reward"
            type="number"
            min={0}
            value={draft.pointsReward ?? 0}
            onChange={(e) =>
              setDraft({ ...draft, pointsReward: Number(e.target.value) })
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

function RewardsAdmin() {
  const [tab, setTab] = usePersistedSearchParam(
    'rewardsTab',
    ADMIN_REWARDS_TABS,
    'catalog',
  );

  return (
    <div className="admin-rewards">
      <div className="admin-subnav">
        <ChoiceRow
          label="Rewards section"
          name="rewards-tab"
          options={[
            {
              value: 'catalog' as const,
              label: 'Shop & auto',
              hint: 'Points shop and streak/level badges',
            },
            {
              value: 'badges' as const,
              label: 'Profile badges',
              hint: 'Image badges on profile',
            },
          ]}
          value={tab}
          onChange={setTab}
        />
      </div>
      {tab === 'catalog' ? <RewardCatalogAdmin /> : <BadgeAdmin />}
    </div>
  );
}

function emptyBadgeDraft(): Badge {
  return {
    id: '',
    title: '',
    description: '',
    isSecret: false,
    sortOrder: 0,
    requirement: null,
  };
}

type BadgeRequirementKind = 'none' | 'task' | 'category' | 'bubble_pops';
type BadgeDurationMode = 'once' | 'accumulate';

function badgeRequirementKind(badge: Badge): BadgeRequirementKind {
  return badge.requirement?.type ?? 'none';
}

function badgeDurationMode(badge: Badge): BadgeDurationMode {
  const seconds = badge.requirement?.durationSeconds;
  return seconds != null && seconds > 0 ? 'accumulate' : 'once';
}

const BADGE_SECONDS_PER_DAY = 86400;

function badgeDurationDays(badge: Badge): number {
  const seconds = badge.requirement?.durationSeconds ?? 0;
  return seconds > 0 ? seconds / BADGE_SECONDS_PER_DAY : 0;
}

function buildBadgeRequirement(
  kind: BadgeRequirementKind,
  taskId: string,
  categoryId: string,
  durationMode: BadgeDurationMode,
  durationDays: number,
  minBubblePops: number,
): BadgeRequirement | null {
  if (kind === 'none') return null;

  if (kind === 'bubble_pops') {
    const pops = Math.floor(minBubblePops);
    if (pops <= 0) return null;
    return { type: 'bubble_pops', minBubblePops: pops };
  }

  const requirement: BadgeRequirement =
    kind === 'task'
      ? { type: 'task', taskId }
      : { type: 'category', categoryId };

  if (durationMode === 'accumulate') {
    const total = Math.round(durationDays * BADGE_SECONDS_PER_DAY);
    if (total > 0) requirement.durationSeconds = total;
  }

  return requirement;
}

function BadgeAdmin() {
  const { state, addBadge, updateBadge, deleteBadge } = useAppStore();
  const [draft, setDraft] = useState<Badge>(emptyBadgeDraft());
  const [requirementKind, setRequirementKind] = useState<BadgeRequirementKind>('none');
  const [requirementTaskId, setRequirementTaskId] = useState('');
  const [requirementCategoryId, setRequirementCategoryId] = useState('');
  const [requirementMinBubblePops, setRequirementMinBubblePops] = useState(0);
  const [durationMode, setDurationMode] = useState<BadgeDurationMode>('once');
  const [durationDays, setDurationDays] = useState(0);
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('');
  const [imageMessage, setImageMessage] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const imagePreview = isBadgeImagePreview(draft.imageUrl) ? draft.imageUrl : null;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return state.badges;
    return state.badges.filter(
      (b) =>
        b.title.toLowerCase().includes(q) ||
        b.description.toLowerCase().includes(q),
    );
  }, [state.badges, search]);

  const loadDraft = (badge: Badge) => {
    setDraft(badge);
    setRequirementKind(badgeRequirementKind(badge));
    setRequirementTaskId(badge.requirement?.taskId ?? '');
    setRequirementCategoryId(badge.requirement?.categoryId ?? '');
    setRequirementMinBubblePops(badge.requirement?.minBubblePops ?? 0);
    setDurationMode(badgeDurationMode(badge));
    setDurationDays(badgeDurationDays(badge));
    setErrors({});
    setImageMessage('');
  };

  const resetRequirementFields = () => {
    setRequirementKind('none');
    setRequirementTaskId('');
    setRequirementCategoryId('');
    setRequirementMinBubblePops(0);
    setDurationMode('once');
    setDurationDays(0);
  };

  const validate = () => {
    const next: Record<string, string> = {};
    if (!draft.title.trim()) next.title = 'Title is required.';
    if (!draft.description.trim()) next.description = 'Description is required.';
    if (requirementKind === 'task' && !requirementTaskId) {
      next.requirementTask = 'Select a task.';
    }
    if (requirementKind === 'category' && !requirementCategoryId) {
      next.requirementCategory = 'Select a category.';
    }
    if (requirementKind === 'bubble_pops' && requirementMinBubblePops <= 0) {
      next.requirementBubblePops = 'Enter a minimum greater than zero.';
    }
    if (durationMode === 'accumulate') {
      if (durationDays <= 0) {
        next.requirementDuration = 'Enter a duration greater than zero.';
      }
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const clearForm = () => {
    setDraft(emptyBadgeDraft());
    resetRequirementFields();
    setErrors({});
    setImageMessage('');
  };

  const submit = async () => {
    if (!validate()) return;
    setMessage('');
    setImageMessage('');

    const badgeId = draft.id || crypto.randomUUID();
    const resolved = await resolveBadgeImageUrl(badgeId, draft.imageUrl);
    if (!resolved.ok) {
      setImageMessage(resolved.error);
      return;
    }

    const badge: Badge = {
      ...draft,
      id: badgeId,
      title: draft.title.trim(),
      description: draft.description.trim(),
      imageUrl: resolved.url,
      requirement: buildBadgeRequirement(
        requirementKind,
        requirementTaskId,
        requirementCategoryId,
        durationMode,
        durationDays,
        requirementMinBubblePops,
      ),
    };

    const result = draft.id ? await updateBadge(badge) : await addBadge(badge);
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    clearForm();
    setMessage('Badge saved.');
  };

  const remove = async (id: string) => {
    if (!window.confirm('Delete this badge from the catalog?')) return;
    const result = await deleteBadge(id);
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    if (draft.id === id) clearForm();
    setMessage('Badge deleted.');
  };

  const list = (
    <AdminListCard
      title="Profile badges"
      count={filtered.length}
      intro="Small image badges shown on the profile. Locked badges are grayscale; secret badges hide how to unlock."
      search={search}
      onSearchChange={setSearch}
    >
      {filtered.length === 0 ? (
        <AdminEmpty
          title={search ? 'No matches' : 'No profile badges yet'}
          hint={
            search
              ? 'Try a different search term.'
              : 'Create badges with an image and unlock description below.'
          }
        />
      ) : (
        <ul className="admin-library">
          {filtered.map((b) => {
            const requirementSummary = formatBadgeRequirementSummary(
              b,
              state.tasks,
              state.categories,
            );
            return (
            <AdminLibraryItem
              key={b.id}
              selected={draft.id === b.id}
              title={b.title}
              meta={
                [
                  b.isSecret ? 'Secret · Profile badge' : 'Profile badge',
                  requirementSummary,
                ]
                  .filter(Boolean)
                  .join(' · ')
              }
              onEdit={() => loadDraft(b)}
              onDelete={() => remove(b.id)}
            />
            );
          })}
        </ul>
      )}
    </AdminListCard>
  );

  const form = (
    <section className="card">
      <h3 className="section-title">{draft.id ? 'Edit badge' : 'New badge'}</h3>
      <StatusMessage message={message} />

      <FormBlock title="Basics">
        <Field label="Title" htmlFor="badge-title" required error={errors.title}>
          <input
            id="badge-title"
            value={draft.title}
            onChange={(e) => {
              setDraft({ ...draft, title: e.target.value });
              if (errors.title) setErrors((p) => ({ ...p, title: '' }));
            }}
          />
        </Field>
        <Field
          label="How to obtain"
          htmlFor="badge-desc"
          hint="Shown on hover when the badge is locked (unless secret)."
          required
          error={errors.description}
        >
          <textarea
            id="badge-desc"
            rows={3}
            value={draft.description}
            onChange={(e) => {
              setDraft({ ...draft, description: e.target.value });
              if (errors.description) setErrors((p) => ({ ...p, description: '' }));
            }}
          />
        </Field>
        <Field label="Sort order" htmlFor="badge-sort">
          <input
            id="badge-sort"
            type="number"
            value={draft.sortOrder}
            onChange={(e) =>
              setDraft({ ...draft, sortOrder: Number(e.target.value) || 0 })
            }
          />
        </Field>
        <Field label="Secret badge">
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={draft.isSecret}
              onChange={(e) => setDraft({ ...draft, isSecret: e.target.checked })}
            />
            <span>Hide unlock hint (hover shows ???)</span>
          </label>
        </Field>
      </FormBlock>

      <FormBlock title="Unlock requirement">
        <p className="muted" style={{ marginTop: 0 }}>
          Optional. When set, the badge unlocks automatically when the player meets
          the rule. Leave on None for manual or description-only badges.
        </p>
        <Field label="Requirement type">
          <ChoiceRow
            label="Badge requirement type"
            name="badge-requirement-kind"
            options={[
              { value: 'none' as const, label: 'None', hint: 'Manual / hint only' },
              { value: 'task' as const, label: 'Single task' },
              { value: 'category' as const, label: 'Task category' },
              {
                value: 'bubble_pops' as const,
                label: 'Soap bubble pops',
                hint: 'Hidden pop counter (floating soap bubbles)',
              },
            ]}
            value={requirementKind}
            onChange={(kind) => {
              setRequirementKind(kind);
              if (errors.requirementTask || errors.requirementCategory) {
                setErrors((p) => ({
                  ...p,
                  requirementTask: '',
                  requirementCategory: '',
                }));
              }
            }}
          />
        </Field>
        {requirementKind === 'task' && (
          <Field
            label="Task"
            htmlFor="badge-req-task"
            required
            error={errors.requirementTask}
          >
            <select
              id="badge-req-task"
              value={requirementTaskId}
              onChange={(e) => {
                setRequirementTaskId(e.target.value);
                if (errors.requirementTask) {
                  setErrors((p) => ({ ...p, requirementTask: '' }));
                }
              }}
            >
              <option value="">Select a task…</option>
              {[...state.tasks]
                .sort((a, b) => a.title.localeCompare(b.title))
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
            </select>
          </Field>
        )}
        {requirementKind === 'category' && (
          <Field
            label="Category"
            htmlFor="badge-req-category"
            required
            error={errors.requirementCategory}
          >
            <select
              id="badge-req-category"
              value={requirementCategoryId}
              onChange={(e) => {
                setRequirementCategoryId(e.target.value);
                if (errors.requirementCategory) {
                  setErrors((p) => ({ ...p, requirementCategory: '' }));
                }
              }}
            >
              <option value="">Select a category…</option>
              {[...state.categories]
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </Field>
        )}
        {requirementKind === 'bubble_pops' && (
          <Field
            label="Minimum bubble pops"
            htmlFor="badge-req-bubble-pops"
            hint="Player must pop this many floating soap bubbles (counter is hidden)."
            required
            error={errors.requirementBubblePops}
          >
            <input
              id="badge-req-bubble-pops"
              type="number"
              min={1}
              step={1}
              value={requirementMinBubblePops || ''}
              placeholder="e.g. 10"
              onChange={(e) => {
                setRequirementMinBubblePops(parseInt(e.target.value, 10) || 0);
                if (errors.requirementBubblePops) {
                  setErrors((p) => ({ ...p, requirementBubblePops: '' }));
                }
              }}
            />
          </Field>
        )}
        {requirementKind !== 'none' && requirementKind !== 'bubble_pops' && (
          <>
            <Field label="Completion mode">
              <ChoiceRow
                label="Badge duration mode"
                name="badge-duration-mode"
                options={[
                  {
                    value: 'once' as const,
                    label: 'Complete once',
                    hint:
                      requirementKind === 'category'
                        ? 'Every task in the category once'
                        : 'Finish the task once',
                  },
                  {
                    value: 'accumulate' as const,
                    label: 'Accumulate time',
                    hint: 'Active timer/duration time counts toward the total (in days)',
                  },
                ]}
                value={durationMode}
                onChange={setDurationMode}
              />
            </Field>
            {durationMode === 'accumulate' && (
              <Field
                label="Days"
                htmlFor="badge-req-days"
                hint="Total active time needed to unlock. Decimals allowed (e.g. 0.5 for half a day)."
                error={errors.requirementDuration}
              >
                <input
                  id="badge-req-days"
                  type="number"
                  min={0}
                  step="any"
                  aria-label="Days"
                  value={durationDays || ''}
                  placeholder="Days"
                  onChange={(e) => {
                    setDurationDays(parseFloat(e.target.value) || 0);
                    if (errors.requirementDuration) {
                      setErrors((p) => ({ ...p, requirementDuration: '' }));
                    }
                  }}
                />
              </Field>
            )}
          </>
        )}
      </FormBlock>

      <FormBlock title="Image">
        <Field
          label="Badge image"
          hint={`Square image recommended (~64px display). Max ${Math.round(MAX_BADGE_IMAGE_BYTES / 1024)} KB. Uploads to badge-images bucket.`}
        >
          {imageMessage && <StatusMessage message={imageMessage} variant="err" />}
          <CategoryImagePicker
            idPrefix="badge"
            compact
            previewAlt="Badge image preview"
            readImageFile={readBadgeImageFile}
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
        entityLabel="badge"
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

function RewardCatalogAdmin() {
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
    sortOrder: 0,
  };
}

function VideoCategoryAdmin() {
  const {
    state,
    addVideoCategory,
    updateVideoCategory,
    reorderVideoCategories,
    deleteVideoCategory,
  } = useAppStore();
  const [draft, setDraft] = useState<VideoCategory>(emptyVideoCategoryDraft());
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [reordering, setReordering] = useState(false);

  const categories = state.videoCategories;
  const searchActive = search.trim().length > 0;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.description ?? '').toLowerCase().includes(q),
    );
  }, [categories, search]);

  const moveCategory = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= categories.length) return;
    const next = [...categories];
    const [removed] = next.splice(index, 1);
    next.splice(target, 0, removed);
    setReordering(true);
    setMessage('');
    const result = await reorderVideoCategories(next.map((c) => c.id));
    setReordering(false);
    if (!result.ok) setMessage(result.error);
  };

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
      {searchActive && categories.length > 0 && (
        <p className="muted admin-list-hint">
          Clear search to reorder categories with ↑ ↓.
        </p>
      )}
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
          {filtered.map((c) => {
            const index = categories.findIndex((x) => x.id === c.id);
            const showReorder = !searchActive && categories.length > 1;
            return (
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
                onMoveUp={
                  showReorder ? () => void moveCategory(index, -1) : undefined
                }
                onMoveDown={
                  showReorder ? () => void moveCategory(index, 1) : undefined
                }
                moveUpDisabled={index <= 0 || reordering}
                moveDownDisabled={
                  index < 0 || index >= categories.length - 1 || reordering
                }
              />
            );
          })}
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
  const { state, addVideo, updateVideo, deleteVideo } = useAppStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [requiredTier, setRequiredTier] = useState<ContentTier>('sweetie');
  const [autoLoop, setAutoLoop] = useState(false);
  const [xpReward, setXpReward] = useState(0);
  const [shopPointsCost, setShopPointsCost] = useState<number | ''>('');
  const [file, setFile] = useState<File | null>(null);
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

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

  const clearForm = () => {
    setEditingId(null);
    setTitle('');
    setDescription('');
    setCategoryId('');
    setRequiredTier('sweetie');
    setAutoLoop(false);
    setXpReward(0);
    setShopPointsCost('');
    setFile(null);
    setError('');
    setMessage('');
  };

  const loadForEdit = (video: Video) => {
    setEditingId(video.id);
    setTitle(video.title);
    setDescription(video.description ?? '');
    setCategoryId(video.categoryId);
    setRequiredTier(video.requiredTier ?? 'sweetie');
    setAutoLoop(video.autoLoop ?? false);
    setXpReward(video.xpReward ?? 0);
    setShopPointsCost(
      video.shopPointsCost != null && video.shopPointsCost > 0
        ? video.shopPointsCost
        : '',
    );
    setFile(null);
    setError('');
    setMessage('');
  };

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

    if (editingId) {
      const existing = state.videos.find((v) => v.id === editingId);
      if (!existing) {
        setError('Video not found.');
        return;
      }
      setUploading(true);
      const shopCost =
        shopPointsCost === '' || shopPointsCost === 0
          ? null
          : Math.max(1, Math.floor(Number(shopPointsCost)));
      const result = await updateVideo({
        ...existing,
        categoryId,
        title: title.trim(),
        description: description.trim() || undefined,
        requiredTier,
        autoLoop,
        xpReward: Math.max(0, Math.floor(xpReward)),
        shopPointsCost: shopCost,
      });
      setUploading(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      clearForm();
      setMessage('Video updated.');
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
      autoLoop,
      xpReward: Math.max(0, Math.floor(xpReward)),
      shopPointsCost:
        shopPointsCost === '' || shopPointsCost === 0
          ? null
          : Math.max(1, Math.floor(Number(shopPointsCost))),
    };

    setUploading(true);
    setUploadProgress(0);
    const result = await addVideo(video, file, file.name, setUploadProgress);
    setUploading(false);
    setUploadProgress(null);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    clearForm();
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
                  <TierBadge tier={v.requiredTier ?? 'sweetie'} accessStyle />
                  {v.autoLoop ? ' · Auto loop' : ''}
                  {(v.xpReward ?? 0) > 0 ? ` · ${v.xpReward} XP` : ''}
                  {(v.shopPointsCost ?? 0) > 0
                    ? ` · Shop ${v.shopPointsCost} pts`
                    : ''}{' '}
                  · {formatMb(v.sizeBytes)}
                </>
              }
              onEdit={() => loadForEdit(v)}
              onDelete={() => remove(v.id)}
            />
          ))}
        </ul>
      )}
    </AdminListCard>
  );

  const form = (
    <section className="card">
      <h3 className="section-title">
        {editingId ? 'Edit video' : 'Upload video'}
      </h3>
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
          label="XP reward"
          htmlFor="vid-xp"
          hint="XP granted once when a user watches the full video (0 = none). Normal play requires watching through; Forced Mode awards on completion."
        >
          <input
            id="vid-xp"
            type="number"
            min={0}
            step={1}
            value={xpReward}
            onChange={(e) => setXpReward(Number(e.target.value))}
          />
        </Field>
        <Field
          label="Shop price (points)"
          htmlFor="vid-shop-cost"
          hint="Reward points to unlock this video individually in the Rewards shop. Leave empty or 0 to disable shop purchase."
        >
          <input
            id="vid-shop-cost"
            type="number"
            min={0}
            step={1}
            value={shopPointsCost}
            onChange={(e) => {
              const raw = e.target.value;
              setShopPointsCost(raw === '' ? '' : Number(raw));
            }}
            placeholder="Not for sale"
          />
        </Field>
        <Field label="Playback">
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={autoLoop}
              onChange={(e) => setAutoLoop(e.target.checked)}
            />
            <span>Auto loop — start with loop enabled (normal play only)</span>
          </label>
        </Field>
        {!editingId && (
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
        )}
      </FormBlock>

      <UploadProgressBar progress={uploadProgress} />

      <FormActions
        editing={!!editingId}
        entityLabel="video"
        onSubmit={() => void submit()}
        onClear={clearForm}
        disabled={uploading}
      />
    </section>
  );

  return <AdminSection list={list} form={form} />;
}

function GifBankPreviewModal({
  entry,
  onClose,
  onTestBackground,
}: {
  entry: GifBankEntry;
  onClose: () => void;
  onTestBackground: () => void;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      className="gif-bank-preview-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="gif-bank-preview-title"
    >
      <button
        type="button"
        className="gif-bank-preview-modal__backdrop"
        aria-label="Close preview"
        onClick={onClose}
      />
      <div className="gif-bank-preview-modal__panel">
        <h2 id="gif-bank-preview-title" className="gif-bank-preview-modal__title">
          GIF preview
        </h2>
        <p className="muted gif-bank-preview-modal__label">
          {entry.title || 'Untitled GIF'}
        </p>
        <img
          src={entry.url}
          alt=""
          className="gif-bank-preview-modal__img"
        />
        <div className="btn-row gif-bank-preview-modal__actions">
          <button
            type="button"
            className="btn btn--primary"
            onClick={onTestBackground}
          >
            Test as background
          </button>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

const GIF_APPEARANCE_UNITS: { value: GifAppearanceIntervalUnit; label: string }[] = [
  { value: 'seconds', label: 'Seconds' },
  { value: 'minutes', label: 'Minutes' },
];

function formatAppearanceSummary(settings: GifBankAppearanceSettings): string {
  if (isFixedAppearanceInterval(settings)) {
    const { value, unit } = msToAppearanceParts(settings.minIntervalMs);
    const unitLabel = unit === 'minutes' ? 'minute' : 'second';
    return `every ${value} ${unitLabel}${value === 1 ? '' : 's'}`;
  }

  const min = msToAppearanceParts(settings.minIntervalMs);
  const max = msToAppearanceParts(settings.maxIntervalMs);
  const minUnit = min.unit === 'minutes' ? 'minute' : 'second';
  const maxUnit = max.unit === 'minutes' ? 'minute' : 'second';
  return `every ${min.value} ${minUnit}${min.value === 1 ? '' : 's'} to ${max.value} ${maxUnit}${max.value === 1 ? '' : 's'}`;
}

function GifAppearanceIntervalField({
  label,
  htmlFor,
  value,
  unit,
  onValueChange,
  onUnitChange,
}: {
  label: string;
  htmlFor: string;
  value: number;
  unit: GifAppearanceIntervalUnit;
  onValueChange: (value: number) => void;
  onUnitChange: (unit: GifAppearanceIntervalUnit) => void;
}) {
  return (
    <Field label={label} htmlFor={htmlFor}>
      <div className="gif-appearance-interval-row">
        <input
          id={htmlFor}
          type="number"
          min={1}
          step={1}
          value={value}
          onChange={(e) => onValueChange(Number(e.target.value))}
        />
        <select
          aria-label={`${label} unit`}
          value={unit}
          onChange={(e) => onUnitChange(e.target.value as GifAppearanceIntervalUnit)}
        >
          {GIF_APPEARANCE_UNITS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    </Field>
  );
}

function GifBankAdmin() {
  const [gifs, setGifs] = useState<GifBankEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [previewEntry, setPreviewEntry] = useState<GifBankEntry | null>(null);
  const [appearanceMode, setAppearanceMode] = useState<'fixed' | 'range'>('range');
  const [fixedValue, setFixedValue] = useState(5);
  const [fixedUnit, setFixedUnit] = useState<GifAppearanceIntervalUnit>('minutes');
  const [minValue, setMinValue] = useState(5);
  const [minUnit, setMinUnit] = useState<GifAppearanceIntervalUnit>('minutes');
  const [maxValue, setMaxValue] = useState(10);
  const [maxUnit, setMaxUnit] = useState<GifAppearanceIntervalUnit>('minutes');
  const [rotationOpacityPercent, setRotationOpacityPercent] = useState(3);
  const [appearanceSummary, setAppearanceSummary] = useState('every 5 minutes to 10 minutes');
  const [settingsMessage, setSettingsMessage] = useState('');
  const [settingsError, setSettingsError] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);

  const applyAppearanceSettings = (settings: GifBankAppearanceSettings) => {
    setAppearanceSummary(formatAppearanceSummary(settings));
    setRotationOpacityPercent(Math.round(settings.rotationOpacity * 100));
    if (isFixedAppearanceInterval(settings)) {
      setAppearanceMode('fixed');
      const fixed = msToAppearanceParts(settings.minIntervalMs);
      setFixedValue(fixed.value);
      setFixedUnit(fixed.unit);
      setMinValue(fixed.value);
      setMinUnit(fixed.unit);
      setMaxValue(fixed.value);
      setMaxUnit(fixed.unit);
      return;
    }

    setAppearanceMode('range');
    const min = msToAppearanceParts(settings.minIntervalMs);
    const max = msToAppearanceParts(settings.maxIntervalMs);
    setMinValue(min.value);
    setMinUnit(min.unit);
    setMaxValue(max.value);
    setMaxUnit(max.unit);
    setFixedValue(min.value);
    setFixedUnit(min.unit);
  };

  const loadGifs = async () => {
    setLoading(true);
    setError('');
    const result = await fetchGifBank();
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setGifs(result.gifs);
  };

  const loadAppearanceSettings = async () => {
    setSettingsError('');
    const result = await fetchGifBankAppearanceSettings();
    if (!result.ok) {
      setSettingsError(result.error);
      return;
    }
    applyAppearanceSettings(result.settings);
  };

  useEffect(() => {
    void loadGifs();
    void loadAppearanceSettings();
  }, []);

  useEffect(() => {
    return () => {
      clearGifBankPreview();
    };
  }, []);

  const openPreview = (entry: GifBankEntry) => {
    previewGifAsBackground(entry);
    setPreviewEntry(entry);
  };

  const closePreview = () => {
    clearGifBankPreview();
    setPreviewEntry(null);
  };

  const testAsBackground = (entry: GifBankEntry) => {
    previewGifAsBackground(entry);
    setPreviewEntry(null);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return gifs;
    return gifs.filter((g) =>
      (g.title ?? '').toLowerCase().includes(q),
    );
  }, [gifs, search]);

  const buildAppearanceSettings = (): GifBankAppearanceSettings | null => {
    const rotationOpacity = rotationOpacityPercent / 100;
    const opacityError = validateRotationOpacity(rotationOpacity);
    if (opacityError) {
      setSettingsError(opacityError);
      return null;
    }

    if (appearanceMode === 'fixed') {
      const intervalMs = appearancePartsToMs(fixedValue, fixedUnit);
      const validationError = validateAppearanceSettings(intervalMs, intervalMs);
      if (validationError) {
        setSettingsError(validationError);
        return null;
      }
      return {
        minIntervalMs: intervalMs,
        maxIntervalMs: intervalMs,
        rotationOpacity,
      };
    }

    const minIntervalMs = appearancePartsToMs(minValue, minUnit);
    const maxIntervalMs = appearancePartsToMs(maxValue, maxUnit);
    const validationError = validateAppearanceSettings(minIntervalMs, maxIntervalMs);
    if (validationError) {
      setSettingsError(validationError);
      return null;
    }
    return { minIntervalMs, maxIntervalMs, rotationOpacity };
  };

  const saveAppearanceSettings = async () => {
    setSettingsMessage('');
    setSettingsError('');
    const settings = buildAppearanceSettings();
    if (!settings) return;

    setSavingSettings(true);
    const result = await updateGifBankAppearanceSettings(settings);
    setSavingSettings(false);

    if (!result.ok) {
      setSettingsError(result.error);
      return;
    }

    applyAppearanceSettings(settings);
    setSettingsMessage('Appearance settings saved.');
  };

  const submit = async () => {
    setError('');
    setMessage('');
    if (!file) {
      setError('Choose a GIF file.');
      return;
    }
    if (file.size > MAX_GIF_BYTES) {
      setError(
        `GIF too large. Max ${Math.round(MAX_GIF_BYTES / (1024 * 1024))} MB.`,
      );
      return;
    }

    setUploading(true);
    const result = await insertGifBankEntry(title, file);
    setUploading(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setGifs((prev) => [result.entry, ...prev]);
    setTitle('');
    setFile(null);
    setMessage('GIF uploaded.');
  };

  const remove = async (entry: GifBankEntry) => {
    if (!window.confirm('Delete this GIF from the bank?')) return;
    setError('');
    setMessage('');
    const result = await deleteGifBankEntry(entry.id, entry.storagePath);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setGifs((prev) => prev.filter((g) => g.id !== entry.id));
    if (previewEntry?.id === entry.id) closePreview();
    setMessage('GIF deleted.');
  };

  const list = (
    <AdminListCard
      title="GIF bank"
      count={filtered.length}
      intro={`GIFs appear randomly in the app background at ${rotationOpacityPercent}% opacity ${appearanceSummary}. Each GIF shows for 5 seconds, then fades. Click to preview at 30% opacity.`}
      search={search}
      onSearchChange={setSearch}
    >
      {loading && <p className="muted">Loading GIFs…</p>}
      <StatusMessage message={error} variant="err" />
      {!loading && filtered.length === 0 ? (
        <AdminEmpty
          title={search ? 'No matches' : 'No GIFs yet'}
          hint={
            search
              ? 'Try a different search term.'
              : 'Upload a GIF below to add it to the background rotation.'
          }
        />
      ) : (
        <ul className="admin-library admin-library--gif-bank">
          {filtered.map((g) => (
            <li
              key={g.id}
              className={
                previewEntry?.id === g.id
                  ? 'admin-library-item admin-library-item--selected'
                  : 'admin-library-item'
              }
            >
              <button
                type="button"
                className="admin-library-item__main admin-gif-bank-item__main"
                onClick={() => openPreview(g)}
                aria-pressed={previewEntry?.id === g.id}
              >
                <img
                  src={g.url}
                  alt=""
                  className="admin-gif-bank-item__thumb"
                />
                <span>
                  <strong className="admin-library-item__title">
                    {g.title || 'Untitled GIF'}
                  </strong>
                  <span className="admin-library-item__meta muted">
                    {new Date(g.createdAt).toLocaleString()} · Click to preview
                  </span>
                </span>
              </button>
              <div className="admin-library-item__actions">
                <button
                  type="button"
                  className="btn btn--ghost btn--small btn--danger-text"
                  onClick={() => void remove(g)}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </AdminListCard>
  );

  const appearanceForm = (
    <section className="card">
      <h3 className="section-title">Background appearance</h3>
      <p className="muted">
        Control timing and opacity for random background GIF appearances.
        Display duration, fade, and position are unchanged.
      </p>
      <StatusMessage message={settingsMessage} />
      <StatusMessage message={settingsError} variant="err" />

      <FormBlock title="Opacity">
        <Field
          label="Background opacity"
          htmlFor="gif-rotation-opacity"
          hint="Opacity when GIFs appear in the app background (0–100%). Preview uses 30%."
        >
          <div className="gif-appearance-interval-row">
            <input
              id="gif-rotation-opacity"
              type="range"
              min={0}
              max={100}
              step={1}
              value={rotationOpacityPercent}
              onChange={(e) => setRotationOpacityPercent(Number(e.target.value))}
            />
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              aria-label="Background opacity percent"
              value={rotationOpacityPercent}
              onChange={(e) => setRotationOpacityPercent(Number(e.target.value))}
            />
            <span className="muted">%</span>
          </div>
        </Field>
      </FormBlock>

      <FormBlock title="Schedule">
        <Field label="Timing mode">
          <ChipSelect
            label="Timing mode"
            options={[
              { value: 'fixed' as const, label: 'Fixed interval' },
              { value: 'range' as const, label: 'Random range' },
            ]}
            value={appearanceMode}
            onChange={setAppearanceMode}
          />
        </Field>

        {appearanceMode === 'fixed' ? (
          <GifAppearanceIntervalField
            label="Appear every"
            htmlFor="gif-appearance-fixed"
            value={fixedValue}
            unit={fixedUnit}
            onValueChange={setFixedValue}
            onUnitChange={setFixedUnit}
          />
        ) : (
          <>
            <GifAppearanceIntervalField
              label="Minimum wait"
              htmlFor="gif-appearance-min"
              value={minValue}
              unit={minUnit}
              onValueChange={setMinValue}
              onUnitChange={setMinUnit}
            />
            <GifAppearanceIntervalField
              label="Maximum wait"
              htmlFor="gif-appearance-max"
              value={maxValue}
              unit={maxUnit}
              onValueChange={setMaxValue}
              onUnitChange={setMaxUnit}
            />
          </>
        )}
      </FormBlock>

      <div className="btn-row admin-form-actions">
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => void saveAppearanceSettings()}
          disabled={savingSettings}
        >
          Save settings
        </button>
      </div>
    </section>
  );

  const form = (
    <>
      {appearanceForm}
      <section className="card">
        <h3 className="section-title">Upload GIF</h3>
        <StatusMessage message={message} />
        <StatusMessage message={error} variant="err" />

        <FormBlock title="Details">
          <Field label="Title (optional)" htmlFor="gif-title">
            <input
              id="gif-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Label for admin list"
            />
          </Field>
          <Field
            label="GIF file"
            htmlFor="gif-file"
            hint={`accept image/gif · max ${Math.round(MAX_GIF_BYTES / (1024 * 1024))} MB`}
            required
          >
            <input
              id="gif-file"
              type="file"
              accept="image/gif"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            {file && (
              <p className="muted">
                {file.name} ({Math.round(file.size / 1024)} KB)
              </p>
            )}
          </Field>
        </FormBlock>

        <FormActions
          editing={false}
          entityLabel="GIF"
          onSubmit={() => void submit()}
          onClear={() => {
            setTitle('');
            setFile(null);
            setError('');
            setMessage('');
          }}
          disabled={uploading}
        />
      </section>
    </>
  );

  return (
    <>
      {previewEntry && (
        <GifBankPreviewModal
          entry={previewEntry}
          onClose={closePreview}
          onTestBackground={() => testAsBackground(previewEntry)}
        />
      )}
      <AdminSection list={list} form={form} />
    </>
  );
}

function VideosAdmin() {
  const [tab, setTab] = usePersistedSearchParam(
    'videosTab',
    ADMIN_VIDEOS_TABS,
    'categories',
  );

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
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'interactive'}
          className={
            tab === 'interactive'
              ? 'admin-videos-tab admin-videos-tab--active'
              : 'admin-videos-tab'
          }
          onClick={() => setTab('interactive')}
        >
          Interactive
        </button>
      </div>
      {tab === 'categories' ? (
        <VideoCategoryAdmin />
      ) : tab === 'uploads' ? (
        <VideoUploadAdmin />
      ) : (
        <InteractiveVideoAdmin />
      )}
    </div>
  );
}

function AudioPlaylistAdmin() {
  const [playlists, setPlaylists] = useState<AudioPlaylist[]>([]);
  const [items, setItems] = useState<AudioPlaylistItem[]>([]);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [unlockAfterId, setUnlockAfterId] = useState('');
  const [patreonTier, setPatreonTier] = useState('');
  const [editingPlaylistId, setEditingPlaylistId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editUnlockAfterId, setEditUnlockAfterId] = useState('');
  const [editPatreonTier, setEditPatreonTier] = useState('');
  const [trackTitle, setTrackTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [savingPlaylist, setSavingPlaylist] = useState(false);
  const [reordering, setReordering] = useState(false);

  const selectedPlaylist = playlists.find((p) => p.id === selectedPlaylistId) ?? null;
  const selectedItems = selectedPlaylistId
    ? itemsForPlaylist(selectedPlaylistId, items)
    : [];

  const loadLibrary = async () => {
    setLoading(true);
    setError('');
    const result = await fetchAudioLibrary();
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setPlaylists(result.library.playlists);
    setItems(result.library.items);
    if (
      selectedPlaylistId &&
      !result.library.playlists.some((p) => p.id === selectedPlaylistId)
    ) {
      setSelectedPlaylistId(null);
    }
  };

  useEffect(() => {
    void loadLibrary();
  }, []);

  const createPlaylist = async () => {
    setError('');
    setMessage('');
    setSavingPlaylist(true);
    const result = await insertAudioPlaylist(
      title,
      description || null,
      unlockAfterId || null,
      (patreonTier as PatreonMemberTier) || null,
      playlists,
    );
    setSavingPlaylist(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setPlaylists((prev) => [...prev, result.playlist]);
    setTitle('');
    setDescription('');
    setUnlockAfterId('');
    setPatreonTier('');
    setSelectedPlaylistId(result.playlist.id);
    setMessage('Playlist created.');
  };

  const startEditPlaylist = (playlist: AudioPlaylist) => {
    setEditingPlaylistId(playlist.id);
    setEditTitle(playlist.title);
    setEditDescription(playlist.description ?? '');
    setEditUnlockAfterId(playlist.unlockAfterPlaylistId ?? '');
    setEditPatreonTier(playlist.patreonTier ?? '');
  };

  const saveEditPlaylist = async () => {
    if (!editingPlaylistId) return;
    setError('');
    setMessage('');
    setSavingPlaylist(true);
    const result = await updateAudioPlaylist(
      editingPlaylistId,
      {
        title: editTitle,
        description: editDescription || null,
        unlockAfterPlaylistId: editUnlockAfterId || null,
        patreonTier: (editPatreonTier as PatreonMemberTier) || null,
      },
      playlists,
    );
    setSavingPlaylist(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setPlaylists((prev) =>
      prev.map((p) => (p.id === editingPlaylistId ? result.playlist : p)),
    );
    setEditingPlaylistId(null);
    setMessage('Playlist updated.');
  };

  const removePlaylist = async (playlist: AudioPlaylist) => {
    if (
      !window.confirm(
        `Delete playlist "${playlist.title}" and all its tracks? This cannot be undone.`,
      )
    ) {
      return;
    }
    setError('');
    setMessage('');
    const result = await deleteAudioPlaylist(playlist.id, items);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setPlaylists((prev) => prev.filter((p) => p.id !== playlist.id));
    setItems((prev) => prev.filter((i) => i.playlistId !== playlist.id));
    if (selectedPlaylistId === playlist.id) setSelectedPlaylistId(null);
    setMessage('Playlist deleted.');
  };

  const movePlaylist = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= playlists.length) return;
    const next = [...playlists];
    const [removed] = next.splice(index, 1);
    next.splice(target, 0, removed);
    setPlaylists(next);
    setReordering(true);
    setError('');
    const result = await updateAudioPlaylistsOrder(next.map((p) => p.id));
    setReordering(false);
    if (!result.ok) {
      setError(result.error);
      void loadLibrary();
    }
  };

  const submitTrack = async () => {
    if (!selectedPlaylistId) {
      setError('Select a playlist first.');
      return;
    }
    setError('');
    setMessage('');
    if (!file) {
      setError('Choose an audio file (MP3, M4A, WAV, OGG).');
      return;
    }
    if (file.size > MAX_AUDIO_BYTES) {
      setError(
        `File too large. Max ${Math.round(MAX_AUDIO_BYTES / (1024 * 1024))} MB.`,
      );
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    const duration = await readAudioDuration(file);
    const result = await insertAudioPlaylistItem(
      selectedPlaylistId,
      trackTitle,
      file,
      duration,
      setUploadProgress,
    );
    setUploading(false);
    setUploadProgress(null);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setItems((prev) => [...prev, result.item]);
    setTrackTitle('');
    setFile(null);
    setMessage('Audio track added to playlist.');
  };

  const removeTrack = async (item: AudioPlaylistItem) => {
    if (!window.confirm(`Delete "${item.title}" from the playlist?`)) return;
    setError('');
    setMessage('');
    const result = await deleteAudioPlaylistItem(item.id, item.storagePath);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    setMessage('Track deleted.');
  };

  const moveTrack = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= selectedItems.length) return;
    const next = [...selectedItems];
    const [removed] = next.splice(index, 1);
    next.splice(target, 0, removed);
    setItems((prev) => [
      ...prev.filter((i) => i.playlistId !== selectedPlaylistId),
      ...next,
    ]);
    setReordering(true);
    setError('');
    const result = await updateAudioPlaylistOrder(next.map((i) => i.id));
    setReordering(false);
    if (!result.ok) {
      setError(result.error);
      void loadLibrary();
    }
  };

  const unlockOptions = (excludeId?: string) =>
    playlists.filter((p) => p.id !== excludeId);

  const playlistList = (
    <>
      <h3 className="admin-list-title">Playlists</h3>
      {loading && <p className="muted">Loading…</p>}
      {!loading && playlists.length === 0 && (
        <p className="muted">No playlists yet. Create one below.</p>
      )}
      {!loading && playlists.length > 0 && (
        <ul className="admin-audio-list">
          {playlists.map((playlist, index) => {
            const trackCount = itemsForPlaylist(playlist.id, items).length;
            const prereq = playlist.unlockAfterPlaylistId
              ? playlists.find((p) => p.id === playlist.unlockAfterPlaylistId)
              : null;
            const isSelected = selectedPlaylistId === playlist.id;
            const isEditing = editingPlaylistId === playlist.id;

            return (
              <li
                key={playlist.id}
                className={`admin-audio-list__item${isSelected ? ' admin-audio-list__item--selected' : ''}`}
              >
                {isEditing ? (
                  <div className="admin-audio-playlist-edit">
                    <label className="form-field">
                      Title
                      <input
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                      />
                    </label>
                    <label className="form-field">
                      Description (optional)
                      <input
                        type="text"
                        value={editDescription}
                        onChange={(e) => setEditDescription(e.target.value)}
                      />
                    </label>
                    <label className="form-field">
                      Unlocking after playlist
                      <select
                        value={editUnlockAfterId}
                        onChange={(e) => setEditUnlockAfterId(e.target.value)}
                      >
                        <option value="">Always available</option>
                        {unlockOptions(playlist.id).map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.title}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="form-field">
                      Required Patreon tier
                      <select
                        value={editPatreonTier}
                        onChange={(e) => setEditPatreonTier(e.target.value)}
                      >
                        {AUDIO_PLAYLIST_TIER_OPTIONS.map((opt) => (
                          <option key={opt.value || 'none'} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="admin-audio-list__actions">
                      <button
                        type="button"
                        className="btn btn--primary btn--small"
                        disabled={savingPlaylist}
                        onClick={() => void saveEditPlaylist()}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        className="btn btn--ghost btn--small"
                        onClick={() => setEditingPlaylistId(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      className="admin-audio-list__select"
                      onClick={() => setSelectedPlaylistId(playlist.id)}
                    >
                      <div className="admin-audio-list__meta">
                        <strong>{playlist.title}</strong>
                        {playlist.description && (
                          <span className="muted">{playlist.description}</span>
                        )}
                        <span className="muted">
                          {trackCount} track{trackCount === 1 ? '' : 's'}
                          {playlist.patreonTier
                            ? ` · Requires ${tierLabel(playlist.patreonTier)}`
                            : ''}
                          {prereq ? ` · Unlocks after "${prereq.title}"` : ' · Always available'}
                        </span>
                      </div>
                    </button>
                    <div className="admin-audio-list__actions">
                      <button
                        type="button"
                        className="btn btn--ghost btn--small"
                        disabled={index === 0 || reordering}
                        onClick={() => void movePlaylist(index, -1)}
                        aria-label="Move up"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="btn btn--ghost btn--small"
                        disabled={index === playlists.length - 1 || reordering}
                        onClick={() => void movePlaylist(index, 1)}
                        aria-label="Move down"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className="btn btn--ghost btn--small"
                        onClick={() => startEditPlaylist(playlist)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn btn--ghost btn--small btn--danger"
                        onClick={() => void removePlaylist(playlist)}
                      >
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {selectedPlaylist && (
        <>
          <h3 className="admin-list-title">
            Tracks in “{selectedPlaylist.title}”
          </h3>
          {selectedItems.length === 0 ? (
            <p className="muted">No tracks in this playlist yet.</p>
          ) : (
            <ul className="admin-audio-list">
              {selectedItems.map((item, index) => (
                <li key={item.id} className="admin-audio-list__item">
                  <span className="admin-audio-list__order">{index + 1}</span>
                  <div className="admin-audio-list__meta">
                    <strong>{item.title}</strong>
                    {item.durationSeconds != null && (
                      <span className="muted">
                        {Math.round(item.durationSeconds)}s
                      </span>
                    )}
                  </div>
                  <div className="admin-audio-list__actions">
                    <button
                      type="button"
                      className="btn btn--ghost btn--small"
                      disabled={index === 0 || reordering}
                      onClick={() => void moveTrack(index, -1)}
                      aria-label="Move up"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost btn--small"
                      disabled={index === selectedItems.length - 1 || reordering}
                      onClick={() => void moveTrack(index, 1)}
                      aria-label="Move down"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost btn--small btn--danger"
                      onClick={() => void removeTrack(item)}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );

  const form = (
    <>
      <h3 className="admin-form-title">Create playlist</h3>
      <p className="muted">
        Each playlist plays in order. Users must finish every track in a
        prerequisite playlist before the next one unlocks.
      </p>
      {message && <p className="admin-form-message">{message}</p>}
      {error && (
        <p className="login-error" role="alert">
          {error}
        </p>
      )}
      <label className="form-field">
        Title
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Playlist title"
        />
      </label>
      <label className="form-field">
        Description (optional)
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Short description"
        />
      </label>
      <label className="form-field">
        Unlock after playlist
        <select
          value={unlockAfterId}
          onChange={(e) => setUnlockAfterId(e.target.value)}
        >
          <option value="">Always available</option>
          {playlists.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
      </label>
      <label className="form-field">
        Required Patreon tier
        <select
          value={patreonTier}
          onChange={(e) => setPatreonTier(e.target.value)}
        >
          {AUDIO_PLAYLIST_TIER_OPTIONS.map((opt) => (
            <option key={opt.value || 'none'} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="btn btn--primary"
        disabled={savingPlaylist || !title.trim()}
        onClick={() => void createPlaylist()}
      >
        {savingPlaylist ? 'Saving…' : 'Create playlist'}
      </button>

      {selectedPlaylist && (
        <>
          <h3 className="admin-form-title">Upload audio</h3>
          <p className="muted">
            Supported: MP3, M4A, WAV, OGG. Tracks are added to “
            {selectedPlaylist.title}”.
          </p>
          <label className="form-field">
            Title
            <input
              type="text"
              value={trackTitle}
              onChange={(e) => setTrackTitle(e.target.value)}
              placeholder="Track title (optional)"
            />
          </label>
          <label className="form-field">
            Audio file
            <input
              type="file"
              accept={AUDIO_ACCEPT}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <UploadProgressBar progress={uploadProgress} />
          <button
            type="button"
            className="btn btn--primary"
            disabled={uploading || !file}
            onClick={() => void submitTrack()}
          >
            {uploading ? 'Uploading…' : 'Add to playlist'}
          </button>
        </>
      )}
    </>
  );

  return <AdminSection list={playlistList} form={form} />;
}
