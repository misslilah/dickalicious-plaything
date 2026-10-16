import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { UniversityCategoryCreate } from '../components/UniversityCategoryCreate';
import { UniversityCategoryTiers } from '../components/UniversityCategoryTiers';
import { UniversityClassCard } from '../components/UniversityClassCard';
import { UniversityClassEditor } from '../components/UniversityClassEditor';
import { UniversityFamilyCard } from '../components/UniversityFamilyCard';
import { UniversityFamilyEditor } from '../components/UniversityFamilyEditor';
import { useAppStore } from '../hooks/useAppStore';
import { emptyUniversityClass } from '../lib/universityClasses';
import {
  emptyUniversityFamily,
  familiesInClass,
} from '../lib/universityFamilies';
import {
  isUniversityTutorialDone,
  requestUniversityTutorial,
  UNIVERSITY_TUTORIAL_DONE_EVENT,
} from '../lib/universityTutorial';
import type { UniversityClass, UniversityFamily } from '../types';

export function UniversityLayout() {
  const { state, isEffectiveAdmin } = useAppStore();
  const malus = state.progress.malusPoints;
  const { pathname } = useLocation();
  const [guideDone, setGuideDone] = useState(isUniversityTutorialDone);
  useEffect(() => {
    const sync = () => setGuideDone(isUniversityTutorialDone());
    window.addEventListener(UNIVERSITY_TUTORIAL_DONE_EVENT, sync);
    return () => window.removeEventListener(UNIVERSITY_TUTORIAL_DONE_EVENT, sync);
  }, []);
  return (
    <div className="page page--university">
      <header className="page-header university-hero">
        <div>
          <p className="university-hero__kicker">Campus</p>
          <h2>University</h2>
          <p className="muted">
            {isEffectiveAdmin
              ? 'Themes link the same subject across levels. Classes group those themes. Punishments clear malus.'
              : 'Open a theme to follow its training paths. Classes group themes. Punishments clear malus.'}
          </p>
          {guideDone ? (
            <p>
              <button
                type="button"
                className="btn btn--ghost btn--small"
                onClick={() => requestUniversityTutorial()}
              >
                Replay University guide
              </button>
            </p>
          ) : null}
        </div>
        <div className="university-hero__aside">
          <div
            className={`punishments-malus-pill${
              malus > 0 ? ' punishments-malus-pill--hot' : ' punishments-malus-pill--clear'
            }`}
          >
            <span className="punishments-malus-pill__gem" aria-hidden>
              {malus > 0 ? '⚡' : '✓'}
            </span>
            <div>
              <strong className="punishments-malus-pill__value">{malus}</strong>
              <span className="punishments-malus-pill__label">malus</span>
            </div>
          </div>
        </div>
      </header>

      <nav className="university-tabs" aria-label="University sections">
        <NavLink
          to="/university"
          end
          className={({ isActive }) =>
            `university-tabs__tab${isActive || pathname.includes('/class/') || pathname.includes('/theme/') ? ' university-tabs__tab--on' : ''}`
          }
        >
          Classes
        </NavLink>
        <NavLink
          to="/university/punishments"
          data-tutorial="university-punishments-tab"
          className={({ isActive }) =>
            `university-tabs__tab${isActive ? ' university-tabs__tab--on' : ''}`
          }
        >
          Punishments
        </NavLink>
      </nav>

      <Outlet />
    </div>
  );
}

