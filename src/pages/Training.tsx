import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { TrainingGate } from '../components/TrainingGate';
import { useAppStore } from '../hooks/useAppStore';
import { getPatreonPageUrl } from '../lib/patreon';
import { canAccessTraining } from '../lib/trainingAccess';
import { tierLabel } from '../lib/tiers';

export function Training() {
  const { session } = useAppStore();
  const navigate = useNavigate();
  const isAdmin = session?.role === 'admin';
  const hasAccess = canAccessTraining(
    session?.patreonTier,
    session?.patreonStatus,
    isAdmin,
  );
  const [certified, setCertified] = useState(false);
  const patreonUrl = getPatreonPageUrl();

  if (!hasAccess) {
    return (
      <div className="page training-page training-page--locked">
        <header className="page-header">
          <h2>Training</h2>
        </header>
        <section className="card training-locked" aria-labelledby="training-locked-title">
          <span className="training-locked__icon" aria-hidden>
            🔒
          </span>
          <h3 id="training-locked-title" className="section-title">
            Slut tier required
          </h3>
          <p className="training-locked__message">
            Training is available only for <strong>{tierLabel('slut')}</strong> tier
            members. Upgrade on{' '}
            <a href={patreonUrl} target="_blank" rel="noopener noreferrer">
              Patreon
            </a>{' '}
            or check <Link to="/settings">Settings</Link>.
          </p>
        </section>
      </div>
    );
  }

  if (!isAdmin && !certified) {
    return (
      <div className="page training-page">
        <TrainingGate
          onAccept={() => setCertified(true)}
          onCancel={() => navigate(-1)}
        />
      </div>
    );
  }

  return (
    <div className="page training-page">
      <header className="page-header">
        <h2>Training</h2>
      </header>
      <section className="card training-empty">
        <p className="muted training-empty__message">Training content coming soon</p>
      </section>
    </div>
  );
}
