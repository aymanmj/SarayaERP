const fs = require('fs');
const path = require('path');
const { addTranslations } = require('./add_keys_to_json');

const pagePath = path.resolve(__dirname, '../client/src/pages/IncomeStatementPage.tsx');
let content = fs.readFileSync(pagePath, 'utf8');

// Normalize line endings to LF for easier replacement
content = content.replace(/\r\n/g, '\n');

const replacements = [
  {
    target: 'تحليل الإيرادات والمصروفات وصافي الربح (P&L) على مستوى المستشفى أو\n            الأقسام.',
    replace: '{t("accounting.incomeStatement.description", "تحليل الإيرادات والمصروفات وصافي الربح (P&L) على مستوى المستشفى أو الأقسام.")}'
  },
  {
    target: 'تحديث\n          </button>',
    replace: '{t("accounting.incomeStatement.refresh", "تحديث")}\n          </button>'
  },
  {
    target: 'طباعة التقرير\n            </button>',
    replace: '{t("accounting.incomeStatement.printReport", "طباعة التقرير")}\n            </button>'
  },
  {
    target: 'عرض التقرير\n          </button>',
    replace: '{t("accounting.incomeStatement.viewReport", "عرض التقرير")}\n          </button>'
  },
  {
    target: 'مسح\n            </button>',
    replace: '{t("accounting.incomeStatement.clear", "مسح")}\n            </button>'
  },
  {
    target: 'إجمالي الإيرادات\n                  </span>',
    replace: '{t("accounting.incomeStatement.totalRevenues", "إجمالي الإيرادات")}\n                  </span>'
  },
  {
    target: 'إجمالي المصروفات\n                  </span>',
    replace: '{t("accounting.incomeStatement.totalExpenses", "إجمالي المصروفات")}\n                  </span>'
  },
  {
    target: 'صافي الربح / الخسارة\n                  </div>',
    replace: '{t("accounting.incomeStatement.netProfitLoss", "صافي الربح / الخسارة")}\n                  </div>'
  },
  {
    target: 'هذا التقرير يعكس الأداء المالي بناءً على الاستحقاق (Accrual\n              Basis). للاطلاع على التدفق النقدي الفعلي، يرجى مراجعة تقرير\n              الخزينة.',
    replace: '{t("accounting.incomeStatement.accrualNote", "هذا التقرير يعكس الأداء المالي بناءً على الاستحقاق (Accrual Basis). للاطلاع على التدفق النقدي الفعلي، يرجى مراجعة تقرير الخزينة.")}'
  }
];

let modified = false;
replacements.forEach(({ target, replace }) => {
  if (content.includes(target)) {
    content = content.split(target).join(replace);
    console.log(`Replaced: ${target.substring(0, 30).replace(/\n/g, ' ')}...`);
    modified = true;
  } else {
    console.warn(`WARNING: Target not found: ${target.substring(0, 30).replace(/\n/g, ' ')}...`);
  }
});

if (modified) {
  // Convert back to CRLF if needed (Windows environment standard, but LF is also fine. Let's do CRLF since files are CRLF)
  content = content.replace(/\n/g, '\r\n');
  fs.writeFileSync(pagePath, content, 'utf8');
  console.log('Saved changes to IncomeStatementPage.tsx');
} else {
  console.log('No changes made to IncomeStatementPage.tsx');
}
