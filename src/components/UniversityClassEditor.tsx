import { useMemo, useState, type FormEvent } from 'react';
import { categoryDisplayIcon } from '../lib/categoryIcon';
import { emptyUniversityClass } from '../lib/universityClasses';
import {
  categoryIdsForClassPicker,
  selectedFamilyIdsForClass,
  selectedUnlinkedIdsForClass,
  unlinkedCategories,
} from '../lib/universityFamilies';
import type { Category, UniversityClass, UniversityFamily } from '../types';

export function UniversityClassEditor({
  initial,
  families,
  categories,
  selectedCategoryIds,
  saving,
  error,
  onCancel,
  onSave,
}: {
  initial?: UniversityClass | null;
  families: UniversityFamily[];
  categories: Category[];
  selectedCategoryIds: string[];
  saving: boolean;
  error: string;
  onCancel: () => void;
  onSave: (item: UniversityClass, categoryIds: string[]) => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [pickedFamilies, setPickedFamilies] = useState<string[]>(() =>
    initial?.id
      ? selectedFamilyIdsForClass(categories, initial.id)
      : [],
  );
  const [pickedUnlinked, setPickedUnlinked] = useState<string[]>(() =>
    initial?.id
      ? selectedUnlinkedIdsForClass(categories, initial.id)
      : selectedCategoryIds.filter((id) =>
          categories.some((category) => category.id === id && !category.familyId),
        ),
  );

  const loose = useMemo(() => unlinkedCategories(categories), [categories]);

  const draft = useMemo<UniversityClass>(
    () => ({
      ...(initial ?? emptyUniversityClass()),
      name,
      description,
    }),
    [description, initial, name],
  );

  const toggleFamily = (id: string) => {
    setPickedFamilies((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  };

  const toggleUnlinked = (id: string) => {
    setPickedUnlinked((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onSave(
      { ...draft, name: trimmed, description: description.trim() },
      categoryIdsForClassPicker(categories, pickedFamilies, pickedUnlinked),
    );
  };

  return (
    <form className="card university-class-editor" onSubmit={submit}>
      <h3 className="section-title">{initial?.id ? 'Edit class' : 'New class'}</h3>
      <p className="muted">
        Tick themes. A theme includes every linked level (Beginner through
        Mindless). Unlinked categories sit in a separate list.
      </p>
      <label className="field">
        <span>Name</span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. Freshman year"
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
      <fieldset className="field" style={{ border: 0, padding: 0 }}>
        <legend>Themes</legend>
        {families.length === 0 ? (
          <p className="muted">
            No themes yet. Create a theme first so a class can cover all levels at
            once.
          </p>
        ) : (
          <ul className="university-class-editor__cats">
            {families.map((family) => {
              const members = categories.filter(
                (category) => category.familyId === family.id,
              );
              const elsewhere = members.some(
                (category) =>
                  Boolean(category.classId) &&
                  category.classId !== (initial?.id || '') &&
                  !pickedFamilies.includes(family.id),
              );
              return (
                <li key={family.id}>
                  <label className="university-class-editor__cat">
                    <input
                      type="checkbox"
                      checked={pickedFamilies.includes(family.id)}
                      onChange={() => toggleFamily(family.id)}
                    />
                    <span>
                      {family.icon || '📚'} {family.name}
                      <span className="muted">
                        {' '}
                        · {members.length}{' '}
                        {members.length === 1 ? 'level' : 'levels'}
                        {elsewhere ? ' · in another class' : ''}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </fieldset>
      {loose.length > 0 ? (
        <fieldset className="field university-class-editor__unlinked" style={{ border: 0, padding: 0 }}>
          <legend>Unlinked</legend>
          <p className="muted">
            Categories not attached to a theme yet.
          </p>
          <ul className="university-class-editor__cats">
            {loose.map((category) => {
              const elsewhere =
                Boolean(category.classId) &&
                category.classId !== (initial?.id || '') &&
                !pickedUnlinked.includes(category.id);
              return (
                <li key={category.id}>
                  <label className="university-class-editor__cat">
                    <input
                      type="checkbox"
                      checked={pickedUnlinked.includes(category.id)}
                      onChange={() => toggleUnlinked(category.id)}
                    />
                    <span>
                      {categoryDisplayIcon(category.name, category.icon)} {category.name}
                      {elsewhere ? (
                        <span className="muted"> · in another class</span>
                      ) : null}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>
      ) : null}
      {error ? (
        <p className="login-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="btn-row">
        <button type="submit" className="btn btn--primary" disabled={saving || !name.trim()}>
          {saving ? 'Saving…' : 'Save class'}
        </button>
        <button type="button" className="btn btn--ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
      </div>
    </form>
  );
}
