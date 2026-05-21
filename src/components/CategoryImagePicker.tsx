import { useId, useRef } from 'react';
import { readCategoryImageFile } from '../lib/categoryImage';

type CategoryImagePickerProps = {
  idPrefix: string;
  previewUrl: string | null;
  urlValue: string;
  onUrlChange: (value: string) => void;
  onFileSelect: (dataUrl: string) => void;
  onFileError?: (message: string) => void;
  urlInputId?: string;
};

export function CategoryImagePicker({
  idPrefix,
  previewUrl,
  urlValue,
  onUrlChange,
  onFileSelect,
  onFileError,
  urlInputId,
}: CategoryImagePickerProps) {
  const fileInputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const resolvedUrlInputId = urlInputId ?? `${idPrefix}-image-url`;

  const handleFileChange = (file: File | undefined) => {
    if (!file) return;
    readCategoryImageFile(
      file,
      (dataUrl) => {
        onFileSelect(dataUrl);
        if (fileInputRef.current) fileInputRef.current.value = '';
      },
      (message) => onFileError?.(message),
    );
  };

  return (
    <div className="category-image-picker">
      <div className="category-image-picker__actions">
        <input
          ref={fileInputRef}
          id={fileInputId}
          type="file"
          accept="image/*"
          className="file-input-hidden"
          aria-label="Choose category image from files"
          onChange={(e) => handleFileChange(e.target.files?.[0])}
        />
        <label htmlFor={fileInputId} className="btn btn--primary">
          Choose from files
        </label>
      </div>

      <label className="field" htmlFor={resolvedUrlInputId}>
        <span>Paste URL</span>
      </label>
      <input
        id={resolvedUrlInputId}
        type="url"
        placeholder="https://…"
        value={urlValue}
        onChange={(e) => onUrlChange(e.target.value)}
      />

      {previewUrl && (
        <div className="image-preview">
          <img src={previewUrl} alt="Category image preview" />
        </div>
      )}
    </div>
  );
}
