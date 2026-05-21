import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('App render error:', error, info.componentStack);
  }

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <div className="auth-loading">
        <div className="login-card card">
          <h1 className="app-title">Something went wrong</h1>
          <p className="login-error" role="alert">
            {this.state.error.message || 'The app failed to load.'}
          </p>
          <p className="muted">
            Try reloading. If this persists after a code update, hard-refresh or clear
            the PWA cache, then restart <code>npm run dev</code> from the project
            folder you use (<code>empty-window</code> or{' '}
            <code>dickalicious-plaything</code>).
          </p>
          <button
            type="button"
            className="btn btn--primary btn--block"
            onClick={this.handleReload}
          >
            Reload app
          </button>
        </div>
      </div>
    );
  }
}
