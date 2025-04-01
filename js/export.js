// js/export.js
import { isValidPalette, hexToRgb } from './utils.js';
import { EXPORT_DEFAULTS } from './config.js'; // Импортируем настройки экспорта

// --- Зависимости от внешних библиотек ---
// Переменная для конструктора jsPDF, будет установлена в main.js
let jsPDF;

/**
 * Инициализация модуля экспорта ссылкой на конструктор jsPDF.
 * @param {object} libs - Объект с загруженными библиотеками.
 * @param {object} libs.jsPDFConstructor - Ссылка на конструктор jsPDF (window.jspdf.jsPDF).
 */
export function initializeExport(libs) {
    if (!libs || !libs.jsPDFConstructor) {
        console.warn("jsPDF library not provided to export module. PDF export disabled.");
        jsPDF = null; // Убедимся, что переменная null, если библиотека не передана
        return false;
    }
    jsPDF = libs.jsPDFConstructor;
    console.log("Export module initialized with jsPDF.");
    return true;
}

/**
 * Генерирует и скачивает SVG файл палитры.
 * @param {Array<Array<string>>} paletteData - Двумерный массив HEX-цветов.
 */
export function exportSVG(paletteData) {
    if (!isValidPalette(paletteData)) {
        alert("Cannot export: Please generate a valid palette first.");
        return;
    }

    const numRows = paletteData.length;
    const numCols = paletteData[0].length;
    // Используем константы из config.js
    const cellSize = EXPORT_DEFAULTS.SVG_CELL_SIZE;
    const gap = EXPORT_DEFAULTS.SVG_GAP;

    // Рассчитываем общие размеры SVG
    const width = numCols * cellSize + Math.max(0, numCols - 1) * gap;
    const height = numRows * cellSize + Math.max(0, numRows - 1) * gap;

    // Начинаем формировать SVG строку
    let svgContent = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">\n`;
    // Можно добавить <style> или <defs> при необходимости
    svgContent += `  <defs>\n    <style>\n      /* Optional CSS styles for SVG */\n    </style>\n  </defs>\n`;
    svgContent += `  <rect width="100%" height="100%" fill="#ffffff"/>\n`; // Белый фон (опционально)

    // Добавляем прямоугольники для каждой ячейки
    paletteData.forEach((row, r) => {
        row.forEach((color, c) => {
            const x = c * (cellSize + gap);
            const y = r * (cellSize + gap);

            // Проверка валидности цвета, используем серый как fallback
            const validColor = typeof color === 'string' && /^#([0-9A-F]{3}){1,2}$/i.test(color);
            const fillColor = validColor ? color : '#CCCCCC'; // Используем серый для невалидных

            // Добавляем <rect> с закругленными углами (rx, ry)
            svgContent += `  <rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" fill="${fillColor}" rx="4" ry="4"/>\n`;
        });
    });

    svgContent += `</svg>`; // Закрываем тег svg

    // Создаем Blob и ссылку для скачивания
    try {
        const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'huecraft_palette.svg'; // Имя файла
        document.body.appendChild(a); // Нужно для Firefox
        a.click();
        document.body.removeChild(a); // Убираем ссылку
        URL.revokeObjectURL(url); // Освобождаем память
    } catch (error) {
        console.error("Error exporting SVG:", error);
        alert("Could not export SVG. Check console for details.");
    }
}

/**
 * Генерирует и скачивает PDF файл палитры с пагинацией.
 * @param {Array<Array<string>>} paletteData - Двумерный массив HEX-цветов.
 */
