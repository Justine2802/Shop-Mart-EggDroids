// Prisma's `contains` filter becomes an SQL LIKE/ILIKE pattern, where "%" and "_" are wildcards
// and "\" is the escape character. Escape them so customer text is matched literally.
export function escapeLikePattern(text) {
  return String(text).replace(/[\\%_]/g, (character) => `\\${character}`);
}
