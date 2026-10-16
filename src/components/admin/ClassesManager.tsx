import { useMemo, useState } from 'react';
import { UniversityClassEditor } from '../UniversityClassEditor';
import { useAppStore } from '../../hooks/useAppStore';
import { categoriesInClass, emptyUniversityClass } from '../../lib/universityClasses';
import type { UniversityClass } from '../../types';

export function ClassesManager() {
  const {
    state,
    addUniversityClass,
    updateUniversityClass,
    deleteUniversityClass,
    assignCategoriesToClass,
  } = useAppStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const selected = state.universityClasses.find((item) => item.id === selectedId) ?? null;
  const selectedCats = useMemo(
    () => (selectedId ? categoriesInClass(state.categories, selectedId) : []),
    [selectedId, state.categories],
  );

  const saveNew = async (item: UniversityClass, categoryIds: string[]) => {
    setSaving(true);
    setError('');
    const created = await addUniversityClass(item);
    if (!created.ok) {
      setSaving(false);
      setError(created.error);
      return;
    }
    if (created.id) {
      const assigned = await assignCategoriesToClass(created.id, categoryIds);
      if (!assigned.ok) {
        setSaving(false);
        setError(assigned.error);
        return;
      }
      setSelectedId(created.id);
    }
    setSaving(false);
    setCreating(false);
  };

  const saveEdit = async (item: UniversityClass, categoryIds: string[]) => {
    if (!selected) return;
    setSaving(true);
    setError('');
    const updated = await updateUniversityClass({ ...item, id: selected.id });
    if (!updated.ok) {
      setSaving(false);
      setError(updated.error);
      return;
    }
    const assigned = await assignCategoriesToClass(selected.id, categoryIds);
    setSaving(false);
    if (!assigned.ok) {
      setError(assigned.error);
      return;
    }
  };

  const remove = async (id: string, name: string) => {
    if (!window.confirm(`Delete « ${name} »? Categories stay, ungrouped.`)) return;
    const result = await deleteUniversityClass(id);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (selectedId === id) setSelectedId(null);
  };

  return (
    <div className="admin-classes">
      <p className="muted">
        Classes live in University. Tick themes (all linked levels) rather than
        every category.
      </p>
      {error ? (
        <p className="login-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="btn-row">
        <button
          type="button"
          className="btn btn--primary btn--small"
          onClick={() => {
            setCreating(true);
            setSelectedId(null);
            setError('');
          }}
        >
          New class
        </button>
      </div>
      {creating ? (
        <UniversityClassEditor
          initial={emptyUniversityClass()}
          families={state.universityFamilies}
          categories={state.categories}
          selectedCategoryIds={[]}
          saving={saving}
          error={error}
          onCancel={() => setCreating(false)}
          onSave={(item, ids) => void saveNew(item, ids)}
        />
      ) : null}
      <ul className="admin-class-list">
        {state.universityClasses.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className={`chip${selectedId === item.id ? ' chip--active' : ''}`}
              onClick={() => {
                setCreating(false);
                setSelectedId(item.id);
              }}
            >
              {item.icon} {item.name}
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--small"
              onClick={() => void remove(item.id, item.name)}
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
      {selected && !creating ? (
        <UniversityClassEditor
          initial={selected}
          families={state.universityFamilies}
          categories={state.categories}
          selectedCategoryIds={selectedCats.map((category) => category.id)}
          saving={saving}
          error={error}
          onCancel={() => setSelectedId(null)}
          onSave={(item, ids) => void saveEdit(item, ids)}
        />
      ) : null}
    </div>
  );
}
