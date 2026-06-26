export default function HeroHeader({ badge, title, actions = null, stats = null, className = '', singleLine = false }) {
  return (
    <section className={`hero-header ${singleLine ? 'hero-header--single' : ''} ${className}`.trim()}>
      <div className="hero-header__left">
        {badge && <span className="eyebrow hero-badge">{badge}</span>}
        {!singleLine && title ? <h1>{title}</h1> : null}
      </div>
      <div className="hero-header__right">
        {actions && <div className="hero-header__actions">{actions}</div>}
        {stats && <div className="hero-header__stats">{stats}</div>}
      </div>
    </section>
  );
}
