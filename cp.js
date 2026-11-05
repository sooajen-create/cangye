// Keep the stored string compatible with existing backups and cloud records.
export function cpValues(value) {
  const values = [...new Set(String(value ?? '').split(/[,，]/).map(s => s.trim()).filter(Boolean))];
  return values.length ? values : ['未分类'];
}
export function normalizeCP(value) { return cpValues(value).join(', '); }
