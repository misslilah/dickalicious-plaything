import { useId, useRef } from 'react';
import {
  TASK_MEDIA_ACCEPT,
  validateTaskMediaFile,
} from '../../lib/taskMediaStorage';
import type { TaskMediaType } from '../../types';

export type TaskMediaPickerValue = {
  pendingFile: File | null;
  pendingPreviewUrl: string | null;
  pendingMediaType: TaskMediaType | null;
  removeExisting: boolean;
};

type TaskMediaPickerProps = {
  existingUrl?: string;
  existingType?: TaskMediaType;
  value: TaskMediaPickerValue;
  onChange: (value: TaskMediaPickerValue) => void;
  onError?: (message: string) => void;
  compact?: boolean;
};

export const emptyTaskMediaPickerValue = (): TaskMediaPickerValue => ({
  pendingFile: null,
  pendingPreviewUrl: null,
  pendingMediaType: null,
  removeExisting: false,
});

export function TaskMediaPicker({
  existingUrl,
  existingType,
  value,
  onChange,
  onError,
  compact = false,
}: TaskMediaPickerProps) {
  const fileInputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showExisting =
    Boolean(existingUrl && existingType) && !value.removeExisting && !value.pendingFile;
  const previewUrl = value.pendingPreviewUrl ?? (showExisting ? existingUrl : null);
  const previewType = value.pendingMediaType ?? (showExisting ? existingType : null);

  const handleFileChange = (file: File | undefined) => {
    if (!file) return;
    const validated = validateTaskMediaFile(file);
    if (!validated.ok) {
      onError?.(validated.error);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    const preview = URL.createObjectURL(file);
    onChange({
      pendingFile: file,
      pendingPreviewUrl: preview,
      pendingMediaType: validated.mediaType,
      removeExisting: false,
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemove = () => {
    if (value.pendingPreviewUrl) {
      URL.revokeObjectURL(value.pendingPreviewUrl);
    }
    onChange({
      ...emptyTaskMediaPickerValue(),
      removeExisting: Boolean(existingUrl),
    });
  };

  return (
    <div
      className={
        compact
          ? 'task-media-picker task-media-picker--compact'
          : 'task-media-picker'
      }
    >
      <div className="task-media-picker__actions">
        <input
          ref={fileInputRef}
          id={fileInputId}
          type="file"
          accept={TASK_MEDIA_ACCEPT}
          className="file-input-hidden"
          aria-label="Choose task media file"
          onChange={(e) => handleFileChange(e.target.files?.[0])}
        />
        <label htmlFor={fileInputId} className="btn btn--primary">
          Choose file
        </label>
        {(previewUrl || value.pendingFile || showExisting) && (
          <button type="button" className="btn btn--ghost" onClick={handleRemove}>
            Remove
          </button>
        )}
      </div>

      <p className="muted task-media-picker__hint">
        One video (mp4, webm) or audio (mp3, wav, m4a, ogg) file per task. Max 100 MB.
      </p>

      {previewUrl && previewType === 'video' && (
        <video
          className="task-media-picker__preview"
          src={previewUrl}
          controls
          playsInline
          preload="metadata"
        />
      )}

      {previewUrl && previewType === 'audio' && (
        <audio className="task-media-picker__preview" src={previewUrl} controls preload="metadata" />
      )}
    </div>
  );
}
