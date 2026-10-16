import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { FlashWordGameModal } from '../components/FlashWordGameModal';
import { FollowInstinctGameModal } from '../components/FollowInstinctGameModal';
import { PuzzleGameModal } from '../components/PuzzleGameModal';
import { MiniGameLeaderboard } from '../components/MiniGameLeaderboard';
import { useAppStore } from '../hooks/useAppStore';
import {
  dailyGameAttemptRemainingLabel,
  dailyGameAttemptShouldShowUpgradeHint,
  fetchAllDailyGameAttemptStatuses,
  startMiniGameAttempt,
  type DailyGameAttemptStatus,
  type DailyGameType,
} from '../lib/dailyGameAttempts';
import { getPatreonPageUrl } from '../lib/patreon';
import {
  fetchFlashWordGameSummaries,
  type FlashWordGameSummary,
} from '../lib/flashWordGames';
import {
  fetchFollowInstinctGameSummaries,
  type FollowInstinctGameSummary,
} from '../lib/followInstinctGames';
import {
  fetchPuzzleGameSummaries,
  PUZZLE_SESSION_STREAK_KEY,
  type PuzzleGameSummary,
} from '../lib/puzzleGames';

type ActiveGame =
  | { type: 'flash'; id: string }
  | { type: 'instinct'; id: string }
  | { type: 'puzzle' }
  | null;

type GameCardVariant = NonNullable<ActiveGame>['type'];

type PlayZoom = {
  artUrl: string | null;
  fallback: string;
  origin: { top: number; left: number; width: number; height: number };
  tx: number;
  ty: number;
  scale: number;
};

const GAME_TYPE_BY_ACTIVE: Record<GameCardVariant, DailyGameType> = {
  flash: 'flash_cards',
  instinct: 'follow_instinct',
  puzzle: 'puzzle',
};

const GAME_ART_FALLBACK: Record<GameCardVariant, string> = {
  flash:
    'radial-gradient(circle at 50% 28%, rgba(255, 79, 191, 0.5), transparent 55%), linear-gradient(165deg, #4a0d3a, #120814)',
  instinct:
    'radial-gradient(circle at 50% 28%, rgba(232, 121, 249, 0.42), transparent 52%), linear-gradient(165deg, #2e1065, #0a0510)',
  puzzle:
    'radial-gradient(circle at 50% 28%, rgba(245, 200, 76, 0.46), transparent 55%), linear-gradient(165deg, #422006, #1c1028)',
};

const ZOOM_MS = 640;
const ZOOM_OPEN_AT = 500;

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function compactAttemptLabel(status: DailyGameAttemptStatus | undefined, loading: boolean): string {
  if (!status) return loading ? 'Loading…' : 'Daily plays';
  if (status.unlimited) return 'Unlimited';
  if (status.limit == null) return loading ? 'Loading…' : 'Daily plays';
  if (status.limit === 0) return 'Members only';
  const left = Math.max(0, status.limit - status.used);
  return `${left}/${status.limit} left`;
}

function MiniGamePlayCard({
  variant,
  badge,
  title,
  description,
  artUrl,
  icon,
  flavor,
  playBusy,
  playDisabled,
  attemptMeta,
  compactLimit,
  onPlay,
}: {
  variant: GameCardVariant;
  badge: string;
  title: string;
  description?: string | null;
  artUrl: string | null;
  icon: string;
  flavor: string;
  playBusy: boolean;
  playDisabled: boolean;
  attemptMeta: ReactNode;
  compactLimit: string;
  onPlay: (card: HTMLElement | null, artUrl: string | null, fallback: string) => void;
}) {
  const cardRef = useRef<HTMLElement>(null);
  const fallback = GAME_ART_FALLBACK[variant];
  const artStyle: CSSProperties = {
    backgroundImage: artUrl ? `url(${artUrl})` : fallback,
  };

  return (
    <article
      ref={cardRef}
      className={`mini-game-card mini-game-card--${variant}${
        playDisabled ? ' mini-game-card--locked' : ''
      }`}
    >
      <div className="mini-game-card__art" style={artStyle}>
        <span className="mini-game-card__ribbon">{badge}</span>
        <span className="mini-game-card__flavor">{flavor}</span>
        {!artUrl ? (
          <span className="mini-game-card__icon" aria-hidden>
            {icon}
          </span>
        ) : null}
      </div>
      <div className="mini-game-card__body">
        <h3 className="mini-game-card__title">{title}</h3>
        {description ? <p className="muted mini-game-card__desc">{description}</p> : null}
        {attemptMeta}
      </div>
      <div className="mini-game-card__bar">
        <span className="mini-game-card__limit">{compactLimit}</span>
        <button
          type="button"
          className="btn btn--primary btn--small mini-game-card__play"
          disabled={playDisabled}
          onClick={() => onPlay(cardRef.current, artUrl, fallback)}
        >
          {playBusy ? 'Starting…' : 'Play'}
        </button>
      </div>
    </article>
  );
}

