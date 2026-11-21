export const radiologyViewerRoot = '/api/radiology/viewer';

export function isRadiologyViewerPath(url: string) {
  return url.toLowerCase().startsWith(`${radiologyViewerRoot}/`);
}

export function requestLogPath(url: string) {
  return isRadiologyViewerPath(url) ? radiologyViewerRoot : url;
}
