type Props = {
  checked: boolean
  onChange: (checked: boolean) => void
  /** Screen-reader name for the switch. */
  label: string
}

/** The on/off switch used on Settings cards. */
export default function SwitchToggle({ checked, onChange, label }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={
        'relative h-7 w-12 shrink-0 rounded-full transition ' +
        (checked ? 'bg-emerald-500' : 'bg-zinc-700')
      }
    >
      <span
        className={
          'absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition ' +
          (checked ? 'translate-x-5' : 'translate-x-0')
        }
      />
      <span className="sr-only">{label}</span>
    </button>
  )
}
