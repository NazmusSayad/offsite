import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'

export class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack)
  }

  render() {
    const error = this.state.error
    if (error === null) {
      return this.props.children
    }
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3 p-4 text-center">
        <p className="font-medium">Something went wrong</p>
        <p className="text-muted-foreground max-w-xl text-sm whitespace-pre-wrap">
          {error.message}
        </p>
        <Button onClick={() => location.reload()}>Reload</Button>
      </div>
    )
  }
}
