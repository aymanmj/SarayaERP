ALTER TABLE "RadiologyOrder"
    ADD COLUMN "dicomMwlId" UUID,
    ADD COLUMN "dicomMwlMayExist" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "dicomMwlCheckedAt" TIMESTAMP(3),
    ADD CONSTRAINT "RadiologyOrder_dicom_mwl_identity_check"
      CHECK (NOT "dicomMwlMayExist" OR ("dicomMwlId" IS NOT NULL AND "dicomAccessionNumber" IS NOT NULL));

CREATE UNIQUE INDEX "RadiologyOrder_dicomMwlId_key" ON "RadiologyOrder"("dicomMwlId");
