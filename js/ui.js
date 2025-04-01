// js/ui.js
import { isValidPalette, hexToRgb, isColorDark } from './utils.js'; // Импортируем утилиты, включая isColorDark

// --- DOM Element References (получим их в main.js и передадим сюда) ---
let domElements = {};
// Ссылка на объект Telegram WebApp (будет передана из main.js)
let WebApp = null;

// --- State Variables ---
let notificationTimeout = null;

/**
 * Инициализация UI модуля ссылками на DOM элементы и объект WebApp.
 * @param {object} elements - Объект с ссылками на DOM элементы.
 * @param {object | null} webAppInstance - Экземпляр window.Telegram.WebApp или null.
 */
export function initializeUI(elements, webAppInstance) {
    domElements = elements; // Сохраняем ссылки
    WebApp = webAppInstance; // Сохраняем ссылку на WebApp SDK
    console.log("UI module initialized.");
    if (WebApp) {
        console.log("Telegram WebApp SDK available in UI module.");
    }
}

/**
 * Обновляет текстовое значение рядом со слайдером.
 * @param {HTMLInputElement} sliderElement - Элемент слайдера.
 * @param {HTMLSpanElement} spanElement - Элемент span для отображения значения.
 */
export function updateSliderValueDisplay(sliderElement, spanElement) {
    if (sliderElement && spanElement) {
        spanElement.textContent = sliderElement.value;
    }
}

/**
 * Переключает видимость контролов для вертикальной/4-цветной интерполяции.
 * @param {boolean} showVertical - Показывать ли вертикальные контролы.
 */
export function toggleVerticalControlsUI(showVertical) {
    if (domElements.verticalSliderGroup && domElements.verticalColorPickers && domElements.body) {
        domElements.body.classList.toggle('vertical-mode-enabled', showVertical);
        domElements.verticalSliderGroup.style.display = showVertical ? 'block' : 'none';
    } else {
        console.error("Could not find elements needed to toggle vertical controls UI.");
    }
}

/**
 * Отображает сообщение внутри сетки палитры (например, при ошибке или при запуске).
 * @param {string} message - Текст сообщения.
 */
export function displayPaletteMessage(message) {
    const grid = domElements.paletteGrid;
    if (!grid) return;
    grid.innerHTML = '';
    grid.style.gridTemplateColumns = '1fr';
    grid.style.gridTemplateRows = 'auto';
    grid.style.width = 'auto';
    grid.style.height = 'auto';
    const msgCell = document.createElement('div');
    msgCell.textContent = message;
    msgCell.style.display = 'flex';
    msgCell.style.alignItems = 'center';
    msgCell.style.justifyContent = 'center';
    msgCell.style.color = 'var(--tg-theme-hint-color, #6c757d)'; // Используем цвет подсказки темы
    msgCell.style.fontSize = '1rem';
    msgCell.style.padding = '2rem';
    msgCell.style.minHeight = '100px';
    msgCell.style.textAlign = 'center';
    msgCell.style.gridColumn = '1 / -1';
    msgCell.style.gridRow = '1 / -1';
    grid.appendChild(msgCell);
}

/**
 * Рендерит палитру в DOM на основе предоставленных данных.
 * @param {Array<Array<string>>} paletteData - Двумерный массив HEX-цветов.
 * @param {Function} onCellClick - Callback функция, вызываемая при клике на ячейку (передает цвет).
 */
export function renderPalette(paletteData, onCellClick) {
    const grid = domElements.paletteGrid;
    const gridContainer = domElements.paletteGridContainer;
    if (!grid || !gridContainer) {
        console.error("Palette grid or container element not found.");
        return;
    }
    grid.innerHTML = '';
    if (!isValidPalette(paletteData)) {
        displayPaletteMessage("Adjust settings to generate the palette.");
        return;
    }
    const numRows = paletteData.length;
    const numCols = paletteData[0].length;
    const containerStyle = getComputedStyle(gridContainer);
    const gridStyle = getComputedStyle(grid);
    const containerPaddingX = parseFloat(containerStyle.paddingLeft) + parseFloat(containerStyle.paddingRight);
    const containerPaddingY = parseFloat(containerStyle.paddingTop) + parseFloat(containerStyle.paddingBottom);
    const availableWidth = gridContainer.clientWidth - containerPaddingX;
    const availableHeight = gridContainer.clientHeight - containerPaddingY;
    const gap = parseFloat(gridStyle.gap) || 0;
    const totalGapWidth = Math.max(0, numCols - 1) * gap;
    const totalGapHeight = Math.max(0, numRows - 1) * gap;
    const potentialCellWidth = (availableWidth - totalGapWidth) / numCols;
    const potentialCellHeight = (availableHeight - totalGapHeight) / numRows;
    let cellSize = Math.floor(Math.min(potentialCellWidth, potentialCellHeight));
    cellSize = Math.max(1, cellSize);
    grid.style.gridTemplateColumns = `repeat(${numCols}, ${cellSize}px)`;
    grid.style.gridTemplateRows = `repeat(${numRows}, ${cellSize}px)`;
    const totalGridWidthActual = numCols * cellSize + totalGapWidth;
    const totalGridHeightActual = numRows * cellSize + totalGapHeight;
    grid.style.width = `${totalGridWidthActual}px`;
    grid.style.height = `${totalGridHeightActual}px`;
    const fragment = document.createDocumentFragment();
    paletteData.forEach((row, rowIndex) => {
        if (!Array.isArray(row)) { console.warn(`Row ${rowIndex} is not an array:`, row); return; }
        row.forEach((color, colIndex) => {
            const cell = document.createElement('div');
            cell.classList.add('color-cell');
            const validColor = typeof color === 'string' && /^#([0-9A-F]{3}){1,2}$/i.test(color);
            if (validColor) {
                const hexColor = color.toUpperCase();
                cell.style.backgroundColor = hexColor;
                cell.title = `Click to copy ${hexColor}`;
                cell.dataset.color = hexColor;
                if (typeof onCellClick === 'function') {
                    cell.addEventListener('click', (e) => {
                        e.stopPropagation();
                        onCellClick(hexColor); // Вызываем callback из main.js
                    });
                }
            } else {
                cell.style.backgroundColor = '#CCCCCC';
                cell.title = `Invalid Color Data (r:${rowIndex}, c:${colIndex})`;
                cell.style.cursor = 'not-allowed';
                console.warn(`Invalid color value at [${rowIndex}][${colIndex}]:`, color);
            }
            fragment.appendChild(cell);
        });
    });
    grid.appendChild(fragment);
}


