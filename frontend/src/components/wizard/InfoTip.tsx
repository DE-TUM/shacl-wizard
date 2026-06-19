import { useCallback, useId, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface InfoTipProps {
  children: ReactNode
  align?: 'left' | 'center' | 'right'
  placement?: 'top' | 'bottom'
  className?: string
  focusable?: boolean
  label?: string
}

export function InfoTip({
  children,
  align = 'center',
  placement = 'bottom',
  className = '',
  focusable = true,
  label = 'More information',
}: InfoTipProps) {
  const id = useId()
  const triggerRef = useRef<HTMLSpanElement>(null)
  const bubbleRef = useRef<HTMLSpanElement>(null)
  const [visible, setVisible] = useState(false)
  const [position, setPosition] = useState<CSSProperties | null>(null)

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current
    const bubble = bubbleRef.current
    if (!trigger || !bubble) return

    const triggerRect = trigger.getBoundingClientRect()
    const bubbleRect = bubble.getBoundingClientRect()
    const gap = 8
    const pagePadding = 8

    let left =
      align === 'left'
        ? triggerRect.left
        : align === 'right'
          ? triggerRect.right - bubbleRect.width
          : triggerRect.left + triggerRect.width / 2 - bubbleRect.width / 2

    let top =
      placement === 'top'
        ? triggerRect.top - bubbleRect.height - gap
        : triggerRect.bottom + gap

    const bottomTop = triggerRect.bottom + gap
    const topTop = triggerRect.top - bubbleRect.height - gap

    if (top < pagePadding && bottomTop + bubbleRect.height <= window.innerHeight - pagePadding) {
      top = bottomTop
    }

    if (
      top + bubbleRect.height > window.innerHeight - pagePadding &&
      topTop >= pagePadding
    ) {
      top = topTop
    }

    left = Math.min(
      Math.max(left, pagePadding),
      window.innerWidth - bubbleRect.width - pagePadding,
    )

    top = Math.min(
      Math.max(top, pagePadding),
      window.innerHeight - bubbleRect.height - pagePadding,
    )

    setPosition({ left, top })
  }, [align, placement])

  useLayoutEffect(() => {
    if (!visible) return

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)

    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [updatePosition, visible])

  return (
    <>
      <span
        ref={triggerRef}
        className={`info-tip ${className}`}
        tabIndex={focusable ? 0 : undefined}
        aria-label={label}
        aria-describedby={visible ? id : undefined}
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onFocus={() => setVisible(true)}
        onBlur={() => setVisible(false)}
      >
        <span aria-hidden="true">i</span>
      </span>
      {visible && typeof document !== 'undefined' && createPortal(
        <span
          ref={bubbleRef}
          id={id}
          role="tooltip"
          className="info-tip-bubble"
          style={position ?? { left: -9999, top: -9999 }}
        >
          {children}
        </span>,
        document.body,
      )}
    </>
  )
}
