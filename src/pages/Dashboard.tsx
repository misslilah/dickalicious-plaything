import { Link } from 'react-router-dom';
import { CategoryCard } from '../components/CategoryCard';
import { DailyTasksSection } from '../components/DailyTasksSection';
import { XpBar } from '../components/XpBar';
import { useAppStore } from '../hooks/useAppStore';
import { completionStats, getTodayPlan } from '../lib/gameLogic';

export function Dashboard() {
  const { state } = useAppStore();
  const { progress, levels } = state;
  const levelInfo = levels.find((l) => l.number === progress.currentLevel);
  const plan = getTodayPlan(state);
  const stats = completionStats(plan);
  const activePunishments = state.punishments.filter((p) => p.active).length;

  const taskCountByCategory = (categoryId: string) =>
    state.tasks.filter((t) => t.categoryId === categoryId).length;

  return (
    <div className="page">
      <section className="home-stats card card--hero">
        <XpBar
          totalXp={progress.totalXp}
          levels={levels}
          levelName={`Level ${progress.currentLevel} — ${levelInfo?.name ?? ''}`}
        />
        <div className="home-stats__row">
          <span className="home-stats__chip">
            🔥 {progress.streak}d streak
          </span>
          <span className="home-stats__chip">
            ⭐ {progress.points} pts
          </span>
          {plan && stats.total > 0 && (
            <span className="home-stats__chip">
              ✓ {stats.completed}/{stats.total} today
            </span>
          )}
        </div>
      </section>

      {activePunishments > 0 && (
        <section className="card card--warn">
          <p>
            {activePunishments} active punishment(s).{' '}
            <Link to="/punishments">View punishments</Link>
          </p>
        </section>
      )}

      <DailyTasksSection />

      <section>
        <h2 className="section-title">Categories</h2>
        {state.categories.length === 0 ? (
          <section className="card">
            <p className="muted">
              No categories yet. An admin can create categories from the admin panel.
            </p>
          </section>
        ) : (
          <div className="category-grid">
            {state.categories.map((cat) => (
              <CategoryCard
                key={cat.id}
                category={cat}
                taskCount={taskCountByCategory(cat.id)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
