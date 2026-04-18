// Tiny markdown → HTML renderer. Handles the shapes our AI prompts actually
// produce: h1/h2/h3, paragraphs, bullet lists, and bold/italic inline. Not a
// full spec — if we ever need one, swap in `marked` as a dep.

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function inlineFmt(s) {
  // Apply escapes first, then re-insert intended markup.
  let out = escapeHtml(s);
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
  return out;
}

export function markdownToHtml(md) {
  const lines = String(md || '').split('\n');
  let html = '';
  let inList = false;
  let paraBuffer = [];

  const flushPara = () => {
    if (paraBuffer.length > 0) {
      html += `<p>${inlineFmt(paraBuffer.join(' '))}</p>\n`;
      paraBuffer = [];
    }
  };
  const flushList = () => {
    if (inList) { html += '</ul>\n'; inList = false; }
  };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (/^###\s+/.test(line)) { flushPara(); flushList(); html += `<h3>${inlineFmt(line.replace(/^###\s+/, ''))}</h3>\n`; continue; }
    if (/^##\s+/.test(line)) { flushPara(); flushList(); html += `<h2>${inlineFmt(line.replace(/^##\s+/, ''))}</h2>\n`; continue; }
    if (/^#\s+/.test(line)) { flushPara(); flushList(); html += `<h1>${inlineFmt(line.replace(/^#\s+/, ''))}</h1>\n`; continue; }
    if (/^[-*]\s+/.test(line)) {
      flushPara();
      if (!inList) { html += '<ul>\n'; inList = true; }
      html += `<li>${inlineFmt(line.replace(/^[-*]\s+/, ''))}</li>\n`;
      continue;
    }
    if (line.trim() === '') { flushPara(); flushList(); continue; }
    if (inList) flushList();
    paraBuffer.push(line);
  }
  flushPara();
  flushList();
  return html;
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Word opens HTML-wrapped documents with a .docx extension as a document.
// For a proper OOXML file we'd ship a lib like `docx` — this is deliberately
// minimal and works for internal proposal handoffs.
export function downloadMarkdownAsDocx(markdown, filename) {
  const body = markdownToHtml(markdown);
  const doc = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(filename)}</title>
<style>
  body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; line-height: 1.5; color: #1B2838; }
  h1 { font-size: 20pt; margin: 16pt 0 8pt; color: #1B2838; }
  h2 { font-size: 16pt; margin: 14pt 0 6pt; color: #1B2838; }
  h3 { font-size: 13pt; margin: 12pt 0 6pt; color: #1B2838; }
  p  { margin: 0 0 8pt; }
  ul { margin: 0 0 8pt 24pt; }
  li { margin-bottom: 4pt; }
  strong { font-weight: bold; }
  em { font-style: italic; }
</style>
</head>
<body>
${body}
</body>
</html>`;
  const blob = new Blob([doc], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  triggerDownload(blob, filename.endsWith('.docx') ? filename : `${filename}.docx`);
}

export function downloadAsMarkdown(markdown, filename) {
  const blob = new Blob([markdown], { type: 'text/markdown' });
  triggerDownload(blob, filename.endsWith('.md') ? filename : `${filename}.md`);
}

export async function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  // Fallback for older browsers / non-secure contexts.
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); } finally { document.body.removeChild(ta); }
}
