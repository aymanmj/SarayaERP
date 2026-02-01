-- CreateTable
CREATE TABLE "LabTestParameter" (
    "id" SERIAL NOT NULL,
    "labTestId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "unit" TEXT,
    "refRange" TEXT,

    CONSTRAINT "LabTestParameter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabOrderResult" (
    "id" SERIAL NOT NULL,
    "labOrderId" INTEGER NOT NULL,
    "parameterId" INTEGER,
    "parameterName" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "unit" TEXT,
    "range" TEXT,
    "flag" TEXT,

    CONSTRAINT "LabOrderResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LabTestParameter_labTestId_idx" ON "LabTestParameter"("labTestId");

-- AddForeignKey
ALTER TABLE "LabTestParameter" ADD CONSTRAINT "LabTestParameter_labTestId_fkey" FOREIGN KEY ("labTestId") REFERENCES "LabTest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabOrderResult" ADD CONSTRAINT "LabOrderResult_labOrderId_fkey" FOREIGN KEY ("labOrderId") REFERENCES "LabOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabOrderResult" ADD CONSTRAINT "LabOrderResult_parameterId_fkey" FOREIGN KEY ("parameterId") REFERENCES "LabTestParameter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
