import { isDeepStrictEqual } from 'node:util';

const indexMetadataFields = new Set(['key', 'name', 'ns', 'v', 'background']);

/** @param {Record<string, unknown>} options */
function comparableOptions(options) {
  const comparable = Object.fromEntries(
    Object.entries(options).filter(
      ([field]) => !indexMetadataFields.has(field),
    ),
  );
  for (const field of ['unique', 'sparse', 'hidden']) {
    comparable[field] = Boolean(options[field]);
  }
  for (const field of [
    'expireAfterSeconds',
    'partialFilterExpression',
    'collation',
  ]) {
    comparable[field] ??= null;
  }
  return comparable;
}

/** @param {Record<string, unknown>} left @param {Record<string, unknown>} right */
function sameIndexKey(left, right) {
  const leftFields = Object.entries(left);
  const rightFields = Object.entries(right);
  return (
    leftFields.length === rightFields.length &&
    leftFields.every(([field, direction], index) => {
      const rightField = rightFields[index];
      return (
        rightField !== undefined &&
        field === rightField[0] &&
        isDeepStrictEqual(direction, rightField[1])
      );
    })
  );
}

/**
 * @param {{key: Record<string, unknown>} & Record<string, unknown>} existing
 * @param {{key: Record<string, unknown>, options: Record<string, unknown>}} definition
 */
export function matchesIndexDefinition(existing, definition) {
  return (
    sameIndexKey(existing.key, definition.key) &&
    isDeepStrictEqual(
      comparableOptions(existing),
      comparableOptions(definition.options),
    )
  );
}
