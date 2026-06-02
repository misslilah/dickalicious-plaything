import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AudioPlaylistSection } from '../components/AudioPlaylistSection';
import { VideoCategoryCard } from '../components/VideoCategoryCard';
import { useAppStore } from '../hooks/useAppStore';
import { canAccessTier, effectiveVideoTier, requiresTierMessage } from '../lib/tiers';
import type { Video, VideoCategory } from '../types';
import { InteractiveVideos } from './InteractiveVideos';

type MediaTab = 'videos' | 'interactive' | 'audio';

export function Videos() {
  const { state, session } = useAppStore();
  const [tab, setTab] = useState<MediaTab>('videos');
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

  const canWatchVideo = (video: Video, category: VideoCategory | undefined) =>
    canAccessTier(
      effectiveVideoTier(video.requiredTier, category?.requiredTier),
      session?.patreonTier,
      session?.patreonStatus,
      isAdmin,
    );

  const videoCountByCategory = (categoryId: string) => {
    const cat = state.videoCategories.find((c) => c.id === categoryId);
    const inCategory = state.videos.filter((v) => v.categoryId === categoryId);
    return inCategory.filter((v) => canWatchVideo(v, cat)).length;
  };

  const lockedCountByCategory = (categoryId: string) => {
    const cat = state.videoCategories.find((c) => c.id === categoryId);
    const inCategory = state.videos.filter((v) => v.categoryId === categoryId);
    return inCategory.filter((v) => !canWatchVideo(v, cat)).length;
  };

  return (
    <div className="page">
      <header className="page-header">
        <h2>Media</h2>
        <p className="muted">Videos and sequential audio playlists</p>
      </header>

      <div className="media-tabs" role="tablist" aria-label="Media sections">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'videos'}
          className={tab === 'videos' ? 'media-tab media-tab--active' : 'media-tab'}
          onClick={() => setTab('videos')}
        >
          Videos
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'interactive'}
          className={tab === 'interactive' ? 'media-tab media-tab--active' : 'media-tab'}
          onClick={() => setTab('interactive')}
        >
          Interactive
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'audio'}
          className={tab === 'audio' ? 'media-tab media-tab--active' : 'media-tab'}
          onClick={() => setTab('audio')}
        >
          Audio
        </button>
      </div>

      {tab === 'audio' ? (
        <AudioPlaylistSection />
      ) : tab === 'interactive' ? (
        <InteractiveVideos embedded />
      ) : (
        <>
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
                {filtered.map((cat) => {
                  const locked = lockedCountByCategory(cat.id);
                  const categoryLocked =
                    !isAdmin &&
                    !canAccessTier(
                      cat.requiredTier ?? 'public',
                      session?.patreonTier,
                      session?.patreonStatus,
                    );
                  return (
                    <VideoCategoryCard
                      key={cat.id}
                      category={cat}
                      videoCount={videoCountByCategory(cat.id)}
                      lockedHint={
                        categoryLocked
                          ? requiresTierMessage(cat.requiredTier ?? 'sweetie')
                          : locked > 0
                            ? `${locked} locked`
                            : undefined
                      }
                    />
                  );
                })}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
