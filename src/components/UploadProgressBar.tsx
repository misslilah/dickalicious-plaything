interface UploadProgressBarProps {
  progress: number | null;
  label?: string;
}

export function UploadProgressBar({ progress, label = 'Uploading…' }: UploadProgressBarProps) {
  if (progress === null) return null;

  const clamped = Math.min(100, Math.max(0, progress));

  return (
    <div className="upload-progress" role="status" aria-live="polite">
      <p className="upload-progress__label">
        {label} {clamped}%
      </p>
      <div
        className="upload-progress__bar"
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${label} ${clamped}%`}
      >
        <div className="upload-progress__fill" style={{ width: `${clamped}%` }} />
      </div>
    </div>
  );
}
