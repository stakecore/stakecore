import type { ReactNode } from 'react'
import { SpinnerCircular } from 'spinners-react'
import ServerError from './serverError'
import EmptyState from './emptyState'

interface QueryStateProps<T> {
  isLoading: boolean
  error: unknown
  data: T | null | undefined
  spinnerColor?: string
  spinnerSize?: number
  emptyTitle?: string
  emptyDescription?: string
  children: (data: T) => ReactNode
}

// Standard loading/error/empty ladder for SWR-backed sections. Critically it
// distinguishes a real failure (error set → ServerError) from a successful
// but empty/expired response (data == null → EmptyState), so the latter can't
// surface a false "Connection failed" the way `data == null → ServerError`
// did on the FSP pages.
//
// **The order of these branches is the load-bearing part.** Read most-settled
// first: data we have, then an error we have, then a request still in flight.
// Checking `isLoading` first — which this did — breaks twice over, because
// SWR 2.x reports `isLoading` for *any* in-flight request with no loaded data,
// which is exactly the state every retry after a failure is in:
//
//   • The error panel was torn down and rebuilt on each retry. Traced against
//     a dead backend, one retry produced -[error-container] +[spinner] then
//     -[spinner] +[error-container] 7ms later. The gap is however long the
//     fetch takes to fail, so a real hanging connection flashes visibly.
//   • A failed *background* refresh replaced a fully-rendered page with
//     "Connection failed", even though the data on screen was still the last
//     thing the server actually said.
//
// So: the page changes when a fetch succeeds, and only then. A failure now
// costs nothing that was already on screen.
export function QueryState<T>({
  isLoading,
  error,
  data,
  spinnerColor = 'var(--heading-color)',
  spinnerSize = 100,
  emptyTitle,
  emptyDescription,
  children,
}: QueryStateProps<T>) {
  if (data != null) {
    return <>{children(data)}</>
  }
  if (error != null) {
    return <ServerError error={error} />
  }
  if (isLoading) {
    return (
      <div style={{ textAlign: 'center' }} className="mt-30 mb-30">
        <SpinnerCircular color={spinnerColor} size={spinnerSize} />
      </div>
    )
  }
  return <EmptyState title={emptyTitle} description={emptyDescription} />
}

export default QueryState