export function UniversityClasses() {
  const {
    state,
    isEffectiveAdmin,
    addUniversityClass,
    assignCategoriesToClass,
    addUniversityFamily,
    updateUniversityFamily,
    assignCategoriesToFamily,
  } = useAppStore();
  const [panel, setPanel] = useState<
    null | 'class' | 'category' | 'family' | { editFamily: string }
  >(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const tutorialCategoryId = state.categories[0]?.id ?? null;
  const editingFamily =
    panel && typeof panel === 'object'
      ? state.universityFamilies.find((item) => item.id === panel.editFamily)
      : null;

  const closePanel = () => {
    setPanel(null);
    setError('');
  };

  const handleCreateClass = async (item: UniversityClass, categoryIds: string[]) => {
    setSaving(true);
    setError('');
    const created = await addUniversityClass(item);
    if (!created.ok) {
      setSaving(false);
      setError(created.error);
      return;
    }
    if (created.id && categoryIds.length > 0) {
      const assigned = await assignCategoriesToClass(created.id, categoryIds);
      if (!assigned.ok) {
        setSaving(false);
        setError(assigned.error);
        return;
      }
    }
    setSaving(false);
    closePanel();
  };

  const handleSaveFamily = async (
    item: UniversityFamily,
    categoryIds: string[],
  ) => {
    setSaving(true);
    setError('');
    const existingId = editingFamily?.id;
    const saved = existingId
      ? await updateUniversityFamily({ ...item, id: existingId })
      : await addUniversityFamily(item);
    if (!saved.ok) {
      setSaving(false);
      setError(saved.error);
      return;
    }
    const familyId = existingId ?? saved.id;
    if (familyId) {
      const assigned = await assignCategoriesToFamily(familyId, categoryIds);
      if (!assigned.ok) {
        setSaving(false);
        setError(assigned.error);
        return;
      }
    }
    setSaving(false);
    closePanel();
  };

  return (
    <>
      {isEffectiveAdmin ? (
        <div className="university-toolbar">
          <button
            type="button"
            className="university-plus"
            aria-label="New category"
            title="New category"
            onClick={() => {
              setError('');
              setPanel('category');
            }}
          >
            +
          </button>
        </div>
      ) : null}

      {panel === 'category' ? (
        <section className="card">
          <UniversityCategoryCreate
            onCancel={closePanel}
            onCreated={closePanel}
          />
        </section>
      ) : null}

      <section className="card">
        <div className="university-section-head">
          <h3 className="section-title">Classes</h3>
          {isEffectiveAdmin && panel !== 'class' && (
            <button
              type="button"
              className="btn btn--primary btn--small"
              onClick={() => {
                setError('');
                setPanel('class');
              }}
            >
              New class
            </button>
          )}
        </div>
        {panel === 'class' ? (
          <UniversityClassEditor
            initial={emptyUniversityClass()}
            families={state.universityFamilies}
            categories={state.categories}
            selectedCategoryIds={[]}
            saving={saving}
            error={error}
            onCancel={closePanel}
            onSave={(item, ids) => void handleCreateClass(item, ids)}
          />
        ) : state.universityClasses.length === 0 ? (
          <p className="muted">
            {isEffectiveAdmin
              ? 'No classes yet. Create a theme, then a class, and tick the themes it covers.'
              : 'No classes yet. Categories are grouped by level below.'}
          </p>
        ) : (
          <div className="university-class-grid">
            {state.universityClasses.map((item) => (
              <UniversityClassCard
                key={item.id}
                item={item}
                categoryCount={
                  familiesInClass(
                    state.universityFamilies,
                    state.categories,
                    item.id,
                  ).length
                }
                categoryLabel="themes"
              />
            ))}
          </div>
        )}
      </section>

      <section className="card" data-tutorial="university-campus">
        <div className="university-section-head">
          <div>
            <h3 className="section-title">Themes</h3>
            <p className="muted">
              {isEffectiveAdmin
                ? 'A theme links Beginner, Intermediate, Trained and Mindless of the same subject.'
                : 'Each theme is a path. If it has several categories, each one has its own progression.'}
            </p>
          </div>
          {isEffectiveAdmin && panel !== 'family' && !editingFamily && (
            <button
              type="button"
              className="btn btn--ghost btn--small"
              onClick={() => {
                setError('');
                setPanel('family');
              }}
            >
              New theme
            </button>
          )}
        </div>
        {isEffectiveAdmin && (panel === 'family' || editingFamily) ? (
          <UniversityFamilyEditor
            initial={editingFamily ?? emptyUniversityFamily()}
            categories={state.categories}
            saving={saving}
            error={error}
            onCancel={closePanel}
            onSave={(item, ids) => void handleSaveFamily(item, ids)}
          />
        ) : null}
        {state.universityFamilies.length === 0 ? (
          <p className="muted" data-tutorial="university-themes">
            {isEffectiveAdmin
              ? 'No themes yet. Create one, then attach a category at each level.'
              : 'No themes yet.'}
          </p>
        ) : (
          <div className="category-grid" data-tutorial="university-themes">
            {state.universityFamilies.map((item) => (
              <UniversityFamilyCard
                key={item.id}
                item={item}
                categories={state.categories}
              />
            ))}
          </div>
        )}
      </section>

      {isEffectiveAdmin ? (
        <UniversityCategoryTiers
          categories={state.categories}
          families={state.universityFamilies}
          tutorialCategoryId={tutorialCategoryId}
        />
      ) : null}

      {isEffectiveAdmin && (
        <p className="muted">
          <Link to="/admin?section=classes">Manage classes in Admin</Link>
          {' · '}
          <Link to="/admin?section=categories">Categories</Link>
          {' · '}
          <Link to="/admin?section=tasks">Tasks</Link>
        </p>
      )}
    </>
  );
}
