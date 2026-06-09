import { useEffect, useState } from 'react';
import { BarChart3, ChevronDown, ChevronUp, CheckCircle2, FileQuestion, XCircle } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';

function answerLabel(value) {
  return value || 'Skipped';
}

export default function Reports() {
  const [rows, setRows] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [details, setDetails] = useState({});
  const [loadingDetail, setLoadingDetail] = useState('');

  useEffect(() => {
    supabase
      .from('student_attempts')
      .select('*, profiles(full_name,email), exams(title,total_questions)')
      .order('started_at', { ascending: false })
      .then(({ data }) => setRows(data || []));
  }, []);

  async function loadDetails(attemptId) {
    if (details[attemptId]) {
      setOpenId(openId === attemptId ? null : attemptId);
      return;
    }

    setLoadingDetail(attemptId);
    const [{ data: assigned, error: questionError }, { data: answers, error: answerError }] = await Promise.all([
      supabase
        .from('exam_questions')
        .select('question_order, question_id, questions(question_text, correct_option, option_a, option_b, option_c, option_d, chapters(chapter_name))')
        .eq('attempt_id', attemptId)
        .order('question_order'),
      supabase.from('student_answers').select('question_id, selected_option, is_correct').eq('attempt_id', attemptId)
    ]);

    if (questionError || answerError) {
      alert(questionError?.message || answerError?.message);
      setLoadingDetail('');
      return;
    }

    const answerMap = (answers || []).reduce((map, answer) => {
      map[answer.question_id] = answer;
      return map;
    }, {});

    setDetails(current => ({
      ...current,
      [attemptId]: (assigned || []).map(row => {
        const answer = answerMap[row.question_id];
        return {
          ...row,
          selected_option: answer?.selected_option || null,
          is_correct: Boolean(answer?.is_correct)
        };
      })
    }));
    setOpenId(attemptId);
    setLoadingDetail('');
  }

  return (
    <>
      <section className="dashboard-hero report-hero">
        <div>
          <span className="eyebrow">Reports</span>
          <h1>Question-wise exam performance.</h1>
          <p>Open any attempt to inspect selected answers, correct answers, skipped questions, and chapter context.</p>
        </div>
        <div className="hero-stat">
          <BarChart3 size={28} />
          <strong>{rows.length}</strong>
          <span>Attempts</span>
        </div>
      </section>

      <div className="report-list">
        {rows.map(row => {
          const isOpen = openId === row.id;
          const questionRows = details[row.id] || [];
          return (
            <article className="report-card" key={row.id}>
              <div className="report-summary">
                <div>
                  <h2>{row.profiles?.full_name || 'Student'} - {row.exams?.title || 'Exam'}</h2>
                  <p className="muted">{row.profiles?.email} • {row.status}</p>
                </div>
                <div className="report-score">
                  <span><b>{row.total_score || 0}</b><small>Score</small></span>
                  <span><b>{row.correct_count || 0}</b><small>Correct</small></span>
                  <span><b>{row.accuracy || 0}%</b><small>Accuracy</small></span>
                </div>
                <button className="btn secondary" type="button" onClick={() => loadDetails(row.id)}>
                  <FileQuestion size={18} /> {loadingDetail === row.id ? 'Loading...' : isOpen ? 'Hide Questions' : 'Question-wise'} {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </button>
              </div>

              {isOpen && (
                <div className="question-report-list">
                  {questionRows.map(item => {
                    const question = item.questions || {};
                    const status = item.selected_option ? item.is_correct ? 'Correct' : 'Wrong' : 'Skipped';
                    return (
                      <div className="question-report-row" key={item.question_id}>
                        <div className="question-report-title">
                          <span>Q{item.question_order}</span>
                          <div>
                            <b>{question.question_text}</b>
                            <small>{question.chapters?.chapter_name || 'Unknown chapter'}</small>
                          </div>
                        </div>
                        <div className="answer-grid">
                          <span><small>Selected</small><b>{answerLabel(item.selected_option)}</b></span>
                          <span><small>Correct</small><b>{question.correct_option}</b></span>
                          <span className={item.is_correct ? 'answer-status correct' : item.selected_option ? 'answer-status wrong' : 'answer-status skipped'}>
                            {item.is_correct ? <CheckCircle2 size={16} /> : <XCircle size={16} />} {status}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                  {!questionRows.length && <p className="muted">No assigned questions found for this attempt.</p>}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </>
  );
}
