import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Award, BarChart3, BookOpen, CheckCircle2, Clock3, Home, Target, TrendingDown, TrendingUp, XCircle } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { getChapterWisePerformance, getQuestionWisePerformance } from '../../services/examService.js';
import LoadingScreen from '../../components/LoadingScreen.jsx';
import HeroHeader from '../../components/HeroHeader.jsx';

function formatDuration(seconds) {
  const safe = Number(seconds || 0);
  return `${Math.floor(safe / 60)}m ${safe % 60}s`;
}

function pct(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

export default function PracticeReview() {
  const { attemptId } = useParams();
  const nav = useNavigate();
  const [attempt, setAttempt] = useState(null);
  const [chapter, setChapter] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [analysisError, setAnalysisError] = useState('');

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data, error } = await supabase.from('student_attempts').select('*, exams(*)').eq('id', attemptId).single();
      if (error) {
        setAnalysisError(error.message);
        setLoading(false);
        return;
      }

      if (data?.attempt_type !== 'practice') {
        nav(`/student/result/${attemptId}`, { replace: true });
        return;
      }

      setAttempt(data);
      try {
        const [chapterRows, questionRows] = await Promise.all([
          getChapterWisePerformance(attemptId),
          getQuestionWisePerformance(attemptId)
        ]);
        setChapter(chapterRows);
        setQuestions(questionRows);
      } catch (error) {
        setAnalysisError(error.message);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [attemptId, nav]);

  const summary = useMemo(() => {
    const strong = chapter.filter(item => item.accuracy >= 75).map(item => item.chapter).slice(0, 3);
    const weak = chapter.filter(item => item.accuracy < 50).map(item => item.chapter).slice(0, 3);
    const recommendation = weak.length
      ? `Revisit ${weak.join(', ')} and start another practice test to reinforce those chapters.`
      : 'Great work. Keep revising regularly to maintain your momentum.';

    return { strong, weak, recommendation };
  }, [chapter]);

  if (loading || !attempt) return <LoadingScreen label="Loading practice review..." />;

  return (
    <>
      <HeroHeader
        badge="Practice Review"
        title={attempt.practice_subject ? `${attempt.practice_subject} Practice Review` : 'Practice Review'}
        actions={(
          <>
            <Link className="btn" to="/student/practice"><BookOpen size={18} /> New Practice Test</Link>
            <Link className="btn secondary" to="/student"><Home size={18} /> Dashboard</Link>
          </>
        )}
        stats={null}
      />

      <div className="cards stat-strip">
        <div className="card soft-card"><Award size={22} /><h3>{attempt.total_score || 0}</h3><p>Overall Score</p></div>
        <div className="card soft-card"><CheckCircle2 size={22} /><h3>{attempt.correct_count || 0}</h3><p>Correct</p></div>
        <div className="card soft-card"><XCircle size={22} /><h3>{attempt.incorrect_count || 0}</h3><p>Incorrect</p></div>
        <div className="card soft-card"><Target size={22} /><h3>{pct(attempt.accuracy || attempt.percentage || 0)}</h3><p>Accuracy</p></div>
        <div className="card soft-card"><Clock3 size={22} /><h3>{formatDuration(attempt.time_taken_seconds)}</h3><p>Time taken</p></div>
        <div className="card soft-card"><BarChart3 size={22} /><h3>{questions.length}</h3><p>Questions attempted</p></div>
      </div>

      <section className="panel analysis-panel">
        <div className="section-title">
          <div>
            <h2>Improvement Summary</h2>
            <p className="muted">A quick reading of your strongest and weakest chapters.</p>
          </div>
          <TrendingUp size={24} />
        </div>
        <div className="student-review-panels">
          <section className="student-review-section">
            <div className="student-review-section__head">
              <TrendingUp size={16} />
              <b>Strong areas</b>
            </div>
            <div className="chip-list">
              {summary.strong.length ? summary.strong.map(item => <span className="chip student-review-chip" key={item}>{item}</span>) : <span className="muted">Not enough data yet</span>}
            </div>
          </section>
          <section className="student-review-section">
            <div className="student-review-section__head">
              <TrendingDown size={16} />
              <b>Weak areas</b>
            </div>
            <div className="chip-list">
              {summary.weak.length ? summary.weak.map(item => <span className="chip student-review-chip" key={item}>{item}</span>) : <span className="muted">No weak chapters detected</span>}
            </div>
          </section>
        </div>
        <div className="student-review-insight">
          <p>{summary.recommendation}</p>
        </div>
      </section>

      {analysisError && <div className="notice"><BarChart3 size={18} /> Could not load detailed analysis: {analysisError}</div>}

      <section className="panel analysis-panel">
        <div className="section-title">
          <div>
            <h2>Chapter-wise Analysis</h2>
            <p className="muted">Accuracy by chapter from this practice test.</p>
          </div>
          <BarChart3 size={24} />
        </div>
        {chapter.length ? (
          <div className="analysis-list">
            {chapter.map(row => (
              <div className="analysis-row" key={row.chapter}>
                <div>
                  <b>{row.chapter}</b>
                  <small>{row.correct}/{row.total} correct</small>
                </div>
                <div className="progress-track"><span style={{ width: `${row.accuracy}%` }} /></div>
                <strong>{row.accuracy}%</strong>
              </div>
            ))}
          </div>
        ) : (
          <div className="notice info"><BarChart3 size={18} /> No chapter data was found for this practice test.</div>
        )}
      </section>

      <section className="panel analysis-panel">
        <div className="section-title">
          <div>
            <h2>Question-wise Review</h2>
            <p className="muted">Compare your answer with the correct answer for each question.</p>
          </div>
          <CheckCircle2 size={24} />
        </div>

        <div className="question-report-list">
          {questions.map(question => {
            const status = question.selected_option ? (question.is_correct ? 'Correct' : 'Wrong') : 'Skipped';
            const getOptionText = (key) => {
              if (!key) return null;
              const upperKey = key.toUpperCase();
              let text = '';
              if (upperKey === 'A') text = question.option_a;
              else if (upperKey === 'B') text = question.option_b;
              else if (upperKey === 'C') text = question.option_c;
              else if (upperKey === 'D') text = question.option_d;
              if (!text) return upperKey;
              return `${upperKey}. ${text.length > 40 ? text.slice(0, 37) + '...' : text}`;
            };
            return (
              <div className="question-report-row" key={question.id} style={{ padding: '12px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                  <div className="question-report-title" style={{ padding: 0, border: 'none', margin: 0, display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <span style={{ flexShrink: 0 }}>Q{question.question_order}</span>
                    <div>
                      <b style={{ fontSize: '0.95rem', color: '#1e293b' }}>{question.question_text}</b>
                      <small style={{ display: 'block', marginTop: '2px', color: '#64748b' }}>{question.chapter_name} • {question.difficulty} • {question.marks || 1} mark</small>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <span className="chip" style={{ display: 'inline-flex', padding: '4px 8px', borderRadius: '5px', background: '#f1f5f9', border: '1px solid #e2e8f0', gap: '4px', fontSize: '0.75rem', alignItems: 'center' }}>
                      <span style={{ color: '#64748b', fontWeight: 500 }}>Selected:</span>
                      <strong style={{ color: '#1e293b' }}>{getOptionText(question.selected_option) || 'Skipped'}</strong>
                    </span>
                    <span className="chip" style={{ display: 'inline-flex', padding: '4px 8px', borderRadius: '5px', background: '#f1f5f9', border: '1px solid #e2e8f0', gap: '4px', fontSize: '0.75rem', alignItems: 'center' }}>
                      <span style={{ color: '#64748b', fontWeight: 500 }}>Correct:</span>
                      <strong style={{ color: '#1e293b' }}>{getOptionText(question.correct_option) || '-'}</strong>
                    </span>
                    <span
                      className="status-pill"
                      style={{
                        display: 'inline-flex',
                        padding: '4px 8px',
                        borderRadius: '5px',
                        fontSize: '0.75rem',
                        alignItems: 'center',
                        gap: '4px',
                        fontWeight: 600,
                        background: question.is_correct ? '#ecfdf5' : question.selected_option ? '#fef2f2' : '#fffbeb',
                        color: question.is_correct ? '#047857' : question.selected_option ? '#b91c1c' : '#d97706',
                        border: `1px solid ${question.is_correct ? '#a7f3d0' : question.selected_option ? '#fecaca' : '#fef3c7'}`
                      }}
                    >
                      {question.is_correct ? <CheckCircle2 size={12} /> : <XCircle size={12} />} {status}
                    </span>
                  </div>
                </div>
                {question.explanation && (
                  <p className="muted" style={{ margin: '6px 0 0 0', fontSize: '0.8rem', paddingLeft: '46px' }}>
                    <b>Explanation:</b> {question.explanation}
                  </p>
                )}
              </div>
            );
          })}
          {!questions.length && <p className="muted">No question-wise data was found for this practice test.</p>}
        </div>
      </section>
    </>
  );
}