export function exportPDF(paletteData) {
    // Проверяем, инициализирована ли библиотека jsPDF
    if (!jsPDF) {
        alert("PDF Export is not available. jsPDF library failed to load.");
        return;
    }
    if (!isValidPalette(paletteData)) {
        alert("Cannot export: Please generate a valid palette first.");
        return;
    }

    try {
        // Создаем PDF документ (ландшафтная ориентация, единицы - пункты)
        const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt' });

        const pageHeight = pdf.internal.pageSize.getHeight();
        const pageWidth = pdf.internal.pageSize.getWidth();
        // Используем константы из config.js
        const margin = EXPORT_DEFAULTS.PDF_MARGIN;
        const cellGap = EXPORT_DEFAULTS.PDF_GAP;
        const minCellSize = EXPORT_DEFAULTS.PDF_MIN_CELL_SIZE; // Мин. размер для отображения текста

        // Доступная область для рисования на странице
        const usableWidth = pageWidth - 2 * margin;
        const usableHeight = pageHeight - 2 * margin;

        const numRows = paletteData.length;
        const numCols = paletteData[0].length;

        // --- Пагинация ---
        // Рассчитываем, сколько ячеек помещается на одну страницу
        // Делаем + cellGap, чтобы учесть промежуток "после" последней ячейки при делении
        const maxColsPerPage = Math.max(1, Math.floor((usableWidth + cellGap) / (minCellSize + cellGap)));
        const maxRowsPerPage = Math.max(1, Math.floor((usableHeight + cellGap) / (minCellSize + cellGap)));

        let pageNumber = 0;

        // Циклы для обхода блоков палитры, которые помещаются на одну страницу
        for (let startRow = 0; startRow < numRows; startRow += maxRowsPerPage) {
            for (let startCol = 0; startCol < numCols; startCol += maxColsPerPage) {
                pageNumber++;
                if (pageNumber > 1) {
                    pdf.addPage(); // Добавляем новую страницу для следующего блока
                }

                // Определяем границы текущего блока ячеек
                const endRow = Math.min(startRow + maxRowsPerPage, numRows);
                const endCol = Math.min(startCol + maxColsPerPage, numCols);
                const colsOnThisPage = endCol - startCol;
                const rowsOnThisPage = endRow - startRow;

                // --- Расчет размера ячеек для текущей страницы ---
                // Доступное пространство для самих ячеек (без gap'ов)
                const availableWidthForCells = usableWidth - Math.max(0, colsOnThisPage - 1) * cellGap;
                const availableHeightForCells = usableHeight - Math.max(0, rowsOnThisPage - 1) * cellGap;

                // Размер ячейки, чтобы вписать блок в usableWidth/Height
                const cellWidth = availableWidthForCells / colsOnThisPage;
                const cellHeight = availableHeightForCells / rowsOnThisPage;
                // Берем минимальный размер, чтобы ячейки были квадратными и не выходили за границы
                const cellSize = Math.max(1, Math.min(cellWidth, cellHeight));

                // --- Центрирование сетки на странице ---
                // Фактический размер сетки на этой странице
                const actualGridWidth = colsOnThisPage * cellSize + Math.max(0, colsOnThisPage - 1) * cellGap;
                const actualGridHeight = rowsOnThisPage * cellSize + Math.max(0, rowsOnThisPage - 1) * cellGap;
                // Отступы для центрирования
                const pageStartX = margin + Math.max(0, (usableWidth - actualGridWidth) / 2);
                const pageStartY = margin + Math.max(0, (usableHeight - actualGridHeight) / 2);

                // --- Рисование ячеек на текущей странице ---
                const fontSize = Math.max(4, Math.min(8, cellSize * 0.15)); // Адаптивный размер шрифта
                pdf.setFontSize(fontSize);

                for (let r = startRow; r < endRow; r++) {
                    for (let c = startCol; c < endCol; c++) {
                        const color = paletteData[r][c];
                        const pageRow = r - startRow; // Индекс строки на текущей странице (0-based)
                        const pageCol = c - startCol; // Индекс колонки на текущей странице (0-based)

                        // Координаты ячейки на странице
                        const x = pageStartX + pageCol * (cellSize + cellGap);
                        const y = pageStartY + pageRow * (cellSize + cellGap);

                        // Валидация цвета
                        const validColor = typeof color === 'string' && /^#([0-9A-F]{3}){1,2}$/i.test(color);
                        const fillColor = validColor ? color : '#CCCCCC';

                        // Устанавливаем цвет заливки и рисуем прямоугольник
                        pdf.setFillColor(fillColor);
                        pdf.rect(x, y, cellSize, cellSize, 'F'); // 'F' - fill

                        // Добавляем текст (HEX-код), если ячейка достаточно большая
                        if (cellSize >= minCellSize) {
                            const rgb = hexToRgb(fillColor);
                            // Выбираем цвет текста (черный или белый) для контраста
                            const luminance = 0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b;
                            pdf.setTextColor(luminance > 128 ? '#000000' : '#FFFFFF');
                            // Выравниваем текст по центру ячейки
                            pdf.text(fillColor.toUpperCase(), x + cellSize / 2, y + cellSize / 2, { align: 'center', baseline: 'middle' });
                        }
                    }
                }

                // --- Добавляем номер страницы ---
                pdf.setFontSize(8);
                pdf.setTextColor('#888888'); // Серый цвет
                pdf.text(`Page ${pageNumber}`, pageWidth / 2, pageHeight - margin / 2, { align: 'center' });
            }
        }

        // Сохраняем PDF файл
        pdf.save('huecraft_palette.pdf');

    } catch (error) {
        console.error("Error exporting PDF:", error);
        alert("Could not export PDF. Check console for details.");
    }
}