/**
 * Показывает всплывающее уведомление (например, о копировании).
 * @param {string} message - Текст уведомления.
 * @param {boolean} [isError=false] - Является ли уведомление сообщением об ошибке (для стилизации).
 */
export function showCopyNotification(message, isError = false) {
    const notificationElement = domElements.copyNotificationElement;
    if (!notificationElement) return;
    if (notificationTimeout) { clearTimeout(notificationTimeout); notificationTimeout = null; }
    notificationElement.textContent = message;
    // Меняем класс для стилизации ошибки через CSS
    notificationElement.classList.toggle('error', isError);
    notificationElement.classList.add('show');
    notificationTimeout = setTimeout(() => {
        notificationElement.classList.remove('show');
        // Убираем класс ошибки после скрытия
        setTimeout(() => notificationElement.classList.remove('error'), 300);
    }, 2000);
}

/**
 * Логика копирования цвета в буфер обмена с использованием Haptic Feedback.
 * @param {string} colorHex - HEX-код цвета для копирования.
 */
export async function copyColorToClipboard(colorHex) {
    if (!navigator.clipboard) {
        console.warn("Clipboard API not available.");
        showCopyNotification("Clipboard API not supported", true);
        if (WebApp && WebApp.HapticFeedback) {
            WebApp.HapticFeedback.notificationOccurred('error');
        }
        return;
    }
    try {
        await navigator.clipboard.writeText(colorHex);
        console.log(`Copied ${colorHex} to clipboard.`);
        showCopyNotification(`Copied ${colorHex}!`);
        if (WebApp && WebApp.HapticFeedback) {
            // Вибрация успеха
            WebApp.HapticFeedback.notificationOccurred('success');
        }
    } catch (err) {
        console.error('Failed to copy color: ', err);
        showCopyNotification("Failed to copy!", true);
        if (WebApp && WebApp.HapticFeedback) {
            // Вибрация ошибки
            WebApp.HapticFeedback.notificationOccurred('error');
        }
    }
}

/**
 * Добавлено: Применяет цвета темы Telegram к CSS переменным и body.
 * @param {object} themeParams - Объект themeParams из Telegram WebApp SDK.
 */
export function applyTelegramTheme(themeParams) {
    if (!themeParams || !document.documentElement) return;
    console.log("Applying Telegram theme:", themeParams);

    const root = document.documentElement;
    const body = domElements.body;

    // Функция для конвертации HEX в RGB строку 'R, G, B' для rgba()
    const hexToRgbString = (hex) => {
        const rgb = hexToRgb(hex);
        return rgb ? `${rgb.r}, ${rgb.g}, ${rgb.b}` : null;
    };

    // Установка CSS переменных
    root.style.setProperty('--tg-theme-bg-color', themeParams.bg_color || '#ffffff');
    root.style.setProperty('--tg-theme-text-color', themeParams.text_color || '#000000');
    root.style.setProperty('--tg-theme-hint-color', themeParams.hint_color || '#aaaaaa');
    root.style.setProperty('--tg-theme-link-color', themeParams.link_color || '#2481cc');
    root.style.setProperty('--tg-theme-button-color', themeParams.button_color || '#5288c1');
    root.style.setProperty('--tg-theme-button-text-color', themeParams.button_text_color || '#ffffff');
    root.style.setProperty('--tg-theme-secondary-bg-color', themeParams.secondary_bg_color || '#f1f1f1');

    // Установка RGB версий для использования в rgba() (например, для box-shadow)
    const linkRgb = hexToRgbString(themeParams.link_color || '#2481cc');
    if (linkRgb) {
        root.style.setProperty('--tg-theme-link-rgb', linkRgb);
    } else {
         root.style.removeProperty('--tg-theme-link-rgb');
    }
    const buttonRgb = hexToRgbString(themeParams.button_color || '#5288c1');
     if (buttonRgb) {
        root.style.setProperty('--tg-theme-button-rgb', buttonRgb);
    } else {
        root.style.removeProperty('--tg-theme-button-rgb');
    }


    // Установка класса темы на body
    if (body && themeParams.bg_color) {
        const isDark = isColorDark(themeParams.bg_color);
        body.classList.toggle('dark-theme', isDark);
        body.classList.toggle('light-theme', !isDark);
        // Можно добавить общий класс, что мы в TMA
        body.classList.add('tma-active');
    }

    // Обновление цвета header и фона (если доступно)
    if (WebApp && WebApp.setHeaderColor) {
         WebApp.setHeaderColor(themeParams.secondary_bg_color || themeParams.bg_color || '#ffffff');
    }
     if (WebApp && WebApp.setBackgroundColor) {
         WebApp.setBackgroundColor(themeParams.bg_color || '#ffffff');
    }
}