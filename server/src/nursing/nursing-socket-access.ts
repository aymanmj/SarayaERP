export function hasNursingSocketRead(roles: string[], permissions: string[]) {
  return (
    roles.includes('ADMIN') ||
    permissions.some((code) =>
      [
        'ADMIN_FULL_ACCESS',
        'nursing:view',
        'nursing:dashboard:view',
        'nursing:station:view',
      ].includes(code),
    )
  );
}
