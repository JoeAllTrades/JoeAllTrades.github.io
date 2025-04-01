// js/utils.js

/**
 * Линейная интерполяция между двумя числами.
 * @param {number} a - Начальное значение.
 * @param {number} b - Конечное значение.
 * @param {number} t - Фактор интерполяции (0.0 до 1.0).
 * @returns {number} Интерполированное значение.
 */
export function lerp(a, b, t) {
    t = Math.max(0, Math.min(1, t));
    return a * (1 - t) + b * t;
}

/**
 * Конвертирует HEX строку в RGB объект.
 * Возвращает {r: 255, g: 0, b: 255} (пурпурный) при ошибке.
 * @param {string} hex - Цвет в формате #RRGGBB или #RGB.
 * @returns {{r: number, g: number, b: number} | null} RGB объект или null при ошибке.
 */
export function hexToRgb(hex) {
    // Небольшое изменение: возвращаем null при ошибке для более четкой проверки
    if (!hex || typeof hex !== 'string' || !hex.startsWith('#')) return null;
    let sanitizedHex = hex;
    if (sanitizedHex.length === 4) {
        sanitizedHex = '#' + sanitizedHex[1] + sanitizedHex[1] + sanitizedHex[2] + sanitizedHex[2] + sanitizedHex[3] + sanitizedHex[3];
    }
    if (!/^#[0-9A-F]{6}$/i.test(sanitizedHex)) return null;
    const bigint = parseInt(sanitizedHex.slice(1), 16);
    if (isNaN(bigint)) return null;
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return { r, g, b };
}

/**
 * Конвертирует RGB объект в HEX строку.
 * @param {{r: number, g: number, b: number}} rgb - RGB объект.
 * @returns {string} Цвет в формате #rrggbb.
 */
export function rgbToHex(rgb) {
    const r = Math.max(0, Math.min(255, Math.round(rgb.r || 0)));
    const g = Math.max(0, Math.min(255, Math.round(rgb.g || 0)));
    const b = Math.max(0, Math.min(255, Math.round(rgb.b || 0)));
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toLowerCase();
}

/**
 * Проверяет, является ли палитра валидным двумерным массивом.
 * @param {Array<Array<string>>} palette - Данные палитры.
 * @returns {boolean} True, если палитра валидна.
 */
export function isValidPalette(palette) {
    return palette && Array.isArray(palette) && palette.length > 0 && Array.isArray(palette[0]) && palette[0].length > 0;
}

/**
 * Добавлено: Определяет, является ли HEX-цвет темным.
 * Используется для переключения классов темы.
 * @param {string} hexColor - Цвет в HEX формате.
 * @returns {boolean} True, если цвет темный.
 */
export function isColorDark(hexColor) {
    const rgb = hexToRgb(hexColor); // Используем нашу утилиту
    if (!rgb) return false; // Если цвет невалидный, считаем светлым
    // Формула яркости (luma), стандартный порог 128
    const luma = 0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b;
    return luma < 128;
}