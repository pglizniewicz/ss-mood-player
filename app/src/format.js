/**
 * Locale-aware formatting for the Polish interface, built on `Intl` rather than hand-rolled.
 */

const LOCALE = "pl";

const pluralRules = new Intl.PluralRules(LOCALE);
const numberFormats = new Map();

/**
 * @param {number} digits fraction digits to show
 * @returns {Intl.NumberFormat} a cached formatter
 */
const numberFormat = digits => {
    const cached = numberFormats.get(digits);
    if (cached) return cached;
    const created = new Intl.NumberFormat(LOCALE, {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits
    });
    numberFormats.set(digits, created);
    return created;
};

/**
 * @param {number} value a duration in seconds
 * @param {number} [digits] fraction digits, one by default
 * @returns {string} the duration with its unit
 */
export const seconds = (value, digits = 1) => `${numberFormat(digits).format(value)} s`;

/**
 * @param {number} value the number to format
 * @param {number} [digits] fraction digits, one by default
 * @returns {string} the number in Polish notation
 */
export const decimal = (value, digits = 1) => numberFormat(digits).format(value);

/**
 * Polish needs three plural forms, so the caller supplies them and `Intl.PluralRules` picks.
 *
 * @param {number} count how many
 * @param {{one: string, few: string, many: string}} forms the wording per plural category
 * @returns {string} the matching form
 */
export const plural = (count, forms) => forms[pluralRules.select(count)] ?? forms.many;
