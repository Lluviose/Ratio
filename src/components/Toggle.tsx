import clsx from 'clsx'

export function Toggle(props: { checked: boolean; onChange: (checked: boolean) => void }) {
  const { checked, onChange } = props
  return (
    <button
      type="button"
      className={clsx('toggle', checked && 'toggleOn')}
      onClick={() => onChange(!checked)}
      aria-pressed={checked}
    >
      <span className="toggleKnob" />
    </button>
  )
}
