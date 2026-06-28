import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { calculateStats, sortReports, formatFriendlyDate, formatHourString } from './helpers';

// Map of theme colors for styling the PDF
const themeColors = {
  teal: {
    primary: '#075E54',      // Deep WhatsApp Teal
    secondary: '#128C7E',    // Medium Teal
    light: '#F4FAF8',        // Zebra alternate row background
    accent: '#25D366',       // Bright green Accent
    border: '#D0E5DF',       // Subtly colored border
    text: '#1E293B'
  },
  charcoal: {
    primary: '#1E293B',      // Slate 800
    secondary: '#475569',    // Slate 600
    light: '#F8FAFC',        // Slate 50
    accent: '#3B82F6',       // Modern Blue
    border: '#E2E8F0',
    text: '#0F172A'
  },
  minimalist: {
    primary: '#000000',      // Pure Black
    secondary: '#374151',    // Gray 700
    light: '#FAFAFA',        // Gray 50
    accent: '#111827',
    border: '#E5E7EB',
    text: '#111827'
  },
  royal: {
    primary: '#5B21B6',      // Purple 800
    secondary: '#7C3AED',    // Violet 600
    light: '#F5F3FF',        // Violet 50
    accent: '#8B5CF6',       // Indigo Accent
    border: '#DDD6FE',
    text: '#1E1B4B'
  },
  sakura: {
    primary: '#9D174D',      // Pink 800
    secondary: '#DB2777',    // Pink 600
    light: '#FFF5F7',        // Pink 50
    accent: '#EC4899',       // Rose Accent
    border: '#FBCFE8',
    text: '#4C0519'
  }
};

/**
 * Generates and downloads a beautifully styled PDF report or plan.
 * Supporting English & Bangla fonts natively by rendering an offscreen browser layout.
 * 
 * @param {Array} reports - The list of reports for the day
 * @param {string} dateStr - YYYY-MM-DD date string
 * @param {Object} user - Current user object
 * @param {Object} options - Export options { templateType, englishFont, banglaFont, theme }
 */
