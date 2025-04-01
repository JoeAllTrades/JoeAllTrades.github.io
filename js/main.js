// js/main.js

// --- Импорт Модулей ---
import { INTERPOLATION_METHODS, DEFAULTS } from './config.js';
import { isValidPalette } from './utils.js';
import { initializeInterpolation } from './interpolation.js';
import { generatePaletteData } from './paletteGenerator.js';
import {
    initializeUI,
    renderPalette,
    updateSliderValueDisplay,
    toggleVerticalControlsUI,
    copyColorToClipboard, // Оставляем для ячеек
    displayPaletteMessage,
    applyTelegramTheme
} from './ui.js';
import { initializeExport, exportSVG, exportPDF } from './export.js';

// --- Ссылка на объект Telegram WebApp SDK ---
let WebApp = null;
let isTma = false;

// --- Импорт ES Модуля Material Color Utilities с CDN ---
let materialColorUtilities;
try {
    materialColorUtilities = await import('https://cdn.jsdelivr.net/npm/@material/material-color-utilities@0.3.0/index.js');
    console.log("Material Color Utilities module loaded successfully.");
} catch (error) {
    console.error("Failed to load Material Color Utilities module from CDN:", error);
    materialColorUtilities = null;
    try { displayPaletteMessage("Error loading Material Color Utilities. HCT may not work."); } catch {}
}

// --- Ссылки на Библиотеки (Глобальные переменные из HTML) ---
let jsPDFConstructor = null;
let ColorJsLib = null;
let librariesLoaded = false;

try {
    // Инициализация Telegram WebApp SDK
    if (window.Telegram && window.Telegram.WebApp) {
        WebApp = window.Telegram.WebApp;
        WebApp.ready();
        WebApp.expand();
        isTma = true;
        console.log("Telegram WebApp SDK initialized.");
    } else {
        console.warn("Telegram WebApp SDK not found. Running in browser mode.");
    }

    // Проверка остальных библиотек
    if (window.jspdf && window.jspdf.jsPDF) { jsPDFConstructor = window.jspdf.jsPDF; }
    else { console.error("jsPDF library not found."); }
    if (window.Color) { ColorJsLib = window.Color; }
    else { console.error("Color.js library not found."); }

    // Проверка загрузки всех НЕОБХОДИМЫХ библиотек
    if (jsPDFConstructor && ColorJsLib && materialColorUtilities) {
        console.log("Core libraries (jsPDF, Color.js, Material Color Utilities) loaded successfully.");
        librariesLoaded = true;
    } else {
        let missing = [];
        if (!jsPDFConstructor) missing.push("jsPDF");
        if (!ColorJsLib) missing.push("Color.js");
        if (!materialColorUtilities) missing.push("Material Color Utilities");
        if (missing.length > 0) throw new Error(`Required libraries (${missing.join(', ')}) not found.`);
        else throw new Error(`Required libraries could not be confirmed.`);
    }

} catch (error) {
    console.error("Error accessing libraries or initializing SDK:", error);
    alert(`Error loading libraries/SDK: ${error.message}. Some features might be disabled.`);
    try { displayPaletteMessage(`Error: ${error.message}. App might not function correctly.`); } catch {}
}

// --- DOM Element References ---
const domElements = {
    colorLeftInput: document.getElementById('color-left'),
    colorRightInput: document.getElementById('color-right'),
    colorTopInput: document.getElementById('color-top'),
    colorBottomInput: document.getElementById('color-bottom'),
    horizontalLevelsSlider: document.getElementById('horizontal-levels'),
    horizontalLevelsValueSpan: document.getElementById('horizontal-levels-value'),
    verticalLevelsSlider: document.getElementById('vertical-levels'),
    verticalLevelsValueSpan: document.getElementById('vertical-levels-value'),
    interpolationMethodSelect: document.getElementById('interpolation-method'),
    verticalInterpolationToggle: document.getElementById('vertical-interpolation-toggle'),
    verticalSliderGroup: document.querySelector('.vertical-slider-group'),
    verticalColorPickers: document.querySelectorAll('.vertical-color'),
    paletteGrid: document.getElementById('palette-grid'),
    paletteGridContainer: document.querySelector('.palette-grid-container'),
    exportSvgButton: document.getElementById('export-svg'),
    exportPdfButton: document.getElementById('export-pdf'),
    copyNotificationElement: document.getElementById('copy-notification'),
    body: document.body
};

