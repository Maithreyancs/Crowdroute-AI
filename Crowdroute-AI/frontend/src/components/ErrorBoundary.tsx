import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RotateCcw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an unhandled rendering error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReload = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  private handleGoHome = () => {
    window.location.href = '/';
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="max-w-4xl mx-auto my-8 p-6 bg-white border border-red-200 rounded-xl shadow-sm space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-100 text-red-700 flex items-center justify-center flex-shrink-0">
              <AlertCircle className="w-6 h-6 text-red-600" />
            </div>
            <div className="flex-1 space-y-1">
              <span className="text-[11px] font-bold text-red-700 uppercase tracking-wider">
                PORTAL RECOVERY ASSISTANT
              </span>
              <h2 className="text-xl font-bold text-slate-900">
                {this.props.fallbackTitle || 'A component encountered a rendering issue'}
              </h2>
              <p className="text-xs text-slate-600">
                Your underlying festival scenario, fixed fleet count (16 buses), and operational settings remain conserved.
              </p>
            </div>
          </div>

          {this.state.error && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs font-mono text-slate-700 overflow-x-auto">
              <p className="font-bold text-red-600">{this.state.error.name}: {this.state.error.message}</p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100">
            <button
              onClick={this.handleReload}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-sky-700 hover:bg-sky-800 text-white text-xs font-semibold shadow-sm transition-all"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Retry Component</span>
            </button>
            <button
              onClick={this.handleGoHome}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-sm transition-all"
            >
              <Home className="w-3.5 h-3.5" />
              <span>Return to Portal Home</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
