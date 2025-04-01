// js/interpolation.js
import { lerp, hexToRgb, rgbToHex } from './utils.js';
import { INTERPOLATION_METHODS } from './config.js';

// --- Зависимости от внешних библиотек ---
// Эти переменные будут инициализированы в main.js
let Color; // Ссылка на конструктор Color.js
let Hct, argbFromHex, hexFromArgb; // Для Material Color Utilities

/**
 * Инициализация модуля интерполяции с необходимыми библиотеками.
 * @param {object} libs - Объект с загруженными библиотеками.
 * @param {object} libs.colorjs - Ссылка на библиотеку Color.js (window.Color).
 * @param {object} libs.materialColor - Ссылка на MaterialColorUtilities.
 */
export function initializeInterpolation(libs) {
    // Проверяем Color.js
    if (!libs || !libs.colorjs) {
        console.warn("Interpolation module requires Color.js library.");
        // RGB интерполяция все еще может работать
    } else {
        Color = libs.colorjs; // Сохраняем конструктор
        console.log("Interpolation module initialized with Color.js.");
    }

    // Проверяем Material Color Utilities
    if (!libs || !libs.materialColor) {
        console.warn("Interpolation module requires Material Color Utilities for HCT.");
    } else {
        // Деструктуризация Hct и функций для работы с ним
        ({ Hct, argbFromHex, hexFromArgb } = libs.materialColor);
        console.log("Interpolation module initialized with Material Color Utilities.");
    }

    // Возвращаем true, если хотя бы Color.js загружен (для HSL/LAB)
    // или если загружено все для HCT.
    // Если ничего не загружено, RGB все равно будет работать как fallback.
    return !!(Color || (Hct && argbFromHex && hexFromArgb));
}

// --- Функции интерполяции ---

/**
 * RGB интерполяция (без изменений).
 */
function interpolateRgb(color1, color2, t) {
    const rgb1 = hexToRgb(color1);
    const rgb2 = hexToRgb(color2);
    const r = lerp(rgb1.r, rgb2.r, t);
    const g = lerp(rgb1.g, rgb2.g, t);
    const b = lerp(rgb1.b, rgb2.b, t);
    return rgbToHex({ r, g, b });
}

/**
 * Общая функция для интерполяции через Color.js (HSL, Lab).
 * @param {string} color1 - Начальный цвет (HEX).
 * @param {string} color2 - Конечный цвет (HEX).
 * @param {number} t - Фактор интерполяции (0-1).
 * @param {string} space - Цветовое пространство Color.js ('hsl', 'lab').
 * @returns {string} Интерполированный цвет (HEX) или RGB интерполяция при ошибке.
 */
function interpolateWithColorJs(color1, color2, t, space) {
    if (!Color) { // Проверяем, была ли библиотека инициализирована
        console.error(`Color.js library not initialized. Falling back to RGB for ${space}.`);
        return interpolateRgb(color1, color2, t);
    }
    try {
        // Создаем объекты Color.js
        const c1 = new Color(color1);
        const c2 = new Color(color2);

        // Создаем функцию диапазона (range)
        // 'outputSpace: "srgb"' важно, чтобы результат был в стандартном RGB
        // перед конвертацией в HEX, даже если интерполяция была в Lab.
        const range = c1.range(c2, {
            space: space,      // Пространство для интерполяции
            outputSpace: "srgb" // Пространство для вывода результата
        });

        // Получаем интерполированный цвет как объект Color.js
        const interpolatedColor = range(t);

        // Конвертируем в HEX и проверяем на валидность (хотя color.js обычно надежен)
        const hexResult = interpolatedColor.toString({ format: "hex" });

        if (hexResult && typeof hexResult === 'string' && /^#([0-9A-F]{6})$/i.test(hexResult)) {
            return hexResult.toLowerCase(); // Приводим к нижнему регистру для единообразия
        } else {
             console.warn(`Color.js interpolation (${space}) produced invalid HEX '${hexResult}' for t=${t}. Falling back to RGB.`);
             return interpolateRgb(color1, color2, t);
        }

    } catch (error) {
        console.error(`Color.js interpolation error (${space}) for ${color1} -> ${color2} at t=${t}:`, error, `Falling back to RGB.`);
        // Проверяем, возможно, ошибка была из-за невалидного входного цвета
        if (error.message && (error.message.includes("Unable to parse color") || error.message.includes("Cannot read properties of undefined"))) {
             console.error(" ^^^ This might be due to an invalid input color string.");
        }
        return interpolateRgb(color1, color2, t);
    }
}

