import { useLicenseStore } from "../stores/licenseStore";

export function useLicenseFeatures() {
  const edition = useLicenseStore((state) => state.edition);
  const features = useLicenseStore((state) => state.features);
  const hasFeature = useLicenseStore((state) => state.hasFeature);

  return {
    edition,
    features,
    hasFeature,
    isEnterprise: edition === "ENTERPRISE",
    isStandard: edition === "STANDARD" || edition === "PRO",
  };
}
