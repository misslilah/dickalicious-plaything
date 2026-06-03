import { useMemo, useState } from 'react';
import { loadMediaPageTab, saveMediaPageTab } from '../lib/adminNavPersistence';
import { Link } from 'react-router-dom';
import { AudioPlaylistSection } from '../components/AudioPlaylistSection';
import { VideoCategoryCard } from '../components/VideoCategoryCard';
import { useAppStore } from '../hooks/useAppStore';
import { getVideoCategoryLockMessage, requiresTierMessage } from '../lib/tiers';
import {
  canAccessVideoCategory,
  canWatchVideo,
  type VideoAccessContext,
} from '../lib/videoAccess';
import type { Video, VideoCategory } from '../types';
import { InteractiveVideos } from './InteractiveVideos';

type MediaTab = 'videos' | 'interactive' | 'audio';

export function Videos() {
  const { state, session } = useAppStore();
  const [tab, setTab] = useState<MediaTab>(() => loadMediaPageTab());
  const setMediaTab = (next: MediaTab) => {
    setTab(next);
    saveMediaPageTab(next);
  };
  const [search, setSearch] = useState('');
  const [lockMessage, setLockMessage] = useState<string | null>(null);
  const isAdmin = session?.role === 'admin';

  const videoAccessCtx: VideoAccessContext = useMemo(
    () => ({
      patreonTier: session?.patreonTier,
      patreonStatus: session?.patreonStatus,
      isAdmin,
      purchasedVideoIds: state.purchasedVideoIds,
    }),
    [
      session?.patreonTier,
      session?.patreonStatus,
      isAdmin,
      state.purchasedVideoIds,
    ],
  );

  const sortedCategories = useMemo(
    () =>
      [...state.videoCategories].sort(
        (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
      ),
    [state.videoCategories],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sortedCategories;
    return sortedCategories.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.description ?? '').toLowerCase().includes(q),
    );
  }, [sortedCategories, search]);

  const userCanWatchVideo = (video: Video, category: VideoCategory | undefined) =>
    canWatchVideo(video, category, videoAccessCtx);

  const userCanAccessCategory = (category: VideoCategory) => {
    const inCategory = state.videos.filter((v) => v.categoryId === category.id);
    return canAccessVideoCategory(category, inCategory, videoAccessCtx);
  };

  const totalVideoCountByCategory = (categoryId: string) =>
    state.videoCategoryCounts[categoryId] ??
    state.videos.filter((v) => v.categoryId === categoryId).length;

  const lockedVideoCountByCategory = (categoryId: string) => {
    const cat = state.videoCategories.find((c) => c.id === categoryId);
    const inCategory = state.videos.filter((v) => v.categoryId === categoryId);
    return inCategory.filter((v) => !userCanWatchVideo(v, cat)).length;
  };

  const showCategoryLockMessage = (category: VideoCategory) => {
    const message = getVideoCategoryLockMessage(
      category.requiredTier,
      session?.patreonTier,
      session?.patreonStatus,
      isAdmin,
    );
    if (message) {
      setLockMessage(message);
    }
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
          onClick={() => setMediaTab('videos')}
        >
          Videos
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'interactive'}
          className={tab === 'interactive' ? 'media-tab media-tab--active' : 'media-tab'}
          onClick={() => setMediaTab('interactive')}
        >
          Interactive
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'audio'}
          className={tab === 'audio' ? 'media-tab media-tab--active' : 'media-tab'}
          onClick={() => setMediaTab('audio')}
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
              <p className="muted video-categories__intro">
                All categories are listed here. Some require a Patreon tier to open.
              </p>
              <div className="category-grid">
                {filtered.map((cat) => {
                  const categoryLocked = !userCanAccessCategory(cat);
                  const lockedVideos = categoryLocked
                    ? 0
                    : lockedVideoCountByCategory(cat.id);
                  return (
                    <VideoCategoryCard
                      key={cat.id}
                      category={cat}
                      videoCount={totalVideoCountByCategory(cat.id)}
                      locked={categoryLocked}
                      lockReason={
                        categoryLocked
                          ? requiresTierMessage(cat.requiredTier ?? 'sweetie')
                          : undefined
                      }
                      lockedVideoCount={lockedVideos}
                      onLockedClick={
                        categoryLocked
                          ? () => showCategoryLockMessage(cat)
                          : undefined
                      }
                    />
                  );
                })}
              </div>
            </section>
          )}

          {lockMessage && (
            <div
              className="audio-playlist__lock-overlay"
              role="alertdialog"
              aria-labelledby="video-category-lock-title"
              aria-describedby="video-category-lock-desc"
            >
              <div
                className="audio-playlist__lock-backdrop"
                aria-hidden="true"
                onClick={() => setLockMessage(null)}
              />
              <div className="audio-playlist__lock-panel card">
                <h3 id="video-category-lock-title" className="section-title">
                  Category locked
                </h3>
                <p id="video-category-lock-desc">{lockMessage}</p>
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => setLockMessage(null)}
                >
                  OK
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
