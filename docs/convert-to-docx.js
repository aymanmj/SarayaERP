/**
 * Saraya ERP — Markdown to DOCX Converter (RTL Support)
 * Converts markdown files to professional .docx with full RTL Arabic support
 * 
 * Usage:
 *   node convert-to-docx.js installation-guide
 *   node convert-to-docx.js user-guide
 *   node convert-to-docx.js all
 */

const fs = require('fs');
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  Table, TableRow, TableCell, WidthType, BorderStyle,
  AlignmentType, ShadingType, Header, Footer,
} = require('docx');

// ─── Colors ────────────────────────────────────────
const BRAND_BLUE = '0EA5E9';
const DARK_BG = '1E293B';
const WHITE = 'FFFFFF';
const LIGHT_GRAY = 'F1F5F9';
const NOTE_PURPLE = '6366F1';
const NOTE_BG = 'EEF2FF';
const WARN_ORANGE = 'EA580C';
const WARN_BG = 'FFF7ED';
const CODE_BG = '0F172A';
const CODE_TEXT = '22D3EE';
const CODE_BORDER = '334155';
const HEADING_ACCENT = '7C3AED';

// ─── Markdown Parser ───────────────────────────────

function parseMarkdown(rawText) {
  const lines = rawText.split('\n');
  const elements = [];
  let i = 0;
  let inCodeBlock = false;
  let codeLines = [];
  let codeLang = '';
  let tableRows = [];
  let inTable = false;

  while (i < lines.length) {
    const line = lines[i].replace(/\r$/, '');

    // ── Code blocks ──
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        elements.push({ type: 'code', content: codeLines.join('\n'), lang: codeLang });
        codeLines = [];
        inCodeBlock = false;
        codeLang = '';
      } else {
        flushTable();
        inCodeBlock = true;
        codeLang = line.slice(3).trim();
      }
      i++;
      continue;
    }
    if (inCodeBlock) {
      codeLines.push(line);
      i++;
      continue;
    }

    // ── Table rows ──
    if (line.startsWith('|') && line.endsWith('|')) {
      const cells = line.split('|').filter(c => c.trim() !== '');
      if (cells.every(c => /^[\s\-:]+$/.test(c))) { i++; continue; }
      tableRows.push(cells.map(c => c.trim()));
      inTable = true;
      i++;
      continue;
    } else if (inTable) {
      flushTable();
    }

    // ── Skip decorative ──
    if (line.startsWith('<div') || line.startsWith('</div>') || line.trim() === '---' || line.trim() === '') {
      i++;
      continue;
    }

    // ── Headings ──
    if (line.startsWith('#### ')) {
      elements.push({ type: 'h4', content: cleanEmoji(line.replace(/^####\s+/, '')) });
    } else if (line.startsWith('### ')) {
      elements.push({ type: 'h3', content: cleanEmoji(line.replace(/^###\s+/, '')) });
    } else if (line.startsWith('## ')) {
      elements.push({ type: 'h2', content: cleanEmoji(line.replace(/^##\s+/, '')) });
    } else if (line.startsWith('# ')) {
      elements.push({ type: 'h1', content: cleanEmoji(line.replace(/^#\s+/, '')) });
    }
    // ── Blockquotes ──
    else if (line.startsWith('> ')) {
      const content = line.replace(/^>\s*/, '');
      const isWarning = /⚠️|تحذير|تنبيه|WARN|CAUTION|مهم|IMPORTANT|🔴/.test(content);
      elements.push({ type: 'note', content: cleanEmoji(content), isWarning });
    }
    // ── Lists ──
    else {
      const trimmed = line.trim();
      if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        elements.push({ type: 'bullet', content: trimmed.replace(/^[-*]\s+/, '') });
      } else if (/^\d+\.\s/.test(trimmed)) {
        elements.push({ type: 'numbered', content: trimmed.replace(/^\d+\.\s+/, '') });
      } else {
        elements.push({ type: 'paragraph', content: trimmed });
      }
    }

    i++;
  }
  flushTable();
  return elements;

  function flushTable() {
    if (inTable && tableRows.length > 0) {
      elements.push({ type: 'table', rows: [...tableRows] });
      tableRows = [];
      inTable = false;
    }
  }
}

function cleanEmoji(text) {
  return text.replace(/[📘🛠️📑📞☁️⚡🔒🌐📱🔴❌❓🖥️🖨️📁📄📊📈🐳📦⚙️🚀💡🔐🏥💊💰📋🩺⚠️🤰🧪☢️]/gu, '').trim();
}

// ─── Inline Markdown → TextRun[] ───────────────────

function parseInline(text, overrides = {}) {
  const runs = [];
  // Match: **bold**, `code`, [text](url)
  const regex = /(\*\*(.+?)\*\*)|(`(.+?)`)|(\[(.+?)\]\((.+?)\))/g;
  let lastIndex = 0;
  let match;

  const baseStyle = {
    font: 'Cairo',
    size: 22,
    rightToLeft: true,
    ...overrides,
  };

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      runs.push(new TextRun({ text: text.slice(lastIndex, match.index), ...baseStyle }));
    }

    if (match[2]) {
      // Bold **text**
      runs.push(new TextRun({ text: match[2], ...baseStyle, bold: true }));
    } else if (match[4]) {
      // Code `text`
      runs.push(new TextRun({
        text: match[4],
        font: 'Consolas',
        size: 20,
        color: BRAND_BLUE,
        rightToLeft: false,
        shading: { type: ShadingType.SOLID, color: LIGHT_GRAY },
      }));
    } else if (match[6]) {
      // Link [text](url)
      runs.push(new TextRun({
        text: match[6],
        ...baseStyle,
        color: BRAND_BLUE,
        underline: {},
      }));
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    runs.push(new TextRun({ text: text.slice(lastIndex), ...baseStyle }));
  }

  if (runs.length === 0) {
    runs.push(new TextRun({ text, ...baseStyle }));
  }

  return runs;
}

// ─── Build DOCX ────────────────────────────────────

function buildDocx(elements) {
  const children = [];

  for (const el of elements) {
    switch (el.type) {

      case 'h1':
        children.push(new Paragraph({
          children: [new TextRun({
            text: el.content,
            bold: true,
            font: 'Cairo',
            size: 48,
            color: BRAND_BLUE,
            rightToLeft: true,
          })],
          spacing: { after: 400, before: 200 },
          alignment: AlignmentType.CENTER,
          bidirectional: true,
        }));
        break;

      case 'h2':
        children.push(new Paragraph({ spacing: { before: 100 } })); // spacer
        children.push(new Paragraph({
          children: [new TextRun({
            text: '  ' + el.content,
            bold: true,
            font: 'Cairo',
            size: 30,
            color: WHITE,
            rightToLeft: true,
          })],
          spacing: { after: 200, before: 100 },
          heading: HeadingLevel.HEADING_2,
          bidirectional: true,
          shading: { type: ShadingType.SOLID, color: DARK_BG },
          border: {
            bottom: { style: BorderStyle.SINGLE, size: 8, color: BRAND_BLUE },
          },
        }));
        break;

      case 'h3':
        children.push(new Paragraph({
          children: [new TextRun({
            text: el.content,
            bold: true,
            font: 'Cairo',
            size: 26,
            color: HEADING_ACCENT,
            rightToLeft: true,
          })],
          spacing: { after: 100, before: 260 },
          heading: HeadingLevel.HEADING_3,
          bidirectional: true,
          border: {
            bottom: { style: BorderStyle.SINGLE, size: 2, color: 'E2E8F0' },
          },
        }));
        break;

      case 'h4':
        children.push(new Paragraph({
          children: [new TextRun({
            text: el.content,
            bold: true,
            font: 'Cairo',
            size: 23,
            color: BRAND_BLUE,
            rightToLeft: true,
          })],
          spacing: { after: 80, before: 200 },
          bidirectional: true,
        }));
        break;

      case 'paragraph':
        children.push(new Paragraph({
          children: parseInline(el.content),
          spacing: { after: 100, line: 360 },
          bidirectional: true,
        }));
        break;

      case 'bullet':
        children.push(new Paragraph({
          children: parseInline(el.content),
          bullet: { level: 0 },
          spacing: { after: 60, line: 340 },
          bidirectional: true,
        }));
        break;

      case 'numbered':
        children.push(new Paragraph({
          children: parseInline(el.content),
          numbering: { reference: 'saraya-numbering', level: 0 },
          spacing: { after: 60, line: 340 },
          bidirectional: true,
        }));
        break;

      case 'note': {
        const isWarn = el.isWarning;
        children.push(new Paragraph({
          children: [new TextRun({
            text: el.content,
            font: 'Cairo',
            size: 21,
            italics: true,
            color: isWarn ? WARN_ORANGE : NOTE_PURPLE,
            rightToLeft: true,
          })],
          spacing: { after: 120, before: 60 },
          indent: { right: 300 },
          bidirectional: true,
          border: {
            right: { style: BorderStyle.SINGLE, size: 14, color: isWarn ? WARN_ORANGE : NOTE_PURPLE },
          },
          shading: { type: ShadingType.SOLID, color: isWarn ? WARN_BG : NOTE_BG },
        }));
        break;
      }

      case 'code':
        // Split long code into lines for readability
        const codeLinesList = el.content.split('\n');
        for (let ci = 0; ci < codeLinesList.length; ci++) {
          const isFirst = ci === 0;
          const isLast = ci === codeLinesList.length - 1;
          children.push(new Paragraph({
            children: [new TextRun({
              text: codeLinesList[ci] || ' ',
              font: 'Consolas',
              size: 18,
              color: CODE_TEXT,
              rightToLeft: false,
            })],
            spacing: { after: 0, before: isFirst ? 100 : 0 },
            indent: { left: 200, right: 200 },
            shading: { type: ShadingType.SOLID, color: CODE_BG },
            border: {
              top: isFirst ? { style: BorderStyle.SINGLE, size: 1, color: CODE_BORDER } : undefined,
              bottom: isLast ? { style: BorderStyle.SINGLE, size: 1, color: CODE_BORDER } : undefined,
              left: { style: BorderStyle.SINGLE, size: 1, color: CODE_BORDER },
              right: { style: BorderStyle.SINGLE, size: 1, color: CODE_BORDER },
            },
          }));
        }
        children.push(new Paragraph({ spacing: { after: 160 } }));
        break;

      case 'table':
        if (el.rows.length > 0) {
          const colCount = el.rows[0].length;
          const table = new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: el.rows.map((row, rowIdx) =>
              new TableRow({
                children: row.map(cell =>
                  new TableCell({
                    children: [new Paragraph({
                      children: [new TextRun({
                        text: cell.replace(/\*\*/g, ''),
                        bold: rowIdx === 0,
                        font: 'Cairo',
                        size: 20,
                        color: rowIdx === 0 ? WHITE : '1E293B',
                        rightToLeft: true,
                      })],
                      bidirectional: true,
                      spacing: { before: 40, after: 40 },
                    })],
                    shading: {
                      type: ShadingType.SOLID,
                      color: rowIdx === 0 ? DARK_BG : (rowIdx % 2 === 0 ? LIGHT_GRAY : WHITE),
                    },
                    width: { size: Math.floor(100 / colCount), type: WidthType.PERCENTAGE },
                    borders: {
                      top: { style: BorderStyle.SINGLE, size: 1, color: 'CBD5E1' },
                      bottom: { style: BorderStyle.SINGLE, size: 1, color: 'CBD5E1' },
                      left: { style: BorderStyle.SINGLE, size: 1, color: 'CBD5E1' },
                      right: { style: BorderStyle.SINGLE, size: 1, color: 'CBD5E1' },
                    },
                  })
                ),
              })
            ),
          });
          children.push(table);
          children.push(new Paragraph({ spacing: { after: 200 } }));
        }
        break;
    }
  }

  return children;
}

// ─── Create Document ───────────────────────────────

function createDocument(title, subtitle, children) {
  // Title page
  const titlePage = [
    new Paragraph({ spacing: { before: 3000 } }),
    new Paragraph({
      children: [new TextRun({
        text: 'نظام السرايا الطبي',
        bold: true,
        font: 'Cairo',
        size: 56,
        color: BRAND_BLUE,
        rightToLeft: true,
      })],
      alignment: AlignmentType.CENTER,
      bidirectional: true,
      spacing: { after: 200 },
    }),
    new Paragraph({
      children: [new TextRun({
        text: 'Saraya Medical ERP',
        font: 'Calibri',
        size: 32,
        color: '64748B',
      })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 600 },
    }),
    new Paragraph({
      children: [new TextRun({
        text: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
        font: 'Calibri',
        size: 24,
        color: BRAND_BLUE,
      })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 600 },
    }),
    new Paragraph({
      children: [new TextRun({
        text: title,
        bold: true,
        font: 'Cairo',
        size: 44,
        color: DARK_BG,
        rightToLeft: true,
      })],
      alignment: AlignmentType.CENTER,
      bidirectional: true,
      spacing: { after: 200 },
    }),
    new Paragraph({
      children: [new TextRun({
        text: subtitle,
        font: 'Calibri',
        size: 26,
        color: '64748B',
      })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 1000 },
    }),
    new Paragraph({
      children: [new TextRun({
        text: 'الإصدار 1.0 — أبريل 2026',
        font: 'Cairo',
        size: 22,
        color: '94A3B8',
        rightToLeft: true,
      })],
      alignment: AlignmentType.CENTER,
      bidirectional: true,
      spacing: { after: 200 },
    }),
    new Paragraph({
      children: [new TextRun({
        text: 'شركة السرايا للتقنية',
        bold: true,
        font: 'Cairo',
        size: 24,
        color: DARK_BG,
        rightToLeft: true,
      })],
      alignment: AlignmentType.CENTER,
      bidirectional: true,
    }),
  ];

  return new Document({
    creator: 'Saraya Technology',
    title: title,
    description: subtitle,
    styles: {
      default: {
        document: {
          run: {
            font: 'Cairo',
            size: 22,
            rightToLeft: true,
          },
          paragraph: {
            bidirectional: true,
          },
        },
      },
    },
    numbering: {
      config: [{
        reference: 'saraya-numbering',
        levels: [{
          level: 0,
          format: 'decimal',
          text: '%1.',
          alignment: AlignmentType.START,
          style: {
            run: { font: 'Cairo', size: 22, rightToLeft: true },
          },
        }],
      }],
    },
    sections: [
      // Title page section
      {
        properties: {
          page: {
            margin: { top: 1000, right: 1200, bottom: 1000, left: 1200 },
          },
        },
        children: titlePage,
      },
      // Content section
      {
        properties: {
          page: {
            margin: { top: 800, right: 1000, bottom: 800, left: 1000 },
          },
        },
        headers: {
          default: new Header({
            children: [new Paragraph({
              children: [
                new TextRun({
                  text: `نظام السرايا الطبي  —  ${title}`,
                  font: 'Cairo',
                  size: 16,
                  color: '94A3B8',
                  rightToLeft: true,
                }),
              ],
              bidirectional: true,
              border: {
                bottom: { style: BorderStyle.SINGLE, size: 1, color: 'E2E8F0' },
              },
              spacing: { after: 100 },
            })],
          }),
        },
        footers: {
          default: new Footer({
            children: [new Paragraph({
              children: [
                new TextRun({
                  text: '© 2026 شركة السرايا للتقنية — جميع الحقوق محفوظة',
                  font: 'Cairo',
                  size: 14,
                  color: '94A3B8',
                  rightToLeft: true,
                }),
              ],
              alignment: AlignmentType.CENTER,
              bidirectional: true,
              border: {
                top: { style: BorderStyle.SINGLE, size: 1, color: 'E2E8F0' },
              },
            })],
          }),
        },
        children: children,
      },
    ],
  });
}

// ─── Main ──────────────────────────────────────────

async function convertFile(inputName) {
  const inputFile = `./${inputName}.md`;

  if (!fs.existsSync(inputFile)) {
    console.error(`  ❌ File not found: ${inputFile}`);
    return;
  }

  const titles = {
    'installation-guide': { ar: 'دليل التثبيت', en: 'Installation Guide' },
    'user-guide': { ar: 'دليل الاستخدام', en: 'User Guide' },
  };

  const titleInfo = titles[inputName] || { ar: inputName, en: inputName };

  console.log(`\n📄 Reading ${inputFile}...`);
  const raw = fs.readFileSync(inputFile, 'utf-8');

  console.log(`🔍 Parsing markdown...`);
  const elements = parseMarkdown(raw);
  console.log(`   Found ${elements.length} elements`);

  console.log(`📝 Building DOCX with RTL support...`);
  const docChildren = buildDocx(elements);
  const doc = createDocument(titleInfo.ar, titleInfo.en, docChildren);

  const buffer = await Packer.toBuffer(doc);
  const outFile = `./${inputName}.docx`;
  fs.writeFileSync(outFile, buffer);
  console.log(`✅ Created: ${outFile} (${(buffer.length / 1024).toFixed(1)} KB)`);
}

async function main() {
  const arg = process.argv[2] || 'all';

  console.log('╔══════════════════════════════════════════╗');
  console.log('║   Saraya ERP — Markdown → DOCX (RTL)    ║');
  console.log('╚══════════════════════════════════════════╝');

  if (arg === 'all') {
    await convertFile('installation-guide');
    await convertFile('user-guide');
  } else {
    await convertFile(arg);
  }

  console.log('\n🎉 Done!\n');
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
