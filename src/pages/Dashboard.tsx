import { Link } from 'react-router-dom';
import { CategoryCard } from '../components/CategoryCard';
import { DailyTasksSection } from '../components/DailyTasksSection';
import { XpBar } from '../components/XpBar';
import { useAppStore } from '../hooks/useAppStore';
import { formatLevelDisplay } from '../lib/levels';
import { completionStats, getTodayPlan } from '../lib/gameLogic';

export function Dashboard() {
  const { state } = useAppStore();
  const { progress } = state;
  const plan = getTodayPlan(state);
  const stats = completionStats(plan);
  const malus = state.progress.malusPoints;

  const taskCountByCategory = (categoryId: string) =>
    state.tasks.filter(
      (t) => (t.taskScope ?? 'category') === 'category' && t.categoryId === categoryId,
    ).length;

  return (
    <div className="page">
      <section className="home-stats card card--hero">
        <XpBar
          totalXp={progress.totalXp}
          currentLevel={progress.currentLevel}
          levelName={formatLevelDisplay(progress.currentLevel)}
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

      {malus > 0 && (
        <section className="card card--warn">
          <p>
            {malus} malus point{malus === 1 ? '' : 's'}.{' '}
            <Link to="/punishments">Clear malus with a punishment</Link>
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
                isMember={state.joinedCategoryIds.includes(cat.id)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
