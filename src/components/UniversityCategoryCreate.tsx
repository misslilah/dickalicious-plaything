import { useState, type FormEvent } from 'react';
import { useAppStore } from '../hooks/useAppStore';
import { categoryDisplayIcon } from '../lib/categoryIcon';
import {
  CATEGORY_GROUP_ICONS,
  CATEGORY_GROUP_LABELS,
  UNIVERSITY_CATEGORY_GROUPS,
} from '../lib/categoryProgression';
import type { CategoryGroup } from '../types';

export function UniversityCategoryCreate({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: () => void;
}) {
  const { state, addCategory } = useAppStore();
  const [name, setName] = useState('');
  const [group, setGroup] = useState<CategoryGroup>('beginner');
  const [familyId, setFamilyId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    setError('');
    const result = await addCategory({
      id: '',
      name: trimmed,
      icon: categoryDisplayIcon(trimmed),
      color: '#f9a8d4',
      description: '',
      categoryGroup: group,
      requiredStage: null,
      unlockAfterCategoryId: null,
      classId: null,
      familyId: familyId || null,
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onCreated();
  };

  return (
    <form className="university-quick-form" onSubmit={(event) => void submit(event)}>
      <h3 className="section-title">New category</h3>
      <p className="muted">
        It shows up in University under the level you pick. Optionally attach it
        to a theme so all levels of the same subject stay linked.
      </p>
      <label className="field">
        <span>Name</span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. Hypnosis Beginner"
          required
        />
      </label>
      <label className="field">
        <span>Level</span>
        <select
          value={group}
          onChange={(event) => setGroup(event.target.value as CategoryGroup)}
        >
          {UNIVERSITY_CATEGORY_GROUPS.map((item) => (
            <option key={item} value={item}>
              {CATEGORY_GROUP_ICONS[item]} {CATEGORY_GROUP_LABELS[item]}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Theme</span>
        <select
          value={familyId}
          onChange={(event) => setFamilyId(event.target.value)}
        >
          <option value="">Unlinked</option>
          {state.universityFamilies.map((family) => (
            <option key={family.id} value={family.id}>
              {family.icon || '📚'} {family.name}
            </option>
          ))}
        </select>
      </label>
      {error ? (
        <p className="login-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="btn-row">
        <button type="submit" className="btn btn--primary" disabled={saving || !name.trim()}>
          {saving ? 'Saving…' : 'Create category'}
        </button>
        <button type="button" className="btn btn--ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
      </div>
    </form>
  );
}
