import React from 'react';

export default function CustomFeatureViewer({ feature, onClose }) {
  if (!feature) return null;

  // Construct the HTML document for the iframe (code-based features)
  const srcDoc = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { margin: 0; padding: 16px; font-family: system-ui, -apple-system, sans-serif; }
        ${feature.css || ''}
      </style>
    </head>
    <body>
      ${feature.html || ''}
      <script>
        // Override alert to work on mobile iframes
        window.alert = function(message) {
          const alertBox = document.createElement('div');
          alertBox.style.cssText = 'position:fixed; top:20px; left:50%; transform:translateX(-50%); background:rgba(0,0,0,0.8); color:#fff; padding:12px 24px; border-radius:8px; z-index:9999; font-family:sans-serif; text-align:center; box-shadow: 0 4px 12px rgba(0,0,0,0.3);';
          alertBox.innerText = message;
          document.body.appendChild(alertBox);
          setTimeout(() => {
            alertBox.style.opacity = '0';
            alertBox.style.transition = 'opacity 0.3s ease';
            setTimeout(() => alertBox.remove(), 300);
          }, 3000);
        };
      </script>
      <script>
        ${feature.js || ''}
      </script>
    </body>
    </html>
  `;

  const getValidUrl = (url) => {
    if (!url || typeof url !== 'string') return '';
    const trimmed = url.trim();
    if (!trimmed) return '';
    if (!/^https?:\/\//i.test(trimmed)) return 'https://' + trimmed;
    return trimmed;
  };

  const validLink = getValidUrl(feature.link);

  // Extract hostname for display
  const getHostname = (url) => {
    try { return new URL(url).hostname; } catch { return url; }
  };

  return (
    <div className="custom-feature-viewer w-100 overflow-hidden position-fixed top-0 start-0 h-100 d-flex flex-column" style={{ zIndex: 1100, background: '#ECE5DD' }}>
      <div className="container-fluid max-width-container py-3 py-md-4 px-3 flex-shrink-0 d-flex align-items-center justify-content-between">
         <div className="d-flex align-items-center gap-2">
            <i className={`bi ${feature.icon || 'bi-star'} fs-4 text-primary`} />
            <div>
               <h4 className="fw-bold m-0">{feature.title}</h4>
               {feature.description && <div className="text-secondary small">{feature.description}</div>}
            </div>
         </div>
         <button className="btn btn-outline-secondary rounded-pill fw-bold" onClick={onClose}>
           <i className="bi bi-x-lg me-1" /> Close
         </button>
      </div>
      <div className="flex-grow-1 w-100 container-fluid max-width-container px-3 pb-3">
        {validLink ? (
          /* External link: show a preview card with Open in Browser button */
          <div className="card border-0 shadow-sm rounded-4 w-100 h-100 overflow-hidden d-flex flex-column align-items-center justify-content-center p-4 text-center">
            <div
              className="rounded-circle d-flex align-items-center justify-content-center mb-4"
              style={{ width: 80, height: 80, background: 'linear-gradient(135deg, #0d6efd, #6f42c1)' }}
            >
              <i className="bi bi-globe2 text-white" style={{ fontSize: '2rem' }} />
            </div>
            <h4 className="fw-bold text-dark mb-2">{feature.title}</h4>
            {feature.description && <p className="text-secondary small mb-3">{feature.description}</p>}
            <div className="bg-light rounded-3 px-3 py-2 mb-4 d-inline-flex align-items-center gap-2" style={{ maxWidth: '100%' }}>
              <i className="bi bi-link-45deg text-primary" />
              <span className="text-secondary small text-truncate" style={{ maxWidth: '250px' }}>{getHostname(validLink)}</span>
            </div>
            <a
              href={validLink}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary rounded-pill fw-bold px-4 py-2 shadow-sm d-inline-flex align-items-center gap-2"
              style={{ fontSize: '1rem' }}
            >
              <i className="bi bi-box-arrow-up-right" />
              Open in Browser
            </a>
            <p className="text-secondary mt-3" style={{ fontSize: '0.7rem' }}>
              External links open in a new tab for the best experience.
            </p>
          </div>
        ) : (
          /* Code-based feature: render in sandboxed iframe */
          <div className="card border-0 shadow-sm rounded-4 w-100 h-100 overflow-hidden">
            <iframe
              title={feature.title}
              srcDoc={srcDoc}
              sandbox="allow-scripts allow-same-origin allow-forms allow-modals"
              style={{ width: '100%', height: '100%', border: 'none' }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
