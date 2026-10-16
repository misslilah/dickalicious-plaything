import { useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { UniversityCategoryGrid } from '../components/UniversityCategoryGrid';
import { UniversityClassEditor } from '../components/UniversityClassEditor';
import { UniversityFamilyCard } from '../components/UniversityFamilyCard';
import { useAppStore } from '../hooks/useAppStore';
import { categoriesInClass } from '../lib/universityClasses';
import { familiesInClass } from '../lib/universityFamilies';

export function UniversityClassDetail() {
  const { classId } = useParams();
  const navigate = useNavigate();
  const {
    state,
    isEffectiveAdmin,
    updateUniversityClass,
    deleteUniversityClass,
    assignCategoriesToClass,
  } = useAppStore();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const item = state.universityClasses.find((entry) => entry.id === classId);
  const cats = useMemo(
    () => (classId ? categoriesInClass(state.categories, classId) : []),
    [classId, state.categories],
  );
  const classFamilies = useMemo(
    () =>
      classId
        ? familiesInClass(state.universityFamilies, state.categories, classId)
        : [],
    [classId, state.categories, state.universityFamilies],
  );
  if (!classId) return <Navigate to="/university" replace />;
  if (!item) {
    return (
      <section className="card">
        <p className="muted">This class was not found.</p>
        <Link to="/university">Back to University</Link>
      </section>
    );
  }

  const handleSave = async (
    next: typeof item,
    categoryIds: string[],
  ) => {
    setSaving(true);
    setError('');
    const updated = await updateUniversityClass({ ...item, ...next, id: item.id });
    if (!updated.ok) {
      setSaving(false);
      setError(updated.error);
      return;
    }
    const assigned = await assignCategoriesToClass(item.id, categoryIds);
    setSaving(false);
    if (!assigned.ok) {
      setError(assigned.error);
      return;
    }
    setEditing(false);
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete « ${item.name} »? Categories stay, ungrouped.`)) return;
    const result = await deleteUniversityClass(item.id);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    navigate('/university', { replace: true });
  };

  return (
    <>
      <p>
        <Link to="/university" className="linkish">
          ← Classes
        </Link>
      </p>
      <section className="card">
        <div className="university-section-head">
          <div>
            <h3 className="section-title">
              <span aria-hidden>{item.icon || '🎓'} </span>
              {item.name}
            </h3>
            {item.description ? <p className="muted">{item.description}</p> : null}
          </div>
          {isEffectiveAdmin && !editing && (
            <div className="btn-row">
              <button
                type="button"
                className="btn btn--ghost btn--small"
                onClick={() => setEditing(true)}
              >
                Edit
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--small"
                onClick={() => void handleDelete()}
              >
                Delete
              </button>
            </div>
          )}
        </div>
        {editing ? (
          <UniversityClassEditor
            initial={item}
            families={state.universityFamilies}
            categories={state.categories}
            selectedCategoryIds={cats.map((category) => category.id)}
            saving={saving}
            error={error}
            onCancel={() => {
              setEditing(false);
              setError('');
            }}
            onSave={(next, ids) => void handleSave(next, ids)}
          />
        ) : (
          <>
            {error ? (
              <p className="login-error" role="alert">
                {error}
              </p>
            ) : null}
            {classFamilies.length > 0 ? (
              <div className="category-grid">
                {classFamilies.map((family) => (
                  <UniversityFamilyCard
                    key={family.id}
                    item={family}
                    categories={state.categories}
                  />
                ))}
              </div>
            ) : null}
            {isEffectiveAdmin ? (
              <UniversityCategoryGrid categories={cats} />
            ) : classFamilies.length === 0 ? (
              <p className="muted">No themes in this class yet.</p>
            ) : null}
          </>
        )}
      </section>
    </>
  );
}
