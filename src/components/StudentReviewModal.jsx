import { useEffect } from 'react';
import { BookOpen, Mail, School2, Target, TrendingDown, TrendingUp, Users, X } from 'lucide-react';

function pct(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

export default function StudentReviewModal({ report, onClose }) {
  useEffect(() => {
    function onEsc(event) {
      if (event.key === 'Escape') onClose?.();
    }

    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [onClose]);

  if (!report) return null;

  const trendType = report.trend?.type || 'average';
  const trendIcon = trendType === 'good' ? <TrendingUp size={16} /> : trendType === 'weak' ? <TrendingDown size={16} /> : null;
  const recommendation = report.recommendation || `Focus on ${report.weak?.join(', ') || 'the weaker chapters'} and keep reattempting practice tests.`;

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="modal-card student-review-modal" role="dialog" aria-modal="true" aria-labelledby="student-review-title" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <span className="eyebrow">Student review</span>
            <h2 id="student-review-title">{report.student?.full_name || 'Student'}</h2>
          </div>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="Close review">
            <X size={18} />
          </button>
        </div>

        <div className="student-review-grid">
          <div className="student-review-info">
            <span><Mail size={16} /> {report.student?.email || '-'}</span>
            <span><School2 size={16} /> {report.student?.class_name || '-'}</span>
            <span><Users size={16} /> {report.teacherName || '-'}</span>
          </div>

          <div className="student-review-metrics">
            <span>
              <b>{report.count || 0}</b>
              <small>Attempts</small>
            </span>
            <span>
              <b>{Number(report.average || 0).toFixed(1)}</b>
              <small>Average score</small>
            </span>
            <span>
              <b>{pct(report.accuracy)}</b>
              <small>Accuracy</small>
            </span>
            <span>
              <b>{Number(report.latestScore || 0)}</b>
              <small>Latest score</small>
            </span>
          </div>

          <div className="student-review-panels">
            <section className="student-review-section">
              <div className="student-review-section__head">
                <BookOpen size={16} />
                <b>Strength areas</b>
              </div>
              <div className="chip-list">
                {(report.strong || []).length ? report.strong.map(item => <span className="chip student-review-chip" key={item}>{item}</span>) : <span className="muted">Not enough data yet</span>}
              </div>
            </section>

            <section className="student-review-section">
              <div className="student-review-section__head">
                <Target size={16} />
                <b>Improvement areas</b>
              </div>
              <div className="chip-list">
                {(report.weak || []).length ? report.weak.map(item => <span className="chip student-review-chip" key={item}>{item}</span>) : <span className="muted">No weak chapters detected</span>}
              </div>
            </section>
          </div>

          <section className="student-review-insight">
            <div className="student-review-section__head">
              <span className={`level ${trendType}`}>{trendIcon} {report.trend?.text || 'Stable'}</span>
            </div>
            <p>{recommendation}</p>
          </section>
        </div>

        <div className="modal-actions">
          <button className="btn secondary" type="button" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
