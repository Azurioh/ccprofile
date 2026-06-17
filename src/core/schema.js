// @ts-check

const KNOWN_KEYS = new Set(['description', 'extends', 'plugins', 'skills', 'meta']);
const ARRAY_KEYS = ['extends', 'plugins', 'skills'];

/**
 * @param {*} obj
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateProfile(obj) {
  const errors = [];
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    return { valid: false, errors: ['profil: doit être un objet JSON'] };
  }
  for (const key of ARRAY_KEYS) {
    if (key in obj) {
      if (!Array.isArray(obj[key])) {
        errors.push(`${key}: doit être un tableau`);
      } else if (!obj[key].every((x) => typeof x === 'string')) {
        errors.push(`${key}: doit contenir uniquement des chaînes`);
      }
    }
  }
  if ('description' in obj && typeof obj.description !== 'string') {
    errors.push('description: doit être une chaîne');
  }
  for (const key of Object.keys(obj)) {
    if (!KNOWN_KEYS.has(key)) {
      errors.push(`clé inconnue: ${key}`);
    }
  }
  return { valid: errors.length === 0, errors };
}
