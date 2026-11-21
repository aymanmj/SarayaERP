ALTER TABLE "RadiologyOrder"
  ADD COLUMN "dicomAccessionNumber" TEXT,
  ADD COLUMN "dicomStudyUid" TEXT,
  ADD CONSTRAINT "RadiologyOrder_dicom_study_requires_accession"
    CHECK ("dicomStudyUid" IS NULL OR "dicomAccessionNumber" IS NOT NULL);

CREATE UNIQUE INDEX "RadiologyOrder_dicomAccessionNumber_key"
  ON "RadiologyOrder" ("dicomAccessionNumber");

CREATE UNIQUE INDEX "RadiologyOrder_dicomStudyUid_key"
  ON "RadiologyOrder" ("dicomStudyUid");
