import React, { useMemo } from 'react';
import defaultDictionaryData from '../constants/dictionary.json';

/**
 * SuggestionHelper
 * Dynamically scans user's text inputs, extracts typing keywords/first word,
 * searches our 100-item dictionary JSON, and displays matching template suggestions.
 */
export default function SuggestionHelper({ type, status = 'Pending', currentInputText = '', dictionaryData = [], onApply }) {
  const activeDictionary = dictionaryData && dictionaryData.length > 0 ? dictionaryData : defaultDictionaryData;

  // Extract words from user input and search dictionary
  const matchedSuggestions = useMemo(() => {
    if (!currentInputText) return [];
    
    // Clean and split words
    const words = currentInputText.toLowerCase().trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return [];
    
    const firstWord = words[0];
    if (firstWord.length < 2) return []; // Only match words with 2 or more characters
    
    // Search dictionary for matches on first word (starts with or matches)
    const matches = activeDictionary.filter(entry => 
      entry.keywords.some(kw => 
        kw.toLowerCase() === firstWord || 
        firstWord.startsWith(kw.toLowerCase()) || 
        kw.toLowerCase().startsWith(firstWord)
      )
    );
    
    // Take top 3 matching entries to keep UI clean
    return matches.slice(0, 3);
  }, [currentInputText, activeDictionary]);

  if (matchedSuggestions.length === 0) return null;

  return (
    <div className="animate-fade-in mt-2 p-2.5 rounded-3 border bg-light text-dark" style={{ fontSize: '0.82rem' }}>
      <div className="text-success small fw-bold mb-2 d-flex align-items-center gap-1" style={{ fontSize: '0.8rem' }}>
        <i className="bi bi-magic text-success"></i>
        Quick Suggestions / শর্টকাট পরামর্শ:
      </div>
      <div className="d-flex flex-column gap-2">
        {matchedSuggestions.map((entry, idx) => {
          // Choose appropriate suggestion templates
          const enSuggestion = type === 'plan' ? entry.plan_en : entry.report_en;
          let bnSuggestion = type === 'plan' ? entry.plan_bn : entry.report_bn;

          // If report, customize Bengali suggestion slightly based on status
          if (type === 'report') {
            if (status === 'Missed') {
              const matchedMissed = activeDictionary.find(d => d.keywords.includes(entry.keywords[0]));
              if (matchedMissed && matchedMissed.bReportMissed) {
                bnSuggestion = matchedMissed.bReportMissed;
              }
            } else if (status === 'Pending') {
              const matchedPending = activeDictionary.find(d => d.keywords.includes(entry.keywords[0]));
              if (matchedPending && matchedPending.bReportPending) {
                bnSuggestion = matchedPending.bReportPending;
              }
            }
          }
          
          return (
            <div key={idx} className="p-2 bg-white rounded border shadow-sm text-start transition-all">
              <span className="badge rounded-pill mb-1.5 fw-bold text-uppercase" style={{ backgroundColor: '#DCF8C6', color: '#075E54', fontSize: '0.62rem' }}>
                #{entry.tag}
              </span>
              <div className="d-grid gap-1">
                <button
                  type="button"
                  className="btn btn-sm btn-link text-start text-dark p-0 text-decoration-none d-block hover-scale font-semibold"
                  style={{ fontSize: '0.8rem', lineHeight: '1.4' }}
                  onClick={() => onApply(bnSuggestion)}
                  title="Click to apply Bengali template"
                >
                  🇧🇩 {bnSuggestion}
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-link text-start text-dark p-0 text-decoration-none d-block hover-scale border-top pt-1 mt-1 text-secondary"
                  style={{ fontSize: '0.78rem', lineHeight: '1.4' }}
                  onClick={() => onApply(enSuggestion)}
                  title="Click to apply English template"
                >
                  🇬🇧 {enSuggestion}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
