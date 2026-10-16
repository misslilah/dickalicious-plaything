import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CategoryImagePicker } from '../components/CategoryImagePicker';
import { CategoryTaskDetailModal } from '../components/CategoryTaskDetailModal';
import { CategoryTaskPathCard } from '../components/CategoryTaskPathCard';
import {
  emptyTaskMediaPickerValue,
  TaskMediaPicker,
  type TaskMediaPickerValue,
} from '../components/admin/TaskMediaPicker';
import { useAppStore } from '../hooks/useAppStore';
import {
  areRegularCategoryTasksComplete,
  canJoinCategory,
  getCategoryTaskBlockReason,
  getCategoryUnlockBlockReason,
  getExamCategoryTasks,
  getPrerequisiteTaskLabel,
  getPrerequisiteTaskOptions,
  getRegularCategoryTasks,
  isCategoryFullyComplete,
  isCategoryTaskAvailable,
  isCategoryTaskEverCompleted,
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
import {
  getRecurringTaskStatusLabel,
  isRecurringCategoryTask,
  isRecurringTaskAccepted,
} from '../lib/recurringCategoryTasks';
import type { Task, TaskFrequency, TaskRecurrence, TaskScope } from '../types';
import { TASK_SCOPE_OPTIONS } from '../lib/taskScope';
import { resolveTaskMediaForSave } from '../lib/taskMediaAdmin';
import {
  fetchAdminProfiles,
  type AdminProfileRow,
} from '../lib/profileDb';

function newId(prefix: string): string {
  return `${prefix}-${Date.now()}`;
}

export function CategoryDetail() {
  const { categoryId } = useParams<{ categoryId: string }>();
  const {
    state,
    updateCategory,
    addTask,
    updateTask,
    deleteTask,
    joinCategory,
    leaveCategory,
    dailyTaskCompletionStatus,
    isEffectiveAdmin,
  } = useAppStore();
  const isAdmin = isEffectiveAdmin;
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

  const oneTimeRegular = useMemo(
    () => regularTasks.filter((t) => !isRecurringCategoryTask(t)),
    [regularTasks],
  );

  const recurringRegular = useMemo(
    () => regularTasks.filter((t) => isRecurringCategoryTask(t)),
    [regularTasks],
  );

  const trainingStats = useMemo(() => {
    const total = regularTasks.length;
    const completed = regularTasks.filter((t) =>
      isCategoryTaskEverCompleted(state, t.id),
    ).length;
    return {
      completed,
      total,
      percent: total === 0 ? 0 : Math.round((completed / total) * 100),
    };
  }, [regularTasks, state]);

  const examStats = useMemo(() => {
    const total = examTasks.length;
    const completed = examTasks.filter((t) =>
      isCategoryTaskEverCompleted(state, t.id),
    ).length;
    return {
      completed,
      total,
      percent: total === 0 ? 0 : Math.round((completed / total) * 100),
    };
  }, [examTasks, state]);

  const recurringChapterTitle = useMemo(() => {
    const hasDaily = recurringRegular.some((t) => t.recurrence === 'daily');
    const hasWeekly = recurringRegular.some((t) => t.recurrence === 'weekly');
    if (hasDaily && hasWeekly) return 'Do today / This week';
    if (hasWeekly) return 'This week';
    return 'Do today';
  }, [recurringRegular]);

  const nextTrainingTaskId = useMemo(() => {
    if (!categoryId) return null;
    return (
      oneTimeRegular.find((task) => {
        const done = isCategoryTaskEverCompleted(state, task.id);
        if (done) return false;
        const available =
          isAdmin || isCategoryTaskAvailable(state, task, categoryId);
        return available;
      })?.id ?? null
    );
  }, [oneTimeRegular, state, categoryId, isAdmin]);

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
    recurrence: 'none',
  });
  const [taskMessage, setTaskMessage] = useState('');
  const [taskMediaPicker, setTaskMediaPicker] = useState<TaskMediaPickerValue>(
    () => emptyTaskMediaPickerValue(),
  );
  const [savingTask, setSavingTask] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const selectedTask = selectedTaskId
    ? categoryTasks.find((t) => t.id === selectedTaskId) ?? null
    : null;

  useEffect(() => {
    if (!isAdmin) return;
    void (async () => {
      const result = await fetchAdminProfiles();
      if (result.ok) setProfiles(result.profiles);
    })();
  }, [isAdmin]);

  const taskScope = taskDraft.taskScope ?? 'category';

  const prerequisiteOptions = useMemo(
    () =>
      categoryId
        ? getPrerequisiteTaskOptions(
            state.tasks,
            categoryId,
            taskDraft.id,
            taskDraft.isExamTask ?? false,
          )
        : [],
    [state.tasks, categoryId, taskDraft.id, taskDraft.isExamTask],
  );

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

  const firstTutorialCardId =
    oneTimeRegular[0]?.id ?? recurringRegular[0]?.id ?? examTasks[0]?.id ?? null;

  const renderPathCard = (
    task: Task,
    options: {
      stepNumber?: number;
      variant?: 'path' | 'recurring' | 'exam';
      isNext?: boolean;
    } = {},
  ) => {
    const available =
      isAdmin ||
      !categoryId ||
      isCategoryTaskAvailable(state, task, categoryId);
    const lockReason =
      !available && categoryId
        ? getCategoryTaskBlockReason(state, task, categoryId)
        : null;
    const recurring = isRecurringCategoryTask(task);
    const pendingAccept =
      recurring &&
      isMember &&
      !isAdmin &&
      !isRecurringTaskAccepted(state, task.id);
    const recurrenceStatus = recurring
      ? getRecurringTaskStatusLabel(state, task)
      : null;
    const variant = options.variant ?? (task.isExamTask ? 'exam' : 'path');
    const isNext =
      options.isNext ??
      (variant === 'recurring'
        ? !pendingAccept &&
          getCategoryTaskStatus(state, task.id) !== 'done' &&
          available
        : task.id === nextTrainingTaskId);
    return (
      <CategoryTaskPathCard
        task={task}
        category={category}
        stepNumber={options.stepNumber}
        status={getCategoryTaskStatus(state, task.id)}
        dailyLimitBlocked={atDailyTaskLimit && !pendingAccept}
        dailyLimitMessage={dailyTaskLimitMessage}
        locked={!isAdmin && !available}
        lockReason={lockReason}
        pendingAccept={pendingAccept}
        recurrenceStatus={recurrenceStatus}
        prerequisiteLabel={getPrerequisiteTaskLabel(task, state.tasks)}
        isNext={Boolean(isNext)}
        variant={variant}
        tutorialTarget={
          task.id === firstTutorialCardId ? 'training-path-card' : undefined
        }
        onOpen={
          isMember && !categoryLocked
            ? () => setSelectedTaskId(task.id)
            : undefined
        }
      />
    );
  };

  const renderTrainingPath = (tasks: Task[], variant: 'path' | 'exam') => (
    <ol
      className="category-task-path"
      style={{ '--cat-color': category.color } as CSSProperties}
    >
      {tasks.map((task, index) => (
        <li key={task.id} className="category-task-path__item">
          {renderPathCard(task, {
            stepNumber: index + 1,
            variant,
            isNext:
              variant === 'path'
                ? task.id === nextTrainingTaskId
                : examUnlocked &&
                  !isCategoryTaskEverCompleted(state, task.id) &&
                  (isAdmin ||
                    !categoryId ||
                    isCategoryTaskAvailable(state, task, categoryId)) &&
                  tasks
                    .slice(0, index)
                    .every((t) => isCategoryTaskEverCompleted(state, t.id)),
          })}
        </li>
      ))}
    </ol>
  );

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

  const submitTask = async () => {
    if (!taskDraft.title.trim()) return;
    const scope = taskDraft.taskScope ?? 'category';
    if (scope === 'category' && !category.id) return;
    if (scope === 'custom' && !taskDraft.assignedUserId) {
      setTaskMessage('Select a user for custom tasks.');
      return;
    }

    setSavingTask(true);
    const taskId = taskDraft.id || newId('task');
    const existingTask = state.tasks.find((t) => t.id === taskId);
    const mediaResult = await resolveTaskMediaForSave(
      taskId,
      existingTask ?? taskDraft,
      taskMediaPicker,
    );
    if (!mediaResult.ok) {
      setSavingTask(false);
      setTaskMessage(mediaResult.error);
      return;
    }

    const task: Task = {
      ...taskDraft,
      id: taskId,
      taskScope: scope,
      categoryId: scope === 'category' ? category.id : null,
      assignedUserId: scope === 'custom' ? taskDraft.assignedUserId ?? null : null,
      taskMediaUrl: mediaResult.taskMediaUrl,
      taskMediaType: mediaResult.taskMediaType,
      taskMediaPlayback: mediaResult.taskMediaUrl
        ? taskDraft.taskMediaPlayback ?? 'inline'
        : undefined,
      taskMediaAutoplayOnStart: mediaResult.taskMediaUrl
        ? taskDraft.taskMediaAutoplayOnStart ?? false
        : undefined,
    };
    const result = state.tasks.some((t) => t.id === task.id)
      ? await updateTask(task)
      : await addTask(task);
    setSavingTask(false);
    if (!result.ok) {
      setTaskMessage(result.error);
      return;
    }
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
      recurrence: 'none',
    });
    setTaskMediaPicker(emptyTaskMediaPickerValue());
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
        recurrence: 'none',
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
          {(trainingStats.total > 0 || examStats.total > 0) && (
            <div className="category-path-progress">
              {trainingStats.total > 0 && (
                <div className="category-path-progress__row">
                  <div className="category-path-progress__label">
                    <span className="category-path-progress__name">
                      Training {trainingStats.completed}/{trainingStats.total}
                    </span>
                    <span className="category-path-progress__count">
                      {trainingStats.percent}%
                    </span>
                  </div>
                  <div
                    className="category-path-progress__bar"
                    role="progressbar"
                    aria-label={`Training ${trainingStats.completed} of ${trainingStats.total}`}
                    aria-valuenow={trainingStats.percent}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <span
                      className="category-path-progress__fill"
                      style={{ width: `${trainingStats.percent}%` }}
                    />
                  </div>
                </div>
              )}
              {examStats.total > 0 && (
                <div className="category-path-progress__row">
                  <div className="category-path-progress__label">
                    <span className="category-path-progress__name">
                      {!examUnlocked
                        ? 'Exam locked'
                        : examStats.completed >= examStats.total
                          ? 'Exam complete'
                          : `Exam ${examStats.completed}/${examStats.total}`}
                    </span>
                    <span className="category-path-progress__count">
                      {examUnlocked
                        ? `${examStats.percent}%`
                        : 'Finish training first'}
                    </span>
                  </div>
                  <div
                    className="category-path-progress__bar"
                    role="progressbar"
                    aria-label={
                      examUnlocked
                        ? `Exam ${examStats.completed} of ${examStats.total}`
                        : 'Exam locked'
                    }
                    aria-valuenow={examUnlocked ? examStats.percent : 0}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <span
                      className={`category-path-progress__fill category-path-progress__fill--exam${examUnlocked ? '' : ' category-path-progress__fill--locked'}`}
                      style={{
                        width: `${examUnlocked ? examStats.percent : 0}%`,
                      }}
                    />
                  </div>
                </div>
              )}
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
                data-tutorial="category-join"
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
            data-tutorial="category-leave"
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
        regularTasks.length === 0 && examTasks.length === 0 ? (
          <section className="card">
            <p className="muted">
              No tasks in this category yet.
              {isAdmin ? ' Add tasks below by audience.' : ' Ask an admin to add tasks.'}
            </p>
          </section>
        ) : (
          <>
            {recurringRegular.length > 0 && (
              <section
                className="category-chapter category-chapter--recurring"
                data-tutorial="do-today"
              >
                <div className="category-chapter__head">
                  <h3 className="category-chapter__title">{recurringChapterTitle}</h3>
                  <p className="category-chapter__hint muted">
                    Recurring tasks stay on your path until the category is complete.
                  </p>
                </div>
                <div className="category-recurring-strip">
                  {recurringRegular.map((task) => (
                    <div key={task.id}>
                      {renderPathCard(task, { variant: 'recurring' })}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {oneTimeRegular.length > 0 && (
              <section
                className="category-chapter category-chapter--training"
                data-tutorial="training-path"
              >
                <div className="category-chapter__head">
                  <h3 className="category-chapter__title">Training path</h3>
                  <p className="category-chapter__hint muted">
                    Follow the steps in order
                  </p>
                </div>
                {renderTrainingPath(oneTimeRegular, 'path')}
              </section>
            )}

            {examTasks.length > 0 && (
              <section
                className="category-chapter category-chapter--exam"
                data-tutorial="exam-chapter"
              >
                <div className="category-chapter__head">
                  <h3 className="category-chapter__title">Exam</h3>
                  {categoryComplete ? (
                    <span className="tag tag--ok">Completed</span>
                  ) : examUnlocked ? (
                    <p className="category-chapter__hint muted">
                      {examStats.completed}/{examStats.total} complete
                    </p>
                  ) : (
                    <p className="category-chapter__hint muted">
                      Locked until training is finished
                    </p>
                  )}
                </div>
                {!examUnlocked && !isAdmin && (
                  <p className="muted">
                    Complete all regular tasks to unlock exam tasks.
                  </p>
                )}
                {renderTrainingPath(examTasks, 'exam')}
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
                    onClick={() => {
                      setTaskDraft(t);
                      setTaskMediaPicker(emptyTaskMediaPickerValue());
                    }}
                  >
                    {getStageLabel(t.userStage ?? 'any')}: {t.title}
                    {t.isExamTask ? ' [Exam]' : ''}
                    {(t.recurrence ?? 'none') !== 'none'
                      ? ` [${(t.recurrence ?? 'none').charAt(0).toUpperCase()}${(t.recurrence ?? 'none').slice(1)}]`
                      : ''}
                    {getPrerequisiteTaskLabel(t, state.tasks)
                      ? ` · after "${getPrerequisiteTaskLabel(t, state.tasks)}"`
                      : ''}
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
                title="Earned when task is completed; spend in the Shop"
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
              <select
                value={taskDraft.recurrence ?? 'none'}
                onChange={(e) =>
                  setTaskDraft({
                    ...taskDraft,
                    recurrence: e.target.value as TaskRecurrence,
                  })
                }
                aria-label="Category recurrence"
                title="Recurring category tasks must be accepted, then completed each day or week"
              >
                <option value="none">Recurrence: None</option>
                <option value="daily">Recurrence: Daily</option>
                <option value="weekly">Recurrence: Weekly</option>
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
              <label className="form-grid__label form-grid__full">
                Must complete first
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
                  {prerequisiteOptions.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.isExamTask ? '[Exam] ' : ''}
                      {t.title}
                    </option>
                  ))}
                </select>
              </label>
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
              <div className="form-grid__full">
                <span className="muted">Task media</span>
                <TaskMediaPicker
                  compact
                  existingUrl={taskDraft.taskMediaUrl}
                  existingType={taskDraft.taskMediaType}
                  playback={taskDraft.taskMediaPlayback ?? 'inline'}
                  onPlaybackChange={(playback) =>
                    setTaskDraft((d) => ({ ...d, taskMediaPlayback: playback }))
                  }
                  autoplayOnStart={taskDraft.taskMediaAutoplayOnStart ?? false}
                  onAutoplayOnStartChange={(autoplay) =>
                    setTaskDraft((d) => ({ ...d, taskMediaAutoplayOnStart: autoplay }))
                  }
                  value={taskMediaPicker}
                  onChange={(value) => {
                    setTaskMediaPicker(value);
                    if (value.removeExisting && !value.pendingFile) {
                      setTaskDraft((d) => ({
                        ...d,
                        taskMediaPlayback: undefined,
                        taskMediaAutoplayOnStart: undefined,
                      }));
                    }
                  }}
                  onError={(message) => setTaskMessage(message)}
                />
              </div>
            </div>
            <button
              type="button"
              className="btn btn--primary"
              disabled={savingTask}
              onClick={submitTask}
            >
              {taskDraft.id ? 'Update task' : 'Add task'}
            </button>
          </section>

        </>
      )}
      {selectedTask && categoryId && (
        <CategoryTaskDetailModal
          open={selectedTaskId != null}
          task={selectedTask}
          category={category}
          categoryId={categoryId}
          isAdmin={isAdmin}
          isMember={isMember}
          onClose={() => setSelectedTaskId(null)}
        />
      )}
    </div>
  );
}
