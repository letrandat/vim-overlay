// Page globals and DOM attachment properties have no public types. Keep reads unknown until checked.
export function property(value: unknown, key: PropertyKey): unknown {
  return value == null ? undefined : (value as Record<PropertyKey, unknown>)[key];
}
