import { useMemo, useState } from 'react';
import { Download, FileSpreadsheet, UploadCloud, X } from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext.jsx';
import { notify } from './Notifications.jsx';

const requiredColumns = ['question_text', 'option_a', 'option_b', 'option_c', 'option_d', 'correct_answer', 'chapter_name', 'subject_name', 'difficulty_level', 'marks'];

function normalizeDifficulty(value) {
  const item = String(value || '').trim().toLowerCase();
  if (['easy', 'medium', 'hard'].includes(item)) return item;
  return '';
}

function normalizeAnswer(value) {
  const item = String(value || '').trim().toUpperCase();
  return ['A', 'B', 'C', 'D'].includes(item) ? item : '';
}

function normalizeRow(row, index) {
  const normalized = {
    rowNumber: index + 2,
    question_text: String(row.question_text || '').trim(),
    option_a: String(row.option_a || '').trim(),
    option_b: String(row.option_b || '').trim(),
    option_c: String(row.option_c || '').trim(),
    option_d: String(row.option_d || '').trim(),
    correct_answer: normalizeAnswer(row.correct_answer),
    chapter_name: String(row.chapter_name || '').trim(),
    subject_name: String(row.subject_name || '').trim(),
    difficulty_level: normalizeDifficulty(row.difficulty_level),
    marks: Number(row.marks || 1),
    explanation: String(row.explanation || '').trim()
  };

  const errors = [];
  requiredColumns.forEach(column => {
    if (!normalized[column] && column !== 'marks') errors.push(`${column} is required`);
  });
  if (!normalized.correct_answer) errors.push('correct_answer must be A, B, C, or D');
  if (!normalized.difficulty_level) errors.push('difficulty_level must be Easy, Medium, or Hard');
  if (!Number.isFinite(normalized.marks) || normalized.marks <= 0) errors.push('marks must be greater than 0');

  return { ...normalized, errors };
}

export default function QuestionUploadModal({ open, onClose, onImported }) {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [fileName, setFileName] = useState('');
  const [message, setMessage] = useState('');
  const [uploading, setUploading] = useState(false);

  const validRows = useMemo(() => rows.filter(row => !row.errors.length), [rows]);
  const invalidRows = useMemo(() => rows.filter(row => row.errors.length), [rows]);

  async function parseFile(file) {
    setMessage('');
    setFileName(file.name);
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    setRows(json.map(normalizeRow));
  }

  function downloadTemplate() {
    const worksheet = XLSX.utils.json_to_sheet([
      {
        question_text: 'What is DBMS?',
        option_a: 'Database System',
        option_b: 'Data Binary',
        option_c: 'Digital Base',
        option_d: 'None',
        correct_answer: 'A',
        chapter_name: 'Introduction',
        subject_name: 'DBMS',
        difficulty_level: 'Easy',
        marks: 1,
        explanation: 'DBMS means Database Management System'
      }
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Questions');
    XLSX.writeFile(workbook, 'question-bank-template.xlsx');
  }

  async function importRows() {
    if (!validRows.length) return setMessage('No valid rows to import.');
    if (invalidRows.length) return setMessage('Fix invalid rows before importing.');

    setUploading(true);
    const chapterKeys = [...new Map(validRows.map(row => [`${row.subject_name}:${row.chapter_name}`, row])).values()];
    const { data: existingChapters } = await supabase.from('chapters').select('*');
    const chapterMap = new Map((existingChapters || []).map(chapter => [`${chapter.subject}:${chapter.chapter_name}`, chapter.id]));

    for (const row of chapterKeys) {
      const key = `${row.subject_name}:${row.chapter_name}`;
      if (chapterMap.has(key)) continue;
      const { data, error } = await supabase
        .from('chapters')
        .insert({ chapter_name: row.chapter_name, subject: row.subject_name })
        .select()
        .single();
      if (error) {
        setUploading(false);
        return notify({ type: 'error', title: 'Upload failed', message: error.message });
      }
      chapterMap.set(key, data.id);
    }

    const { data: existingQuestions } = await supabase.from('questions').select('question_text,is_deleted');
    const questionSet = new Set((existingQuestions || []).filter(question => question.is_deleted !== true).map(question => question.question_text.trim().toLowerCase()));
    const insertRows = validRows
      .filter(row => !questionSet.has(row.question_text.toLowerCase()))
      .map(row => ({
        chapter_id: chapterMap.get(`${row.subject_name}:${row.chapter_name}`),
        question_text: row.question_text,
        option_a: row.option_a,
        option_b: row.option_b,
        option_c: row.option_c,
        option_d: row.option_d,
        correct_option: row.correct_answer,
        difficulty: row.difficulty_level,
        marks: row.marks,
        explanation: row.explanation,
        created_by: user?.id
      }));

    if (insertRows.length) {
      const { error } = await supabase.from('questions').insert(insertRows);
      if (error) {
        setUploading(false);
        return notify({ type: 'error', title: 'Upload failed', message: error.message });
      }
    }

    setUploading(false);
    onImported?.();
    notify({ type: 'success', title: 'Questions imported', message: `Imported ${insertRows.length} questions. Skipped ${validRows.length - insertRows.length} duplicates.` });
    onClose?.();
    setRows([]);
    setFileName('');
    setMessage('');
  }

  if (!open) return null;

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="modal-card upload-modal" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <span className="eyebrow">Upload question bank</span>
            <h2>Upload Question Bank</h2>
          </div>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="Close modal"><X size={18} /></button>
        </div>

        <label className="upload-drop">
          <UploadCloud size={34} />
          <b>{fileName || 'Choose .xlsx or .csv file'}</b>
          <small>Required columns: {requiredColumns.join(', ')}, explanation</small>
          <input type="file" accept=".xlsx,.csv" onChange={e => e.target.files?.[0] && parseFile(e.target.files[0])} />
        </label>

        <div className="upload-actions">
          <span><FileSpreadsheet size={18} /> {validRows.length} valid • {invalidRows.length} errors</span>
          <button className="btn secondary" type="button" onClick={downloadTemplate}><Download size={18} /> Template</button>
        </div>

        {message && <div className="notice info">{message}</div>}

        {rows.length > 0 && (
          <section className="upload-preview">
            <h3>Preview</h3>
            <div className="preview-table">
              {rows.slice(0, 50).map(row => (
                <div className={row.errors.length ? 'preview-row invalid' : 'preview-row'} key={row.rowNumber}>
                  <span><b>Row {row.rowNumber}</b><small>{row.subject_name} / {row.chapter_name}</small></span>
                  <span>{row.question_text}</span>
                  <span>{row.correct_answer || '-'} • {row.difficulty_level || '-'} • {row.marks || '-'}</span>
                  <small>{row.errors.join('; ') || 'Ready'}</small>
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="modal-actions">
          <button className="btn secondary" type="button" onClick={onClose}>Cancel</button>
          <button className="btn" type="button" onClick={importRows} disabled={uploading || invalidRows.length > 0 || !rows.length}>
            {uploading ? 'Importing...' : 'Import Questions'}
          </button>
        </div>
      </div>
    </div>
  );
}
