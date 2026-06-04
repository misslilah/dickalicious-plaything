type PrivacyNoticeVariant = 'login' | 'camera';

interface PrivacyNoticeProps {
  variant: PrivacyNoticeVariant;
  className?: string;
}

const COPY: Record<PrivacyNoticeVariant, string> = {
  login:
    'We only store what you need to sign in (email and profile). Camera features run on your device only—we never receive video from your camera on our servers.',
  camera:
    'Camera is active on your device only. Nothing is recorded or sent to our servers.',
};

export function PrivacyNotice({ variant, className = '' }: PrivacyNoticeProps) {
  const classes = ['privacy-notice', `privacy-notice--${variant}`, className]
    .filter(Boolean)
    .join(' ');

  return (
    <p className={classes} role="note">
      {COPY[variant]}
    </p>
  );
}
