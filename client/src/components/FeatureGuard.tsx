// src/components/FeatureGuard.tsx
import { ReactNode } from "react";
import { useLicenseFeatures } from "../hooks/useLicenseFeatures";

type FeatureProps = {
  feature: string;
  fallback?: ReactNode;
  children: ReactNode;
};

/**
 * FeatureGuard
 * Hides children if the current license does not support the given feature.
 */
export const FeatureGuard = ({ feature, fallback = null, children }: FeatureProps) => {
  const { hasFeature } = useLicenseFeatures();

  if (!hasFeature(feature)) return <>{fallback}</>;

  return <>{children}</>;
};

type EditionProps = {
  allowedEditions: string[];
  fallback?: ReactNode;
  children: ReactNode;
};

/**
 * EditionGuard
 * Hides children if the current license edition is not in the allowed list.
 */
export const EditionGuard = ({ allowedEditions, fallback = null, children }: EditionProps) => {
  const { edition } = useLicenseFeatures();

  if (!allowedEditions.includes(edition)) return <>{fallback}</>;

  return <>{children}</>;
};