function MiniGamePlayZoom({ zoom }: { zoom: PlayZoom }) {
  const artStyle: CSSProperties = {
    backgroundImage: zoom.artUrl ? `url(${zoom.artUrl})` : zoom.fallback,
  };
  const cardStyle = {
    top: zoom.origin.top,
    left: zoom.origin.left,
    width: zoom.origin.width,
    height: zoom.origin.height,
    '--zoom-tx': `${zoom.tx}px`,
    '--zoom-ty': `${zoom.ty}px`,
    '--zoom-scale': String(zoom.scale),
  } as CSSProperties;

  return createPortal(
    <div className="mini-game-zoom" aria-hidden>
      <div className="mini-game-zoom__veil" />
      <div className="mini-game-zoom__card" style={cardStyle}>
        <div className="mini-game-zoom__art" style={artStyle} />
      </div>
    </div>,
    document.body,
  );
}

export function MiniGames() {
  const { session, isEffectiveAdmin, adminUserPreview } = useAppStore();
  const [flashGames, setFlashGames] = useState<FlashWordGameSummary[]>([]);
  const [instinctGames, setInstinctGames] = useState<FollowInstinctGameSummary[]>([]);
  const [puzzleGames, setPuzzleGames] = useState<PuzzleGameSummary[]>([]);
  const [attemptStatuses, setAttemptStatuses] = useState<
    Record<DailyGameType, DailyGameAttemptStatus> | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeGame, setActiveGame] = useState<ActiveGame>(null);
  const [leaderboardRefresh, setLeaderboardRefresh] = useState(0);
  const [playBusy, setPlayBusy] = useState<DailyGameType | null>(null);
  const [playError, setPlayError] = useState('');
  const [playZoom, setPlayZoom] = useState<PlayZoom | null>(null);
  const aliveRef = useRef(true);

  const closeActiveGame = () => {
    setActiveGame(null);
    setLeaderboardRefresh((tick) => tick + 1);
    void refreshAttemptStatuses();
  };

  const refreshAttemptStatuses = useCallback(async () => {
    const result = await fetchAllDailyGameAttemptStatuses();
    if (result.ok) {
      setAttemptStatuses(result.statuses);
    }
  }, []);

  const handleAttemptStatusChange = useCallback(
    (gameType: DailyGameType, status: DailyGameAttemptStatus) => {
      setAttemptStatuses((prev) =>
        prev ? { ...prev, [gameType]: status } : prev,
      );
    },
    [],
  );

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      try {
        sessionStorage.removeItem(PUZZLE_SESSION_STREAK_KEY);
      } catch {
        /* sessionStorage unavailable */
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError('');
      const [flashResult, instinctResult, puzzleResult, attemptsResult] = await Promise.all([
        fetchFlashWordGameSummaries(),
        fetchFollowInstinctGameSummaries(),
        fetchPuzzleGameSummaries(),
        fetchAllDailyGameAttemptStatuses(),
      ]);
      if (cancelled) return;
      setLoading(false);
      const errors: string[] = [];
      if (!flashResult.ok) errors.push(flashResult.error);
      else setFlashGames(flashResult.games);
      if (!instinctResult.ok) errors.push(instinctResult.error);
      else setInstinctGames(instinctResult.games);
      if (!puzzleResult.ok) errors.push(puzzleResult.error);
      else setPuzzleGames(puzzleResult.puzzles);
      if (attemptsResult.ok) {
        setAttemptStatuses(attemptsResult.statuses);
      }
      if (errors.length === 3) setError(errors.join(' '));
      else if (errors.length === 1) setError(errors[0]);
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.userId]);

  const handlePlay = async (
    game: NonNullable<ActiveGame>,
    cardEl: HTMLElement | null,
    artUrl: string | null,
    fallback: string,
  ) => {
    const gameType = GAME_TYPE_BY_ACTIVE[game.type];
    if (playBusy || playZoom) return;
    setPlayError('');
    setPlayBusy(gameType);
    const result = await startMiniGameAttempt(gameType);
    if (!aliveRef.current) return;
    setPlayBusy(null);
    if (!result.ok) {
      setPlayError(result.error);
      if (result.status) {
        setAttemptStatuses((prev) =>
          prev ? { ...prev, [gameType]: result.status! } : prev,
        );
      }
      return;
    }
    setAttemptStatuses((prev) =>
      prev ? { ...prev, [gameType]: result.status } : prev,
    );

    const skipZoom = prefersReducedMotion() || !cardEl;
    if (!skipZoom && cardEl) {
      const originEl =
        cardEl.querySelector<HTMLElement>('.mini-game-card__art') ?? cardEl;
      const rect = originEl.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const scale = Math.max(vw / Math.max(rect.width, 1), vh / Math.max(rect.height, 1)) * 1.12;
      setPlayZoom({
        artUrl,
        fallback,
        origin: {
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        },
        tx: vw / 2 - cx,
        ty: vh / 2 - cy,
        scale,
      });
      await waitMs(ZOOM_OPEN_AT);
      if (!aliveRef.current) return;
      setActiveGame(game);
      await waitMs(ZOOM_MS - ZOOM_OPEN_AT);
      if (!aliveRef.current) return;
      setPlayZoom(null);
      return;
    }

    setActiveGame(game);
  };

  const patreonUrl = getPatreonPageUrl();

  const renderAttemptMeta = (gameType: DailyGameType) => {
    const status = attemptStatuses?.[gameType];
    if (!status) {
      if (loading) {
        return <p className="muted mini-game-card__meta">Loading play limit…</p>;
      }
      return null;
    }

    const counterLabel = dailyGameAttemptRemainingLabel(status);
    const isFree = status.limit === 0;
    const atLimit = !status.canPlay && !isFree && !status.unlimited;
    const showUpgradeHint = dailyGameAttemptShouldShowUpgradeHint(status);

    return (
      <div className="mini-game-card__attempt-meta">
        {counterLabel && (
          <p
            className={`mini-game-card__meta${atLimit ? ' login-error' : ' muted'}`}
          >
            {counterLabel}
          </p>
        )}

        {isFree && (
          <p className="mini-game-card__meta login-error" role="alert">
            Mini games require an active Patreon membership.{' '}
            <Link to="/settings">Connect Patreon in Settings</Link> to play.
          </p>
        )}

        {atLimit && status.limit === 3 && (
          <p className="mini-game-card__meta login-error" role="alert">
            Daily limit reached ({status.used}/{status.limit}). Upgrade to{' '}
            <strong>Princess</strong> (15/day) or <strong>Slut</strong> (unlimited) on{' '}
            <a href={patreonUrl} target="_blank" rel="noopener noreferrer">
              Patreon
            </a>{' '}
            to play more, or check <Link to="/settings">Settings</Link>.
          </p>
        )}

        {atLimit && status.limit === 15 && (
          <p className="mini-game-card__meta login-error" role="alert">
            Daily limit reached ({status.used}/{status.limit}). Upgrade to{' '}
            <strong>Slut</strong> on{' '}
            <a href={patreonUrl} target="_blank" rel="noopener noreferrer">
              Patreon
            </a>{' '}
            for unlimited plays, or check <Link to="/settings">Settings</Link>.
          </p>
        )}

        {showUpgradeHint && (
          <p className="muted mini-game-card__meta mini-game-card__meta--hint">
            Upgrade for more daily plays.{' '}
            <a href={patreonUrl} target="_blank" rel="noopener noreferrer">
              Patreon
            </a>
            {' · '}
            <Link to="/settings">Settings</Link>
          </p>
        )}
      </div>
    );
  };

  const isPlayDisabled = (gameType: DailyGameType) => {
    if (playBusy === gameType || playZoom) return true;
    const status = attemptStatuses?.[gameType];
    return status != null && !status.canPlay;
  };

  const hasGames =
    flashGames.length > 0 || instinctGames.length > 0 || puzzleGames.length > 0;
  const puzzleCover = puzzleGames[0]?.imageUrl ?? null;

  return (
    <div className={`page mini-games${playZoom ? ' mini-games--zooming' : ''}`}>
      <header className="mini-games__header" data-tutorial="home-games">
        <p className="mini-games__kicker">Arcade</p>
        <h2 className="mini-games__title">Games</h2>
        <p className="muted mini-games__tagline">
          Quick challenges to sharpen focus and recall.
        </p>
      </header>

      {loading && <p className="muted">Loading games…</p>}
      {error && (
        <p className="login-error" role="alert">
          {error}
        </p>
      )}
      {playError && (
        <p className="login-error" role="alert">
          {playError}
        </p>
      )}

      {!loading && !error && !hasGames && (
        <section className="card">
          <p className="muted">
            No mini games available yet. An admin can create games under Admin → Mini games.
          </p>
        </section>
      )}

      {!loading && hasGames && (
        <div className="mini-games-grid">
          {flashGames.map((game) => (
            <MiniGamePlayCard
              key={`flash-${game.id}`}
              variant="flash"
              badge="Focus"
              title="Focus Training"
              description={game.description}
              artUrl={game.imageUrl}
              icon="⚡"
              flavor={`${game.cardCount} ${game.cardCount === 1 ? 'card' : 'cards'}`}
              playBusy={playBusy === 'flash_cards'}
              playDisabled={isPlayDisabled('flash_cards')}
              attemptMeta={renderAttemptMeta('flash_cards')}
              compactLimit={compactAttemptLabel(attemptStatuses?.flash_cards, loading)}
              onPlay={(card, artUrl, fallback) =>
                void handlePlay({ type: 'flash', id: game.id }, card, artUrl, fallback)
              }
            />
          ))}

          {instinctGames.map((game) => (
            <MiniGamePlayCard
              key={`instinct-${game.id}`}
              variant="instinct"
              badge="Camera"
              title="Follow your instinct"
              description={game.description}
              artUrl={game.previewImageUrl}
              icon="📷"
              flavor={`${game.roundCount} ${game.roundCount === 1 ? 'round' : 'rounds'}`}
              playBusy={playBusy === 'follow_instinct'}
              playDisabled={isPlayDisabled('follow_instinct')}
              attemptMeta={renderAttemptMeta('follow_instinct')}
              compactLimit={compactAttemptLabel(attemptStatuses?.follow_instinct, loading)}
              onPlay={(card, artUrl, fallback) =>
                void handlePlay({ type: 'instinct', id: game.id }, card, artUrl, fallback)
              }
            />
          ))}

          {puzzleGames.length > 0 && (
            <MiniGamePlayCard
              key="puzzle"
              variant="puzzle"
              badge="Puzzle"
              title="Puzzle"
              description="Piece it together. Keep the session streak going."
              artUrl={puzzleCover}
              icon="🧩"
              flavor={`${puzzleGames.length} ${puzzleGames.length === 1 ? 'puzzle' : 'puzzles'}`}
              playBusy={playBusy === 'puzzle'}
              playDisabled={isPlayDisabled('puzzle')}
              attemptMeta={renderAttemptMeta('puzzle')}
              compactLimit={compactAttemptLabel(attemptStatuses?.puzzle, loading)}
              onPlay={(card, artUrl, fallback) =>
                void handlePlay({ type: 'puzzle' }, card, artUrl, fallback)
              }
            />
          )}
        </div>
      )}

      {!loading && hasGames && (
        <p className="notice mini-games-leaderboards-notice" role="status">
          Leaderboards reset on the 1st of every month. The #1 player on each
          leaderboard wins one free month of Princess tier.
        </p>
      )}

      {!loading && hasGames && (
        <section className="mini-games-leaderboards">
          <header className="mini-games-leaderboards__header">
            <p className="mini-games-leaderboards__kicker">Monthly</p>
            <h3 className="mini-games-leaderboards__heading">Leaderboards</h3>
          </header>
          <p className="muted mini-games-leaderboards__intro">
            Top players by best streak in a single session.
          </p>
          <div className="mini-games-leaderboards__list">
            {flashGames.map((game) => (
              <MiniGameLeaderboard
                key={`leaderboard-flash-${game.id}`}
                gameType="flash_cards"
                gameId={game.id}
                title={game.title || 'Focus Training'}
                userId={adminUserPreview ? null : (session?.userId ?? null)}
                isAdmin={isEffectiveAdmin}
                refreshKey={leaderboardRefresh}
              />
            ))}
            {instinctGames.map((game) => (
              <MiniGameLeaderboard
                key={`leaderboard-instinct-${game.id}`}
                gameType="follow_instinct"
                gameId={game.id}
                title={game.title || 'Follow your instinct'}
                userId={adminUserPreview ? null : (session?.userId ?? null)}
                isAdmin={isEffectiveAdmin}
                refreshKey={leaderboardRefresh}
              />
            ))}
          </div>
        </section>
      )}

      {playZoom && <MiniGamePlayZoom zoom={playZoom} />}

      {activeGame?.type === 'flash' && (
        <FlashWordGameModal
          gameId={activeGame.id}
          onClose={closeActiveGame}
          onAttemptStatusChange={(status) =>
            handleAttemptStatusChange('flash_cards', status)
          }
        />
      )}
      {activeGame?.type === 'instinct' && (
        <FollowInstinctGameModal
          gameId={activeGame.id}
          onClose={closeActiveGame}
          onAttemptStatusChange={(status) =>
            handleAttemptStatusChange('follow_instinct', status)
          }
        />
      )}
      {activeGame?.type === 'puzzle' && (
        <PuzzleGameModal
          onClose={closeActiveGame}
          onAttemptStatusChange={(status) => handleAttemptStatusChange('puzzle', status)}
        />
      )}
    </div>
  );
}
