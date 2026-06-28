import React, { useEffect, useRef } from 'react';
import HourCard from './HourCard';
import { getTodayDateString } from '../utils/helpers';

/**
 * Timeline component rendering the list of hourly tracking cards or
 * displaying a premium empty-state when no items exist for the date.
 */
export default function Timeline({ 
  reports, 
  currentHourData, 
  selectedDate, 
  onEditPlan, 
  onEditReport, 
  onDelete,
  onGenerateToday,
  onInlineUpdatePlan,
  onInlineUpdateReport,
  dictionaryData
}) {
  const isTodaySelected = selectedDate === getTodayDateString();
  const currentCardRef = useRef(null);
  const scrolledRef = useRef(false);

  useEffect(() => {
    // Only scroll once when today's data is loaded
    if (isTodaySelected && reports.length > 0 && currentHourData && !scrolledRef.current) {
      const timer = setTimeout(() => {
        if (currentCardRef.current) {
          currentCardRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
          scrolledRef.current = true;
        }
      }, 500); // Small timeout to ensure rendering is complete
      return () => clearTimeout(timer);
    }
  }, [isTodaySelected, reports.length, currentHourData]);

  // Reset scrolledRef when date changes
  useEffect(() => {
    scrolledRef.current = false;
  }, [selectedDate]);

  if (reports.length === 0) {
    return (
      <div className="container-fluid max-width-container my-5 px-3 text-center animate-fade-in">
        <div className="py-5 px-3 rounded-4 bg-white shadow-sm border border-light">
          <div className="mb-4">
            <div 
              className="d-inline-flex justify-content-center align-items-center rounded-circle p-4" 
              style={{ width: '90px', height: '90px', backgroundColor: '#F0F5F2' }}
            >
              <i className="bi bi-chat-quote-fill fs-1" style={{ color: '#075E54' }}></i>
            </div>
          </div>
          <h3 className="h5 fw-bold text-dark mb-2">No planning available.</h3>
          <p className="text-secondary mb-4 mx-auto" style={{ maxWidth: '340px', fontSize: '0.95rem' }}>
            Click "+" to create your first hour or generate a full schedule template for today.
          </p>
          <div className="d-flex flex-column flex-sm-row justify-content-center gap-2">
            <button
              className="btn text-white fw-bold px-4 py-2 rounded-pill shadow-sm transition-all hover-scale"
              style={{ backgroundColor: '#128C7E' }}
              onClick={onGenerateToday}
            >
              <i className="bi bi-magic me-2"></i>Generate Today's Hours (6 AM - 11 PM)
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container-fluid max-width-container ps-5 pe-3 pb-5 mb-5 timeline-wrapper">
      {reports.map((report) => {
        // Highlight card only if it is today and the hour/ampm matches current time
        const isCurrentHour = isTodaySelected && 
          report.hour === currentHourData.hour && 
          report.ampm === currentHourData.ampm;

        return (
          <div 
            key={report.id}
            ref={isCurrentHour ? currentCardRef : null}
            className="position-relative"
          >
            {/* Timeline bullet indicator outside of HourCard (avoids overflow clip) */}
            <div className={`timeline-dot ${isCurrentHour ? 'active' : ''} ${report.status.toLowerCase()}`} />
            
            <HourCard
              report={report}
              isCurrentHour={isCurrentHour}
              onEditPlan={onEditPlan}
              onEditReport={onEditReport}
              onDelete={onDelete}
              onInlineUpdatePlan={onInlineUpdatePlan}
              onInlineUpdateReport={onInlineUpdateReport}
              dictionaryData={dictionaryData}
            />
          </div>
        );
      })}
    </div>
  );
}
