import { X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode, type TouchEvent } from 'react';
import { createPortal } from 'react-dom';

interface SheetProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  tall?: boolean;
  headerAction?: ReactNode;
  /** Shown in place of the title (which still names the dialog for screen readers). */
  heading?: ReactNode;
  className?: string;
  /** Close by swiping down from the top of the sheet (phones). */
  swipeToClose?: boolean;
}

/** How far down a swipe must go to close the sheet. */
const SWIPE_CLOSE_PX = 90;

/** Bottom sheet on phones, centered dialog on larger screens. */
export function Sheet({ title, onClose, children, footer, wide, tall, headerAction, heading, className, swipeToClose }: SheetProps) {
  const ref = useRef<HTMLDivElement>(null);
  const startY = useRef<number | null>(null);
  const [drag, setDrag] = useState(0);
  const swipe = swipeToClose
    ? {
        onTouchStart: (e: TouchEvent) => {
          startY.current = e.touches[0].clientY;
        },
        onTouchMove: (e: TouchEvent) => {
          if (startY.current !== null) setDrag(Math.max(0, e.touches[0].clientY - startY.current));
        },
        onTouchEnd: () => {
          startY.current = null;
          if (drag > SWIPE_CLOSE_PX) onClose();
          else setDrag(0);
        },
      }
    : {};
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const prevFocus = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const first = ref.current?.querySelector<HTMLElement>('[data-autofocus]');
    (first ?? ref.current)?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      prevFocus?.focus?.({ preventScroll: true });
    };
  }, []);

  return createPortal(
    <div className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        className={`sheet${wide ? ' wide' : ''}${tall ? ' tall' : ''}${className ? ` ${className}` : ''}`}
        style={drag ? { transform: `translateY(${drag}px)`, transition: 'none' } : undefined}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        // The sheet is drawn outside the page but still sits inside it as far as React goes: without this,
        // pressing Search in a sheet opened from the edit form also submitted (saved) that form.
        onSubmit={(e) => e.stopPropagation()}
      >
        <div className="sheet-grabber" {...swipe} />
        <div className="sheet-head" {...swipe}>
          {heading ?? <h2>{title}</h2>}
          <div style={{ display: 'flex', gap: 8 }}>
            {headerAction}
            <button type="button" className="icon-btn sheet-close" onClick={onClose} aria-label="Close">
              <X size={20} />
            </button>
          </div>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
