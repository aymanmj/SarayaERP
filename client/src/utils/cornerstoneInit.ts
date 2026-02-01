// src/utils/cornerstoneInit.ts

import dicomParser from "dicom-parser";
import cornerstone from "cornerstone-core";
import cornerstoneWADOImageLoader from "cornerstone-wado-image-loader";
import cornerstoneMath from "cornerstone-math";

export function initCornerstone() {
  // ربط التبعيات الخارجية
  cornerstoneWADOImageLoader.external.cornerstone = cornerstone;
  cornerstoneWADOImageLoader.external.dicomParser = dicomParser;
  cornerstoneWADOImageLoader.external.cornerstoneMath = cornerstoneMath;

  // إعداد مسارات الـ Web Workers (التي قمت بنسخها إلى public)
  const config = {
    maxWebWorkers: navigator.hardwareConcurrency || 1,
    startWebWorkersOnDemand: true,
    webWorkerPath: "/cornerstoneWADOImageLoaderWebWorker.min.js", // ✅ المسار الصحيح
    taskConfiguration: {
      decodeTask: {
        initializeCode: undefined,
        codecsPath: "/cornerstoneWADOImageLoaderCodecs.min.js", // ✅ المسار الصحيح
      },
    },
  };

  cornerstoneWADOImageLoader.webWorkerManager.initialize(config);
}

// // src/utils/cornerstoneInit.ts

// import dicomParser from "dicom-parser";
// import cornerstone from "cornerstone-core";
// import cornerstoneWADOImageLoader from "cornerstone-wado-image-loader";
// import cornerstoneMath from "cornerstone-math";

// export function initCornerstone() {
//   // ربط التبعيات الخارجية
//   cornerstoneWADOImageLoader.external.cornerstone = cornerstone;
//   cornerstoneWADOImageLoader.external.dicomParser = dicomParser;

//   // إعداد الـ Image Loader
//   cornerstoneWADOImageLoader.configure({
//     beforeSend: function (xhr: any) {
//       // يمكن إضافة Headers للمصادقة هنا إذا كان PACS Server يتطلب ذلك
//       // const token = localStorage.getItem('token');
//       // xhr.setRequestHeader('Authorization', `Bearer ${token}`);
//     },
//   });

//   // إعداد Web Workers (لتحسين الأداء وفك ضغط الصور في الخلفية)
//   // ملاحظة: في بيئة الإنتاج الحقيقية، يجب أن تشير هذه المسارات إلى ملفات موجودة في مجلد public
//   const config = {
//     maxWebWorkers: navigator.hardwareConcurrency || 1,
//     startWebWorkersOnDemand: true,
//     taskConfiguration: {
//       decodeTask: {
//         initializeCode: undefined,
//       },
//     },
//   };

//   cornerstoneWADOImageLoader.webWorkerManager.initialize(config);
// }
