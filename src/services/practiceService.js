import { supabase } from '../lib/supabaseClient';

export function buildPracticeSignature({ subject = '', chapterIds = [], questionCount = 0, difficulty = 'mixed' }) {
  const normalizedChapters = [...new Set((chapterIds || []).filter(Boolean))].sort();
  return [
    String(subject || '').trim().toLowerCase(),
    normalizedChapters.join(','),
    Number(questionCount) || 0,
    String(difficulty || 'mixed').trim().toLowerCase()
  ].join('|');
}

export async function findPracticeAttemptBySignature(studentId, signature) {
  if (!studentId || !signature) return null;

  const { data, error } = await supabase
    .from('student_attempts')
    .select('id,status,attempt_number,started_at,submitted_at,attempt_type,practice_signature,practice_subject,practice_chapter_ids,practice_question_count,practice_difficulty,practice_duration_minutes')
    .eq('student_id', studentId)
    .eq('attempt_type', 'practice')
    .eq('practice_signature', signature)
    .order('started_at', { ascending: false })
    .limit(1);

  if (error) throw error;
  return data?.[0] || null;
}

export async function startPracticeTest({ subject, chapterIds, questionCount, difficulty = 'mixed', signature }) {
  const { data, error } = await supabase.rpc('start_practice_test', {
    p_subject: subject,
    p_chapter_ids: chapterIds,
    p_question_count: questionCount,
    p_difficulty: difficulty,
    p_signature: signature
  });
  if (error) throw error;
  return data;
}

export async function restartPracticeTest(attemptId) {
  const { data, error } = await supabase.rpc('restart_practice_test', {
    p_attempt_id: attemptId
  });
  if (error) throw error;
  return data;
}
