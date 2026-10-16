import { useMemo, useState, type FormEvent } from 'react';
import { categoryDisplayIcon } from '../lib/categoryIcon';
import {
  CATEGORY_GROUP_ICONS,
  CATEGORY_GROUP_LABELS,
  getCategoryGroup,
  UNIVERSITY_CATEGORY_GROUPS,
} from '../lib/categoryProgression';
import { emptyUniversityFamily, familyLevelMap } from '../lib/universityFamilies';
import type { Category, CategoryGroup, UniversityFamily } from '../types';

export function UniversityFamilyEditor({
  initial,
  categories,
  saving,
  error,
  onCancel,
  onSave,
}: {
  initial?: UniversityFamily | null;
  categories: Category[];
  saving: boolean;
  error: string;
  onCancel: () => void;
  onSave: (item: UniversityFamily, categoryIds: string[]) => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const initialLevels = useMemo(
    () => (initial?.id ? familyLevelMap(categories, initial.id) : {}),
    [categories, initial?.id],
  );
  const [picked, setPicked] = useState<Partial<Record<CategoryGroup, string>>>(() => {
    const next: Partial<Record<CategoryGroup, string>> = {};
    for (const group of UNIVERSITY_CATEGORY_GROUPS) {
      const current = initialLevels[group];
      if (current) next[group] = current.id;
    }
    return next;
  });

  const draft = useMemo<UniversityFamily>(
    () => ({
      ...(initial ?? emptyUniversityFamily()),
      name,
      description,
      icon: categoryDisplayIcon(name.trim() || 'Theme', initial?.icon),
    }),
    [description, initial, name],
  );

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    const ids = UNIVERSITY_CATEGORY_GROUPS.map((group) => picked[group]).filter(
      (id): id is string => Boolean(id),
    );
    onSave({ ...draft, name: trimmed, description: description.trim() }, ids);
  };

  return (
    <form className="university-quick-form" onSubmit={submit}>
      <h3 className="section-title">{initial?.id ? 'Edit theme' : 'New theme'}</h3>
      <p className="muted">
        A theme links the same subject across Beginner, Intermediate, Trained and
        Mindless. Checking it in a class covers every linked level.
      </p>
      <label className="field">
        <span>Name</span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. Hypnosis"
          required
        />
      </label>
      <label className="field">
        <span>Description</span>
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={2}
          placeholder="Optional"
        />
      </label>
      {UNIVERSITY_CATEGORY_GROUPS.map((group) => {
        const options = categories.filter(
          (category) => getCategoryGroup(category) === group,
        );
        return (
          <label key={group} className="field">
            <span>
              {CATEGORY_GROUP_ICONS[group]} {CATEGORY_GROUP_LABELS[group]}
            </span>
            <select
              value={picked[group] ?? ''}
              onChange={(event) =>
                setPicked((current) => ({
                  ...current,
                  [group]: event.target.value,
                }))
              }
            >
              <option value="">None</option>
              {options.map((category) => {
                const elsewhere =
                  Boolean(category.familyId) &&
                  category.familyId !== (initial?.id || '');
                return (
                  <option key={category.id} value={category.id}>
                    {categoryDisplayIcon(category.name, category.icon)} {category.name}
                    {elsewhere ? ' · other theme' : ''}
                  </option>
                );
              })}
            </select>
          </label>
        );
      })}
      {error ? (
        <p className="login-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="btn-row">
        <button type="submit" className="btn btn--primary" disabled={saving || !name.trim()}>
          {saving ? 'Saving…' : 'Save theme'}
        </button>
        <button type="button" className="btn btn--ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
      </div>
    </form>
  );
}
