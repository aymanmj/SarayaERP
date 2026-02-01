// src/components/clinical/DicomViewer.tsx

import { useEffect, useRef, useState } from "react";
import cornerstone from "cornerstone-core";
import cornerstoneMath from "cornerstone-math";
import cornerstoneTools from "cornerstone-tools";
import Hammer from "hammerjs";
import { initCornerstone } from "../../utils/cornerstoneInit";

// تهيئة الأدوات (مرة واحدة)
initCornerstone();

// ربط المكتبات بـ Cornerstone Tools
cornerstoneTools.external.cornerstone = cornerstone;
cornerstoneTools.external.cornerstoneMath = cornerstoneMath;
cornerstoneTools.external.Hammer = Hammer;
cornerstoneTools.init();

type DicomViewerProps = {
  imageId: string; // رابط الصورة (wadouri:http://...)
  onClose: () => void;
};

export function DicomViewer({ imageId, onClose }: DicomViewerProps) {
  const elementRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Tools Setup
  const [activeTool, setActiveTool] = useState("Wwwc"); // Window/Level (Brightness)

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    // تفعيل العنصر
    cornerstone.enable(element);

    // تحميل الصورة
    const loadAndDisplayImage = async () => {
      try {
        setLoading(true);
        // ملاحظة: إذا كان الرابط صورة عادية (JPG/PNG) لا تستخدم wadouri
        // إذا كان DICOM حقيقي استخدم wadouri:
        const processedImageId = imageId.startsWith("http")
          ? `wadouri:${imageId}`
          : imageId;

        const image = await cornerstone.loadImage(processedImageId);
        cornerstone.displayImage(element, image);

        // إضافة الأدوات الأساسية
        const WwwcTool = cornerstoneTools.WwwcTool;
        const PanTool = cornerstoneTools.PanTool;
        const ZoomTool = cornerstoneTools.ZoomTool;
        const ZoomMouseWheelTool = cornerstoneTools.ZoomMouseWheelTool;

        cornerstoneTools.addTool(WwwcTool);
        cornerstoneTools.addTool(PanTool);
        cornerstoneTools.addTool(ZoomTool);
        cornerstoneTools.addTool(ZoomMouseWheelTool);

        // تفعيل الأدوات الافتراضية
        cornerstoneTools.setToolActive("Wwwc", { mouseButtonMask: 1 }); // Left Click
        cornerstoneTools.setToolActive("Pan", { mouseButtonMask: 2 }); // Middle Click
        cornerstoneTools.setToolActive("Zoom", { mouseButtonMask: 4 }); // Right Click
        cornerstoneTools.setToolActive("ZoomMouseWheel", {});

        setLoading(false);
      } catch (err: any) {
        console.error("DICOM Load Error:", err);
        setError("تعذر تحميل صورة الأشعة. تأكد من أن الرابط صالح ويدعم CORS.");
        setLoading(false);
      }
    };

    loadAndDisplayImage();

    return () => {
      if (element) cornerstone.disable(element);
    };
  }, [imageId]);

  // تبديل الأدوات
  const activateTool = (toolName: string) => {
    setActiveTool(toolName);
    cornerstoneTools.setToolActive(toolName, { mouseButtonMask: 1 });

    // إعادة تعيين الأدوات الأخرى لتكون Passive
    ["Wwwc", "Pan", "Zoom"].forEach((t) => {
      if (t !== toolName) cornerstoneTools.setToolPassive(t);
    });
  };

  const resetViewport = () => {
    const element = elementRef.current;
    if (element) cornerstone.reset(element);
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col">
      {/* Toolbar */}
      <div className="flex justify-between items-center px-4 py-2 bg-slate-900 border-b border-slate-800">
        <div className="flex gap-2">
          <button
            onClick={() => activateTool("Wwwc")}
            className={`px-3 py-1.5 rounded text-xs font-bold ${
              activeTool === "Wwwc"
                ? "bg-sky-600 text-white"
                : "bg-slate-800 text-slate-300"
            }`}
          >
            W/L (تباين)
          </button>
          <button
            onClick={() => activateTool("Pan")}
            className={`px-3 py-1.5 rounded text-xs font-bold ${
              activeTool === "Pan"
                ? "bg-sky-600 text-white"
                : "bg-slate-800 text-slate-300"
            }`}
          >
            Pan (تحريك)
          </button>
          <button
            onClick={() => activateTool("Zoom")}
            className={`px-3 py-1.5 rounded text-xs font-bold ${
              activeTool === "Zoom"
                ? "bg-sky-600 text-white"
                : "bg-slate-800 text-slate-300"
            }`}
          >
            Zoom (تكبير)
          </button>
          <button
            onClick={resetViewport}
            className="px-3 py-1.5 rounded text-xs font-bold bg-slate-700 text-slate-200 hover:bg-slate-600"
          >
            Reset (إعادة)
          </button>
        </div>

        <div className="text-white font-mono text-xs hidden md:block">
          Saraya PACS Viewer v1.0
        </div>

        <button
          onClick={onClose}
          className="bg-rose-600 hover:bg-rose-500 text-white px-4 py-1.5 rounded text-xs font-bold"
        >
          إغلاق ✕
        </button>
      </div>

      {/* Viewer Canvas */}
      <div className="flex-1 relative bg-black overflow-hidden flex items-center justify-center">
        {loading && (
          <div className="text-sky-500 animate-pulse">
            جارِ تحميل الصورة الطبية...
          </div>
        )}
        {error && <div className="text-rose-500 text-sm">{error}</div>}

        <div
          ref={elementRef}
          className="w-full h-full outline-none"
          onContextMenu={(e) => e.preventDefault()} // منع قائمة المتصفح عند النقر باليمين
        />

        {/* Info Overlay */}
        {!loading && !error && (
          <div className="absolute bottom-4 left-4 text-slate-400 text-[10px] pointer-events-none select-none">
            <p>Zoom: Mouse Wheel / Right Click</p>
            <p>Pan: Middle Click</p>
            <p>Contrast: Left Click Drag</p>
          </div>
        )}
      </div>
    </div>
  );
}
