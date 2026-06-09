import { supabase } from '../lib/supabaseClient';

export async function startExam(examId) {
  const { data, error } = await supabase.rpc('start_exam', { p_exam_id: examId });
  if (error) throw error;
  return data;
}

export async function getAttemptQuestions(attemptId) {
  const { data, error } = await supabase
    .from('exam_questions')
    .select('question_order, questions(id, question_text, option_a, option_b, option_c, option_d, chapter_id, difficulty, marks)')
    .eq('attempt_id', attemptId)
    .order('question_order');
  if (error) throw error;
  return data.map(row => ({ ...row.questions, question_order: row.question_order }));
}

export async function submitExam(attemptId, answers) {
  const { data: attempt, error: attError } = await supabase.from('student_attempts').select('*').eq('id', attemptId).single();
  if (attError) throw attError;
  if (attempt.status === 'submitted') throw new Error('This exam is already submitted.');

  const { data: assigned, error: assignedError } = await supabase
    .from('exam_questions')
    .select('question_id')
    .eq('attempt_id', attemptId);
  if (assignedError) throw assignedError;

  const questionIds = (assigned || []).map(row => row.question_id);
  if (!questionIds.length) throw new Error('No questions were found for this attempt.');

  const { data: questions, error } = await supabase.from('questions').select('id, correct_option, marks').in('id', questionIds);
  if (error) throw error;
  if ((questions || []).length !== questionIds.length) throw new Error('Some assigned questions could not be loaded for scoring.');

  let correct = 0;
  const answerRows = questionIds.map(questionId => {
    const q = questions.find(item => item.id === questionId);
    const selected = answers[q.id] || null;
    const isCorrect = selected === q.correct_option;
    if (isCorrect) correct++;
    return { attempt_id: attemptId, question_id: q.id, selected_option: selected, is_correct: isCorrect };
  });

  const incorrect = questions.length - correct;
  const totalScore = questions.reduce((sum, q) => sum + (answers[q.id] === q.correct_option ? Number(q.marks || 1) : 0), 0);
  const accuracy = questions.length ? Number(((correct / questions.length) * 100).toFixed(2)) : 0;

  const { error: ansError } = await supabase.from('student_answers').upsert(answerRows, { onConflict: 'attempt_id,question_id' });
  if (ansError) throw ansError;

  const { error: updError } = await supabase.from('student_attempts').update({
    status: 'submitted', submitted_at: new Date().toISOString(), total_score: totalScore, correct_count: correct, incorrect_count: incorrect, accuracy
  }).eq('id', attemptId);
  if (updError) throw updError;

  return { totalScore, correct, incorrect, accuracy };
}

export async function getChapterWisePerformance(attemptId) {
  const assigned = await getAttemptQuestions(attemptId);
  const questionIds = assigned.map(question => question.id);
  const chapterIds = [...new Set(assigned.map(question => question.chapter_id).filter(Boolean))];

  const { data: answers, error } = questionIds.length
    ? await supabase.from('student_answers').select('question_id,is_correct').eq('attempt_id', attemptId).in('question_id', questionIds)
    : { data: [], error: null };
  if (error) throw error;

  const { data: chapters, error: chapterError } = chapterIds.length
    ? await supabase.from('chapters').select('id,chapter_name').in('id', chapterIds)
    : { data: [], error: null };
  if (chapterError) throw chapterError;

  const answerMap = (answers || []).reduce((map, row) => {
    map[row.question_id] = row.is_correct;
    return map;
  }, {});
  const chapterMap = (chapters || []).reduce((map, chapter) => {
    map[chapter.id] = chapter.chapter_name;
    return map;
  }, {});

  const map = {};
  assigned.forEach(question => {
    const name = chapterMap[question.chapter_id] || 'Unknown';
    if (!map[name]) map[name] = { chapter: name, total: 0, correct: 0 };
    map[name].total++;
    if (answerMap[question.id]) map[name].correct++;
  });
  return Object.values(map).map(x => ({ ...x, accuracy: x.total ? Math.round((x.correct / x.total) * 100) : 0 }));
}

export async function getQuestionWisePerformance(attemptId) {
  const questions = await getAttemptQuestions(attemptId);
  const questionIds = questions.map(question => question.id);

  const { data: answers, error } = questionIds.length
    ? await supabase.from('student_answers').select('question_id,selected_option,is_correct').eq('attempt_id', attemptId).in('question_id', questionIds)
    : { data: [], error: null };
  if (error) throw error;

  const { data: correctRows, error: correctError } = questionIds.length
    ? await supabase.from('questions').select('id,correct_option').in('id', questionIds)
    : { data: [], error: null };
  if (correctError) throw correctError;

  const answerMap = (answers || []).reduce((map, answer) => {
    map[answer.question_id] = answer;
    return map;
  }, {});
  const correctMap = (correctRows || []).reduce((map, question) => {
    map[question.id] = question.correct_option;
    return map;
  }, {});

  return questions.map(question => {
    const answer = answerMap[question.id];
    return {
      ...question,
      selected_option: answer?.selected_option || null,
      correct_option: correctMap[question.id],
      is_correct: Boolean(answer?.is_correct)
    };
  });
}
