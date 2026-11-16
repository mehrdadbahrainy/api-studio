export function isNewerRelease(remote: string, installed: string): boolean {
  const pattern = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/;
  const a = pattern.exec(remote), b = pattern.exec(installed);
  if (!a || !b) return false;
  for (let i=1;i<=3;i++) {
    const next = Number(a[i]), current = Number(b[i]);
    if (next!==current) return next>current;
  }
  return false;
}
