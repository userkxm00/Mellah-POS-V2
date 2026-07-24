import React, { Component, ReactNode, ErrorInfo } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('Uncaught React Error:', error, errorInfo)
  }

  private handleReset = (): void => {
    this.setState({ hasError: false, error: null })
    window.location.reload()
  }

  public render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="h-screen w-screen flex items-center justify-center bg-[#F2F2F7] p-6 select-none">
          <div className="max-w-md w-full bg-white rounded-3xl p-8 border border-gray-200/80 shadow-layered-lg flex flex-col items-center text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-danger/10 text-danger flex items-center justify-center border border-danger/20">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-xl font-black text-text-primary">حدث خطأ غير متوقع في الواجهة</h2>
              <p className="text-xs font-bold text-text-secondary mt-1">
                {this.state.error?.message ?? 'تم تسجيل الخطأ، اضغط أدناه لإعادة تشغيل الواجهة.'}
              </p>
            </div>
            <button
              onClick={this.handleReset}
              className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl bg-accent text-white text-xs font-bold shadow-ambient hover:bg-accent-hover transition-all btn-press"
            >
              <RefreshCw className="w-4 h-4" />
              <span>إعادة تحميل التطبيق</span>
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
