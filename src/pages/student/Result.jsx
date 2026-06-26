import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertCircle, Award, BarChart3, CheckCircle2, EyeOff, Home, Target, XCircle } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { getChapterWisePerformance, getQuestionWisePerformance } from '../../services/examService.js';
import LoadingScreen from '../../components/LoadingScreen.jsx';
import HeroHeader from '../../components/HeroHeader.jsx';

function formatDuration(seconds) {
  const safe = Number(seconds || 0);
  return `${Math.floor(safe / 60)}m ${safe % 60}s`;
}

export default function Result() {
  const { attemptId } = useParams();
  const [attempt, setAttempt] = useState(null);
  const [chapter, setChapter] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState('');

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase.from('student_attempts').select('*, exams(*)').eq('id', attemptId).single();
      if (error) {
        setAnalysisError(error.message);
        return;
      }
      setAttempt(data);
      if (data?.exams?.analysis_visible) {
        try {
          setAnalysisLoading(true);
          const [chapterRows, questionRows] = await Promise.all([
            getChapterWisePerformance(attemptId),
            getQuestionWisePerformance(attemptId)
          ]);
          setChapter(chapterRows);
          setQuestions(questionRows);
        } catch (error) {
          setAnalysisError(error.message);
        } finally {
          setAnalysisLoading(false);
        }
      }
    }
    load();
  }, [attemptId]);

  if (!attempt) return <LoadingScreen label="Loading result..." />;

  if (!attempt.exams?.result_visible) {
    return (
      <div className="result-shell">
        <section className="panel result-locked">
          <EyeOff size={42} />
          <h1>Submitted Successfully</h1>
          <p>Your exam has been submitted. The examiner has not enabled result visibility yet.</p>
          <Link className="btn secondary" to="/student"><Home size={18} /> Back to Dashboard</Link>
        </section>
      </div>
    );
  }

  return (
    <>
      <HeroHeader
        badge="Result Published"
        title={attempt.exams?.title || 'Exam Result'}
        singleLine
        stats={<div className="hero-stat"><Award size={28} /><strong>{attempt.accuracy}%</strong><span>Accuracy</span></div>}
      />

      <div className="cards stat-strip">
        <div className="card soft-card"><Award size={22} /><h3>{attempt.total_score}</h3><p>Total Score</p></div>
        <div className="card soft-card"><CheckCircle2 size={22} /><h3>{attempt.correct_count}</h3><p>Correct</p></div>
        <div className="card soft-card"><XCircle size={22} /><h3>{attempt.incorrect_count}</h3><p>Incorrect</p></div>
        <div className="card soft-card"><Target size={22} /><h3>{attempt.percentage || attempt.accuracy}%</h3><p>Percentage</p></div>
        <div className="card soft-card"><h3>{attempt.attempt_number || 1}</h3><p>Attempt number</p></div>
        <div className="card soft-card"><h3>{formatDuration(attempt.time_taken_seconds)}</h3><p>Time taken</p></div>
      </div>

      {attempt.exams?.analysis_visible ? (
        <>
        <section className="panel analysis-panel">
          <div className="section-title">
            <div>
              <h2>Chapter-wise Analysis</h2>
              <p className="muted">Accuracy by chapter from this attempt.</p>
            </div>
            <BarChart3 size={24} />
          </div>
          {analysisLoading ? (
            <p className="loading-inline">Loading detailed analysis...</p>
          ) : analysisError ? (
            <div className="notice"><AlertCircle size={18} /> Could not load detailed analysis: {analysisError}</div>
          ) : chapter.length ? (
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
            <div className="notice info"><BarChart3 size={18} /> Detailed analysis is enabled, but no chapter data was found for this attempt.</div>
          )}
        </section>
        {!analysisLoading && !analysisError && (
          <section className="panel analysis-panel">
            <div className="section-title">
              <div>
                <h2>Question-wise Analysis</h2>
                <p className="muted">Your selected answer compared with the correct answer.</p>
              </div>
              <CheckCircle2 size={24} />
            </div>
            <div className="question-report-list">
              {questions.map(question => {
                const status = question.selected_option ? question.is_correct ? 'Correct' : 'Wrong' : 'Skipped';
                return (
                  <div className="question-report-row" key={question.id}>
                    <div className="question-report-title">
                      <span>Q{question.question_order}</span>
                      <div>
                        <b>{question.question_text}</b>
                        <small>{question.chapter_name} • {question.difficulty} • {question.marks || 1} mark</small>
                      </div>
                    </div>
                    <div className="answer-grid">
                      <span><small>Selected</small><b>{question.selected_option || 'Skipped'}</b></span>
                      <span><small>Correct</small><b>{question.correct_option || '-'}</b></span>
                      <span className={question.is_correct ? 'answer-status correct' : question.selected_option ? 'answer-status wrong' : 'answer-status skipped'}>
                        {question.is_correct ? <CheckCircle2 size={16} /> : <XCircle size={16} />} {status}
                      </span>
                    </div>
                    {question.explanation && <p className="muted"><b>Explanation:</b> {question.explanation}</p>}
                  </div>
                );
              })}
              {!questions.length && <p className="muted">No question-wise data was found for this attempt.</p>}
            </div>
          </section>
        )}
        </>
      ) : (
        <div className="notice info"><EyeOff size={18} /> Detailed analysis is disabled by admin.</div>
      )}
    </>
  );
}
