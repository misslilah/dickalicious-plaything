import type { ReactNode } from 'react';

export type AdminGuideStep = {
  id: string;
  label: string;
  hint: string;
};

/** One step of a create/edit form, with the save action left to the parent. */
export function AdminStepSwitcher({
  steps,
  stepId,
  onStepId,
  children,
}: {
  steps: AdminGuideStep[];
  stepId: string;
  onStepId: (id: string) => void;
  children: ReactNode;
}) {
  const index = Math.max(
    0,
    steps.findIndex((step) => step.id === stepId),
  );
  const step = steps[index] ?? steps[0];
  if (!step) return null;

  const go = (delta: number) => {
    const next = steps[index + delta];
    if (next) onStepId(next.id);
  };

  return (
    <div className="admin-guided">
      <p className="admin-guided__progress muted">
        Step {index + 1} of {steps.length}. {step.hint}
      </p>
      <div className="admin-guided__steps" role="tablist" aria-label="Form steps">
        {steps.map((item, itemIndex) => {
          const active = item.id === step.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`admin-step-${item.id}`}
              aria-selected={active}
              aria-controls="admin-step-panel"
              className={
                active
                  ? 'admin-guided__step admin-guided__step--active'
                  : 'admin-guided__step'
              }
              onClick={() => onStepId(item.id)}
            >
              <span className="admin-guided__step-index">{itemIndex + 1}</span>
              {item.label}
            </button>
          );
        })}
      </div>
      <div
        className="admin-guided__body"
        role="tabpanel"
        id="admin-step-panel"
        aria-labelledby={`admin-step-${step.id}`}
      >
        {children}
      </div>
      <div className="btn-row admin-guided__nav">
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => go(-1)}
          disabled={index <= 0}
        >
          Back
        </button>
        {index < steps.length - 1 ? (
          <button type="button" className="btn btn--secondary" onClick={() => go(1)}>
            Next
          </button>
        ) : (
          <p className="muted admin-guided__ready">
            Last step. The save button below keeps every field you already filled in.
          </p>
        )}
      </div>
    </div>
  );
}
