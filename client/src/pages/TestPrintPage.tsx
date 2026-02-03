import React from 'react';

export default function TestPrintPage() {
  return (
    <div id="print-container" className="min-h-screen bg-gray-100 p-8">
      <h1 className="text-2xl font-bold mb-4">Test Print Page</h1>
      <p>This is a test to see if content appears in print preview.</p>
      <div className="bg-white p-4 rounded shadow">
        <h2 className="text-xl font-semibold mb-2">Sample Content</h2>
        <p>Line 1: Some sample text</p>
        <p>Line 2: More sample text</p>
        <p>Line 3: Even more sample text</p>
      </div>
      
      <button 
        onClick={() => window.print()}
        className="no-print mt-4 px-4 py-2 bg-blue-500 text-white rounded"
      >
        Print Test
      </button>
      
      <style>{`
        @media print {
          #print-container {
            background: white !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}