export const generatePDF = async (reports, dateStr, user, options) => {
  const {
    templateType = 'report',
    englishFont = 'Outfit',
    banglaFont = 'Noto Sans Bengali',
    theme = 'teal'
  } = options;

  const activeTheme = themeColors[theme] || themeColors.teal;
  const sortedData = sortReports(reports);
  const stats = calculateStats(reports);
  const friendlyDate = formatFriendlyDate(dateStr);
  
  // Create offscreen container
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-9999px';
  container.style.top = '0';
  container.style.width = '800px';
  container.style.padding = '40px 48px';
  container.style.boxSizing = 'border-box';
  container.style.backgroundColor = '#FFFFFF';
  container.style.color = '#1E293B';
  // Use font fallback for English and Bangla
  container.style.fontFamily = `"${englishFont}", "${banglaFont}", "Outfit", "Arial", sans-serif`;
  container.style.lineHeight = '1.4';
  
  // 1. Build Header Section
  const headerHtml = `
    <div style="border-bottom: 2px solid ${activeTheme.primary}; padding-bottom: 20px; margin-bottom: 25px;">
      <div style="display: flex; justify-content: space-between; align-items: flex-end;">
        <div>
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
            <div style="width: 14px; height: 14px; border-radius: 50%; background-color: ${activeTheme.primary};"></div>
            <span style="font-size: 14px; text-transform: uppercase; letter-spacing: 1.5px; font-weight: 700; color: ${activeTheme.secondary};">
              HourLog Tracker
            </span>
          </div>
          <h1 style="margin: 0; font-size: 28px; font-weight: 800; color: ${activeTheme.primary}; letter-spacing: -0.5px;">
            ${templateType === 'report' 
              ? 'Hourly Productivity Report <span style="font-size: 20px; font-weight: 400; color: #64748B;">/ দৈনিক প্রতিবেদন</span>' 
              : 'Hourly Action Plan <span style="font-size: 20px; font-weight: 400; color: #64748B;">/ দৈনিক কর্মপরিকল্পনা</span>'}
          </h1>
        </div>
        <div style="text-align: right;">
          <div style="font-size: 14px; font-weight: 600; color: #475569;">${friendlyDate}</div>
          <div style="font-size: 12px; color: #94A3B8; margin-top: 2px;">Date: ${dateStr}</div>
        </div>
      </div>
      
      <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 15px; background-color: ${activeTheme.light}; border: 1px solid ${activeTheme.border}; border-radius: 8px; padding: 10px 16px; font-size: 13px;">
        <div>
          <strong style="color: ${activeTheme.primary};">User / ব্যবহারকারী:</strong> 
          <span style="color: #334155; font-weight: 500; margin-left: 4px;">
            ${user?.displayName || user?.email || 'Guest Log'}
          </span>
        </div>
        <div style="color: #64748B; font-size: 11px;">
          Generated at: ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </div>
  `;

  // 2. Build Summary/Stats Cards (For report, show detailed; for plan, show simple)
  let statsHtml = '';
  if (templateType === 'report') {
    statsHtml = `
      <div style="margin-bottom: 25px;">
        <h2 style="font-size: 16px; font-weight: 700; color: ${activeTheme.primary}; margin: 0 0 12px 0; text-transform: uppercase; letter-spacing: 0.5px;">
          Productivity Summary / সংক্ষিপ্ত বিবরণ
        </h2>
        
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 16px;">
          <div style="background-color: ${activeTheme.light}; border: 1px solid ${activeTheme.border}; border-radius: 12px; padding: 12px; text-align: center;">
            <div style="font-size: 11px; font-weight: 600; color: #64748B; margin-bottom: 4px;">Total Hours / মোট ঘণ্টা</div>
            <div style="font-size: 20px; font-weight: 800; color: ${activeTheme.primary};">${stats.totalPlanned}</div>
          </div>
          <div style="background-color: #F0FDF4; border: 1px solid #BBF7D0; border-radius: 12px; padding: 12px; text-align: center;">
            <div style="font-size: 11px; font-weight: 600; color: #166534; margin-bottom: 4px;">Completed / সম্পন্ন</div>
            <div style="font-size: 20px; font-weight: 800; color: #15803D;">${stats.completed}</div>
          </div>
          <div style="background-color: #FEF3C7; border: 1px solid #FDE68A; border-radius: 12px; padding: 12px; text-align: center;">
            <div style="font-size: 11px; font-weight: 600; color: #92400E; margin-bottom: 4px;">Pending / চলমান</div>
            <div style="font-size: 20px; font-weight: 800; color: #D97706;">${stats.pending}</div>
          </div>
          <div style="background-color: #FEF2F2; border: 1px solid #FCA5A5; border-radius: 12px; padding: 12px; text-align: center;">
            <div style="font-size: 11px; font-weight: 600; color: #991B1B; margin-bottom: 4px;">Missed / বাদ পড়া</div>
            <div style="font-size: 20px; font-weight: 800; color: #DC2626;">${stats.missed}</div>
          </div>
        </div>

        <div style="background-color: ${activeTheme.light}; border: 1px solid ${activeTheme.border}; border-radius: 12px; padding: 14px 18px; display: flex; align-items: center; justify-content: space-between; gap: 20px;">
          <div style="flex-grow: 1;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <span style="font-size: 13px; font-weight: 700; color: ${activeTheme.secondary};">Productivity Score / কর্মদক্ষতা স্কোর</span>
              <span style="font-size: 16px; font-weight: 800; color: ${activeTheme.primary};">${stats.productivity}%</span>
            </div>
            <div style="width: 100%; height: 10px; background-color: #E2E8F0; border-radius: 999px; overflow: hidden; display: flex;">
              <div style="width: ${stats.productivity}%; height: 100%; background-color: ${activeTheme.accent}; border-radius: 999px; transition: width 0.3s ease;"></div>
            </div>
          </div>
        </div>
      </div>
    `;
  } else {
    statsHtml = `
      <div style="margin-bottom: 25px; background-color: ${activeTheme.light}; border: 1px solid ${activeTheme.border}; border-radius: 12px; padding: 16px; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <h2 style="font-size: 15px; font-weight: 700; color: ${activeTheme.primary}; margin: 0 0 4px 0;">Plan Overview / পরিকল্পনা রূপরেখা</h2>
          <span style="font-size: 12px; color: #64748B;">Successfully scheduled plan items for this day.</span>
        </div>
        <div style="background-color: #FFFFFF; border: 1px solid ${activeTheme.border}; border-radius: 8px; padding: 8px 16px; text-align: center;">
          <div style="font-size: 10px; font-weight: 600; color: #64748B;">Planned Hours / নির্ধারিত ঘণ্টা</div>
          <div style="font-size: 18px; font-weight: 800; color: ${activeTheme.primary};">${stats.totalPlanned}</div>
        </div>
      </div>
    `;
  }

  // 3. Build Timeline Table
  let tableRowsHtml = '';
  if (sortedData.length === 0) {
    tableRowsHtml = `
      <tr>
        <td colspan="${templateType === 'report' ? 4 : 2}" style="padding: 30px; text-align: center; color: #64748B; font-size: 14px; font-style: italic; border: 1px solid ${activeTheme.border}; border-radius: 0 0 8px 8px;">
          No hour logs found for this day. / এই দিনের জন্য কোনো তথ্য পাওয়া যায়নি।
        </td>
      </tr>
    `;
  } else {
    sortedData.forEach((row, idx) => {
      const isAlt = idx % 2 === 1;
      const rowBg = isAlt ? activeTheme.light : '#FFFFFF';
      
      const timeStr = formatHourString(row.hour, row.ampm);
      
      let statusBadge = '';
      if (row.status === 'Completed') {
        statusBadge = `<span style="background-color: #DCFCE7; color: #15803D; border: 1px solid #BBF7D0; padding: 3px 8px; border-radius: 999px; font-size: 11px; font-weight: 700; display: inline-block;">Completed / সম্পন্ন</span>`;
      } else if (row.status === 'Pending') {
        statusBadge = `<span style="background-color: #FEF3C7; color: #D97706; border: 1px solid #FDE68A; padding: 3px 8px; border-radius: 999px; font-size: 11px; font-weight: 700; display: inline-block;">Pending / চলমান</span>`;
      } else if (row.status === 'Missed') {
        statusBadge = `<span style="background-color: #FEE2E2; color: #DC2626; border: 1px solid #FCA5A5; padding: 3px 8px; border-radius: 999px; font-size: 11px; font-weight: 700; display: inline-block;">Missed / বাদ পড়া</span>`;
      }

      if (templateType === 'report') {
        tableRowsHtml += `
          <tr style="background-color: ${rowBg};">
            <td style="padding: 12px 14px; border-bottom: 1px solid ${activeTheme.border}; font-size: 13px; font-weight: 700; color: ${activeTheme.primary}; white-space: nowrap;">
              ${timeStr}
            </td>
            <td style="padding: 12px 14px; border-bottom: 1px solid ${activeTheme.border}; font-size: 13px; color: #334155; word-break: break-word;">
              ${row.plan || '<span style="color: #94A3B8; font-style: italic;">No Plan / পরিকল্পনা নেই</span>'}
            </td>
            <td style="padding: 12px 14px; border-bottom: 1px solid ${activeTheme.border}; font-size: 13px; color: #334155; word-break: break-word;">
              ${row.report || '<span style="color: #94A3B8; font-style: italic;">No Report / রিপোর্ট নেই</span>'}
            </td>
            <td style="padding: 12px 14px; border-bottom: 1px solid ${activeTheme.border}; text-align: center; white-space: nowrap;">
              ${statusBadge}
            </td>
          </tr>
        `;
      } else {
        tableRowsHtml += `
          <tr style="background-color: ${rowBg};">
            <td style="padding: 14px 18px; border-bottom: 1px solid ${activeTheme.border}; font-size: 14px; font-weight: 700; color: ${activeTheme.primary}; width: 120px; white-space: nowrap;">
              ${timeStr}
            </td>
            <td style="padding: 14px 18px; border-bottom: 1px solid ${activeTheme.border}; font-size: 14px; color: #1E293B; word-break: break-word;">
              ${row.plan || '<span style="color: #94A3B8; font-style: italic;">No Plan / পরিকল্পনা নেই</span>'}
            </td>
          </tr>
        `;
      }
    });
  }

  const tableHeaderHtml = templateType === 'report' 
    ? `
      <thead>
        <tr style="background-color: ${activeTheme.primary}; color: #FFFFFF;">
          <th style="padding: 12px 14px; text-align: left; font-size: 13px; font-weight: 700; border-top-left-radius: 8px; width: 100px;">Time / সময়</th>
          <th style="padding: 12px 14px; text-align: left; font-size: 13px; font-weight: 700;">Plan / পরিকল্পনা</th>
          <th style="padding: 12px 14px; text-align: left; font-size: 13px; font-weight: 700;">Report / বাস্তবায়ন</th>
          <th style="padding: 12px 14px; text-align: center; font-size: 13px; font-weight: 700; border-top-right-radius: 8px; width: 110px;">Status / অবস্থা</th>
        </tr>
      </thead>
    `
    : `
      <thead>
        <tr style="background-color: ${activeTheme.primary}; color: #FFFFFF;">
          <th style="padding: 14px 18px; text-align: left; font-size: 14px; font-weight: 700; border-top-left-radius: 8px; width: 130px;">Time / সময়</th>
          <th style="padding: 14px 18px; text-align: left; font-size: 14px; font-weight: 700; border-top-right-radius: 8px;">Plan & Targets / কর্মপরিকল্পনা ও লক্ষ্য</th>
        </tr>
      </thead>
    `;

  const timelineHtml = `
    <div style="margin-bottom: 30px;">
      <h2 style="font-size: 16px; font-weight: 700; color: ${activeTheme.primary}; margin: 0 0 12px 0; text-transform: uppercase; letter-spacing: 0.5px;">
        Timeline Details / বিস্তারিত সূচি
      </h2>
      <table style="width: 100%; border-collapse: separate; border-spacing: 0; border: 1px solid ${activeTheme.border}; border-radius: 8px; overflow: hidden; table-layout: fixed;">
        ${tableHeaderHtml}
        <tbody>
          ${tableRowsHtml}
        </tbody>
      </table>
    </div>
  `;

  // 4. Build Footer Section
  const footerHtml = `
    <div style="border-top: 1px solid #E2E8F0; padding-top: 16px; margin-top: 30px; text-align: center; font-size: 11px; color: #94A3B8;">
      <p style="margin: 0 0 4px 0; font-weight: 600; color: #64748B;">
        HourLog Tracker • Organize hours, maximize output.
      </p>
      <p style="margin: 0;">
        পরিকল্পনা করুন, সময় ট্র্যাক করুন এবং ধারাবাহিকতা বজায় রাখুন।
      </p>
    </div>
  `;

  // Inject content to offscreen container
  container.innerHTML = `
    ${headerHtml}
    ${statsHtml}
    ${timelineHtml}
    ${footerHtml}
  `;

  document.body.appendChild(container);

  try {
    // Wait for all Google fonts to load completely to avoid fallback rendering bugs in html2canvas
    await document.fonts.ready;
    
    // Slight delay to ensure layout rendering finishes
    await new Promise((resolve) => setTimeout(resolve, 350));

    // Capture the container via html2canvas with high scale for vector-like quality
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#FFFFFF',
    });

    const imgWidth = 210; // A4 dimensions in mm
    const pageHeight = 297;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    let heightLeft = imgHeight;
    let position = 0;

    const pdf = new jsPDF('p', 'mm', 'a4');
    const imgData = canvas.toDataURL('image/jpeg', 0.95);

    // Add first page
    pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight, undefined, 'FAST');
    heightLeft -= pageHeight;

    // Split long canvas into multiple pages if it goes beyond A4 height
    while (heightLeft >= 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight, undefined, 'FAST');
      heightLeft -= pageHeight;
    }

    // Save the PDF
    const filename = `${templateType}_${dateStr}_${theme}.pdf`;
    pdf.save(filename);
  } finally {
    // Clean up DOM
    document.body.removeChild(container);
  }
};
