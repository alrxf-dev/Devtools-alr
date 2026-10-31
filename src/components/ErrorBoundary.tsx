import { Component, type ReactNode } from 'react';

interface State { error: Error | null }

export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, State> {
  override state: State = { error: null };
  static getDerivedStateFromError(error: Error): State {
    return { error };
  }
  override componentDidUpdate(prev: { resetKey?: string }): void {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }
  override render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div className="fatal" role="alert">
        <h1 className="pixel" style={{ fontSize: 28 }}>Something broke</h1>
        <p style={{ color: 'var(--muted)' }}>This tool hit an unexpected error. Your files were not uploaded and nothing was changed on disk.</p>
        <pre className="pre wrap">{this.state.error.message}</pre>
        <p style={{ marginTop: 16 }}>
          <a className="btn" href="#/">Back to all tools</a>{' '}
          <button className="btn btn-ghost" type="button" onClick={() => location.reload()}>Reload page</button>
        </p>
      </div>
    );
  }
}
