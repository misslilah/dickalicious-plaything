type PrivacyNoticeVariant = 'login' | 'camera';

interface PrivacyNoticeProps {
  variant: PrivacyNoticeVariant;
  className?: string;
}

const COPY: Record<PrivacyNoticeVariant, string> = {
  login:
    'At sign-up we store your email and chosen username; sign-in uses your username and password only. Camera features run on your device—we never receive video from your camera on our servers.',
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
