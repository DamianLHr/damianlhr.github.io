import { Component, type ReactNode } from 'react'

interface Props {
  onError: (error: unknown) => void
  children: ReactNode
}

interface State {
  failed: boolean
}

/** Catches theme render crashes so the shell can kick down to the floor theme —
 * a white screen is architecturally off the table (PLAN §2). */
export class ThemeBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    this.props.onError(error)
  }

  render() {
    return this.state.failed ? null : this.props.children
  }
}
