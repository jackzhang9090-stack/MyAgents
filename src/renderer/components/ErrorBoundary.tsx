import React, { Component, type ReactNode, type ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * ErrorBoundary - Catches React errors and displays a fallback UI instead of white screen
 * 
 * Usage: Wrap your app with this component to prevent white screens on crashes.
 * The error details will be logged to console and displayed in the fallback UI.
 */
export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log error for debugging
    console.error('[ErrorBoundary] Caught error:', error);
    console.error('[ErrorBoundary] Error info:', errorInfo);
    
    this.setState({
      error,
      errorInfo,
    });
  }

  handleRetry = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      // Custom fallback UI
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg-primary, #1a1a1a)',
          color: 'var(--text-primary, #fff)',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          padding: '20px',
        }}>
          <div style={{
            maxWidth: '600px',
            width: '100%',
            padding: '24px',
            background: 'var(--bg-secondary, #2a2a2a)',
            borderRadius: '12px',
            boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
          }}>
            <h1 style={{ 
              margin: '0 0 16px 0', 
              color: '#ef4444',
              fontSize: '20px',
              fontWeight: 600,
            }}>
              ⚠️ 应用崩溃
            </h1>
            
            <p style={{ 
              margin: '0 0 16px 0', 
              color: 'var(--text-secondary, #aaa)',
              fontSize: '14px',
            }}>
              发生了错误，页面显示为空白。你可以尝试刷新页面。
            </p>

            {this.state.error && (
              <details style={{ 
                marginBottom: '16px',
                padding: '12px',
                background: 'rgba(0,0,0,0.2)',
                borderRadius: '8px',
                fontSize: '12px',
                fontFamily: 'monospace',
              }}>
                <summary style={{ 
                  cursor: 'pointer', 
                  color: 'var(--text-secondary, #aaa)',
                  marginBottom: '8px',
                }}>
                  错误详情
                </summary>
                <pre style={{ 
                  margin: 0, 
                  whiteSpace: 'pre-wrap', 
                  wordBreak: 'break-all',
                  color: '#f87171',
                }}>
                  {this.state.error.toString()}
                </pre>
                {this.state.errorInfo?.componentStack && (
                  <pre style={{ 
                    margin: '8px 0 0 0', 
                    whiteSpace: 'pre-wrap', 
                    wordBreak: 'break-all',
                    color: '#fb923c',
                  }}>
                    {this.state.errorInfo.componentStack}
                  </pre>
                )}
              </details>
            )}

            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={this.handleRetry}
                style={{
                  padding: '10px 20px',
                  background: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 500,
                }}
              >
                🔄 重试
              </button>
              <button
                onClick={() => window.location.reload()}
                style={{
                  padding: '10px 20px',
                  background: 'transparent',
                  color: 'var(--text-secondary, #aaa)',
                  border: '1px solid var(--border, #444)',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '14px',
                }}
              >
                📋 刷新页面
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
