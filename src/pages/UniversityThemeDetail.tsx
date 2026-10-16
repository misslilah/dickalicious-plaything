import { useMemo, useState } from 'react';
import { Link, Navigate, NavLink, useParams } from 'react-router-dom';
import { UniversityFamilyEditor } from '../components/UniversityFamilyEditor';
import { useAppStore } from '../hooks/useAppStore';
import { categoryDisplayIcon } from '../lib/categoryIcon';
import {
  CATEGORY_GROUP_LABELS,
  getCategoryGroup,
  getExamCategoryTasks,
} from '../lib/categoryProgression';
import { categoriesInFamilyOrdered } from '../lib/universityFamilies';
import type { Category, CategoryGroup, UniversityFamily } from '../types';

function moduleLevelLabel(group: CategoryGroup): string {
  return CATEGORY_GROUP_LABELS[group] || group;
}

export function UniversityThemeDetail() {
  const { familyId } = useParams();
  const {
    state,
    isEffectiveAdmin,
    updateUniversityFamily,
    assignCategoriesToFamily,
  } = useAppStore();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const item = state.universityFamilies.find((entry) => entry.id === familyId);
  const modules = useMemo(
    () => (familyId ? categoriesInFamilyOrdered(state.categories, familyId) : []),
    [familyId, state.categories],
  );
  const graduation = useMemo(() => {
    const withExams = [...modules]
      .reverse()
      .find((category) => getExamCategoryTasks(state, category.id).length > 0);
    return withExams ?? null;
  }, [modules, state]);

  if (!familyId) return <Navigate to="/university" replace />;
  if (!item) {
    return (
      <section className="card">
        <p className="muted">This theme was not found.</p>
        <Link to="/university">Back to University</Link>
      </section>
    );
  }

  const handleSave = async (next: UniversityFamily, categoryIds: string[]) => {
    setSaving(true);
    setError('');
    const updated = await updateUniversityFamily({ ...item, ...next, id: item.id });
    if (!updated.ok) {
      setSaving(false);
      setError(updated.error);
      return;
    }
    const assigned = await assignCategoriesToFamily(item.id, categoryIds);
    setSaving(false);
    if (!assigned.ok) {
      setError(assigned.error);
      return;
    }
    setEditing(false);
  };

  return (
    <div className="university-degree">
      <p>
        <Link to="/university" className="linkish">
          ← Themes
        </Link>
      </p>

      {state.universityFamilies.length > 1 ? (
        <nav className="university-degree-tabs" aria-label="Themes">
          {state.universityFamilies.map((family) => (
            <NavLink
              key={family.id}
              to={`/university/theme/${family.id}`}
              className={({ isActive }) =>
                `university-degree-tabs__tab${isActive ? ' university-degree-tabs__tab--on' : ''}`
              }
            >
              {family.name}
            </NavLink>
          ))}
        </nav>
      ) : null}

      {isEffectiveAdmin ? (
        <div className="university-section-head">
          {editing ? null : (
            <button
              type="button"
              className="btn btn--ghost btn--small"
              onClick={() => setEditing(true)}
            >
              Edit theme
            </button>
          )}
        </div>
      ) : null}

      {editing ? (
        <section className="card">
          <UniversityFamilyEditor
            initial={item}
            categories={state.categories}
            saving={saving}
            error={error}
            onCancel={() => {
              setEditing(false);
              setError('');
            }}
            onSave={(next, ids) => void handleSave(next, ids)}
          />
        </section>
      ) : error ? (
        <p className="login-error" role="alert">
          {error}
        </p>
      ) : null}

      {modules.length === 0 ? (
        <section className="card" data-tutorial="university-modules">
          <p className="muted">No modules in this theme yet.</p>
        </section>
      ) : (
        <ol className="university-module-list" data-tutorial="university-modules">
          {modules.map((category, index) => (
            <li key={category.id}>
              <ThemeModuleLink category={category} index={index + 1} />
            </li>
          ))}
        </ol>
      )}

      {graduation ? (
        <Link
          to={`/category/${graduation.id}`}
          className="university-module-grad"
        >
          <span className="university-module-grad__kicker">
            Module {modules.length + 1}
          </span>
          Graduation Exams
        </Link>
      ) : null}
    </div>
  );
}

function ThemeModuleLink({
  category,
  index,
}: {
  category: Category;
  index: number;
}) {
  const group = getCategoryGroup(category);
  const thumb = category.imageUrl;
  return (
    <Link to={`/category/${category.id}`} className="university-module">
      <span className="university-module__index" aria-hidden>
        {index}
      </span>
      <div className="university-module__body">
        <p className="university-module__kicker">
          Module {index} - {moduleLevelLabel(group)}
        </p>
        <div className="university-module__card">
          {thumb ? (
            <img src={thumb} alt="" className="university-module__thumb" />
          ) : (
            <div className="university-module__thumb university-module__thumb--placeholder" aria-hidden>
              {categoryDisplayIcon(category.name, category.icon)}
            </div>
          )}
          <div>
            <h3 className="university-module__name">{category.name}</h3>
            {category.description ? (
              <p className="university-module__desc">{category.description}</p>
            ) : (
              <p className="university-module__desc muted">Open this module to continue the path.</p>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
