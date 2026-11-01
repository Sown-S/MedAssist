import Icon from './Icon'
export function LoadingBlock({ text = 'Loading...' }) {
  return (
    <div className="card" style={{ textAlign: 'center', color: 'var(--ink-soft)' }}>
      {text}
    </div>
  )
}

export function ErrorBlock({ message }) {
  return (
    <div className="warn-banner danger show">
      <div className="icon">
  <Icon name="ban" />
</div>
      <div className="txt">
        <b>Failed to load data</b>
        {message}
      </div>
    </div>
  )
}
