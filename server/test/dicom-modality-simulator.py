"""Synthetic X-ray modality for the isolated CAP13 acceptance test."""

import json
import sys
from datetime import datetime
from pathlib import Path

from pydicom import dcmread
from pydicom.dataset import Dataset, FileMetaDataset
from pydicom.uid import DigitalXRayImageStorageForPresentation, ExplicitVRLittleEndian, generate_uid
from pynetdicom import AE
from pynetdicom.sop_class import ModalityWorklistInformationFind


def association(port, abstract_syntax, station="SARAYASIM"):
    ae = AE(ae_title=station)
    ae.acse_timeout = ae.dimse_timeout = ae.network_timeout = 10
    ae.add_requested_context(abstract_syntax, ExplicitVRLittleEndian)
    connection = ae.associate("127.0.0.1", port, ae_title="SARAYAPACS")
    if not connection.is_established:
        raise RuntimeError("DICOM association was rejected")
    return connection


def worklist(port, accession, station="SARAYASIM", include_study_uid=False):
    query = Dataset()
    query.AccessionNumber = accession
    query.PatientID = ""
    query.PatientName = ""
    if include_study_uid:
        query.StudyInstanceUID = ""
    step = Dataset()
    step.Modality = ""
    step.ScheduledProcedureStepID = ""
    query.ScheduledProcedureStepSequence = [step]
    connection = association(port, ModalityWorklistInformationFind, station)
    try:
        results = []
        for status, result in connection.send_c_find(query, ModalityWorklistInformationFind):
            if status and status.Status in (0xFF00, 0xFF01):
                results.append({
                    "accession": str(result.AccessionNumber),
                    "patientId": str(result.PatientID),
                    "modality": str(result.ScheduledProcedureStepSequence[0].Modality),
                })
                if include_study_uid:
                    results[-1]["studyInstanceUid"] = str(result.StudyInstanceUID)
            elif not status or status.Status != 0:
                raise RuntimeError("DICOM worklist query failed")
        return results
    finally:
        connection.release()


def make_xray(file, accession, patient, uid):
    now = datetime.now()
    ds = Dataset()
    ds.file_meta = FileMetaDataset()
    ds.file_meta.TransferSyntaxUID = ExplicitVRLittleEndian
    ds.SOPClassUID = DigitalXRayImageStorageForPresentation
    ds.SOPInstanceUID = generate_uid()
    ds.file_meta.MediaStorageSOPClassUID = ds.SOPClassUID
    ds.file_meta.MediaStorageSOPInstanceUID = ds.SOPInstanceUID
    ds.StudyInstanceUID = uid
    ds.SeriesInstanceUID = generate_uid()
    ds.AccessionNumber, ds.PatientID = accession, patient
    ds.PatientName = "Synthetic^CAP13"
    ds.PatientBirthDate, ds.PatientSex = "", ""
    ds.StudyDate, ds.StudyTime = now.strftime("%Y%m%d"), now.strftime("%H%M%S")
    ds.StudyDescription = "Synthetic CAP13 X-ray"
    ds.Modality, ds.ImageType = "DX", ["ORIGINAL", "PRIMARY"]
    ds.SeriesNumber = ds.InstanceNumber = 1
    ds.Rows = ds.Columns = 128
    ds.SamplesPerPixel = 1
    ds.PhotometricInterpretation = "MONOCHROME2"
    ds.BitsAllocated = ds.BitsStored = 8
    ds.HighBit, ds.PixelRepresentation = 7, 0
    ds.WindowCenter, ds.WindowWidth = 128, 256
    ds.PixelData = bytes(
        (200 if 32 < x < 96 and 32 < y < 96 else (x + y) // 3)
        for y in range(128) for x in range(128)
    )
    ds.save_as(file, enforce_file_format=True)
    return ds


def store(port, file, accession=None, patient=None, uid=None):
    ds = make_xray(file, accession, patient, uid) if accession is not None else dcmread(file)
    connection = association(port, ds.SOPClassUID)
    try:
        status = connection.send_c_store(ds)
        if not status or status.Status != 0:
            raise RuntimeError("DICOM storage failed")
        return {"sopInstanceUid": str(ds.SOPInstanceUID)}
    finally:
        connection.release()


if __name__ == "__main__":
    action, port, *args = sys.argv[1:]
    if action == "find":
        output = worklist(int(port), args[0])
    elif action == "find-mwl":
        output = worklist(int(port), args[0], args[1], include_study_uid=True)
    elif action == "store":
        output = store(int(port), Path(args[0]), *args[1:])
    elif action == "make":
        ds = make_xray(Path(args[0]), *args[1:])
        output = {"sopInstanceUid": str(ds.SOPInstanceUID)}
    else:
        raise ValueError("Unknown simulator command")
    print(json.dumps(output))
