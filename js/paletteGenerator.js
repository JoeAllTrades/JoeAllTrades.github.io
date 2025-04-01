// js/paletteGenerator.js
import { getInterpolator } from './interpolation.js';
// Можно импортировать и config, если нужны константы, но пока не обязательно
// import { INTERPOLATION_METHODS } from './config.js';

/**
 * Генерирует двумерный массив HEX-цветов палитры.
 *
 * @param {object} options - Параметры генерации.
 * @param {string} options.leftColor - Левый цвет (#RRGGBB).
 * @param {string} options.rightColor - Правый цвет (#RRGGBB).
 * @param {string} options.topColor - Верхний цвет (#RRGGBB), используется если useVertical=true.
 * @param {string} options.bottomColor - Нижний цвет (#RRGGBB), используется если useVertical=true.
 * @param {number} options.hLevels - Количество горизонтальных уровней (столбцов). Должно быть >= 1.
 * @param {number} options.vSteps - Количество вертикальных шагов ОТ центральной линии (используется если useVertical=true). Должно быть >= 1.
 * @param {string} options.method - Имя метода интерполяции ('rgb', 'hsl', 'lab', 'hct').
 * @param {boolean} options.useVertical - Использовать ли вертикальную (4-цветную) интерполяцию.
 * @returns {Array<Array<string>>} Двумерный массив с HEX-кодами цветов палитры. Возвращает пустой массив при некорректных параметрах.
 */
export function generatePaletteData({
    leftColor,
    rightColor,
    topColor = '#ffffff', // Значения по умолчанию на случай отсутствия
    bottomColor = '#000000',
    hLevels,
    vSteps = 1, // Минимальное значение шага
    method,
    useVertical
}) {
    // Базовая валидация входных данных
    if (hLevels < 1 || (useVertical && vSteps < 1)) {
        console.error("Invalid levels for palette generation:", { hLevels, vSteps, useVertical });
        return []; // Возвращаем пустой массив при невалидных уровнях
    }
    if (!leftColor || !rightColor || (useVertical && (!topColor || !bottomColor))) {
        console.error("Missing required colors for palette generation.");
        return [];
    }

    const interpolator = getInterpolator(method); // Получаем нужную функцию интерполяции
    const paletteData = [];

    // --- 1. Генерация Базовой Горизонтальной Линии ---
    const horizontalRow = [];
    for (let j = 0; j < hLevels; j++) {
        // Коэффициент интерполяции t от 0 до 1
        // Если уровень один, берем среднее (или просто начальный/конечный? Логичнее среднее или сам цвет, но для градиента 0..1 лучше)
        // Исправлено: для hLevels=1 t должен быть 0.5, чтобы получить средний цвет,
        // но так как у нас min=2 в UI, можно использовать стандартную формулу.
        // При hLevels=2, t будет 0 и 1. При hLevels=3, t будет 0, 0.5, 1.
        const t_h = hLevels <= 1 ? 0.5 : j / (hLevels - 1);
        try {
            const color = interpolator(leftColor, rightColor, t_h);
            horizontalRow.push(color);
        } catch (error) {
            // Эта ошибка маловероятна, так как interpolator должен иметь fallback, но на всякий случай
            console.error(`Error interpolating horizontal row at index ${j} (t=${t_h}):`, error);
            horizontalRow.push('#FF00FF'); // Пурпурный - индикатор ошибки
        }
    }

    // --- 2. Генерация Полной Сетки (если включена вертикальная интерполяция) ---
    if (useVertical) {
        const vLevelsTotal = (vSteps * 2) + 1; // Общее количество строк
        const midIndex = vSteps; // Индекс центральной строки (0-based)

        // Инициализация двумерного массива
        for (let i = 0; i < vLevelsTotal; i++) {
            paletteData.push(new Array(hLevels).fill('#CCCCCC')); // Заполняем временным цветом
        }

        // Проходим по каждому столбцу (j) и интерполируем вертикально
        for (let j = 0; j < hLevels; j++) {
            const baseColor = horizontalRow[j]; // Цвет из центральной линии для этого столбца

            for (let i = 0; i < vLevelsTotal; i++) { // Проходим по строкам (i)
                let finalColor;
                if (i === midIndex) {
                    // Центральная строка - берем цвет из horizontalRow
                    finalColor = baseColor;
                } else {
                    let startColor, endColor, t_v;

                    if (i < midIndex) {
                        // Верхняя половина: от TopColor к BaseColor
                        startColor = topColor;
                        endColor = baseColor;
                        // t_v идет от 0 (у topColor) до почти 1 (перед baseColor)
                        // Например, если vSteps=2, midIndex=2. Строки 0, 1.
                        // i=0: t_v = 0 / 2 = 0
                        // i=1: t_v = 1 / 2 = 0.5
                        t_v = i / midIndex;
                    } else {
                        // Нижняя половина: от BaseColor к BottomColor
                        startColor = baseColor;
                        endColor = bottomColor;
                        // t_v идет от >0 (сразу после baseColor) до 1 (у bottomColor)
                        // Например, если vSteps=2, midIndex=2. Строки 3, 4.
                        // i=3: stepNum = 3 - 2 = 1. t_v = 1 / 2 = 0.5
                        // i=4: stepNum = 4 - 2 = 2. t_v = 2 / 2 = 1.0
                        const stepNum = i - midIndex; // Номер шага от центра (1, 2, ...)
                        t_v = stepNum / vSteps; // vSteps - количество шагов в одной половине
                    }

                    try {
                         // Выполняем вертикальную интерполяцию
                        finalColor = interpolator(startColor, endColor, t_v);
                    } catch (error) {
                         console.error(`Error interpolating vertical column ${j} at row index ${i} (t_v=${t_v}):`, error);
                         finalColor = '#FF00FF'; // Пурпурный - индикатор ошибки
                    }
                }
                paletteData[i][j] = finalColor; // Записываем цвет в сетку
            }
        }
    } else {
        // Если вертикальная интерполяция выключена, палитра - это просто одна строка
        paletteData.push(horizontalRow);
    }

    return paletteData;
}