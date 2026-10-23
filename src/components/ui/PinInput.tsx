import {
  forwardRef,
  useEffect,
  useLayoutEffect,
  useRef,
  type FocusEvent,
  type InputHTMLAttributes,
} from 'react'
import { scrollFocusedIntoView } from '@/lib/keyboardViewport'

type PinInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'value' | 'onChange' | 'inputMode' | 'autoComplete' | 'ref'
> & {
  value: string
  /** Shakes the field each time it turns true (a wrong PIN). */
  error?: boolean
  onChange: (value: string) => void
  maxLength?: number
}

/**
 * 4-digit PIN field that avoids `type="password"` so browsers do not treat
 * it as a site login password (save/update prompts). Masking uses CSS.
 *
 * Do not use initial `readOnly` to block autofill — iOS Safari focuses the
 * field on first tap but refuses to show the keyboard until a second focus.
 */
const PinInput = forwardRef<HTMLInputElement, PinInputProps>(function PinInput(
  {
    value,
    onChange,
    error = false,
    maxLength = 4,
    className = '',
    autoFocus,
    id,
    onFocus,
    ...rest
  },
  forwardedRef,
) {
  const localRef = useRef<HTMLInputElement>(null)

  const setRef = (el: HTMLInputElement | null) => {
    localRef.current = el
    if (typeof forwardedRef === 'function') {
      forwardedRef(el)
    } else if (forwardedRef) {
      forwardedRef.current = el
    }
  }

  function handleFocus(e: FocusEvent<HTMLInputElement>) {
    scrollFocusedIntoView(e.currentTarget)
    onFocus?.(e)
  }

  useLayoutEffect(() => {
    if (!autoFocus) return
    const el = localRef.current
    if (!el) return
    el.focus({ preventScroll: true })
  }, [autoFocus])

  useEffect(() => {
    if (!error) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    localRef.current?.animate(
      [
        { transform: 'translateX(0)' },
        { transform: 'translateX(-8px)' },
        { transform: 'translateX(7px)' },
        { transform: 'translateX(-5px)' },
        { transform: 'translateX(3px)' },
        { transform: 'translateX(0)' },
      ],
      { duration: 320, easing: 'cubic-bezier(0.36, 0.07, 0.19, 0.97)' },
    )
  }, [error])

  return (
    <input
      {...rest}
      ref={setRef}
      id={id}
      type="tel"
      inputMode="numeric"
      pattern="[0-9]*"
      enterKeyHint="done"
      maxLength={maxLength}
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="off"
      spellCheck={false}
      data-lpignore="true"
      data-1p-ignore
      data-form-type="other"
      name={id ? `pin-${id}` : undefined}
      value={value}
      onChange={(e) =>
        onChange(e.target.value.replace(/\D/g, '').slice(0, maxLength))
      }
      onFocus={handleFocus}
      className={`pin-mask ${className}`.trim()}
    />
  )
})

export default PinInput
