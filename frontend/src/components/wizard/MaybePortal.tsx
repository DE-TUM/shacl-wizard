import { createPortal } from 'react-dom'

// Renders children inline (the stacked mobile fallback) or portaled into the
// App-level side panel (desktop). With no slot yet it renders nothing, to
// avoid a flash of content inside the card before the portal target mounts.
// Shared by any step that uses the App-level side panel (currently Step 4's
// constraint editor and Step 3's property-detection browser) - one mechanism,
// not one per step.
export function MaybePortal({ target, inline, children }: {
  target: HTMLElement | null
  inline: boolean
  children: React.ReactNode
}) {
  if (inline) return <>{children}</>
  return target ? createPortal(children, target) : null
}
