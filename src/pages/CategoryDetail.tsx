import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CategoryImagePicker } from '../components/CategoryImagePicker';
import { TaskCard } from '../components/TaskCard';
import { useAppStore } from '../hooks/useAppStore';
import {
  isCategoryImagePreview,
  MAX_CATEGORY_IMAGE_BYTES,
} from '../lib/categoryImage';
import type { Task, TaskFrequency } from '../types';

function newId(prefix: string): string {
  return `${prefix}-${Date.now()}`;
}

export function CategoryDetail() {
  const { categoryId } = useParams<{ categoryId: string }>();
  const { state, session, updateCategory, addTask, updateTask, deleteTask } =
    useAppStore();
  const isAdmin = session?.role === 'admin';

  const category = state.categories.find((c) => c.id === categoryId);
  const categoryTasks = useMemo(
    () => state.tasks.filter((t) => t.categoryId === categoryId),
    [state.tasks, categoryId],
  );

  const grouped = useMemo(() => {
    const map = new Map<number, Task[]>();
    for (const t of categoryTasks) {
      const list = map.get(t.minLevel) ?? [];
      list.push(t);
      map.set(t.minLevel, list);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [categoryTasks]);

  const [imageUrlInput, setImageUrlInput] = useState(
    () => category?.imageUrl?.startsWith('http') ? category.imageUrl : '',
  );
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [imageMessage, setImageMessage] = useState('');

  const [taskDraft, setTaskDraft] = useState<Task>({
    id: '',
    title: '',
    description: '',
    categoryId: categoryId ?? '',
    minLevel: 1,
    xpReward: 10,
    frequency: 'daily',
  });
  const [taskMessage, setTaskMessage] = useState('');

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

  const levelName = (n: number) =>
    state.levels.find((l) => l.number === n)?.name ?? '';

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
    const task = {
      ...taskDraft,
      id: taskDraft.id || newId('task'),
      categoryId: category.id,
    };
    if (state.tasks.some((t) => t.id === task.id)) updateTask(task);
    else addTask(task);
    setTaskDraft({
      id: '',
      title: '',
      description: '',
      categoryId: category.id,
      minLevel: 1,
      xpReward: 10,
      frequency: 'daily',
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
        categoryId: category.id,
        minLevel: 1,
        xpReward: 10,
        frequency: 'daily',
      });
    }
    setTaskMessage('Task deleted.');
  };

  return (
    <div className="page">
      <Link to="/" className="back-link">
        ← Home
      </Link>

      <header className="category-detail__hero">
        <div className="category-detail__image-wrap">
          {category.imageUrl ? (
            <img
              src={category.imageUrl}
              alt=""
              className="category-detail__image"
            />
          ) : (
            <div
              className="category-detail__placeholder"
              style={{ background: `${category.color}22` }}
            >
              <span className="category-detail__icon">{category.icon}</span>
            </div>
          )}
        </div>
        <div>
          <h2>{category.name}</h2>
          {category.description && (
            <p className="muted">{category.description}</p>
          )}
        </div>
      </header>

      {grouped.length === 0 ? (
        <section className="card">
          <p className="muted">
            No tasks in this category yet.
            {isAdmin ? ' Add tasks below by level.' : ' Ask an admin to add tasks.'}
          </p>
        </section>
      ) : (
        grouped.map(([level, tasks]) => (
          <section key={level} className="library-section">
            <h3 className="library-level">
              Level {level}
              {levelName(level) ? ` — ${levelName(level)}` : ''}
            </h3>
            <ul className="task-list">
              {tasks.map((task) => {
                const locked = task.minLevel > state.progress.currentLevel;
                return (
                  <li key={task.id}>
                    <TaskCard task={task} showXp disabled={locked} />
                    {locked && (
                      <p className="locked-hint">Unlocks at level {task.minLevel}</p>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))
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
                    Lvl {t.minLevel}: {t.title}
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
              <input
                type="number"
                min={1}
                max={5}
                aria-label="Minimum level"
                value={taskDraft.minLevel}
                onChange={(e) =>
                  setTaskDraft({ ...taskDraft, minLevel: Number(e.target.value) })
                }
              />
              <input
                type="number"
                min={5}
                aria-label="XP reward"
                value={taskDraft.xpReward}
                onChange={(e) =>
                  setTaskDraft({ ...taskDraft, xpReward: Number(e.target.value) })
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
            </div>
            <button type="button" className="btn btn--primary" onClick={submitTask}>
              {taskDraft.id ? 'Update task' : 'Add task'}
            </button>
          </section>
        </>
      )}
    </div>
  );
}
