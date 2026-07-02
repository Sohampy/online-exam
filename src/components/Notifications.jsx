import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { AlertCircle, BadgeCheck, Bell, Info, TriangleAlert, X } from 'lucide-react';

const NotificationContext = createContext(() => {});

const iconMap = {
  success: BadgeCheck,
  error: AlertCircle,
  warning: TriangleAlert,
  info: Info
};

let toastId = 0;

export function notify(notification) {
  window.dispatchEvent(new CustomEvent('app-notification', { detail: notification }));
}

export function NotificationsProvider({ children }) {
  const [items, setItems] = useState([]);

  useEffect(() => {
    function onNotify(event) {
      const detail = event.detail || {};
      const id = ++toastId;
      const item = {
        id,
        type: detail.type || 'info',
        title: detail.title || (detail.type === 'success' ? 'Success' : detail.type === 'error' ? 'Error' : detail.type === 'warning' ? 'Warning' : 'Info'),
        message: detail.message || ''
      };
      setItems(current => [...current, item]);
      window.setTimeout(() => {
        setItems(current => current.filter(toast => toast.id !== id));
      }, detail.duration || 3600);
    }

    window.addEventListener('app-notification', onNotify);
    return () => window.removeEventListener('app-notification', onNotify);
  }, []);

  const api = useMemo(() => ({ notify }), []);

  return (
    <NotificationContext.Provider value={api}>
      {children}
      <div className="toast-viewport" aria-live="polite" aria-relevant="additions">
        {items.map(item => {
          const Icon = iconMap[item.type] || Bell;
          return (
            <div className={`toast toast-${item.type}`} key={item.id}>
              <span className="toast-icon"><Icon size={18} /></span>
              <div className="toast-body">
                <b>{item.title}</b>
                {item.message && <small>{item.message}</small>}
              </div>
              <button className="icon-btn toast-close" type="button" onClick={() => setItems(current => current.filter(toast => toast.id !== item.id))} aria-label="Dismiss notification">
                <X size={16} />
              </button>
            </div>
          );
        })}
      </div>
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  return useContext(NotificationContext);
}
