import { useEffect } from 'react';

const editableSelector = [
  '.question-form input:not([type="checkbox"]):not([type="radio"]):not([type="file"])',
  '.question-form textarea',
  '.exam-builder input:not([type="checkbox"]):not([type="radio"]):not([type="file"])',
  '.exam-builder textarea',
  '.add-person-panel input:not([type="checkbox"]):not([type="radio"]):not([type="file"])',
  '.password-panel input:not([type="checkbox"]):not([type="radio"]):not([type="file"])',
  '.form-row input:not([type="checkbox"]):not([type="radio"]):not([type="file"])',
  '.auth-card input:not([type="checkbox"]):not([type="radio"]):not([type="file"])'
].join(',');

export default function FormEditingEnhancer() {
  useEffect(() => {
    function handleFocus(event) {
      const target = event.target;
      if (!target.matches?.(editableSelector) || !target.value) return;
      requestAnimationFrame(() => target.select?.());
    }

    document.addEventListener('focusin', handleFocus);
    return () => document.removeEventListener('focusin', handleFocus);
  }, []);

  return null;
}
