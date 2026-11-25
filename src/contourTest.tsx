import { createRoot } from 'react-dom/client';
import './index.css';
import { UserAvatar, type UserAvatarSize } from './components/UserAvatar';
import { ShopTile } from './components/ShopTile';
import { AVATAR_FRAMES } from './lib/avatarFrames';

const sizes: UserAvatarSize[] = ['xs', 'sm', 'md', 'lg'];
const img =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f9a8d4"/><stop offset="1" stop-color="#6d28d9"/></linearGradient></defs><rect width="200" height="200" fill="url(#g)"/><circle cx="100" cy="80" r="38" fill="#fde7f3"/><ellipse cx="100" cy="175" rx="62" ry="48" fill="#fde7f3"/></svg>`,
  );

function App() {
  return (
    <div style={{ padding: 16, background: '#140a22', minHeight: '100vh', color: '#fff', fontFamily: 'sans-serif' }}>
      <div style={{ zoom: 3.2, display: 'grid', gridTemplateColumns: 'repeat(3, auto)', gap: 6, marginBottom: 20 }}>
        {AVATAR_FRAMES.filter((x) => ['flame','wings','thorns'].includes(x.id)).map((frame) => (<UserAvatar key={frame.id} url={img} name='Ada' frameId={frame.id} size='md' />))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '90px repeat(4, auto)', gap: 14, alignItems: 'center', justifyItems: 'start' }}>
        {AVATAR_FRAMES.map((frame) => (
          <>
            <span key={frame.id + 'n'} style={{ fontSize: 12 }}>{frame.id}</span>
            {sizes.map((s) => (
              <UserAvatar key={frame.id + s} url={s === 'sm' ? null : img} name="Ada" frameId={frame.id} size={s} />
            ))}
          </>
        ))}
      </div>
      <div className="item-shop" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 220px)', gap: 12, marginTop: 24 }}>
        {AVATAR_FRAMES.map((frame) => (
          <ShopTile
            key={frame.id}
            rarity={frame.rarity}
            name={frame.name}
            subtitle={frame.description}
            priceLabel={frame.pricePoints > 0 ? String(frame.pricePoints) : 'Free'}
            artStyle={{ background: frame.previewGradient }}
            preview={<UserAvatar url={frame.id === 'crown' ? null : img} name="Ada" frameId={frame.id} size="lg" />}
            status={frame.id === 'flame' ? 'equipped' : frame.id === 'crown' ? 'owned' : 'buy'}
          />
        ))}
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
