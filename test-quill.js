import React from 'react';
import { renderToString } from 'react-dom/server';
import ReactQuill from 'react-quill-new';
try {
  console.log("Rendering...");
  const html = renderToString(React.createElement(ReactQuill, { value: 'test' }));
  console.log("Success:", !!html);
} catch (e) {
  console.error("Error:", e);
}
