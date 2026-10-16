import { useEffect, useState, type ReactNode } from 'react';

export function TaskEditorSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="admin-form-block">
      <h3 className="section-title">{title}</h3>
      {hint ? (
        <p className="muted" style={{ marginTop: 0 }}>
          {hint}
        </p>
      ) : null}
      {children}
    </section>
  );
}

export function TaskEditorField({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label htmlFor={htmlFor}>
        <span>{label}</span>
      </label>
      {hint ? <p className="muted field__hint">{hint}</p> : null}
      {children}
    </div>
  );
}

export function TaskEditorModal({
  open,
  title,
  onClose,
  preview,
  footer,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  preview: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const [mobilePane, setMobilePane] = useState<'form' | 'preview'>('form');

  useEffect(() => {
    if (!open) return;
    setMobilePane('form');
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="task-editor-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="task-editor-title"
    >
      <button
        type="button"
        className="task-editor-modal__backdrop"
        aria-label="Close task editor"
        onClick={onClose}
      />
      <div className="task-editor-modal__panel">
        <header className="task-editor-modal__header">
          <h2 id="task-editor-title" className="section-title">
            {title}
          </h2>
          <button type="button" className="btn btn--ghost btn--small" onClick={onClose}>
            Close
          </button>
        </header>
        <div className="task-editor-modal__tabs" role="tablist" aria-label="Task editor views">
          <button
            type="button"
            role="tab"
            aria-selected={mobilePane === 'form'}
            className={
              mobilePane === 'form'
                ? 'task-editor-modal__tab is-active'
                : 'task-editor-modal__tab'
            }
            onClick={() => setMobilePane('form')}
          >
            Form
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mobilePane === 'preview'}
            className={
              mobilePane === 'preview'
                ? 'task-editor-modal__tab is-active'
                : 'task-editor-modal__tab'
            }
            onClick={() => setMobilePane('preview')}
          >
            Preview
          </button>
        </div>
        <div
          className={
            mobilePane === 'preview'
              ? 'task-editor-modal__layout task-editor-modal__layout--preview'
              : 'task-editor-modal__layout task-editor-modal__layout--form'
          }
        >
          <div className="task-editor-modal__form">{children}</div>
          <aside className="task-editor-modal__preview">
            <p className="task-editor-modal__preview-label">Live preview</p>
            <p className="muted task-editor-modal__preview-hint">
              Updates as you type — this is how players will see the task.
            </p>
            <div className="task-editor-modal__preview-stage">{preview}</div>
          </aside>
        </div>
        {footer ? <footer className="task-editor-modal__footer">{footer}</footer> : null}
      </div>
    </div>
  );
}
