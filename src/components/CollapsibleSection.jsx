import { ChevronDown } from 'lucide-react';

export default function CollapsibleSection({ title, subtitle, open, onToggle, children, action }) {
  return (
    <section className={open ? 'collapsible-panel open' : 'collapsible-panel'}>
      <button className="collapsible-trigger" type="button" onClick={onToggle} aria-expanded={open}>
        <span>
          <b>{title}</b>
          {subtitle && <small>{subtitle}</small>}
        </span>
        <span className="collapsible-action">
          {action}
          <ChevronDown size={18} className={open ? 'rotated' : ''} />
        </span>
      </button>
      <div className="collapsible-body">
        {children}
      </div>
    </section>
  );
}
