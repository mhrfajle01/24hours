import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import defaultDictionaryData from '../constants/dictionary.json';

/**
 * TagDropdown — Searchable, multilingual (English + Bengali) dropdown
 * for selecting dictionary tags.
 *
 * Props:
 *  - dictionaryData: array of dictionary entries (falls back to default)
 *  - selectedTags: array of currently selected tag strings
 *  - onChange: (newSelectedTags: string[]) => void
 *  - placeholder: string (optional)
 *  - multiSelect: bool (default true)
 *  - maxVisible: number of chips shown before "+N more" (default 3)
 */
export default function TagDropdown({
  dictionaryData = [],
  selectedTags = [],
  onChange,
  placeholder = 'Search or pick a tag... / ট্যাগ খুঁজুন',
  multiSelect = true,
  maxVisible = 3,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const activeDictionary = dictionaryData?.length > 0 ? dictionaryData : defaultDictionaryData;

  // Build unique tags with metadata
  const allTags = useMemo(() => {
    const seen = new Set();
    const result = [];
    activeDictionary.forEach((entry) => {
      if (!seen.has(entry.tag)) {
        seen.add(entry.tag);
        result.push({
          tag: entry.tag,
          keywords: entry.keywords || [],
          plan_bn: entry.plan_bn || '',
          plan_en: entry.plan_en || '',
        });
      }
    });
    return result.sort((a, b) => a.tag.localeCompare(b.tag));
  }, [activeDictionary]);

  // Filter by query — matches tag, keywords (En/Bn), plan text
  const filtered = useMemo(() => {
    if (!query.trim()) return allTags;
    const q = query.toLowerCase().trim();
    return allTags.filter(
      ({ tag, keywords, plan_bn, plan_en }) =>
        tag.includes(q) ||
        keywords.some((kw) => kw.toLowerCase().includes(q)) ||
        plan_bn.includes(q) ||
        plan_en.toLowerCase().includes(q)
    );
  }, [query, allTags]);

  // Group filtered tags alphabetically
  const grouped = useMemo(() => {
    const groups = {};
    filtered.forEach((item) => {
      const letter = /[\u0980-\u09FF]/.test(item.tag[0])
        ? 'বাংলা'
        : item.tag[0].toUpperCase();
      if (!groups[letter]) groups[letter] = [];
      groups[letter].push(item);
    });
    return groups;
  }, [filtered]);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
        setQuery('');
        setActiveIndex(-1);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Scroll active item into view
  useEffect(() => {
    if (activeIndex >= 0 && listRef.current) {
      const el = listRef.current.querySelector(`[data-idx="${activeIndex}"]`);
      el?.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex]);

  const toggleTag = useCallback(
    (tag) => {
      if (!multiSelect) {
        onChange(selectedTags.includes(tag) ? [] : [tag]);
        setIsOpen(false);
        setQuery('');
        return;
      }
      const next = selectedTags.includes(tag)
        ? selectedTags.filter((t) => t !== tag)
        : [...selectedTags, tag];
      onChange(next);
    },
    [multiSelect, selectedTags, onChange]
  );

  const removeTag = useCallback(
    (tag, e) => {
      e.stopPropagation();
      onChange(selectedTags.filter((t) => t !== tag));
    },
    [selectedTags, onChange]
  );

  const handleKeyDown = (e) => {
    if (!isOpen) {
      if (e.key === 'Enter' || e.key === 'ArrowDown') {
        setIsOpen(true);
        e.preventDefault();
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((p) => Math.min(p + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((p) => Math.max(p - 1, -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0 && filtered[activeIndex]) {
        toggleTag(filtered[activeIndex].tag);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      setQuery('');
      setActiveIndex(-1);
    }
  };

  const visibleTags = selectedTags.slice(0, maxVisible);
  const hiddenCount = selectedTags.length - maxVisible;

  // Tag color palette
  const TAG_COLORS = [
    { bg: '#DCF8C6', text: '#065F46' },
    { bg: '#DBEAFE', text: '#1E40AF' },
    { bg: '#FEF3C7', text: '#92400E' },
    { bg: '#FCE7F3', text: '#9D174D' },
    { bg: '#EDE9FE', text: '#5B21B6' },
    { bg: '#FEE2E2', text: '#991B1B' },
    { bg: '#D1FAE5', text: '#065F46' },
    { bg: '#E0F2FE', text: '#075985' },
  ];

  const getColor = (tag) => {
    let hash = 0;
    for (let i = 0; i < tag.length; i++) hash = tag.charCodeAt(i) + ((hash << 5) - hash);
    return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length];
  };

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', width: '100%', fontFamily: "'Outfit', sans-serif" }}
    >
      {/* Trigger Box */}
      <div
        id="tag-dropdown-trigger"
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-controls="tag-dropdown-list"
        className="d-flex align-items-center flex-wrap gap-1 px-2 py-2 rounded-3 border bg-white"
        style={{
          minHeight: '42px',
          cursor: 'text',
          borderColor: isOpen ? '#075E54' : '#dee2e6',
          boxShadow: isOpen
            ? '0 0 0 3px rgba(7, 94, 84, 0.12)'
            : '0 1px 3px rgba(0,0,0,0.06)',
          transition: 'all 0.2s ease',
        }}
        onClick={() => {
          setIsOpen(true);
          setTimeout(() => inputRef.current?.focus(), 50);
        }}
      >
        {/* Selected tag chips */}
        {visibleTags.map((tag) => {
          const { bg, text } = getColor(tag);
          return (
            <span
              key={tag}
              className="d-inline-flex align-items-center gap-1 rounded-pill px-2"
              style={{
                backgroundColor: bg,
                color: text,
                fontSize: '0.72rem',
                fontWeight: 700,
                lineHeight: '1.8',
                letterSpacing: '0.02em',
              }}
            >
              #{tag}
              <button
                type="button"
                onClick={(e) => removeTag(tag, e)}
                aria-label={`Remove ${tag}`}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: '0 0 0 2px',
                  cursor: 'pointer',
                  color: 'inherit',
                  opacity: 0.7,
                  lineHeight: 1,
                  fontSize: '0.9rem',
                }}
              >
                ×
              </button>
            </span>
          );
        })}

        {hiddenCount > 0 && (
          <span
            className="rounded-pill px-2"
            style={{
              backgroundColor: '#F3F4F6',
              color: '#374151',
              fontSize: '0.7rem',
              fontWeight: 700,
              lineHeight: '1.8',
            }}
          >
            +{hiddenCount} more
          </span>
        )}

        {/* Search input */}
        <input
          ref={inputRef}
          type="text"
          value={query}
          aria-label="Search tags"
          aria-autocomplete="list"
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIndex(-1);
            if (!isOpen) setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={selectedTags.length === 0 ? placeholder : ''}
          style={{
            border: 'none',
            outline: 'none',
            background: 'transparent',
            fontSize: '0.82rem',
            minWidth: '120px',
            flex: 1,
            color: '#374151',
            fontFamily: "'Noto Sans Bengali', 'Outfit', sans-serif",
          }}
        />

        {/* Clear all button */}
        {selectedTags.length > 0 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange([]);
            }}
            style={{
              background: 'none',
              border: 'none',
              padding: '0 4px',
              cursor: 'pointer',
              color: '#9CA3AF',
              fontSize: '1rem',
              lineHeight: 1,
              marginLeft: 'auto',
            }}
            title="Clear all tags"
          >
            ✕
          </button>
        )}

        {/* Caret icon */}
        <span
          style={{
            color: '#6B7280',
            fontSize: '0.6rem',
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s',
            marginLeft: selectedTags.length === 0 ? 'auto' : '0',
            flexShrink: 0,
            pointerEvents: 'none',
          }}
        >
          ▼
        </span>
      </div>

      {/* Dropdown Panel */}
      {isOpen && (
        <div
          id="tag-dropdown-list"
          role="listbox"
          aria-multiselectable={multiSelect}
          ref={listRef}
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            right: 0,
            zIndex: 9999,
            backgroundColor: '#fff',
            border: '1px solid #E5E7EB',
            borderRadius: '12px',
            boxShadow: '0 10px 40px rgba(0,0,0,0.13)',
            maxHeight: '280px',
            overflowY: 'auto',
            animation: 'tagDropdownIn 0.15s ease',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '8px 12px 4px',
              fontSize: '0.66rem',
              color: '#9CA3AF',
              borderBottom: '1px solid #F3F4F6',
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              position: 'sticky',
              top: 0,
              backgroundColor: '#fff',
              zIndex: 1,
            }}
          >
            <span>
              {filtered.length} tag{filtered.length !== 1 ? 's' : ''} found
            </span>
            {multiSelect && selectedTags.length > 0 && (
              <span style={{ color: '#075E54', fontWeight: 700 }}>
                {selectedTags.length} selected ✓
              </span>
            )}
          </div>

          {filtered.length === 0 ? (
            <div
              style={{
                padding: '24px',
                textAlign: 'center',
                color: '#9CA3AF',
                fontSize: '0.82rem',
              }}
            >
              <div style={{ fontSize: '1.8rem', marginBottom: '6px' }}>🔍</div>
              No tags match &ldquo;{query}&rdquo;
              <div style={{ fontSize: '0.72rem', marginTop: '4px' }}>
                Add it in Settings → Custom Suggestions
              </div>
            </div>
          ) : (
            Object.entries(grouped).map(([letter, items]) => (
              <div key={letter}>
                {/* Group header */}
                <div
                  style={{
                    padding: '5px 12px 2px',
                    fontSize: '0.6rem',
                    fontWeight: 800,
                    color: '#9CA3AF',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    backgroundColor: '#FAFAFA',
                    borderTop: '1px solid #F3F4F6',
                  }}
                >
                  {letter}
                </div>

                {items.map((item) => {
                  const globalIdx = filtered.findIndex((f) => f.tag === item.tag);
                  const isSelected = selectedTags.includes(item.tag);
                  const isActive = globalIdx === activeIndex;
                  const { bg, text } = getColor(item.tag);

                  return (
                    <div
                      key={item.tag}
                      data-idx={globalIdx}
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => toggleTag(item.tag)}
                      style={{
                        padding: '8px 12px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        backgroundColor: isActive || isSelected ? '#F0FDF4' : '#fff',
                        borderLeft: isSelected
                          ? '3px solid #075E54'
                          : '3px solid transparent',
                        transition: 'all 0.1s ease',
                      }}
                      onMouseEnter={() => setActiveIndex(globalIdx)}
                    >
                      {/* Tag chip */}
                      <span
                        style={{
                          backgroundColor: bg,
                          color: text,
                          fontSize: '0.67rem',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: '999px',
                          letterSpacing: '0.02em',
                          flexShrink: 0,
                          minWidth: '52px',
                          textAlign: 'center',
                        }}
                      >
                        #{item.tag}
                      </span>

                      {/* Text preview */}
                      <div style={{ flex: 1, overflow: 'hidden' }}>
                        <div
                          style={{
                            fontSize: '0.73rem',
                            color: '#374151',
                            fontWeight: 500,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            fontFamily: "'Noto Sans Bengali', 'Outfit', sans-serif",
                          }}
                        >
                          {item.plan_bn}
                        </div>
                        <div
                          style={{
                            fontSize: '0.63rem',
                            color: '#9CA3AF',
                            marginTop: '1px',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {item.keywords.slice(0, 4).join(' · ')}
                        </div>
                      </div>

                      {/* Checkbox circle */}
                      {isSelected ? (
                        <span
                          style={{
                            width: '18px',
                            height: '18px',
                            borderRadius: '50%',
                            backgroundColor: '#075E54',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                            fontSize: '10px',
                            color: '#fff',
                          }}
                        >
                          ✓
                        </span>
                      ) : (
                        <span
                          style={{
                            width: '18px',
                            height: '18px',
                            borderRadius: '50%',
                            border: '2px solid #E5E7EB',
                            flexShrink: 0,
                          }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      )}

      <style>{`
        @keyframes tagDropdownIn {
          from { opacity: 0; transform: translateY(-6px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0)   scale(1); }
        }
      `}</style>
    </div>
  );
}
