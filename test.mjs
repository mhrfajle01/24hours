import * as acorn from 'acorn';
import jsx from 'acorn-jsx';
import fs from 'fs';

const parser = acorn.Parser.extend(jsx());
const content = fs.readFileSync('src/pages/JournalPage.jsx', 'utf8');

try {
  parser.parse(content, { sourceType: 'module', ecmaVersion: 'latest' });
  console.log("Syntax is valid!");
} catch (e) {
  console.error("Syntax Error:", e.message, "at line", e.loc.line, "col", e.loc.column);
}
