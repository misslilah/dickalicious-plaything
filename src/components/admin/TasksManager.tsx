import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { TaskCard } from '../TaskCard';
import { TaskListRow } from '../TaskListRow';
import { useAppStore } from '../../hooks/useAppStore';
import {
  CATEGORY_GROUP_LABELS,
  CATEGORY_GROUP_ORDER,
  getCategoryGroup,
  getPrerequisiteTaskOptions,
  sortCategoryTasks,
} from '../../lib/categoryProgression';
import { isCategoryImagePreview } from '../../lib/categoryImage';
import { USER_STAGE_OPTIONS, type TaskUserStage } from '../../lib/levels';
import {
  fetchAdminProfiles,
  type AdminProfileRow,
} from '../../lib/profileDb';
import { fetchAudioLibrary } from '../../lib/audioPlaylist';
import { resolveTaskMediaForSave } from '../../lib/taskMediaAdmin';
import { TASK_SCOPE_OPTIONS } from '../../lib/taskScope';
import type {
  AudioPlaylistItem,
  Category,
  CategoryGroup,
  Task,
  TaskFrequency,
  TaskLinkedMediaType,
  TaskRecurrence,
  TaskScope,
} from '../../types';
import {
  emptyTaskMediaPickerValue,
  TaskMediaPicker,
  type TaskMediaPickerValue,
} from './TaskMediaPicker';

const SCOPE_TABS: { value: TaskScope; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'category', label: 'Category' },
  { value: 'custom', label: 'Personal' },
];

const FREQUENCIES: { value: TaskFrequency; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'once', label: 'One-time' },
];

const LINKED_MEDIA_OPTIONS: { value: TaskLinkedMediaType; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'video', label: 'Video' },
  { value: 'audio', label: 'Audio' },
];

function emptyTaskDraft(scope: TaskScope, categoryId: string): Task {
  return {
    id: '',
    title: '',
    description: '',
    taskScope: scope,
    categoryId: scope === 'category' ? categoryId || null : null,
    assignedUserId: null,
    userStage: 'any',
    xpReward: 10,
    pointsReward: 0,
    frequency: 'daily',
    malusPointsOnFail: 0,
    sortOrder: 0,
    prerequisiteTaskId: null,
    isExamTask: false,
    recurrence: 'none',
  };
}

function taskMatchesScope(task: Task, scope: TaskScope): boolean {
  return (task.taskScope ?? 'category') === scope;
}

