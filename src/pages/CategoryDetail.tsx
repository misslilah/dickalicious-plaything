import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CategoryImagePicker } from '../components/CategoryImagePicker';
import { TaskListRow } from '../components/TaskListRow';
import { useAppStore } from '../hooks/useAppStore';
import {
  areRegularCategoryTasksComplete,
  canJoinCategory,
  getCategoryCompletionStats,
  getCategoryTaskBlockReason,
  getCategoryUnlockBlockReason,
  getExamCategoryTasks,
  getRegularCategoryTasks,
  isCategoryFullyComplete,
  isCategoryTaskAvailable,
  isCategoryUnlocked,
  sortCategoryTasks,
} from '../lib/categoryProgression';
import {
  isCategoryImagePreview,
  MAX_CATEGORY_IMAGE_BYTES,
} from '../lib/categoryImage';
import {
  getStageLabel,
  getUserStage,
  USER_STAGE_OPTIONS,
  type TaskUserStage,
} from '../lib/levels';
import { getCategoryTaskStatus } from '../lib/gameLogic';
import { dailyTaskCompletionBlockedMessage, dailyTaskCompletionRemainingLabel } from '../lib/dailyTaskCompletions';
import type { Task, TaskFrequency, TaskScope } from '../types';
import { TASK_SCOPE_OPTIONS } from '../lib/taskScope';
import {
  fetchAdminProfiles,
  type AdminProfileRow,
} from '../lib/profileDb';

const STAGE_GROUP_ORDER: TaskUserStage[] = [
  'beginner',
  'intermediate',
  'trained',
  'mindless',
  'any',
];

function newId(prefix: string): string {
  return `${prefix}-${Date.now()}`;
}

