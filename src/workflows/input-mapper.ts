import { WorkflowInputMappingError } from "../errors.js";

const referencePattern =
  /^\$(?:\.[a-zA-Z_][a-zA-Z0-9_-]*|\.[0-9]+)*$/;
const optionalReferencePattern =
  /^\$(?:\.[a-zA-Z_][a-zA-Z0-9_-]*|\.[0-9]+)*\?$/;
const blockedKeys = new Set(["__proto__", "constructor", "prototype"]);

export function resolveInputTemplate(
  template: unknown,
  context: unknown,
): unknown {
  if (
    typeof template === "string" &&
    (referencePattern.test(template) || optionalReferencePattern.test(template))
  ) {
    return resolveReference(template, context);
  }

  if (Array.isArray(template)) {
    return template.map((item) => resolveInputTemplate(item, context));
  }

  if (isPlainObject(template)) {
    const resolved: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(template)) {
      if (blockedKeys.has(key)) {
        throw new WorkflowInputMappingError(key);
      }
      resolved[key] = resolveInputTemplate(value, context);
    }
    return resolved;
  }

  return template;
}

function resolveReference(reference: string, context: unknown): unknown {
  const optional = reference.endsWith("?");
  const normalizedReference = optional ? reference.slice(0, -1) : reference;
  if (normalizedReference === "$") {
    return context;
  }

  const segments = normalizedReference.slice(2).split(".");
  let current = context;

  for (const segment of segments) {
    if (blockedKeys.has(segment)) {
      if (optional) {
        return undefined;
      }
      throw new WorkflowInputMappingError(reference);
    }

    if (Array.isArray(current) && /^[0-9]+$/.test(segment)) {
      current = current[Number(segment)];
      continue;
    }

    if (
      typeof current === "object" &&
      current !== null &&
      Object.prototype.hasOwnProperty.call(current, segment)
    ) {
      current = (current as Record<string, unknown>)[segment];
      continue;
    }

    if (optional) {
      return undefined;
    }
    throw new WorkflowInputMappingError(reference);
  }

  if (current === undefined) {
    if (optional) {
      return undefined;
    }
    throw new WorkflowInputMappingError(reference);
  }
  return current;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