export function TasksManager() {
  const { state, addTask, updateTask, deleteTask } = useAppStore();
  const [filterScope, setFilterScope] = useState<TaskScope>('daily');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    null,
  );
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState<Task>(() => emptyTaskDraft('daily', ''));
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [profiles, setProfiles] = useState<AdminProfileRow[]>([]);
  const [audioLibrary, setAudioLibrary] = useState<AudioPlaylistItem[]>([]);
  const [videoMediaSearch, setVideoMediaSearch] = useState('');
  const [taskMediaPicker, setTaskMediaPicker] = useState<TaskMediaPickerValue>(
    () => emptyTaskMediaPickerValue(),
  );
  const [saving, setSaving] = useState(false);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const categoriesRef = useRef<HTMLElement>(null);

  useEffect(() => {
    void (async () => {
      const result = await fetchAdminProfiles();
      if (result.ok) setProfiles(result.profiles);
    })();
  }, []);

  useEffect(() => {
    if ((draft.linkedMediaType ?? 'none') !== 'audio') return;
    void (async () => {
      const result = await fetchAudioLibrary();
      if (result.ok) setAudioLibrary(result.library.items ?? []);
    })();
  }, [draft.linkedMediaType]);

  useEffect(() => {
    if (filterScope !== 'category') return;
    const target = selectedCategoryId
      ? workspaceRef.current
      : categoriesRef.current;
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [filterScope, selectedCategoryId]);

  const taskScope = draft.taskScope ?? 'category';
  const linkedMediaType = draft.linkedMediaType ?? 'none';

  const selectedCategory =
    state.categories.find((c) => c.id === selectedCategoryId) ?? null;

  const scopeCounts = useMemo(() => {
    const counts: Record<TaskScope, number> = {
      daily: 0,
      category: 0,
      custom: 0,
    };
    for (const task of state.tasks) {
      counts[task.taskScope ?? 'category'] += 1;
    }
    return counts;
  }, [state.tasks]);

  const taskCountByCategory = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const task of state.tasks) {
      if (!taskMatchesScope(task, 'category') || !task.categoryId) continue;
      counts[task.categoryId] = (counts[task.categoryId] ?? 0) + 1;
    }
    return counts;
  }, [state.tasks]);

  const categoriesByGroup = useMemo(() => {
    const grouped = Object.fromEntries(
      CATEGORY_GROUP_ORDER.map((group) => [group, [] as Category[]]),
    ) as Record<CategoryGroup, Category[]>;
    for (const category of state.categories) {
      grouped[getCategoryGroup(category)].push(category);
    }
    return grouped;
  }, [state.categories]);

  const videoPickerOptions = useMemo(() => {
    const q = videoMediaSearch.trim().toLowerCase();
    return [...state.videos]
      .filter((v) => {
        if (!q) return true;
        return (
          v.title.toLowerCase().includes(q) ||
          (v.description ?? '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [state.videos, videoMediaSearch]);

  const catalogTasks = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matchesSearch = (task: Task) => {
      if (!q) return true;
      return (
        task.title.toLowerCase().includes(q) ||
        task.description.toLowerCase().includes(q)
      );
    };

    if (filterScope === 'category') {
      if (!selectedCategoryId) return [];
      return sortCategoryTasks(
        state.tasks.filter(
          (task) =>
            taskMatchesScope(task, 'category') &&
            task.categoryId === selectedCategoryId &&
            matchesSearch(task),
        ),
      );
    }

    const scoped = state.tasks.filter(
      (task) => taskMatchesScope(task, filterScope) && matchesSearch(task),
    );
    if (filterScope === 'custom') {
      return scoped.sort((a, b) => {
        const userA = profiles.find((p) => p.id === a.assignedUserId)?.username ?? '';
        const userB = profiles.find((p) => p.id === b.assignedUserId)?.username ?? '';
        if (userA !== userB) return userA.localeCompare(userB);
        return a.title.localeCompare(b.title);
      });
    }
    return scoped.sort((a, b) => a.title.localeCompare(b.title));
  }, [
    filterScope,
    profiles,
    search,
    selectedCategoryId,
    state.tasks,
  ]);

  const resolvedCategoryId =
    taskScope === 'category'
      ? draft.categoryId || selectedCategoryId || state.categories[0]?.id || ''
      : null;

  const prerequisiteOptions = useMemo(() => {
    if (taskScope !== 'category' || !resolvedCategoryId) return [];
    return getPrerequisiteTaskOptions(
      state.tasks,
      resolvedCategoryId,
      draft.id,
      draft.isExamTask ?? false,
    );
  }, [
    draft.id,
    draft.isExamTask,
    resolvedCategoryId,
    state.tasks,
    taskScope,
  ]);

  const previewTask: Task = {
    ...draft,
    id: draft.id || '__draft__',
    title: draft.title.trim() || 'Untitled task',
    taskScope,
    categoryId: taskScope === 'category' ? resolvedCategoryId : null,
    assignedUserId: taskScope === 'custom' ? draft.assignedUserId ?? null : null,
  };

  const profileName = (id: string | null | undefined) =>
    id ? profiles.find((p) => p.id === id)?.username ?? 'Unknown user' : 'Unassigned';

  const resetPicker = () => setTaskMediaPicker(emptyTaskMediaPickerValue());

  const closeEditor = () => {
    setEditorOpen(false);
    setErrors({});
    setDraft(
      emptyTaskDraft(
        filterScope,
        filterScope === 'category' ? selectedCategoryId ?? '' : '',
      ),
    );
    resetPicker();
  };

  const selectScope = (scope: TaskScope) => {
    setFilterScope(scope);
    setSearch('');
    setMessage('');
    setError('');
    setErrors({});
    setEditorOpen(false);
    resetPicker();
    if (scope !== 'category') {
      setSelectedCategoryId(null);
    }
    setDraft(
      emptyTaskDraft(
        scope,
        scope === 'category' ? selectedCategoryId ?? '' : '',
      ),
    );
  };

  const selectCategory = (category: Category) => {
    setSelectedCategoryId(category.id);
    setSearch('');
    setMessage('');
    setError('');
    setErrors({});
    setEditorOpen(false);
    resetPicker();
    setDraft(emptyTaskDraft('category', category.id));
  };

  const backToCategories = () => {
    setSelectedCategoryId(null);
    setSearch('');
    setMessage('');
    setError('');
    setErrors({});
    setEditorOpen(false);
    resetPicker();
    setDraft(emptyTaskDraft('category', ''));
  };

  const startNewTask = () => {
    if (filterScope === 'category' && !selectedCategoryId) {
      setError('Select a category first.');
      return;
    }
    setMessage('');
    setError('');
    setErrors({});
    resetPicker();
    setDraft(
      emptyTaskDraft(
        filterScope,
        filterScope === 'category' ? selectedCategoryId ?? '' : '',
      ),
    );
    setEditorOpen(true);
  };

  const startEditTask = (task: Task) => {
    setMessage('');
    setError('');
    setErrors({});
    resetPicker();
    setDraft(task);
    setEditorOpen(true);
  };

  const applyScopeChange = (nextScope: TaskScope) => {
    setDraft({
      ...draft,
      taskScope: nextScope,
      categoryId:
        nextScope === 'category'
          ? draft.categoryId || selectedCategoryId || state.categories[0]?.id || ''
          : null,
      assignedUserId: nextScope === 'custom' ? draft.assignedUserId ?? null : null,
      prerequisiteTaskId: nextScope === 'category' ? draft.prerequisiteTaskId : null,
      isExamTask: nextScope === 'category' ? draft.isExamTask : false,
      sortOrder: nextScope === 'category' ? draft.sortOrder : 0,
    });
    setErrors({});
  };

  const validate = () => {
    const next: Record<string, string> = {};
    if (!draft.title.trim()) next.title = 'Title is required.';
    if (taskScope === 'category' && !resolvedCategoryId) {
      next.categoryId = 'Select a category.';
    }
    if (taskScope === 'custom' && !draft.assignedUserId) {
      next.assignedUserId = 'Select a user.';
    }
    if (linkedMediaType === 'video' && !draft.linkedVideoId) {
      next.linkedVideoId = 'Select a catalog video.';
    }
    if (
      linkedMediaType === 'audio' &&
      !draft.linkedAudioItemId &&
      !draft.linkedAudioUrl?.trim()
    ) {
      next.linkedAudio = 'Pick a library track or enter an audio URL.';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async () => {
    if (!validate()) return;
    setMessage('');
    setError('');
    setSaving(true);

    const isNew = !draft.id;
    const taskId = draft.id || crypto.randomUUID();
    const existingTask = state.tasks.find((t) => t.id === taskId);
    const mediaResult = await resolveTaskMediaForSave(
      taskId,
      existingTask ?? draft,
      taskMediaPicker,
    );
    if (!mediaResult.ok) {
      setSaving(false);
      setError(mediaResult.error);
      return;
    }

    const task: Task = {
      ...draft,
      id: taskId,
      taskScope,
      categoryId: taskScope === 'category' ? resolvedCategoryId : null,
      assignedUserId: taskScope === 'custom' ? draft.assignedUserId ?? null : null,
      taskMediaUrl: mediaResult.taskMediaUrl,
      taskMediaType: mediaResult.taskMediaType,
      taskMediaPlayback: mediaResult.taskMediaUrl
        ? draft.taskMediaPlayback ?? 'inline'
        : undefined,
      taskMediaAutoplayOnStart: mediaResult.taskMediaUrl
        ? draft.taskMediaAutoplayOnStart ?? false
        : undefined,
    };
    const result = isNew ? await addTask(task) : await updateTask(task);
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    setFilterScope(taskScope);
    if (taskScope === 'category' && task.categoryId) {
      setSelectedCategoryId(task.categoryId);
    }
    setDraft(
      emptyTaskDraft(taskScope, task.categoryId ?? selectedCategoryId ?? ''),
    );
    resetPicker();
    setErrors({});
    setEditorOpen(true);
    setMessage('Task saved.');
  };

  const remove = async (id: string) => {
    if (!window.confirm('Delete this task?')) return;
    const result = await deleteTask(id);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (draft.id === id) {
      setDraft(
        emptyTaskDraft(
          filterScope,
          filterScope === 'category' ? selectedCategoryId ?? '' : '',
        ),
      );
      resetPicker();
    }
    setMessage('Task deleted.');
  };

  const showWorkspace =
    filterScope !== 'category' || selectedCategory != null || editorOpen;
  const newTaskLabel =
    filterScope === 'daily'
      ? 'New daily task'
      : filterScope === 'custom'
        ? 'New personal task'
        : 'New task';
  const catalogTitle =
    filterScope === 'category'
      ? selectedCategory?.name ?? 'Category tasks'
      : filterScope === 'custom'
        ? 'Personal tasks'
        : 'Daily tasks';
  const catalogHint =
    filterScope === 'category'
      ? 'Same layout as the category page. Click a task to edit it.'
      : filterScope === 'custom'
        ? 'Assigned to one user. Same cards as the home daily plan.'
        : 'Shown on the home daily plan. Click a task to edit it.';

  return (
    <div className="admin-tasks">
      <p className="muted">
        Choose Daily, Category, or Personal. Category tasks use the same rows
        players see; daily and personal tasks use the home plan cards.
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

      <div className="admin-minigames-tabs" role="tablist" aria-label="Task type">
        {SCOPE_TABS.map((tab) => {
          const active = filterScope === tab.value;
          return (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={active}
              className={
                active
                  ? 'admin-minigames-tab admin-minigames-tab--active'
                  : 'admin-minigames-tab'
              }
              onClick={() => selectScope(tab.value)}
            >
              {tab.label}
              <span className="admin-count">{scopeCounts[tab.value]}</span>
            </button>
          );
        })}
      </div>

      {filterScope === 'category' && !selectedCategory && (
        <section ref={categoriesRef} className="card">
          <div className="admin-list-card__title-row">
            <h3 className="section-title">Categories</h3>
            <span className="admin-count">{state.categories.length}</span>
          </div>
          {state.categories.length === 0 ? (
            <p className="muted punishment-selected-hint">
              Create a category first, then add tasks here.
            </p>
          ) : (
            <>
              <p className="muted punishment-selected-hint">
                Choose a category to see its tasks.
              </p>
              {CATEGORY_GROUP_ORDER.map((group) => {
              const groupCategories = categoriesByGroup[group];
              if (groupCategories.length === 0) return null;
              return (
                <div key={group} className="admin-tasks-category-group">
                  <h4 className="admin-tasks-category-group__title">
                    {CATEGORY_GROUP_LABELS[group]}
                  </h4>
                  <div className="category-grid">
                    {groupCategories.map((category) => {
                      const count = taskCountByCategory[category.id] ?? 0;
                      const selected = selectedCategoryId === category.id;
                      const imagePreview = isCategoryImagePreview(category.imageUrl)
                        ? category.imageUrl
                        : null;
                      return (
                        <button
                          key={category.id}
                          type="button"
                          className={`category-card punishment-category-card${
                            selected ? ' punishment-category-card--selected' : ''
                          }`}
                          style={
                            { '--cat-color': category.color } as CSSProperties
                          }
                          aria-pressed={selected}
                          onClick={() => selectCategory(category)}
                        >
                          <div className="category-card__image-wrap">
                            {imagePreview ? (
                              <img
                                src={imagePreview}
                                alt=""
                                className="category-card__image"
                              />
                            ) : (
                              <div className="category-card__placeholder" aria-hidden>
                                <span className="category-card__icon">
                                  {category.icon}
                                </span>
                              </div>
                            )}
                          </div>
                          <div className="category-card__body">
                            <h3 className="category-card__name">{category.name}</h3>
                            <p className="category-card__meta muted">
                              {count} {count === 1 ? 'task' : 'tasks'}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            </>
          )}
        </section>
      )}

      {showWorkspace && (
        <div
          ref={workspaceRef}
          className={
            editorOpen
              ? 'admin-tasks-workspace admin-tasks-workspace--editing'
              : 'admin-tasks-workspace'
          }
        >
          {(filterScope !== 'category' || selectedCategory) && (
            <section className="card admin-tasks-catalog">
              <div className="page-header__row">
                <div>
                  {filterScope === 'category' && selectedCategory ? (
                    <nav
                      className="admin-tasks-breadcrumb"
                      aria-label="Selected category"
                    >
                      <button
                        type="button"
                        className="back-link"
                        onClick={backToCategories}
                      >
                        ← Categories
                      </button>
                      <span
                        className="admin-tasks-breadcrumb__sep"
                        aria-hidden="true"
                      >
                        /
                      </span>
                      <h3 className="section-title admin-tasks-breadcrumb__current">
                        {selectedCategory.name}
                      </h3>
                    </nav>
                  ) : (
                    <h3 className="section-title">{catalogTitle}</h3>
                  )}
                  <p className="muted">{catalogHint}</p>
                </div>
                <div className="btn-row">
                  <button
                    type="button"
                    className="btn btn--primary btn--small"
                    onClick={startNewTask}
                    disabled={filterScope === 'category' && !selectedCategory}
                  >
                    {newTaskLabel}
                  </button>
                </div>
              </div>

              <label className="field admin-list-card__search">
                <span className="visually-hidden">Search tasks</span>
                <input
                  type="search"
                  placeholder="Search…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label="Search tasks"
                />
              </label>

              {catalogTasks.length === 0 ? (
                <p className="muted punishment-category-empty">
                  {search
                    ? 'No matches.'
                    : filterScope === 'category'
                      ? 'No tasks in this category yet.'
                      : `No ${filterScope === 'custom' ? 'personal' : 'daily'} tasks yet.`}
                </p>
              ) : filterScope === 'category' ? (
                <ul className="task-list">
                  {catalogTasks.map((task) => (
                    <li key={task.id}>
                      <TaskListRow
                        task={task}
                        categoryId={task.categoryId ?? selectedCategoryId ?? ''}
                        status="not_started"
                        preview
                        selected={editorOpen && draft.id === task.id}
                        onOpen={() => startEditTask(task)}
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                <ul className="task-list">
                  {catalogTasks.map((task) => (
                    <li key={task.id}>
                      <TaskCard
                        task={task}
                        preview
                        selected={editorOpen && draft.id === task.id}
                        onSelect={() => startEditTask(task)}
                        scopeBadge={
                          filterScope === 'custom'
                            ? profileName(task.assignedUserId)
                            : undefined
                        }
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {editorOpen && (
            <section className="card admin-tasks-editor">
              <h3 className="section-title">
                {draft.id ? 'Edit task' : newTaskLabel}
              </h3>
              <p className="muted admin-punishments-preview-label">User preview</p>
              {taskScope === 'category' ? (
                <TaskListRow
                  task={previewTask}
                  categoryId={resolvedCategoryId ?? ''}
                  status="not_started"
                  preview
                />
              ) : (
                <TaskCard
                  task={previewTask}
                  preview
                  scopeBadge={
                    taskScope === 'custom'
                      ? profileName(draft.assignedUserId)
                      : undefined
                  }
                />
              )}

              <FormBlock title="Basics">
                <Field
                  label="Task type"
                  hint="Category tasks appear on category pages. Daily tasks appear on the home daily plan. Personal tasks are assigned to one user."
                >
                  <ChipSelect
                    label="Task type"
                    options={TASK_SCOPE_OPTIONS.map((opt) =>
                      opt.value === 'custom'
                        ? { ...opt, label: 'Personal' }
                        : opt,
                    )}
                    value={taskScope}
                    onChange={(scope) => applyScopeChange(scope as TaskScope)}
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
                    onChange={(e) =>
                      setDraft({ ...draft, description: e.target.value })
                    }
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
                        onChange={(categoryId) => {
                          const prereqValid =
                            !draft.prerequisiteTaskId ||
                            state.tasks.some(
                              (t) =>
                                t.id === draft.prerequisiteTaskId &&
                                t.categoryId === categoryId,
                            );
                          setDraft({
                            ...draft,
                            categoryId,
                            prerequisiteTaskId: prereqValid
                              ? draft.prerequisiteTaskId
                              : null,
                          });
                          if (errors.categoryId) {
                            setErrors((p) => ({ ...p, categoryId: '' }));
                          }
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
                  hint="Added at day end if the task is on the plan (daily/personal) or was started (category)."
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

              {taskScope === 'category' && (
                <FormBlock title="Category order & prerequisites">
                  <p className="muted" style={{ marginTop: 0 }}>
                    Control task order within this category. Players must complete the
                    prerequisite task before this one unlocks. Exam tasks unlock only
                    after all regular tasks in the category are done.
                  </p>
                  <Field
                    label="Sort order"
                    htmlFor="task-sort-order"
                    hint="Lower numbers appear first in the category task list."
                  >
                    <input
                      id="task-sort-order"
                      type="number"
                      min={0}
                      value={draft.sortOrder ?? 0}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          sortOrder: Number(e.target.value) || 0,
                        })
                      }
                    />
                  </Field>
                  <Field
                    label="Must complete first"
                    htmlFor="task-prerequisite"
                    hint={
                      prerequisiteOptions.length === 0
                        ? 'Save other category tasks first, then pick one as a prerequisite.'
                        : 'Another task in the same category that must be finished before this one is available.'
                    }
                  >
                    <select
                      id="task-prerequisite"
                      value={draft.prerequisiteTaskId ?? ''}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          prerequisiteTaskId: e.target.value || null,
                        })
                      }
                    >
                      <option value="">No prerequisite</option>
                      {prerequisiteOptions.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.isExamTask ? '[Exam] ' : ''}
                          {t.title}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Exam task">
                    <label className="checkbox-row">
                      <input
                        type="checkbox"
                        checked={draft.isExamTask ?? false}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            isExamTask: e.target.checked,
                            prerequisiteTaskId: e.target.checked
                              ? draft.prerequisiteTaskId
                              : draft.prerequisiteTaskId &&
                                  state.tasks.find(
                                    (t) => t.id === draft.prerequisiteTaskId,
                                  )?.isExamTask
                                ? null
                                : draft.prerequisiteTaskId,
                          })
                        }
                      />
                      <span>
                        Unlock only after all regular category tasks are completed
                      </span>
                    </label>
                  </Field>
                  <Field
                    label="Category recurrence"
                    htmlFor="task-recurrence"
                    hint="Daily or weekly obligations after the player accepts the task. Stays in the category only (not Home daily tasks)."
                  >
                    <select
                      id="task-recurrence"
                      value={draft.recurrence ?? 'none'}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          recurrence: e.target.value as TaskRecurrence,
                        })
                      }
                    >
                      <option value="none">None (one-time)</option>
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                    </select>
                  </Field>
                </FormBlock>
              )}

              <FormBlock title="Completion requirements">
                <p className="muted" style={{ marginTop: 0 }}>
                  Optional. Players must satisfy all configured requirements before
                  marking complete.
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
                          draft.durationSeconds != null
                            ? draft.durationSeconds % 60
                            : 0;
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
                        draft.durationSeconds != null
                          ? draft.durationSeconds % 60
                          : ''
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
                        requiredPhraseRepeatCount: Math.max(
                          1,
                          Number(e.target.value) || 1,
                        ),
                      })
                    }
                  />
                </Field>
              </FormBlock>

              <FormBlock title="Linked media">
                <p className="muted" style={{ marginTop: 0 }}>
                  Optional. Player must watch or listen to the end in a popup. Closing
                  early fails the task (malus applies).
                </p>
                <Field label="Media type">
                  <ChipSelect
                    label="Linked media type"
                    options={LINKED_MEDIA_OPTIONS}
                    value={linkedMediaType}
                    onChange={(type) => {
                      const next = type as TaskLinkedMediaType;
                      setDraft({
                        ...draft,
                        linkedMediaType: next,
                        linkedVideoId:
                          next === 'video' ? draft.linkedVideoId : undefined,
                        linkedAudioItemId:
                          next === 'audio' ? draft.linkedAudioItemId : undefined,
                        linkedAudioUrl:
                          next === 'audio' ? draft.linkedAudioUrl : undefined,
                      });
                      setErrors((p) => ({
                        ...p,
                        linkedVideoId: '',
                        linkedAudio: '',
                      }));
                    }}
                  />
                </Field>

                {linkedMediaType === 'video' && (
                  <Field
                    label="Catalog video"
                    required
                    error={errors.linkedVideoId}
                    hint="Search by title, then select a video from the catalog."
                  >
                    <input
                      type="search"
                      placeholder="Search videos…"
                      value={videoMediaSearch}
                      onChange={(e) => setVideoMediaSearch(e.target.value)}
                      aria-label="Search catalog videos"
                    />
                    {state.videos.length === 0 ? (
                      <p className="muted">
                        Upload videos in the Videos admin section first.
                      </p>
                    ) : (
                      <ChipSelect
                        label="Linked video"
                        scroll
                        options={videoPickerOptions.map((v) => ({
                          value: v.id,
                          label: v.title,
                        }))}
                        value={draft.linkedVideoId ?? ''}
                        onChange={(videoId) => {
                          setDraft({ ...draft, linkedVideoId: videoId || undefined });
                          if (errors.linkedVideoId) {
                            setErrors((p) => ({ ...p, linkedVideoId: '' }));
                          }
                        }}
                      />
                    )}
                  </Field>
                )}

                {linkedMediaType === 'audio' && (
                  <>
                    <Field
                      label="Library track"
                      error={errors.linkedAudio}
                      hint="Pick a track from audio playlists, or use an external URL below."
                    >
                      {(audioLibrary ?? []).length === 0 ? (
                        <p className="muted">
                          No audio tracks yet — add playlists in Audio admin.
                        </p>
                      ) : (
                        <ChipSelect
                          label="Linked audio track"
                          scroll
                          options={(audioLibrary ?? []).map((item) => ({
                            value: item.id,
                            label: item.title,
                          }))}
                          value={draft.linkedAudioItemId ?? ''}
                          onChange={(itemId) => {
                            setDraft({
                              ...draft,
                              linkedAudioItemId: itemId || undefined,
                              linkedAudioUrl: itemId
                                ? undefined
                                : draft.linkedAudioUrl,
                            });
                            if (errors.linkedAudio) {
                              setErrors((p) => ({ ...p, linkedAudio: '' }));
                            }
                          }}
                        />
                      )}
                    </Field>
                    <Field label="Or audio URL" htmlFor="task-linked-audio-url">
                      <input
                        id="task-linked-audio-url"
                        type="url"
                        placeholder="https://…"
                        value={draft.linkedAudioUrl ?? ''}
                        onChange={(e) => {
                          const url = e.target.value.trim();
                          setDraft({
                            ...draft,
                            linkedAudioUrl: url || undefined,
                            linkedAudioItemId: url
                              ? undefined
                              : draft.linkedAudioItemId,
                          });
                          if (errors.linkedAudio) {
                            setErrors((p) => ({ ...p, linkedAudio: '' }));
                          }
                        }}
                      />
                    </Field>
                  </>
                )}
              </FormBlock>

              <FormBlock title="Task media">
                <p className="muted" style={{ marginTop: 0 }}>
                  Optional. Upload a video or audio file for this task. Users can
                  preview attached media before starting. Check &quot;Play on
                  Start&quot; to begin playback when they click Start (inline player
                  or 40% background overlay).
                </p>
                <TaskMediaPicker
                  compact
                  existingUrl={draft.taskMediaUrl}
                  existingType={draft.taskMediaType}
                  playback={draft.taskMediaPlayback ?? 'inline'}
                  onPlaybackChange={(playback) =>
                    setDraft((d) => ({ ...d, taskMediaPlayback: playback }))
                  }
                  autoplayOnStart={draft.taskMediaAutoplayOnStart ?? false}
                  onAutoplayOnStartChange={(autoplay) =>
                    setDraft((d) => ({ ...d, taskMediaAutoplayOnStart: autoplay }))
                  }
                  value={taskMediaPicker}
                  onChange={(value) => {
                    setTaskMediaPicker(value);
                    if (value.removeExisting && !value.pendingFile) {
                      setDraft((d) => ({
                        ...d,
                        taskMediaPlayback: undefined,
                        taskMediaAutoplayOnStart: undefined,
                      }));
                    }
                  }}
                  onError={(msg) => setError(msg)}
                />
              </FormBlock>

              <div className="btn-row admin-form-actions">
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => void submit()}
                  disabled={saving}
                >
                  {draft.id ? 'Save task' : 'Create task'}
                </button>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => {
                    if (draft.id) {
                      startNewTask();
                    } else {
                      closeEditor();
                    }
                  }}
                >
                  {draft.id ? 'New instead' : 'Cancel'}
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
          )}
        </div>
      )}
    </div>
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
  label = 'Category',
}: {
  categories: Category[];
  value: string;
  onChange: (categoryId: string) => void;
  label?: string;
}) {
  return (
    <div
      className="chip-row chip-row--scroll category-chip-row"
      role="group"
      aria-label={label}
    >
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
