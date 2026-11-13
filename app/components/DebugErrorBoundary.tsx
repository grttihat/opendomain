"use client";

import { Component, type ReactNode } from "react";

type State = { err: Error | null };

// Temporary diagnostic boundary — swaps the generic Next.js production
// error page for the actual thrown error + stack. Remove once the step
// 2-5 refactor is confirmed stable.
export default class DebugErrorBoundary extends Component<
  { children: ReactNode },
  State
> {
  state: State = { err: null };

  static getDerivedStateFromError(err: Error): State {
    return { err };
  }

  componentDidCatch(err: Error, info: { componentStack?: string }) {
    // eslint-disable-next-line no-console
    console.error("[DebugErrorBoundary]", err, info);
  }

  render() {
    if (!this.state.err) return this.props.children;
    const err = this.state.err;
    return (
      <div className="fixed inset-0 z-[9999] flex flex-col gap-3 overflow-auto bg-black p-4 text-text-primary">
        <div className="text-[14px] font-bold text-red-400">
          [런타임 에러] {err.name}
        </div>
        <div className="whitespace-pre-wrap break-words text-[12px] text-text-primary">
          {err.message}
        </div>
        <div className="whitespace-pre-wrap break-words text-[10px] text-text-muted">
          {err.stack}
        </div>
        <button
          type="button"
          onClick={() => this.setState({ err: null })}
          className="mt-2 w-fit rounded-full bg-white/[0.12] px-4 py-2 text-[12px] text-text-primary hover:bg-white/[0.2]"
        >
          재시도
        </button>
      </div>
    );
  }
}
