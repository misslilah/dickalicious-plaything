import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { VideoCategoryCard } from '../components/VideoCategoryCard';
import { useAppStore } from '../hooks/useAppStore';

export function Videos() {
  const { state, session } = useAppStore();
  const [search, setSearch] = useState('');
  const isAdmin = session?.role === 'admin';

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return state.videoCategories;
    return state.videoCategories.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.description ?? '').toLowerCase().includes(q),
    );
  }, [state.videoCategories, search]);

  const videoCountByCategory = (categoryId: string) =>
    state.videos.filter((v) => v.categoryId === categoryId).length;

  return (
    <div className="page">
      <header className="page-header">
        <h2>Videos</h2>
        <p className="muted">Browse videos by category</p>
      </header>

      {state.videoCategories.length > 0 && (
        <div className="filters">
          <input
            type="search"
            placeholder="Search categories…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search video categories"
          />
        </div>
      )}

      {state.videoCategories.length === 0 ? (
        <section className="card">
          <p className="muted">
            No video categories yet.
            {isAdmin ? (
              <>
                {' '}
                <Link to="/admin">Create categories in Admin</Link> under Videos.
              </>
            ) : (
              ' An admin can add video categories and uploads.'
            )}
          </p>
        </section>
      ) : filtered.length === 0 ? (
        <section className="card">
          <p className="muted">No categories match your search.</p>
        </section>
      ) : (
        <section>
          <h2 className="section-title">Categories</h2>
          <div className="category-grid">
            {filtered.map((cat) => (
              <VideoCategoryCard
                key={cat.id}
                category={cat}
                videoCount={videoCountByCategory(cat.id)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