/**
 * HSL интерполяция (через Color.js).
 */
function interpolateHsl(color1, color2, t) {
    // Используем 'hsl' как пространство для интерполяции в Color.js
    return interpolateWithColorJs(color1, color2, t, 'hsl');
}

/**
 * CIELAB интерполяция (через Color.js).
 */
function interpolateLab(color1, color2, t) {
    // Используем 'lab' как пространство для интерполяции в Color.js
    return interpolateWithColorJs(color1, color2, t, 'lab');
}

/**
 * HCT интерполяция (через Material Color Utilities - без изменений).
 */
function interpolateHct(color1, color2, t) {
     if (!Hct || !argbFromHex || !hexFromArgb) {
         console.error("Material Color Utilities (HCT) not fully initialized. Falling back to RGB.");
         return interpolateRgb(color1, color2, t);
     }
     try {
        const argb1 = argbFromHex(color1);
        const argb2 = argbFromHex(color2);
        const hct1 = Hct.fromInt(argb1);
        const hct2 = Hct.fromInt(argb2);
        const hue1 = hct1.hue;
        const hue2 = hct2.hue;
        let deltaHue = hue2 - hue1;
        if (Math.abs(deltaHue) > 180.0) {
            deltaHue -= Math.sign(deltaHue) * 360.0;
        }
        const hue = (hue1 + deltaHue * t + 360.0) % 360.0;
        const chroma = lerp(hct1.chroma, hct2.chroma, t);
        const tone = lerp(hct1.tone, hct2.tone, t);
        const safeChroma = Math.max(0, chroma);
        const safeTone = Math.max(0, Math.min(100, tone));
        const interpolatedHct = Hct.from(hue, safeChroma, safeTone);
        const finalArgb = interpolatedHct.toInt();
        return hexFromArgb(finalArgb);
     } catch (error) {
        console.error(`HCT interpolation error for ${color1} -> ${color2} at t=${t}:`, error, `Falling back to RGB.`);
        return interpolateRgb(color1, color2, t);
     }
}

// --- Выбор функции интерполяции (обновлен) ---

const interpolators = {
    [INTERPOLATION_METHODS.RGB]: interpolateRgb,
    [INTERPOLATION_METHODS.HSL]: interpolateHsl, // Теперь вызывает interpolateWithColorJs
    [INTERPOLATION_METHODS.LAB]: interpolateLab, // Теперь вызывает interpolateWithColorJs
    [INTERPOLATION_METHODS.HCT]: interpolateHct, // Без изменений
};

/**
 * Возвращает функцию интерполяции по её имени.
 * @param {string} methodName - Имя метода (из INTERPOLATION_METHODS).
 * @returns {Function} Функция интерполяции (color1, color2, t) => hexColor.
 */
export function getInterpolator(methodName) {
    const interpolator = interpolators[methodName];
    if (!interpolator) {
        console.warn(`Interpolator for method "${methodName}" not found. Using RGB as default.`);
        return interpolateRgb;
    }
    // Дополнительная проверка: если выбран HSL или LAB, но Color.js не загрузился, вернем RGB
    if ((methodName === INTERPOLATION_METHODS.HSL || methodName === INTERPOLATION_METHODS.LAB) && !Color) {
         console.warn(`Color.js not loaded, cannot use ${methodName} interpolation. Falling back to RGB.`);
         return interpolateRgb;
    }
     // Дополнительная проверка: если выбран HCT, но MCU не загрузился, вернем RGB
    if (methodName === INTERPOLATION_METHODS.HCT && (!Hct || !argbFromHex || !hexFromArgb)) {
         console.warn(`Material Color Utilities not loaded, cannot use ${methodName} interpolation. Falling back to RGB.`);
         return interpolateRgb;
    }
    return interpolator;
}