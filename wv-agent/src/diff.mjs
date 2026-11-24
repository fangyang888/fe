function valueType(v) {
  if (v === undefined) return 'missing';
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

function collectKeyPaths(obj, prefix = '', out = new Map(), depth = 0) {
  if (depth > 4 || !obj || typeof obj !== 'object') {
    if (prefix) out.set(prefix, valueType(obj));
    return out;
  }
  if (Array.isArray(obj)) {
    out.set(prefix || '$', `array(${obj.length > 0 ? valueType(obj[0]) : 'empty'})`);
    if (obj.length > 0 && obj[0] && typeof obj[0] === 'object') {
      collectKeyPaths(obj[0], `${prefix}[0]`, out, depth + 1);
    }
    return out;
  }
  const keys = Object.keys(obj);
  if (keys.length === 0 && prefix) {
    out.set(prefix, 'object(empty)');
    return out;
  }
  for (const k of keys) {
    const nextPath = prefix ? `${prefix}.${k}` : k;
    const val = obj[k];
    const t = valueType(val);
    if (t === 'object') {
      out.set(nextPath, 'object');
      collectKeyPaths(val, nextPath, out, depth + 1);
    } else if (t === 'array') {
      collectKeyPaths(val, nextPath, out, depth + 1);
    } else {
      out.set(nextPath, t);
    }
  }
  return out;
}

/**
 * Compare JSBridge call results across multiple devices/platforms (e.g. android, ios, harmony).
 * Reports status differences, missing fields, and type mismatches.
 */
export function diffBridgeResults(resultsByDevice) {
  const entries = Object.entries(resultsByDevice || {});
  if (entries.length <= 1) return [];

  const diffs = [];

  // 1. Compare execution statuses (resolved vs timeout vs error vs no_bridge)
  const statuses = entries.map(([dev, r]) => `${dev}=${r?.status || 'unknown'}`);
  const uniqueStatuses = new Set(entries.map(([, r]) => r?.status || 'unknown'));
  if (uniqueStatuses.size > 1) {
    diffs.push({
      kind: 'status_mismatch',
      field: '$status',
      detail: statuses.join(', '),
    });
  }

  // 2. Compare payload shapes for resolved entries
  const resolved = entries.filter(([, r]) => r && r.status === 'resolved');
  if (resolved.length <= 1) return diffs;

  const perDeviceTypes = new Map();
  const allFields = new Set();

  for (const [dev, r] of resolved) {
    const map = collectKeyPaths(r.data);
    if (map.size === 0) {
      map.set('$root', valueType(r.data));
    }
    perDeviceTypes.set(dev, map);
    for (const f of map.keys()) allFields.add(f);
  }

  for (const field of [...allFields].sort()) {
    const types = [];
    const uniqueTypes = new Set();
    for (const [dev] of resolved) {
      const t = perDeviceTypes.get(dev).get(field) || 'missing';
      types.push(`${dev}=${t}`);
      uniqueTypes.add(t);
    }
    if (uniqueTypes.size > 1) {
      diffs.push({
        kind: uniqueTypes.has('missing') ? 'missing_field' : 'type_mismatch',
        field,
        detail: types.join(', '),
      });
    }
  }

  return diffs;
}
