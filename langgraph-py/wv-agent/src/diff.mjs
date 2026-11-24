function valueType(v) {
  if (v === undefined) return 'missing';
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

function isEmptyValue(v) {
  if (typeof v === 'string') return v.trim() === '';
  if (Array.isArray(v)) return v.length === 0;
  if (v && typeof v === 'object') return Object.keys(v).length === 0;
  return false;
}

function previewValue(v) {
  if (v === undefined) return '<missing>';
  if (v === null) return 'null';
  if (typeof v === 'string') {
    if (v === '') return '""';
    return v.length > 48 ? JSON.stringify(v.slice(0, 45) + '...') : JSON.stringify(v);
  }
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return `Array(${v.length})`;
  if (typeof v === 'object') {
    const keys = Object.keys(v);
    return keys.length === 0 ? '{}' : `Object(${keys.length} keys)`;
  }
  return String(v);
}

/**
 * Detect semantic format of a non-empty primitive value so cross-platform format
 * discrepancies (e.g. YYYY-MM-DD vs YYYY/MM/DD, seconds vs ms timestamps, https vs http)
 * can be caught even when typeof is identical.
 */
export function detectSemanticFormat(v) {
  if (typeof v === 'number' && Number.isFinite(v) && Number.isInteger(v)) {
    if (v >= 1e9 && v < 1e10) return 'timestamp:seconds';
    if (v >= 1e12 && v < 1e13) return 'timestamp:milliseconds';
    return null;
  }

  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s) return null;

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/.test(s)) {
    return 'datetime:iso';
  }
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(s)) {
    return 'datetime:space-dash';
  }
  if (/^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}(:\d{2})?$/.test(s)) {
    return 'datetime:space-slash';
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return 'date:YYYY-MM-DD';
  }
  if (/^\d{4}\/\d{2}\/\d{2}$/.test(s)) {
    return 'date:YYYY/MM/DD';
  }
  if (/^\d{4}\.\d{2}\.\d{2}$/.test(s)) {
    return 'date:YYYY.MM.DD';
  }
  if (/^(19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])$/.test(s)) {
    return 'date:YYYYMMDD';
  }
  if (/^https:\/\//i.test(s)) return 'url:https';
  if (/^http:\/\//i.test(s)) return 'url:http';
  if (/^\/\/[^/\s]+/.test(s)) return 'url:protocol-relative';
  if (/^\/[^/\s].*/.test(s)) return 'url:path';
  if (/^1\d{9}$/.test(s)) return 'timestamp:seconds-str';
  if (/^1\d{12}$/.test(s)) return 'timestamp:milliseconds-str';
  if (/^(true|false)$/i.test(s)) return 'bool-str';
  if (/^-?\d+(\.\d+)?$/.test(s)) return 'numeric-str';

  return null;
}

function formatFamily(fmt) {
  if (!fmt) return null;
  if (fmt.startsWith('date:') || fmt.startsWith('datetime:')) return 'date';
  if (fmt.startsWith('timestamp:')) return 'timestamp';
  if (fmt.startsWith('url:')) return 'url';
  if (fmt === 'bool-str' || fmt === 'numeric-str') return 'bool_num_str';
  return fmt;
}

function shouldFlagFormatMismatch(formatsByDevice) {
  const entries = Object.entries(formatsByDevice).filter(([, f]) => Boolean(f));
  if (entries.length < 2) return false;
  // Require every compared non-empty device to have a recognized format so free-form text doesn't trigger noise
  if (entries.length !== Object.keys(formatsByDevice).length) return false;

  const uniqueFormats = new Set(entries.map(([, f]) => f));
  if (uniqueFormats.size <= 1) return false;

  const families = new Set(entries.map(([, f]) => formatFamily(f)));
  // Same semantic family with different formats (e.g. date:YYYY-MM-DD vs date:YYYY/MM/DD,
  // timestamp:seconds vs timestamp:milliseconds, url:https vs url:http, bool-str vs numeric-str)
  if (families.size === 1) {
    const fam = [...families][0];
    if (fam === 'url') {
      // Only flag url:path if at least one device has a real URL scheme / protocol-relative URL
      const hasConcreteUrl = entries.some(
        ([, f]) => f === 'url:https' || f === 'url:http' || f === 'url:protocol-relative'
      );
      return hasConcreteUrl;
    }
    return true;
  }

  // Date string vs timestamp string (e.g. "2026-11-24" vs "1732436000")
  if (families.size === 2 && families.has('date') && families.has('timestamp')) {
    return true;
  }

  return false;
}

function matchesIgnorePattern(field, patterns) {
  if (!patterns || patterns.length === 0) return false;
  for (const raw of patterns) {
    const p = String(raw || '').trim();
    if (!p) continue;
    if (p === field) return true;
    if (p.includes('*')) {
      const escaped = p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
      if (new RegExp(`^${escaped}$`).test(field)) return true;
    }
  }
  return false;
}

function collectFieldNodes(obj, prefix = '', out = new Map(), depth = 0) {
  if (depth > 5 || !obj || typeof obj !== 'object') {
    if (prefix) {
      out.set(prefix, {
        type: valueType(obj),
        value: obj,
        empty: isEmptyValue(obj),
      });
    }
    return out;
  }

  if (Array.isArray(obj)) {
    const pathKey = prefix || '$';
    const elemType = obj.length > 0 ? valueType(obj[0]) : 'empty';
    out.set(pathKey, {
      type: 'array',
      value: obj,
      empty: obj.length === 0,
      arrayElemType: elemType,
    });
    if (obj.length > 0 && obj[0] && typeof obj[0] === 'object') {
      collectFieldNodes(obj[0], `${prefix}[0]`, out, depth + 1);
    }
    return out;
  }

  const keys = Object.keys(obj);
  if (prefix) {
    out.set(prefix, {
      type: 'object',
      value: obj,
      empty: keys.length === 0,
    });
  }
  if (keys.length === 0) {
    return out;
  }

  for (const k of keys) {
    const nextPath = prefix ? `${prefix}.${k}` : k;
    const val = obj[k];
    const t = valueType(val);
    if (t === 'object') {
      collectFieldNodes(val, nextPath, out, depth + 1);
    } else if (t === 'array') {
      collectFieldNodes(val, nextPath, out, depth + 1);
    } else {
      out.set(nextPath, {
        type: t,
        value: val,
        empty: isEmptyValue(val),
      });
    }
  }
  return out;
}

function normalizeContractRules(contract) {
  if (!contract || typeof contract !== 'object') return [];
  const rules = [];

  function walkSchemaProps(properties, requiredList, prefix) {
    const reqSet = new Set(Array.isArray(requiredList) ? requiredList : []);
    for (const [key, spec] of Object.entries(properties || {})) {
      const fieldPath = prefix ? `${prefix}.${key}` : key;
      if (typeof spec === 'string') {
        rules.push({ field: fieldPath, type: spec, required: reqSet.has(key) });
        continue;
      }
      if (!spec || typeof spec !== 'object') continue;
      const isReq = spec.required !== undefined ? Boolean(spec.required) : reqSet.has(key);
      const nonEmpty =
        spec.nonEmpty === true ||
        (typeof spec.minLength === 'number' && spec.minLength > 0) ||
        (typeof spec.minItems === 'number' && spec.minItems > 0);
      rules.push({
        field: fieldPath,
        type: spec.type,
        required: isReq,
        nonEmpty,
        format: spec.format,
        pattern: spec.pattern,
        enum: Array.isArray(spec.enum) ? spec.enum : undefined,
      });
      if (spec.properties && typeof spec.properties === 'object') {
        walkSchemaProps(spec.properties, spec.required, fieldPath);
      }
    }
  }

  // Standard JSON Schema style: { type: 'object', required: [...], properties: { ... } }
  if (contract.properties && typeof contract.properties === 'object') {
    walkSchemaProps(contract.properties, contract.required, '');
    return rules;
  }

  // Shorthand flat / dot-path contract style:
  // { nickName: { type: 'string', required: true, nonEmpty: true }, uid: 'string' }
  for (const [field, spec] of Object.entries(contract)) {
    if (typeof spec === 'string') {
      rules.push({ field, type: spec, required: true });
      continue;
    }
    if (!spec || typeof spec !== 'object') continue;
    const nonEmpty =
      spec.nonEmpty === true ||
      (typeof spec.minLength === 'number' && spec.minLength > 0) ||
      (typeof spec.minItems === 'number' && spec.minItems > 0);
    rules.push({
      field,
      type: spec.type,
      required: spec.required !== false,
      nonEmpty,
      format: spec.format,
      pattern: spec.pattern,
      enum: Array.isArray(spec.enum) ? spec.enum : undefined,
    });
    if (spec.properties && typeof spec.properties === 'object') {
      walkSchemaProps(spec.properties, spec.required, field);
    }
  }

  return rules;
}

function matchesContractFormat(val, expectedFormat) {
  if (!expectedFormat) return true;
  const detected = detectSemanticFormat(val);
  if (detected === expectedFormat) return true;
  // Family-level match, e.g. format: "url", "date", "datetime", "timestamp"
  if (expectedFormat === 'url') {
    return detected === 'url:https' || detected === 'url:http' || detected === 'url:protocol-relative';
  }
  if (expectedFormat === 'date') {
    return Boolean(detected && detected.startsWith('date:'));
  }
  if (expectedFormat === 'datetime') {
    return Boolean(detected && detected.startsWith('datetime:'));
  }
  if (expectedFormat === 'timestamp') {
    return Boolean(detected && detected.startsWith('timestamp:'));
  }
  return false;
}

/**
 * Validate one or more device JSBridge results against an expected contract/schema.
 * Works even when only a single device is online.
 */
export function validateBridgeContract(resultsByDevice, contract, options = {}) {
  const rules = normalizeContractRules(contract);
  if (rules.length === 0) return [];
  const ignoreFields = Array.isArray(options.ignoreFields) ? options.ignoreFields : [];
  const entries = Object.entries(resultsByDevice || {});
  const violations = [];

  for (const [dev, r] of entries) {
    if (!r || r.status !== 'resolved') {
      violations.push({
        kind: 'contract_status_error',
        severity: 'error',
        field: '$status',
        device: dev,
        detail: `${dev}=${r?.status || 'unknown'} (expected resolved)`,
      });
      continue;
    }

    const nodes = collectFieldNodes(r.data);
    for (const rule of rules) {
      if (matchesIgnorePattern(rule.field, ignoreFields)) continue;
      const node = nodes.get(rule.field);

      if (!node || node.type === 'missing') {
        if (rule.required) {
          violations.push({
            kind: 'contract_missing',
            severity: 'error',
            field: rule.field,
            device: dev,
            detail: `${dev} missing required field "${rule.field}"`,
          });
        }
        continue;
      }

      if (rule.type) {
        const allowedTypes = Array.isArray(rule.type) ? rule.type : [rule.type];
        if (!allowedTypes.includes(node.type)) {
          violations.push({
            kind: 'contract_type_mismatch',
            severity: 'error',
            field: rule.field,
            device: dev,
            detail: `${dev}=${node.type} (expected ${allowedTypes.join('|')})`,
            values: { [dev]: previewValue(node.value) },
          });
          continue;
        }
      }

      if (rule.nonEmpty && (node.empty || node.type === 'null')) {
        violations.push({
          kind: 'contract_empty',
          severity: 'error',
          field: rule.field,
          device: dev,
          detail: `${dev}=${previewValue(node.value)} (expected non-empty)`,
          values: { [dev]: previewValue(node.value) },
        });
        continue;
      }

      if (rule.enum && !rule.enum.includes(node.value)) {
        violations.push({
          kind: 'contract_enum_mismatch',
          severity: 'error',
          field: rule.field,
          device: dev,
          detail: `${dev}=${previewValue(node.value)} (expected one of ${JSON.stringify(rule.enum)})`,
          values: { [dev]: previewValue(node.value) },
        });
      }

      if (rule.format && !node.empty && node.type !== 'null') {
        if (!matchesContractFormat(node.value, rule.format)) {
          const actualFmt = detectSemanticFormat(node.value) || 'unrecognized';
          violations.push({
            kind: 'contract_format_mismatch',
            severity: 'error',
            field: rule.field,
            device: dev,
            detail: `${dev}=${previewValue(node.value)} (format ${actualFmt}, expected ${rule.format})`,
            values: { [dev]: previewValue(node.value) },
          });
        }
      }

      if (rule.pattern && typeof node.value === 'string' && !node.empty) {
        try {
          if (!new RegExp(rule.pattern).test(node.value)) {
            violations.push({
              kind: 'contract_format_mismatch',
              severity: 'error',
              field: rule.field,
              device: dev,
              detail: `${dev}=${previewValue(node.value)} (did not match /${rule.pattern}/)`,
              values: { [dev]: previewValue(node.value) },
            });
          }
        } catch {
          // ignore invalid regex
        }
      }
    }
  }

  return violations;
}

/**
 * Compare JSBridge call results across multiple devices/platforms (e.g. android, ios, harmony),
 * and optionally validate every device against a contract schema.
 *
 * Detects:
 * - status_mismatch (error): e.g. resolved vs timeout/error/no_bridge
 * - missing_field (error): field absent on one or more platforms
 * - type_mismatch (error): field types differ (e.g. number vs boolean)
 * - empty_mismatch (warn): same type, but empty ("", [], {}) on one platform vs non-empty on another
 * - format_mismatch (warn): same type, incompatible format (e.g. YYYY-MM-DD vs YYYY/MM/DD, sec vs ms timestamp, https vs http)
 * - value_mismatch (warn, opt-in via checkValues): primitive values differ across platforms
 * - contract_* (error, when contract/schema is provided): single- or multi-device schema validation
 */
export function diffBridgeResults(resultsByDevice, options = {}) {
  const entries = Object.entries(resultsByDevice || {});
  const ignoreFields = Array.isArray(options.ignoreFields) ? options.ignoreFields : [];
  const checkValues = options.checkValues === true;
  const contract = options.contract || options.schema || null;

  const diffs = [];

  // Multi-device cross-platform diff
  if (entries.length > 1) {
    // 1. Compare execution statuses (resolved vs timeout vs error vs no_bridge)
    const statuses = entries.map(([dev, r]) => `${dev}=${r?.status || 'unknown'}`);
    const uniqueStatuses = new Set(entries.map(([, r]) => r?.status || 'unknown'));
    if (uniqueStatuses.size > 1) {
      diffs.push({
        kind: 'status_mismatch',
        severity: 'error',
        field: '$status',
        detail: statuses.join(', '),
      });
    }

    // 2. Compare payload shapes & semantics for resolved entries
    const resolved = entries.filter(([, r]) => r && r.status === 'resolved');
    if (resolved.length > 1) {
      const perDeviceNodes = new Map();
      const allFields = new Set();

      for (const [dev, r] of resolved) {
        const map = collectFieldNodes(r.data);
        if (map.size === 0) {
          map.set('$root', {
            type: valueType(r.data),
            value: r.data,
            empty: isEmptyValue(r.data),
          });
        }
        perDeviceNodes.set(dev, map);
        for (const f of map.keys()) allFields.add(f);
      }

      // Track array paths where at least one device has an empty array so we don't spam child [0].* missing_field
      const arraysWithEmptyDevice = new Set();
      for (const field of allFields) {
        const nodes = resolved.map(([dev]) => perDeviceNodes.get(dev).get(field));
        if (nodes.every((n) => n && n.type === 'array') && nodes.some((n) => n.empty)) {
          arraysWithEmptyDevice.add(field);
        }
      }

      for (const field of [...allFields].sort()) {
        if (matchesIgnorePattern(field, ignoreFields)) continue;

        // If this field is inside an array element `[0].*` whose parent array is empty on some device,
        // skip noisy child missing_field reports (the parent array already reports empty_mismatch).
        const arrayChildMatch = field.match(/^(.+?)\[0\]/);
        if (arrayChildMatch && arraysWithEmptyDevice.has(arrayChildMatch[1])) {
          continue;
        }

        const typeLabels = [];
        const uniqueTypes = new Set();
        const values = {};
        const nodesByDev = {};

        for (const [dev] of resolved) {
          const node = perDeviceNodes.get(dev).get(field);
          const t = node ? node.type : 'missing';
          nodesByDev[dev] = node || null;
          typeLabels.push(`${dev}=${t}`);
          uniqueTypes.add(t);
          values[dev] = node ? previewValue(node.value) : '<missing>';
        }

        // 2a. Missing field or type mismatch
        if (uniqueTypes.size > 1) {
          diffs.push({
            kind: uniqueTypes.has('missing') ? 'missing_field' : 'type_mismatch',
            severity: 'error',
            field,
            detail: typeLabels.join(', '),
            values,
          });
          continue;
        }

        const commonType = [...uniqueTypes][0];

        // 2b. Array element type mismatch & empty array mismatch
        if (commonType === 'array') {
          const emptyFlags = resolved.map(([dev]) => nodesByDev[dev].empty);
          if (emptyFlags.some(Boolean) && emptyFlags.some((e) => !e)) {
            diffs.push({
              kind: 'empty_mismatch',
              severity: 'warn',
              field,
              detail: resolved.map(([dev]) => `${dev}=${values[dev]}`).join(', '),
              values,
            });
            continue;
          }
          const elemTypes = new Set(
            resolved.filter(([dev]) => !nodesByDev[dev].empty).map(([dev]) => nodesByDev[dev].arrayElemType)
          );
          if (elemTypes.size > 1) {
            diffs.push({
              kind: 'type_mismatch',
              severity: 'error',
              field,
              detail: resolved
                .map(([dev]) => `${dev}=array(${nodesByDev[dev].arrayElemType})`)
                .join(', '),
              values,
            });
          }
          continue;
        }

        // 2c. Empty object mismatch ({} vs populated object)
        if (commonType === 'object') {
          const emptyFlags = resolved.map(([dev]) => nodesByDev[dev].empty);
          if (emptyFlags.some(Boolean) && emptyFlags.some((e) => !e)) {
            diffs.push({
              kind: 'empty_mismatch',
              severity: 'warn',
              field,
              detail: resolved.map(([dev]) => `${dev}=${values[dev]}`).join(', '),
              values,
            });
          }
          continue;
        }

        // 2d. Empty string mismatch ("" vs non-empty string)
        if (commonType === 'string') {
          const emptyFlags = resolved.map(([dev]) => nodesByDev[dev].empty);
          if (emptyFlags.some(Boolean) && emptyFlags.some((e) => !e)) {
            diffs.push({
              kind: 'empty_mismatch',
              severity: 'warn',
              field,
              detail: resolved.map(([dev]) => `${dev}=${values[dev]}`).join(', '),
              values,
            });
            continue;
          }
        }

        // 2e. Semantic format mismatch (dates, timestamps sec vs ms, URLs, bool/numeric strings)
        if (commonType === 'string' || commonType === 'number') {
          const formatsByDev = {};
          for (const [dev] of resolved) {
            const node = nodesByDev[dev];
            if (!node.empty) {
              formatsByDev[dev] = detectSemanticFormat(node.value);
            }
          }
          if (shouldFlagFormatMismatch(formatsByDev)) {
            diffs.push({
              kind: 'format_mismatch',
              severity: 'warn',
              field,
              detail: resolved
                .map(([dev]) => `${dev}=${formatsByDev[dev]}(${values[dev]})`)
                .join(', '),
              values,
            });
            continue;
          }
        }

        // 2f. Optional strict primitive value comparison
        if (checkValues && (commonType === 'string' || commonType === 'number' || commonType === 'boolean')) {
          const uniqueVals = new Set(resolved.map(([dev]) => nodesByDev[dev].value));
          if (uniqueVals.size > 1) {
            diffs.push({
              kind: 'value_mismatch',
              severity: 'warn',
              field,
              detail: resolved.map(([dev]) => `${dev}=${values[dev]}`).join(', '),
              values,
            });
          }
        }
      }
    }
  }

  // Optional contract / schema validation (works for both 1 device and multi-device)
  if (contract) {
    const contractDiffs = validateBridgeContract(resultsByDevice, contract, { ignoreFields });
    diffs.push(...contractDiffs);
  }

  return diffs;
}

export function summarizeBridgeDiff(resultsByDevice, diffs) {
  const entries = Object.entries(resultsByDevice || {});
  const resolvedCount = entries.filter(([, r]) => r && r.status === 'resolved').length;
  const byKind = {};
  let errorCount = 0;
  let warnCount = 0;

  for (const d of diffs || []) {
    byKind[d.kind] = (byKind[d.kind] || 0) + 1;
    if (d.severity === 'warn') warnCount++;
    else errorCount++;
  }

  return {
    passed: errorCount === 0 && warnCount === 0 && resolvedCount === entries.length,
    deviceCount: entries.length,
    resolvedCount,
    errorCount,
    warnCount,
    byKind,
  };
}

function escapeMdCell(str) {
  return String(str ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ');
}

export function formatDiffMarkdown({ path: bridgePath, params, results, diffs, summary }) {
  const sum = summary || summarizeBridgeDiff(results, diffs);
  const lines = [];
  lines.push(`### JSBridge 协议对账单：\`${bridgePath}\``);
  lines.push('');
  lines.push(`- **入参**：\`${JSON.stringify(params || {})}\``);
  lines.push(
    `- **结论**：${sum.passed ? '✅ 一致通过' : `❌ 发现 ${sum.errorCount} 项错误、${sum.warnCount} 项警告`}（在线设备 ${sum.deviceCount} 台，成功回调 ${sum.resolvedCount} 台）`
  );
  lines.push('');

  // Device status summary
  lines.push('| 设备 | 状态 | 耗时 |');
  lines.push('| --- | --- | --- |');
  for (const [dev, r] of Object.entries(results || {})) {
    const st = r?.status || 'unknown';
    const ms = typeof r?.durationMs === 'number' ? `${r.durationMs}ms` : '-';
    lines.push(`| ${escapeMdCell(dev)} | ${escapeMdCell(st)} | ${escapeMdCell(ms)} |`);
  }

  if (!diffs || diffs.length === 0) {
    lines.push('');
    lines.push('> 无差异项。');
    return lines.join('\n');
  }

  lines.push('');
  lines.push('#### 差异明细');
  lines.push('');
  lines.push('| 级别 | 类型 | 字段 | 详情 |');
  lines.push('| --- | --- | --- | --- |');
  for (const d of diffs) {
    const badge = d.severity === 'warn' ? 'WARN' : 'ERROR';
    lines.push(
      `| ${badge} | \`${escapeMdCell(d.kind)}\` | \`${escapeMdCell(d.field)}\` | ${escapeMdCell(d.detail)} |`
    );
  }

  return lines.join('\n');
}
