import { Component, type ErrorInfo, type ReactNode } from 'react';
import { RefreshCw, TriangleAlert } from 'lucide-react';

interface Props { children: ReactNode; }
interface State { error: Error | null; }

export default class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('docbd.info render error', error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="route-state route-state-error" role="alert">
        <TriangleAlert />
        <h2>Page render করা যায়নি</h2>
        <p>{this.state.error.message || 'একটি অপ্রত্যাশিত browser/runtime error হয়েছে।'}</p>
        <div className="route-state-actions">
          <button type="button" onClick={() => window.location.reload()}><RefreshCw /> Page reload করুন</button>
        </div>
      </div>
    );
  }
}
