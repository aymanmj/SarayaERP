// src/pages/LabReportPrintPage.tsx

import { useEffect, useState, useMemo } from "react";
import { useParams } from "react-router-dom";
import { apiClient } from "../api/apiClient";
import type { OrganizationSettings } from "../types/organization";
import { formatDate } from "@/lib/utils";

type LabReportData = {
  encounter: {
    id: number;
    createdAt: string;
    patient: {
      fullName: string;
      mrn: string;
      dateOfBirth: string | null;
      gender: string | null;
    };
    doctor?: { fullName: string };
    department?: { name: string };
  };
  labOrders: {
    id: number;
    resultValue: string | null;
    resultUnit: string | null;
    referenceRange: string | null;
    resultDate: string | null;
    test: {
      name: string;
      code: string;
      category: string | null;
    };
    results?: {
      id: number;
      parameterName: string;
      value: string;
      unit: string;
      range: string;
    }[];
  }[];
};

function calculateAge(dob: string | null) {
  if (!dob) return "";
  const diff = Date.now() - new Date(dob).getTime();
  const ageDate = new Date(diff);
  return Math.abs(ageDate.getUTCFullYear() - 1970);
}

// Local formatDate removed

export default function LabReportPrintPage() {
  const { id } = useParams<{ id: string }>(); // encounterId
  const [data, setData] = useState<LabReportData | null>(null);
  const [org, setOrg] = useState<OrganizationSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [resRep, resOrg] = await Promise.all([
          apiClient.get<LabReportData>(`/lab/encounters/${id}/print`),
          apiClient.get<OrganizationSettings>("/settings/organization"),
        ]);
        setData(resRep.data);
        setOrg(resOrg.data);
      } catch (err) {
        console.error(err);
        alert("فشل تحميل التقرير.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  // ✅ تجميع التحاليل حسب الـ Category (Hematology, Biochemistry...)
  const groupedOrders = useMemo(() => {
    if (!data) return {};
    const groups: Record<string, typeof data.labOrders> = {};

    data.labOrders.forEach((order) => {
      const cat = order.test.category || "General";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(order);
    });

    return groups;
  }, [data]);

  if (loading) return <div className="p-10 text-center">Loading Report...</div>;
  if (!data)
    return (
      <div className="p-10 text-center text-red-500">
        Report Not Found or No Completed Tests.
      </div>
    );

  return (
    <div className="min-h-screen bg-slate-800 p-8 flex justify-center overflow-auto">
      <div
        className="bg-white text-black w-[210mm] min-h-[297mm] p-[10mm] shadow-2xl relative flex flex-col"
        style={{ direction: "ltr" }}
      >
        {/* Header */}
        {/* Header (conditionally rendered) */}
        {org?.printHeaderFooter !== false ? (
          <header className="flex justify-between items-center border-b-2 border-black pb-4 mb-6">
            <div className="flex flex-col">
              <h1 className="text-xl font-bold uppercase tracking-wider">
                {org?.displayName}
              </h1>
              <span className="text-xs text-gray-600">{org?.address}</span>
              <span className="text-xs text-gray-600">{org?.phone}</span>
            </div>
            {org?.logoUrl && (
              <img
                src={org.logoUrl}
                alt="Logo"
                className="h-16 w-16 object-contain"
              />
            )}
          </header>
        ) : (
          <div style={{ height: "150px" }} /> // Spacer for pre-printed
        )}

        {/* Title */}
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold uppercase underline">
            Laboratory Report
          </h2>
        </div>

        {/* Patient Info */}
        <section className="grid grid-cols-2 gap-x-8 gap-y-2 text-xs mb-6 border border-gray-400 p-3 rounded">
          <div>
            <span className="font-bold w-24 inline-block">Patient Name:</span>{" "}
            <span>{data.encounter.patient.fullName}</span>
          </div>
          <div>
            <span className="font-bold w-24 inline-block">MRN / ID:</span>{" "}
            <span>{data.encounter.patient.mrn}</span>
          </div>
          <div>
            <span className="font-bold w-24 inline-block">Age / Sex:</span>{" "}
            <span>
              {calculateAge(data.encounter.patient.dateOfBirth)} Y /{" "}
              {data.encounter.patient.gender}
            </span>
          </div>
          <div>
            <span className="font-bold w-24 inline-block">Ref. Doctor:</span>{" "}
            <span>{data.encounter.doctor?.fullName || "—"}</span>
          </div>
          <div>
            <span className="font-bold w-24 inline-block">Sample Date:</span>{" "}
            <span>{formatDate(data.encounter.createdAt)}</span>
          </div>
          <div>
            <span className="font-bold w-24 inline-block">Print Date:</span>{" "}
            <span>{formatDate(new Date())}</span>
          </div>
        </section>

        {/* Results Body */}
        <div className="flex-1">
          {Object.keys(groupedOrders).map((category) => (
            <div key={category} className="mb-6">
              <h3 className="text-sm font-bold uppercase bg-gray-100 p-1 mb-2 border-l-4 border-black pl-2">
                {category}
              </h3>
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-gray-400">
                    <th className="text-left py-1 w-1/3">Test Name</th>
                    <th className="text-center py-1">Result</th>
                    <th className="text-center py-1">Unit</th>
                    <th className="text-center py-1">Reference Range</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedOrders[category].map((order) => (
                    <>
                      {/* حالة 1: تحليل يحتوي على نتائج تفصيلية (مثل CBC) */}
                      {order.results && order.results.length > 0 ? (
                        <>
                          {/* عنوان التحليل الرئيسي */}
                          <tr key={`head-${order.id}`} className="bg-gray-50">
                            <td
                              colSpan={4}
                              className="py-1 px-2 font-bold text-black border-b border-gray-200"
                            >
                              {order.test.name}
                            </td>
                          </tr>
                          {/* الأسطر الفرعية */}
                          {order.results.map((res: any) => (
                            <tr
                              key={res.id}
                              className="border-b border-gray-100"
                            >
                              <td className="py-1 pl-4 text-gray-700">
                                {res.parameterName}
                              </td>
                              <td className="py-1 text-center font-bold text-black">
                                {res.value}
                              </td>
                              <td className="py-1 text-center text-gray-500">
                                {res.unit}
                              </td>
                              <td className="py-1 text-center text-gray-500">
                                {res.range}
                              </td>
                            </tr>
                          ))}
                        </>
                      ) : (
                        /* حالة 2: تحليل فردي قديم */
                        <tr key={order.id} className="border-b border-gray-100">
                          <td className="py-2 text-gray-800 font-medium">
                            {order.test.name}
                          </td>
                          <td className="py-2 text-center font-bold text-base">
                            {order.resultValue}
                          </td>
                          <td className="py-2 text-center text-gray-500">
                            {order.resultUnit}
                          </td>
                          <td className="py-2 text-center text-gray-600">
                            {order.referenceRange}
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>

        {/* Footer */}
        <footer className="mt-8 pt-4 border-t border-gray-300 flex justify-between items-end">
          <div className="text-[10px] text-gray-400">
            Generated by Saraya ERP
            <br />
            Encounter ID: #{data.encounter.id}
          </div>
          <div className="text-center">
            <div className="h-10 w-40 border-b border-black mb-1"></div>
            <div className="text-xs font-bold">
              Lab Technician / Pathologist
            </div>
          </div>
        </footer>

        {/* Print Button */}
        <button
          onClick={() => window.print()}
          className="print:hidden absolute top-4 right-[-80px] bg-blue-600 text-white p-3 rounded-full shadow-lg hover:bg-blue-500 transition"
          title="Print Report"
        >
          🖨️
        </button>
      </div>

      <style>{`
        @media print {
            body { background: white; margin: 0; padding: 0; }
            .print\\:hidden { display: none !important; }
            @page { size: A4 portrait; margin: 5mm; }
        }
      `}</style>
    </div>
  );
}
