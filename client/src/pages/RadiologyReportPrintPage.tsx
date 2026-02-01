// src/pages/RadiologyReportPrintPage.tsx

import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { apiClient } from "../api/apiClient";
import type { OrganizationSettings } from "../types/organization";
import { formatDate } from "@/lib/utils";

type RadiologyOrderData = {
  id: number;
  status: string;
  reportText: string | null;
  reportedAt: string | null;
  study: { name: string; bodyPart: string | null; modality: string | null };
  order: {
    id: number;
    createdAt: string;
    patient: {
      fullName: string;
      mrn: string;
      dateOfBirth: string | null;
      gender: string | null;
    };
    orderedBy: { fullName: string };
  };
};

function calculateAge(dob: string | null) {
  if (!dob) return "";
  const diff = Date.now() - new Date(dob).getTime();
  const ageDate = new Date(diff);
  return Math.abs(ageDate.getUTCFullYear() - 1970);
}

// Local formatDate removed

export default function RadiologyReportPrintPage() {
  const { id } = useParams();
  const [data, setData] = useState<RadiologyOrderData | null>(null);
  const [org, setOrg] = useState<OrganizationSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [resOrder, resOrg] = await Promise.all([
          apiClient.get<RadiologyOrderData>(`/radiology/orders/${id}`),
          apiClient.get<OrganizationSettings>("/settings/organization"),
        ]);
        setData(resOrder.data);
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

  if (loading) return <div className="p-10 text-center">Loading Report...</div>;
  if (!data)
    return (
      <div className="p-10 text-center text-red-500">Report Not Found</div>
    );

  return (
    <div className="min-h-screen bg-slate-800 p-8 flex justify-center overflow-auto">
      <div
        className="bg-white text-black w-[210mm] min-h-[297mm] p-[15mm] shadow-2xl relative flex flex-col"
        style={{ direction: "ltr" }}
      >
        {/* Header */}
        {/* Header (conditionally rendered) */}
        {org?.printHeaderFooter !== false ? (
          <header className="flex justify-between items-center border-b-2 border-black pb-4 mb-6">
            <div className="flex flex-col">
              <h1 className="text-2xl font-bold uppercase tracking-wider">
                {org?.displayName}
              </h1>
              <span className="text-sm text-gray-600">{org?.address}</span>
              <span className="text-sm text-gray-600">{org?.phone}</span>
            </div>
            {org?.logoUrl && (
              <img
                src={org.logoUrl}
                alt="Logo"
                className="h-20 w-20 object-contain"
              />
            )}
          </header>
        ) : (
          <div style={{ height: "150px" }} /> // Spacer
        )}

        {/* Title */}
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold underline">RADIOLOGY REPORT</h2>
        </div>

        {/* Patient Info */}
        <section className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm mb-8 border border-gray-300 p-4 rounded">
          <div>
            <span className="font-bold block text-gray-500 text-xs uppercase">
              Patient Name
            </span>
            <span className="text-lg">{data.order.patient.fullName}</span>
          </div>
          <div>
            <span className="font-bold block text-gray-500 text-xs uppercase">
              MRN / ID
            </span>
            <span className="text-lg">{data.order.patient.mrn}</span>
          </div>
          <div>
            <span className="font-bold block text-gray-500 text-xs uppercase">
              Age / Gender
            </span>
            <span>
              {calculateAge(data.order.patient.dateOfBirth)} Y /{" "}
              {data.order.patient.gender}
            </span>
          </div>
          <div>
            <span className="font-bold block text-gray-500 text-xs uppercase">
              Date
            </span>
            <span>{formatDate(data.reportedAt || data.order.createdAt)}</span>
          </div>
          <div>
            <span className="font-bold block text-gray-500 text-xs uppercase">
              Referring Doctor
            </span>
            <span>{data.order.orderedBy?.fullName || "—"}</span>
          </div>
          <div>
            <span className="font-bold block text-gray-500 text-xs uppercase">
              Accession No.
            </span>
            <span>RAD-{data.id}</span>
          </div>
        </section>

        {/* Study Name */}
        <div className="mb-6 bg-gray-100 p-2 rounded border-l-4 border-black">
          <span className="font-bold text-lg">{data.study.name}</span>
          {data.study.bodyPart && (
            <span className="ml-2 text-gray-600">({data.study.bodyPart})</span>
          )}
        </div>

        {/* Report Body */}
        <div className="flex-1 text-base leading-relaxed whitespace-pre-wrap font-serif">
          {data.reportText || "No report text available."}
        </div>

        {/* Footer */}
        <footer className="mt-12 pt-4 border-t border-gray-300 flex justify-between items-end">
          <div className="text-xs text-gray-400">
            Generated by Saraya ERP
            <br />
            {new Date().toLocaleString()}
          </div>
          <div className="text-center">
            <div className="h-12 w-48 border-b border-black mb-1"></div>
            <div className="text-sm font-bold">Radiologist Signature</div>
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
            @page { size: A4 portrait; }
        }
      `}</style>
    </div>
  );
}