export function CategoryDetail() {
  const { categoryId } = useParams<{ categoryId: string }>();
  const {
    state,
    session,
    updateCategory,
    addTask,
    updateTask,
    deleteTask,
    joinCategory,
    leaveCategory,
    dailyTaskCompletionStatus,
  } = useAppStore();
  const isAdmin = session?.role === 'admin';
  const atDailyTaskLimit =
    !isAdmin &&
    dailyTaskCompletionStatus != null &&
    !dailyTaskCompletionStatus.unlimited &&
    !dailyTaskCompletionStatus.canComplete;
  const dailyTaskLimitMessage = dailyTaskCompletionStatus
    ? dailyTaskCompletionBlockedMessage(dailyTaskCompletionStatus)
    : 'Category task limit reached (3/3). Come back tomorrow.';
  const categoryLimitLabel =
    !isAdmin && dailyTaskCompletionStatus
      ? dailyTaskCompletionRemainingLabel(dailyTaskCompletionStatus)
      : null;

  const category = state.categories.find((c) => c.id === categoryId);
  const isMember =
    isAdmin ||
    (categoryId != null && state.joinedCategoryIds.includes(categoryId));
  const joinGate = category
    ? canJoinCategory(state, category, state.progress.currentLevel)
    : { ok: false as const, reason: '' };
  const joinBlocked = category != null && !isMember && !joinGate.ok;
  const categoryLocked =
    category != null && !isAdmin && !isCategoryUnlocked(state, category);
  const completion = category
    ? getCategoryCompletionStats(state, category.id)
    : { completed: 0, total: 0, percent: 0 };
  const categoryComplete =
    category != null && isCategoryFullyComplete(state, category.id);

  const regularTasks = useMemo(
    () =>
      categoryId != null
        ? sortCategoryTasks(getRegularCategoryTasks(state, categoryId))
        : [],
    [state, categoryId],
  );

  const examTasks = useMemo(
    () =>
      categoryId != null
        ? sortCategoryTasks(getExamCategoryTasks(state, categoryId))
        : [],
    [state, categoryId],
  );

  const examUnlocked =
    categoryId != null && areRegularCategoryTasksComplete(state, categoryId);

  const categoryTasks = useMemo(
    () => [...regularTasks, ...examTasks],
    [regularTasks, examTasks],
  );

  const groupedRegular = useMemo(() => {
    const map = new Map<TaskUserStage, Task[]>();
    for (const t of regularTasks) {
      const key = t.userStage ?? 'any';
      const list = map.get(key) ?? [];
      list.push(t);
      map.set(key, list);
    }
    return STAGE_GROUP_ORDER.filter((stage) => map.has(stage)).map(
      (stage) => [stage, map.get(stage)!] as const,
    );
  }, [regularTasks]);

  const groupedExam = useMemo(() => {
    const map = new Map<TaskUserStage, Task[]>();
    for (const t of examTasks) {
      const key = t.userStage ?? 'any';
      const list = map.get(key) ?? [];
      list.push(t);
      map.set(key, list);
    }
    return STAGE_GROUP_ORDER.filter((stage) => map.has(stage)).map(
      (stage) => [stage, map.get(stage)!] as const,
    );
  }, [examTasks]);

  const [imageUrlInput, setImageUrlInput] = useState(
    () => category?.imageUrl?.startsWith('http') ? category.imageUrl : '',
  );
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [imageMessage, setImageMessage] = useState('');
  const [joinMessage, setJoinMessage] = useState('');
  const [joinError, setJoinError] = useState('');
  const [joining, setJoining] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const [profiles, setProfiles] = useState<AdminProfileRow[]>([]);
  const [taskDraft, setTaskDraft] = useState<Task>({
    id: '',
    title: '',
    description: '',
    taskScope: 'category',
    categoryId: categoryId ?? '',
    assignedUserId: null,
    userStage: 'any',
    xpReward: 10,
    pointsReward: 0,
    frequency: 'daily',
    malusPointsOnFail: 0,
    sortOrder: 0,
    prerequisiteTaskId: null,
    isExamTask: false,
  });
  const [taskMessage, setTaskMessage] = useState('');

  useEffect(() => {
    if (!isAdmin) return;
    void (async () => {
      const result = await fetchAdminProfiles();
      if (result.ok) setProfiles(result.profiles);
    })();
  }, [isAdmin]);

  const taskScope = taskDraft.taskScope ?? 'category';

  if (!category) {
    return (
      <div className="page">
        <p className="muted">Category not found.</p>
        <Link to="/" className="btn btn--ghost">
          Back to home
        </Link>
      </div>
    );
  }

  const renderTaskRow = (task: Task) => {
    const available =
      isAdmin ||
      !categoryId ||
      isCategoryTaskAvailable(state, task, categoryId);
    const lockReason =
      !available && categoryId
        ? getCategoryTaskBlockReason(state, task, categoryId)
        : null;
    return (
      <TaskListRow
        task={task}
        categoryId={category.id}
        status={getCategoryTaskStatus(state, task.id)}
        dailyLimitBlocked={atDailyTaskLimit}
        dailyLimitMessage={dailyTaskLimitMessage}
        locked={!isAdmin && !available}
        lockReason={lockReason}
      />
    );
  };

  const handleJoin = async () => {
    if (!categoryId) return;
    setJoinError('');
    setJoinMessage('');
    setJoining(true);
    const result = await joinCategory(categoryId);
    setJoining(false);
    if (!result.ok) {
      setJoinError(result.error);
      return;
    }
    setJoinMessage('You joined this category. Tasks are now available.');
  };

  const handleLeave = async () => {
    if (!categoryId) return;
    if (
      !window.confirm(
        'Leave this category? All progress and completions for this category will be reset.',
      )
    ) {
      return;
    }
    setJoinError('');
    setJoinMessage('');
    setLeaving(true);
    const result = await leaveCategory(categoryId);
    setLeaving(false);
    if (!result.ok) {
      setJoinError(result.error);
      return;
    }
    setJoinMessage('You left this category.');
  };

  const saveImageUrl = (url: string) => {
    updateCategory({ ...category, imageUrl: url || undefined });
    setImageMessage('Presentation image saved.');
  };

  const pickerPreviewUrl = (() => {
    if (filePreview) return filePreview;
    const trimmed = imageUrlInput.trim();
    if (trimmed.startsWith('http')) return trimmed;
    return isCategoryImagePreview(category.imageUrl) ? category.imageUrl : null;
  })();

  const handleImageSave = () => {
    setImageMessage('');
    if (filePreview) {
      saveImageUrl(filePreview);
      setFilePreview(null);
      return;
    }
    const trimmed = imageUrlInput.trim();
    if (!trimmed) {
      updateCategory({ ...category, imageUrl: undefined });
      setImageMessage('Image removed.');
      setImageUrlInput('');
      return;
    }
    saveImageUrl(trimmed);
  };

  const submitTask = () => {
    if (!taskDraft.title.trim()) return;
    const scope = taskDraft.taskScope ?? 'category';
    if (scope === 'category' && !category.id) return;
    if (scope === 'custom' && !taskDraft.assignedUserId) {
      setTaskMessage('Select a user for custom tasks.');
      return;
    }
    const task: Task = {
      ...taskDraft,
      id: taskDraft.id || newId('task'),
      taskScope: scope,
      categoryId: scope === 'category' ? category.id : null,
      assignedUserId: scope === 'custom' ? taskDraft.assignedUserId ?? null : null,
    };
    if (state.tasks.some((t) => t.id === task.id)) updateTask(task);
    else addTask(task);
    setTaskDraft({
      id: '',
      title: '',
      description: '',
      taskScope: 'category',
      categoryId: category.id,
      assignedUserId: null,
      userStage: 'any',
      xpReward: 10,
      pointsReward: 0,
      frequency: 'daily',
      malusPointsOnFail: 0,
      sortOrder: 0,
      prerequisiteTaskId: null,
      isExamTask: false,
    });
    setTaskMessage('Task saved.');
  };

  const removeTask = (id: string) => {
    if (!window.confirm('Delete this task?')) return;
    deleteTask(id);
    if (taskDraft.id === id) {
      setTaskDraft({
        id: '',
        title: '',
        description: '',
        taskScope: 'category',
        categoryId: category.id,
        assignedUserId: null,
        userStage: 'any',
        xpReward: 10,
        pointsReward: 0,
        frequency: 'daily',
        malusPointsOnFail: 0,
        sortOrder: 0,
        prerequisiteTaskId: null,
        isExamTask: false,
      });
    }
    setTaskMessage('Task deleted.');
  };

  return (
    <div className="page">
      <Link to="/" className="back-link">
        ← Home
      </Link>

      <header className="category-detail__header">
        <div className="category-detail__thumb">
          {category.imageUrl ? (
            <img
              src={category.imageUrl}
              alt=""
              className="category-detail__thumb-image"
            />
          ) : (
            <div
              className="category-detail__thumb-placeholder"
              style={{ background: `${category.color}22` }}
            >
              <span>{category.icon}</span>
            </div>
          )}
        </div>
        <div className="category-detail__header-text">
          <div className="category-detail__title-row">
            <h2>{category.name}</h2>
            {categoryComplete && (
              <span className="tag tag--ok">Completed</span>
            )}
          </div>
          {category.description && (
            <p className="muted">{category.description}</p>
          )}
          {category.requiredStage && (
            <p className="muted">
              Join requirement: {getStageLabel(category.requiredStage)}
            </p>
          )}
          {completion.total > 0 && (
            <div className="category-detail__completion">
              <div
                className="category-detail__progress-bar"
                role="progressbar"
                aria-valuenow={completion.percent}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <span
                  className="category-detail__progress-fill"
                  style={{ width: `${completion.percent}%` }}
                />
              </div>
              <p className="muted">
                {completion.percent}% complete ({completion.completed}/
                {completion.total} tasks)
              </p>
            </div>
          )}
          {categoryLimitLabel && isMember && (
            <p className="muted">{categoryLimitLabel}</p>
          )}
        </div>
      </header>

      {categoryLocked && (
        <section className="card">
          <p className="login-error" role="alert">
            {getCategoryUnlockBlockReason(state, category)}
          </p>
        </section>
      )}

      {!isAdmin && !isMember && !categoryLocked && (
        <section className="card">
          {joinBlocked ? (
            <>
              <p className="login-error" role="alert">
                {joinGate.reason}
              </p>
              {category.requiredStage && (
                <p className="muted">
                  Your current stage:{' '}
                  {getStageLabel(getUserStage(state.progress.currentLevel))}
                </p>
              )}
            </>
          ) : (
            <>
              <p className="muted">
                Join this category to view and complete its tasks.
              </p>
              {joinError && (
                <p className="login-error" role="alert">
                  {joinError}
                </p>
              )}
              {joinMessage && <p className="notice">{joinMessage}</p>}
              <button
                type="button"
                className="btn btn--primary btn--block"
                disabled={joining}
                onClick={() => void handleJoin()}
              >
                {joining ? 'Joining…' : 'Join category'}
              </button>
            </>
          )}
        </section>
      )}

      {!isAdmin && isMember && (
        <section className="card category-detail__member-actions">
          <p className="notice">You are a member of this category.</p>
          <button
            type="button"
            className="btn btn--ghost btn--small"
            disabled={leaving}
            onClick={() => void handleLeave()}
          >
            {leaving ? 'Leaving…' : 'Leave category'}
          </button>
        </section>
      )}

      {atDailyTaskLimit && isMember && !categoryLocked && (
        <section className="card">
          <p className="login-error" role="alert">
            {dailyTaskLimitMessage}
          </p>
        </section>
      )}

      {isMember && !categoryLocked ? (
        groupedRegular.length === 0 && examTasks.length === 0 ? (
          <section className="card">
            <p className="muted">
              No tasks in this category yet.
              {isAdmin ? ' Add tasks below by audience.' : ' Ask an admin to add tasks.'}
            </p>
          </section>
        ) : (
          <>
            {groupedRegular.map(([stage, tasks]) => (
              <section key={stage} className="library-section">
                <h3 className="library-level">{getStageLabel(stage)}</h3>
                <ul className="task-list">
                  {tasks.map((task) => (
                    <li key={task.id}>
                      {renderTaskRow(task)}
                      {(task.malusPointsOnFail ?? 0) > 0 && (
                        <p className="muted task-malus-hint">
                          +{task.malusPointsOnFail} malus if started and not completed today
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            ))}

            {examTasks.length > 0 && (
              <section className="library-section library-section--exam">
                <h3 className="library-level">Exam mode</h3>
                {!examUnlocked && !isAdmin ? (
                  <p className="muted">
                    Complete all regular tasks to unlock exam tasks.
                  </p>
                ) : groupedExam.length === 0 ? (
                  <p className="muted">No exam tasks in this section.</p>
                ) : (
                  groupedExam.map(([stage, tasks]) => (
                    <div key={`exam-${stage}`}>
                      {groupedExam.length > 1 && (
                        <h4 className="library-level library-level--sub">
                          {getStageLabel(stage)}
                        </h4>
                      )}
                      <ul className="task-list">
                        {tasks.map((task) => (
                          <li key={task.id}>
                            {renderTaskRow(task)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))
                )}
              </section>
            )}
          </>
        )
      ) : (
        !isAdmin && (
          <section className="card">
            <p className="muted">Tasks are hidden until you join this category.</p>
          </section>
        )
      )}

      {isAdmin && (
        <>
          <section className="card">
            <h2 className="section-title">Presentation image</h2>
            <p className="muted">
              Choose a file or paste a URL (files are stored as base64 in localStorage).
              Keep files under {Math.round(MAX_CATEGORY_IMAGE_BYTES / 1024)} KB to avoid storage limits.
            </p>
            {imageMessage && <p className="notice">{imageMessage}</p>}
            <CategoryImagePicker
              idPrefix="category-detail"
              previewUrl={pickerPreviewUrl}
              urlValue={imageUrlInput}
              onUrlChange={(value) => {
                setImageMessage('');
                setImageUrlInput(value);
                if (filePreview) setFilePreview(null);
              }}
              onFileSelect={(dataUrl) => {
                setImageMessage('');
                setFilePreview(dataUrl);
              }}
              onFileError={setImageMessage}
            />
            <div className="btn-row">
              <button type="button" className="btn btn--primary" onClick={handleImageSave}>
                Save image
              </button>
              {category.imageUrl && (
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => {
                    updateCategory({ ...category, imageUrl: undefined });
                    setImageUrlInput('');
                    setFilePreview(null);
                    setImageMessage('Image removed.');
                  }}
                >
                  Remove image
                </button>
              )}
            </div>
          </section>

          <section className="card">
            <h2 className="section-title">Manage tasks</h2>
            {taskMessage && <p className="notice">{taskMessage}</p>}
            <ul className="edit-list">
              {categoryTasks.map((t) => (
                <li key={t.id} className="edit-list__row">
                  <button
                    type="button"
                    className="edit-list__btn"
                    onClick={() => setTaskDraft(t)}
                  >
                    {getStageLabel(t.userStage ?? 'any')}: {t.title}
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost btn--small"
                    onClick={() => removeTask(t.id)}
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
            <div className="form-grid">
              <div className="form-grid__full">
                <span className="muted">Task type</span>
                <div className="chip-row chip-row--scroll" role="group" aria-label="Task type">
                  {TASK_SCOPE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      className={
                        taskScope === opt.value ? 'chip chip--active' : 'chip'
                      }
                      aria-pressed={taskScope === opt.value}
                      onClick={() =>
                        setTaskDraft({
                          ...taskDraft,
                          taskScope: opt.value as TaskScope,
                          categoryId:
                            opt.value === 'category' ? category.id : null,
                          assignedUserId:
                            opt.value === 'custom'
                              ? taskDraft.assignedUserId ?? null
                              : null,
                        })
                      }
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              {taskScope === 'custom' && (
                <select
                  aria-label="Assigned user"
                  value={taskDraft.assignedUserId ?? ''}
                  onChange={(e) =>
                    setTaskDraft({
                      ...taskDraft,
                      assignedUserId: e.target.value || null,
                    })
                  }
                >
                  <option value="">Select user…</option>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.username} ({p.role})
                    </option>
                  ))}
                </select>
              )}
              <input
                placeholder="Title"
                value={taskDraft.title}
                onChange={(e) => setTaskDraft({ ...taskDraft, title: e.target.value })}
              />
              <input
                placeholder="Description"
                value={taskDraft.description}
                onChange={(e) =>
                  setTaskDraft({ ...taskDraft, description: e.target.value })
                }
              />
              <select
                aria-label="User stage"
                value={taskDraft.userStage ?? 'any'}
                onChange={(e) =>
                  setTaskDraft({
                    ...taskDraft,
                    userStage: e.target.value as TaskUserStage,
                  })
                }
              >
                {USER_STAGE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={5}
                aria-label="XP reward"
                value={taskDraft.xpReward}
                onChange={(e) =>
                  setTaskDraft({ ...taskDraft, xpReward: Number(e.target.value) })
                }
              />
              <input
                type="number"
                min={0}
                aria-label="Points reward"
                placeholder="Points reward (shop)"
                title="Earned when task is completed; spend in Rewards shop"
                value={taskDraft.pointsReward ?? 0}
                onChange={(e) =>
                  setTaskDraft({ ...taskDraft, pointsReward: Number(e.target.value) })
                }
              />
              <input
                type="number"
                min={0}
                aria-label="Malus if not completed"
                placeholder="Malus if not completed"
                value={taskDraft.malusPointsOnFail ?? 0}
                onChange={(e) =>
                  setTaskDraft({
                    ...taskDraft,
                    malusPointsOnFail: Number(e.target.value),
                  })
                }
              />
              <select
                value={taskDraft.frequency}
                onChange={(e) =>
                  setTaskDraft({
                    ...taskDraft,
                    frequency: e.target.value as TaskFrequency,
                  })
                }
                aria-label="Frequency"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="once">One-time</option>
              </select>
              <input
                type="number"
                min={0}
                aria-label="Sort order"
                placeholder="Sort order"
                value={taskDraft.sortOrder ?? 0}
                onChange={(e) =>
                  setTaskDraft({
                    ...taskDraft,
                    sortOrder: Number(e.target.value) || 0,
                  })
                }
              />
              <select
                aria-label="Prerequisite task"
                value={taskDraft.prerequisiteTaskId ?? ''}
                onChange={(e) =>
                  setTaskDraft({
                    ...taskDraft,
                    prerequisiteTaskId: e.target.value || null,
                  })
                }
              >
                <option value="">No prerequisite</option>
                {categoryTasks
                  .filter((t) => t.id !== taskDraft.id)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.isExamTask ? '[Exam] ' : ''}
                      {t.title}
                    </option>
                  ))}
              </select>
              <label className="form-grid__checkbox">
                <input
                  type="checkbox"
                  checked={taskDraft.isExamTask ?? false}
                  onChange={(e) =>
                    setTaskDraft({
                      ...taskDraft,
                      isExamTask: e.target.checked,
                    })
                  }
                />
                Exam task (unlocks after regular tasks)
              </label>
              <input
                type="number"
                min={1}
                placeholder="Duration (minutes, optional)"
                value={taskDraft.durationMinutes ?? ''}
                onChange={(e) =>
                  setTaskDraft({
                    ...taskDraft,
                    durationMinutes: e.target.value
                      ? Number(e.target.value)
                      : undefined,
                  })
                }
              />
              <input
                type="number"
                min={0}
                placeholder="Timer min (resets on leave)"
                aria-label="Timer minutes"
                title="Timer: resets if player leaves the page"
                value={
                  taskDraft.timerSeconds != null
                    ? Math.floor(taskDraft.timerSeconds / 60)
                    : ''
                }
                onChange={(e) => {
                  const mins = e.target.value ? Number(e.target.value) : 0;
                  const secs =
                    taskDraft.timerSeconds != null ? taskDraft.timerSeconds % 60 : 0;
                  const total = mins * 60 + secs;
                  setTaskDraft({
                    ...taskDraft,
                    timerSeconds: total > 0 ? total : undefined,
                  });
                }}
              />
              <input
                type="number"
                min={0}
                max={59}
                placeholder="Timer sec"
                aria-label="Timer seconds"
                value={
                  taskDraft.timerSeconds != null ? taskDraft.timerSeconds % 60 : ''
                }
                onChange={(e) => {
                  const secs = e.target.value ? Number(e.target.value) : 0;
                  const mins =
                    taskDraft.timerSeconds != null
                      ? Math.floor(taskDraft.timerSeconds / 60)
                      : 0;
                  const total = mins * 60 + secs;
                  setTaskDraft({
                    ...taskDraft,
                    timerSeconds: total > 0 ? total : undefined,
                  });
                }}
              />
              <input
                type="number"
                min={0}
                placeholder="Duration min (persists)"
                aria-label="Duration minutes"
                title="Duration: keeps counting after browser close"
                value={
                  taskDraft.durationSeconds != null
                    ? Math.floor(taskDraft.durationSeconds / 60)
                    : ''
                }
                onChange={(e) => {
                  const mins = e.target.value ? Number(e.target.value) : 0;
                  const secs =
                    taskDraft.durationSeconds != null
                      ? taskDraft.durationSeconds % 60
                      : 0;
                  const total = mins * 60 + secs;
                  setTaskDraft({
                    ...taskDraft,
                    durationSeconds: total > 0 ? total : undefined,
                  });
                }}
              />
              <input
                type="number"
                min={0}
                max={59}
                placeholder="Duration sec"
                aria-label="Duration seconds"
                value={
                  taskDraft.durationSeconds != null
                    ? taskDraft.durationSeconds % 60
                    : ''
                }
                onChange={(e) => {
                  const secs = e.target.value ? Number(e.target.value) : 0;
                  const mins =
                    taskDraft.durationSeconds != null
                      ? Math.floor(taskDraft.durationSeconds / 60)
                      : 0;
                  const total = mins * 60 + secs;
                  setTaskDraft({
                    ...taskDraft,
                    durationSeconds: total > 0 ? total : undefined,
                  });
                }}
              />
              <input
                type="url"
                placeholder="Open URL (optional)"
                value={taskDraft.openUrl ?? ''}
                onChange={(e) =>
                  setTaskDraft({
                    ...taskDraft,
                    openUrl: e.target.value.trim() || undefined,
                  })
                }
              />
              <input
                placeholder="Required phrase (optional)"
                value={taskDraft.requiredPhrase ?? ''}
                onChange={(e) =>
                  setTaskDraft({
                    ...taskDraft,
                    requiredPhrase: e.target.value || undefined,
                  })
                }
              />
              <input
                type="number"
                min={1}
                placeholder="Times to write (default 1)"
                title="Times to write phrase"
                value={taskDraft.requiredPhraseRepeatCount ?? 1}
                onChange={(e) =>
                  setTaskDraft({
                    ...taskDraft,
                    requiredPhraseRepeatCount: Math.max(1, Number(e.target.value) || 1),
                  })
                }
              />
            </div>
            <button type="button" className="btn btn--primary" onClick={submitTask}>
              {taskDraft.id ? 'Update task' : 'Add task'}
            </button>
          </section>

          {groupedRegular.map(([stage, tasks]) => (
            <section key={`admin-preview-${stage}`} className="library-section">
              <h3 className="library-level">{getStageLabel(stage)} (preview)</h3>
              <ul className="task-list">
                {tasks.map((task) => (
                  <li key={task.id}>{renderTaskRow(task)}</li>
                ))}
              </ul>
            </section>
          ))}
          {examTasks.length > 0 && (
            <section className="library-section library-section--exam">
              <h3 className="library-level">Exam mode (preview)</h3>
              <ul className="task-list">
                {examTasks.map((task) => (
                  <li key={task.id}>{renderTaskRow(task)}</li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