// --- Проверка DOM ---
function checkDOMelements() {
    const missingElements = Object.entries(domElements)
        .filter(([key, value]) => !value)
        .map(([key]) => key);
    if (missingElements.length > 0) {
        console.error("Essential DOM elements are missing:", missingElements);
        try { displayPaletteMessage(`Initialization Error: Missing DOM elements (${missingElements.join(', ')}).`); } catch {}
        return false;
    }
    if (!domElements.verticalColorPickers || domElements.verticalColorPickers.length === 0) {
         console.warn("Vertical color picker elements (.vertical-color) not found.");
    }
    return true;
}
const domReady = checkDOMelements();

// --- Application State ---
let currentPalette = [];

// --- Инициализация Модулей ---
let modulesInitialized = false;
if (librariesLoaded && domReady) {
    try {
        initializeUI(domElements, WebApp);
        if (isTma && WebApp.themeParams) {
            applyTelegramTheme(WebApp.themeParams);
        }
        const interpolationInitialized = initializeInterpolation({
            colorjs: ColorJsLib,
            materialColor: materialColorUtilities
        });
        const exportInitialized = initializeExport({ jsPDFConstructor: jsPDFConstructor });
        if (!exportInitialized && domElements.exportPdfButton) {
            domElements.exportPdfButton.disabled = true;
            domElements.exportPdfButton.title = "PDF export disabled (jsPDF library not loaded)";
        }
        modulesInitialized = true;
        console.log("All modules initialized.");
    } catch (initError) {
        console.error("Error during module initialization:", initError);
        displayPaletteMessage(`Initialization Error: ${initError.message}.`);
        modulesInitialized = false;
    }
} else {
     console.error("Application cannot start due to missing libraries or DOM elements.");
     if (domElements.exportSvgButton) domElements.exportSvgButton.disabled = true;
     if (domElements.exportPdfButton) domElements.exportPdfButton.disabled = true;
}

// --- Core Application Logic ---
/**
 * Собирает настройки, генерирует и рендерит палитру.
 */
function updateAndRenderPalette() {
    if (!modulesInitialized || !domReady) {
        console.warn("Skipping palette generation: Modules not initialized or DOM not ready.");
        return;
    }
    const settings = {
        leftColor: domElements.colorLeftInput.value,
        rightColor: domElements.colorRightInput.value,
        topColor: domElements.colorTopInput.value,
        bottomColor: domElements.colorBottomInput.value,
        hLevels: parseInt(domElements.horizontalLevelsSlider.value, 10),
        vSteps: parseInt(domElements.verticalLevelsSlider.value, 10),
        method: domElements.interpolationMethodSelect.value,
        useVertical: domElements.verticalInterpolationToggle.checked
    };
    currentPalette = generatePaletteData(settings);
    renderPalette(currentPalette, copyColorToClipboard);

    // ----- ИЗМЕНЕНИЕ ЗДЕСЬ -----
    // Убираем вызов функции настройки Main Button Telegram
    // setupMainButton();
    // ---------------------------
}

// --- Telegram Main Button Logic (Оставляем функции, но не вызываем setup) ---
/** Настраивает основную кнопку Telegram */
function setupMainButton() {
    if (!isTma || !WebApp) return;
    WebApp.MainButton.offClick(handleMainButtonClick); // Снимаем старый обработчик на всякий случай
    if (isValidPalette(currentPalette)) {
        WebApp.MainButton.setText("Export SVG");
        WebApp.MainButton.onClick(handleMainButtonClick);
        WebApp.MainButton.show();
    } else {
        WebApp.MainButton.hide();
    }
}
/** Обработчик клика по Main Button */
function handleMainButtonClick() {
     if (!isValidPalette(currentPalette)) {
         if (WebApp) WebApp.showAlert("Generate a valid palette first.");
         else alert("Generate a valid palette first.");
         return;
     }
     exportSVG(currentPalette);
}

