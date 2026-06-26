import { BookOpenCheck, Loader2 } from 'lucide-react';

export default function LoadingScreen({ label = 'Loading your workspace...' }) {
  return (
    <div className="loading-screen" role="status" aria-live="polite">
      <div className="loading-card">
        <div className="loading-icon">
          <BookOpenCheck size={28} />
          <Loader2 className="loading-spinner" size={20} />
        </div>
        <b>{label}</b>
        <span>Preparing your exam portal</span>
      </div>
    </div>
  );
}
