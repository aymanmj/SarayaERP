const fs = require('fs');
const file = 'e:/SarayaERP/client/src/pages/PatientStatementPage.tsx';
let content = fs.readFileSync(file, 'utf8');

if (!content.includes('PrintLayout')) {
  content = content.replace('import { apiClient } from "../api/apiClient";', 'import { apiClient } from "../api/apiClient";\nimport PrintLayout from "../components/print/PrintLayout";');
}

const returnIndex = content.lastIndexOf('  return (');
if (returnIndex === -1) {
  console.error('Could not find return statement');
  process.exit(1);
}

const newReturn = `  return (
    <div className="flex flex-col h-full gap-4">
      {/* ─── Actions Bar (Screen Only) ─── */}
      <div className="print:hidden flex items-center justify-between bg-slate-900/60 border border-slate-800 p-4 rounded-2xl">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold transition-colors"
          >
            ← رجوع
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-100">كشف حساب مريض</h1>
            <p className="text-xs text-slate-400">عرض الفواتير والدفعات والرصيد المتبقي للمريض.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg transition-all"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>
          <span>طباعة كشف الحساب</span>
        </button>
      </div>

      {error && (
        <div className="text-sm text-rose-300 bg-rose-950/40 border border-rose-700/60 rounded-xl px-4 py-3">
          {error}
        </div>
      )}
      
      {loading && (
        <div className="flex-1 flex items-center justify-center text-slate-400">
          جارِ إعداد كشف الحساب...
        </div>
      )}

      {!loading && !data && !error && (
        <div className="flex-1 flex items-center justify-center text-slate-400">
          لا توجد بيانات متاحة.
        </div>
      )}

      {!loading && data && (
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden print:shadow-none print:bg-transparent text-slate-900 border border-slate-200">
          <PrintLayout
            title="كشف حساب مريض"
            subtitle="PATIENT STATEMENT OF ACCOUNT"
            documentId={patient?.mrn || \`ID-\${patientId}\`}
            showWatermark={summary?.remaining === 0}
            watermarkText="CLEARED"
          >
            <style>{\`
              .statement-wrapper {
                font-family: 'Cairo', 'Noto Sans Arabic', 'Segoe UI', Tahoma, sans-serif;
                color: #1e293b;
              }
              .statement-section {
                border: 1px solid #e2e8f0;
                border-radius: 12px;
                overflow: hidden;
                margin-bottom: 20px;
                background: #fff;
              }
              .statement-section-header {
                background: #f8fafc;
                padding: 12px 16px;
                font-weight: 700;
                font-size: 14px;
                color: #334155;
                border-bottom: 1px solid #e2e8f0;
                display: flex;
                align-items: center;
                gap: 8px;
              }
              .statement-table {
                width: 100%;
                border-collapse: collapse;
              }
              .statement-table th,
              .statement-table td {
                padding: 10px 14px;
                text-align: right;
                font-size: 13px;
                border-bottom: 1px solid #f1f5f9;
              }
              .statement-table th {
                color: #64748b;
                font-weight: 700;
                font-size: 12px;
                white-space: nowrap;
                background: #fdfdfd;
              }
              .statement-table td {
                color: #1e293b;
                font-weight: 600;
              }
              .statement-table tbody tr:nth-child(even) {
                background-color: #f8fafc;
              }
              
              /* ── Summary Cards ── */
              .summary-cards-container {
                display: grid;
                grid-template-columns: repeat(4, 1fr);
                gap: 16px;
                margin-bottom: 20px;
              }
              .summary-card {
                padding: 16px;
                border-radius: 12px;
                border: 1px solid #e2e8f0;
                background: #fff;
                text-align: center;
              }
              .summary-card.highlight {
                background: linear-gradient(135deg, #f0fdf4, #f8fafc);
                border: 2px solid #10b981;
              }
              .summary-card.danger {
                background: linear-gradient(135deg, #fff1f2, #f8fafc);
                border: 2px solid #f43f5e;
              }
              .summary-label {
                font-size: 12px;
                color: #64748b;
                font-weight: 700;
                margin-bottom: 6px;
              }
              .summary-value {
                font-size: 20px;
                font-weight: 900;
                letter-spacing: -0.5px;
                color: #0f172a;
              }
              .summary-value.green { color: #059669; }
              .summary-value.red { color: #e11d48; }
              .summary-value.orange { color: #d97706; }
              .summary-value.blue { color: #0284c7; }

              /* Number fonts */
              .num-val {
                font-family: 'Inter', monospace;
              }

              /* Status Badges */
              .badge {
                display: inline-flex;
                align-items: center;
                padding: 3px 8px;
                border-radius: 6px;
                font-size: 11px;
                font-weight: 700;
              }
              .badge-invoice { background: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd; }
              .badge-payment { background: #dcfce7; color: #166534; border: 1px solid #bbf7d0; }
              
              /* Print optimizations */
              @media print {
                .summary-card.highlight { background: #f0fdf4 !important; border: 2px solid #10b981 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                .summary-card.danger { background: #fff1f2 !important; border: 2px solid #f43f5e !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                .statement-section-header { background: #f8fafc !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                .badge-invoice { background: #e0f2fe !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                .badge-payment { background: #dcfce7 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                .statement-table tbody tr:nth-child(even) { background-color: #f8fafc !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              }
            \`}</style>
            
            <div className="statement-wrapper">
              
              {/* ─── Patient Info ─── */}
              {patient && (
                <div className="statement-section">
                  <div className="statement-section-header">👤 بيانات المريض</div>
                  <table className="statement-table">
                    <tbody>
                      <tr>
                        <th style={{ width: '15%' }}>الاسم:</th>
                        <td style={{ width: '35%' }}>{patient.fullName}</td>
                        <th style={{ width: '15%' }}>تاريخ الكشف:</th>
                        <td style={{ width: '35%', direction: 'ltr', textAlign: 'right' }}>
                          {formatDateTime(new Date().toISOString())}
                        </td>
                      </tr>
                      <tr>
                        <th>رقم الملف:</th>
                        <td className="num-val">{patient.mrn}</td>
                        <th>تاريخ أخر حركة:</th>
                        <td className="num-val" style={{ direction: 'ltr', textAlign: 'right' }}>
                          {statementRows.length > 0 ? formatDateTime(statementRows[statementRows.length - 1].date) : "—"}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}

              {/* ─── Financial Summary Cards ─── */}
              <div className="summary-cards-container">
                <div className="summary-card">
                  <div className="summary-label">إجمالي المفوتر</div>
                  <div className="summary-value blue num-val">
                    {formatMoney(summary?.totalInvoiced ?? 0)}
                  </div>
                </div>
                <div className="summary-card">
                  <div className="summary-label">إجمالي الخصومات</div>
                  <div className="summary-value orange num-val">
                    {formatMoney(summary?.totalDiscount ?? 0)}
                  </div>
                </div>
                <div className="summary-card">
                  <div className="summary-label">إجمالي المدفوع</div>
                  <div className="summary-value green num-val">
                    {formatMoney(summary?.totalPaid ?? 0)}
                  </div>
                </div>
                <div className={\`summary-card \${(summary?.remaining ?? 0) > 0 ? 'danger' : 'highlight'}\`}>
                  <div className="summary-label">الرصيد المتبقي</div>
                  <div className={\`summary-value num-val \${(summary?.remaining ?? 0) > 0 ? 'red' : 'green'}\`}>
                    {formatMoney(summary?.remaining ?? 0)}
                  </div>
                </div>
              </div>

              {/* ─── Detailed Statement of Account ─── */}
              <div className="statement-section">
                <div className="statement-section-header">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                  <span style={{ marginRight: '8px' }}>سجل الحركة المالية مفصلاً</span>
                </div>
                
                {statementRows.length === 0 ? (
                  <div style={{ padding: '30px', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
                    لا توجد حركات مالية مسجلة على هذا المريض.
                  </div>
                ) : (
                  <table className="statement-table">
                    <thead>
                      <tr>
                        <th>التاريخ</th>
                        <th>النوع</th>
                        <th>المرجع</th>
                        <th>الوصف</th>
                        <th>مدين (عليه)</th>
                        <th>دائن (تسديد)</th>
                        <th>الرصيد (المتبقي عليه)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {statementRows.map((row, idx) => (
                        <tr key={idx}>
                          <td className="num-val" style={{ direction: 'ltr', textAlign: 'right' }}>
                            {formatDateTime(row.date)}
                          </td>
                          <td>
                            <span className={\`badge \${row.kind === "INVOICE" ? "badge-invoice" : "badge-payment"}\`}>
                              {row.kind === "INVOICE" ? "فاتورة" : "دفعة"}
                            </span>
                          </td>
                          <td className="num-val text-slate-500">
                            {row.ref}
                          </td>
                          <td style={{ maxWidth: '200px', whiteSpace: 'normal', lineHeight: '1.4' }}>
                            {row.description}
                          </td>
                          <td className="num-val" style={{ color: row.debit > 0 ? '#0369a1' : '#cbd5e1' }}>
                            {row.debit ? formatMoney(row.debit) : "—"}
                          </td>
                          <td className="num-val" style={{ color: row.credit > 0 ? '#166534' : '#cbd5e1' }}>
                            {row.credit ? formatMoney(row.credit) : "—"}
                          </td>
                          <td className="num-val" style={{ fontWeight: 800, color: row.balance > 0 ? '#e11d48' : '#0f172a' }}>
                            {formatMoney(row.balance)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* ─── Pharmacy Dispenses Summary (If Any) ─── */}
              {Object.keys(pharmacyDispenses).length > 0 && (
                <div className="statement-section">
                  <div className="statement-section-header">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.5 20.5 7 17l-5-5s-1.8-1.8-1.8-3c0-2.3 2.2-4.2 4.5-4.2 1.2 0 2.4.6 3 1.8l5 5"></path><path d="m14 13.5 3.5 3.5s1.8 1.8 3 1.8c2.3 0 4.2-2.2 4.2-4.5 0-1.2-.6-2.4-1.8-3l-5-5"></path><path d="M8 8l8 8"></path></svg>
                    <span style={{ marginRight: '8px' }}>تفصيل مبيعات الصيدلية للمرات المفوترة</span>
                  </div>
                  {Object.entries(pharmacyDispenses).map(([encounterId, dispenses]) => (
                    <div key={encounterId} style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <div style={{ background: '#f8fafc', padding: '8px 16px', fontSize: '12px', fontWeight: 700, color: '#334155', display: 'flex', justifyContent: 'space-between' }}>
                        <span>زيارة رقم: {encounterId}</span>
                        <span style={{ color: '#059669' }}>
                          الإجمالي: {formatMoney(dispenses.reduce((sum, d) => sum + d.totalAmount, 0))}
                        </span>
                      </div>
                      {dispenses.map(d => (
                        <div key={d.id} style={{ padding: '12px 16px', borderBottom: '1px dashed #e2e8f0' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '12px', color: '#64748b', fontWeight: 600 }}>
                            <div>
                                رقم الصرفية: {d.id} &nbsp;|&nbsp; التاريخ: <span className="num-val" style={{direction: 'ltr', display: 'inline-block'}}>{formatDateTime(d.createdAt)}</span>
                                {d.doctor && <>&nbsp;|&nbsp; الطبيب: {d.doctor.fullName}</>}
                            </div>
                            <div style={{ color: '#0f172a' }}>
                              قيمة العملية: {formatMoney(d.totalAmount)}
                            </div>
                          </div>
                          
                          <table className="statement-table" style={{ background: '#fafaf9', border: '1px solid #e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                            <thead>
                              <tr>
                                <th>الدواء المصروف</th>
                                <th>الكمية</th>
                                <th>سعر الوحدة</th>
                                <th>الإجمالي</th>
                              </tr>
                            </thead>
                            <tbody>
                              {d.items.map(it => (
                                <tr key={it.id}>
                                  <td>
                                    {it.dispensedDrug?.name ?? "-"} {it.dispensedDrug?.strength ? \`(\${it.dispensedDrug.strength})\` : ""}
                                    {it.isSubstitute && <span style={{ color: '#d97706', fontSize: '10px', marginRight: '4px' }}>(بديل)</span>}
                                  </td>
                                  <td className="num-val">{it.quantity.toFixed(3)}</td>
                                  <td className="num-val">{it.unitPrice.toFixed(3)}</td>
                                  <td className="num-val">{it.totalAmount.toFixed(3)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}

              {/* ─── Footer Signatures ─── */}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '40px', padding: '0 40px' }}>
                <div style={{ textAlign: 'center', width: '200px' }}>
                  <div style={{ borderTop: '1px solid #94a3b8', marginBottom: '8px' }}></div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#475569' }}>توقيع المحاسب المستخرج للبيان</div>
                </div>
                <div style={{ textAlign: 'center', width: '200px' }}>
                  <div style={{ borderTop: '1px solid #94a3b8', marginBottom: '8px' }}></div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#475569' }}>الختم المعتمد للمشفى</div>
                </div>
              </div>

            </div>
          </PrintLayout>
        </div>
      )}
    </div>
  );
}
`;

const preReturnStr = content.substring(0, returnIndex);
fs.writeFileSync(file, preReturnStr + newReturn, 'utf8');
console.log('Successfully replaced the file contents via split!');