// --- Event Listeners Setup ---
function setupEventListeners() {
     if (!modulesInitialized || !domReady) {
          console.warn("Skipping event listener setup: Modules/DOM not ready.");
          return;
      }
    console.log("Setting up event listeners...");

    // Слушатели для контролов, влияющих на палитру
    const inputsToUpdatePalette = [
        domElements.colorLeftInput, domElements.colorRightInput,
        domElements.colorTopInput, domElements.colorBottomInput,
        domElements.interpolationMethodSelect
    ];
    inputsToUpdatePalette.forEach(input => {
        if (input) {
            const eventType = input.tagName === 'SELECT' ? 'change' : 'input';
            input.addEventListener(eventType, updateAndRenderPalette);
        }
    });

    // Слушатели для слайдеров
    if (domElements.horizontalLevelsSlider) {
        domElements.horizontalLevelsSlider.addEventListener('input', () => {
            updateSliderValueDisplay(domElements.horizontalLevelsSlider, domElements.horizontalLevelsValueSpan);
            updateAndRenderPalette();
        });
    }
    if (domElements.verticalLevelsSlider) {
        domElements.verticalLevelsSlider.addEventListener('input', () => {
            updateSliderValueDisplay(domElements.verticalLevelsSlider, domElements.verticalLevelsValueSpan);
            if (domElements.verticalInterpolationToggle.checked) {
                updateAndRenderPalette();
            }
        });
    }

    // Слушатель для переключателя вертикального режима
    if (domElements.verticalInterpolationToggle) {
        domElements.verticalInterpolationToggle.addEventListener('change', () => {
            toggleVerticalControlsUI(domElements.verticalInterpolationToggle.checked);
            updateAndRenderPalette();
        });
    }

    // Слушатели для обычных кнопок экспорта
    if (domElements.exportSvgButton) {
        domElements.exportSvgButton.addEventListener('click', () => exportSVG(currentPalette));
    }
    if (domElements.exportPdfButton && !domElements.exportPdfButton.disabled) {
        domElements.exportPdfButton.addEventListener('click', () => exportPDF(currentPalette));
    }

    // Слушатель изменения темы Telegram
    if (isTma && WebApp) {
        WebApp.onEvent('themeChanged', () => applyTelegramTheme(WebApp.themeParams));
        // Убираем лишний обработчик для MainButton, т.к. мы её не показываем активно
        // WebApp.onEvent('mainButtonClicked', handleMainButtonClick);
    }

    // Слушатель ресайза окна
    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
             if (modulesInitialized && domReady && isValidPalette(currentPalette)) {
                 console.log("Window resized, re-rendering palette grid.");
                 renderPalette(currentPalette, copyColorToClipboard);
             }
        }, 150);
    });

    console.log("Event listeners set up.");
}

// --- Initial Application Setup ---
function initializeApp() {
    console.log("Initializing HueCraft Application...");
    if (!domReady || !librariesLoaded || !modulesInitialized) {
         console.error("Initialization failed due to missing DOM/libs/modules.");
         return;
    }
    try {
        // Установка начальных значений из DEFAULTS
        domElements.colorLeftInput.value = DEFAULTS.LEFT_COLOR;
        domElements.colorRightInput.value = DEFAULTS.RIGHT_COLOR;
        domElements.colorTopInput.value = DEFAULTS.TOP_COLOR;
        domElements.colorBottomInput.value = DEFAULTS.BOTTOM_COLOR;
        domElements.horizontalLevelsSlider.value = DEFAULTS.H_LEVELS;
        domElements.verticalLevelsSlider.value = DEFAULTS.V_STEPS;
        domElements.interpolationMethodSelect.value = DEFAULTS.INTERPOLATION_METHOD;
        domElements.verticalInterpolationToggle.checked = DEFAULTS.VERTICAL_ENABLED;

        updateSliderValueDisplay(domElements.horizontalLevelsSlider, domElements.horizontalLevelsValueSpan);
        updateSliderValueDisplay(domElements.verticalLevelsSlider, domElements.verticalLevelsValueSpan);
        toggleVerticalControlsUI(domElements.verticalInterpolationToggle.checked);

        setupEventListeners();
        updateAndRenderPalette(); // Генерируем начальную палитру (Main Button больше не настроится)

        console.log("HueCraft Initialization Complete.");
    } catch (error) {
         console.error("Error during final initialization steps:", error);
         displayPaletteMessage(`Runtime Error: ${error.message}. Please reload.`);
    }
}

// --- Запуск приложения ---
initializeApp();
