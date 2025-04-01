// js/main.js

// --- Import Modules ---
import { INTERPOLATION_METHODS, DEFAULTS } from './config.js';
import { isValidPalette } from './utils.js';
import { initializeInterpolation } from './interpolation.js';
import { generatePaletteData } from './paletteGenerator.js';
import {
    initializeUI,
    renderPalette,
    updateSliderValueDisplay,
    toggleVerticalControlsUI,
    copyColorToClipboard,
    displayPaletteMessage,
    applyTelegramTheme,
    initializeColorPickers // Import Pickr initializer
} from './ui.js';
import { initializeExport, exportSVG, exportPDF } from './export.js';

// --- Telegram WebApp SDK ---
let WebApp = null;
let isTma = false;

// --- Material Color Utilities (async import) ---
let materialColorUtilities;
try {
    materialColorUtilities = await import('https://cdn.jsdelivr.net/npm/@material/material-color-utilities@0.3.0/index.js');
    console.log("Material Color Utilities module loaded successfully.");
} catch (error) {
    console.error("Failed to load Material Color Utilities module from CDN:", error);
    materialColorUtilities = null;
    // Attempt to display message only if UI might be ready
    setTimeout(() => { try { displayPaletteMessage("Error loading Material Color Utilities. HCT may not work."); } catch {} }, 100);
}

// --- Library References ---
let jsPDFConstructor = null;
let ColorJsLib = null;
let PickrLib = null; // Reference for Pickr constructor
let librariesLoaded = false;

try {
    // Initialize Telegram WebApp SDK first if available
    if (window.Telegram && window.Telegram.WebApp) {
        WebApp = window.Telegram.WebApp;
        WebApp.ready();
        WebApp.expand();
        isTma = true;
        console.log("Telegram WebApp SDK initialized.");
    } else {
        console.warn("Telegram WebApp SDK not found. Running in browser mode.");
    }

    // Check other required libraries
    if (window.jspdf && window.jspdf.jsPDF) { jsPDFConstructor = window.jspdf.jsPDF; }
    else { console.error("jsPDF library not found."); }

    if (window.Color) { ColorJsLib = window.Color; }
    else { console.error("Color.js library not found."); }

    if (window.Pickr) { PickrLib = window.Pickr; } // Check for Pickr
    else { console.error("Pickr library not found."); }

    // Verify all essential libraries are loaded
    if (jsPDFConstructor && ColorJsLib && materialColorUtilities && PickrLib) {
        console.log("Core libraries (jsPDF, Color.js, Material Color, Pickr) loaded.");
        librariesLoaded = true;
    } else {
        let missing = [];
        if (!jsPDFConstructor) missing.push("jsPDF");
        if (!ColorJsLib) missing.push("Color.js");
        if (!materialColorUtilities) missing.push("Material Color");
        if (!PickrLib) missing.push("Pickr"); // Add Pickr to check
        if (missing.length > 0) throw new Error(`Required libraries (${missing.join(', ')}) not found.`);
        else throw new Error(`Required libraries could not be confirmed.`);
    }

} catch (error) {
    console.error("Error accessing libraries or initializing SDK:", error);
    // Delay alert slightly to ensure DOM might be ready for basic message display
     setTimeout(() => {
        alert(`Error loading libraries/SDK: ${error.message}. Some features might be disabled.`);
        try { displayPaletteMessage(`Error: ${error.message}. App might not function correctly.`); } catch {}
    }, 100);
}

// --- DOM Element References ---
const domElements = {
    // References to the button triggers
    colorLeftTrigger: document.getElementById('color-left-trigger'),
    colorRightTrigger: document.getElementById('color-right-trigger'),
    colorTopTrigger: document.getElementById('color-top-trigger'),
    colorBottomTrigger: document.getElementById('color-bottom-trigger'),
    // Other elements remain the same
    horizontalLevelsSlider: document.getElementById('horizontal-levels'),
    horizontalLevelsValueSpan: document.getElementById('horizontal-levels-value'),
    verticalLevelsSlider: document.getElementById('vertical-levels'),
    verticalLevelsValueSpan: document.getElementById('vertical-levels-value'),
    interpolationMethodSelect: document.getElementById('interpolation-method'),
    verticalInterpolationToggle: document.getElementById('vertical-interpolation-toggle'),
    verticalSliderGroup: document.querySelector('.vertical-slider-group'),
    verticalColorPickers: document.querySelectorAll('.vertical-color'), // Keep this selector for showing/hiding the group
    paletteGrid: document.getElementById('palette-grid'),
    paletteGridContainer: document.querySelector('.palette-grid-container'),
    exportSvgButton: document.getElementById('export-svg'),
    exportPdfButton: document.getElementById('export-pdf'),
    copyNotificationElement: document.getElementById('copy-notification'),
    body: document.body
};

// --- DOM Check ---
function checkDOMelements() {
    const essentialIds = [
        'color-left-trigger', 'color-right-trigger', 'color-top-trigger', 'color-bottom-trigger',
        'horizontal-levels', 'horizontal-levels-value', 'vertical-levels', 'vertical-levels-value',
        'interpolation-method', 'vertical-interpolation-toggle', 'palette-grid', 'export-svg', 'export-pdf',
        'copy-notification'
    ];
    const missingElements = essentialIds.filter(id => !document.getElementById(id));

    // Check querySelector elements separately
    if (!domElements.verticalSliderGroup) missingElements.push('.vertical-slider-group');
    if (!domElements.paletteGridContainer) missingElements.push('.palette-grid-container');
    if (!domElements.body) missingElements.push('body');

    if (missingElements.length > 0) {
        console.error("Essential DOM elements are missing:", missingElements);
         setTimeout(() => { try { displayPaletteMessage(`Initialization Error: Missing DOM elements (${missingElements.join(', ')}).`); } catch {} }, 100);
        return false;
    }
    if (!domElements.verticalColorPickers || domElements.verticalColorPickers.length === 0) {
         console.warn("Vertical color picker container elements (.vertical-color) not found.");
    }
    return true;
}
const domReady = checkDOMelements();

// --- Application State ---
let currentPalette = [];
let pickrInstances = {}; // Store Pickr instances

// --- Module Initialization ---
let modulesInitialized = false;
if (librariesLoaded && domReady) {
    try {
        // Pass PickrLib to initializeUI
        initializeUI(domElements, WebApp, PickrLib);

        // Apply Telegram theme if available
        if (isTma && WebApp.themeParams) {
            applyTelegramTheme(WebApp.themeParams);
        }

        // Initialize custom color pickers with Pickr
        // Pass the callback function to handle color changes
        pickrInstances = initializeColorPickers(handleColorChange);

        // Initialize other modules
        const interpolationInitialized = initializeInterpolation({
            colorjs: ColorJsLib,
            materialColor: materialColorUtilities
        });
        const exportInitialized = initializeExport({ jsPDFConstructor: jsPDFConstructor });

        // Disable PDF export if library failed
        if (!exportInitialized && domElements.exportPdfButton) {
            domElements.exportPdfButton.disabled = true;
            domElements.exportPdfButton.title = "PDF export disabled (jsPDF library not loaded)";
        }
        modulesInitialized = true;
        console.log("All modules initialized, including custom color pickers.");

    } catch (initError) {
        console.error("Error during module initialization:", initError);
         setTimeout(() => { try { displayPaletteMessage(`Initialization Error: ${initError.message}.`); } catch {} }, 100);
        modulesInitialized = false;
    }
} else {
     console.error("Application cannot start due to missing libraries or DOM elements.");
     // Disable buttons if initialization failed early
     if (domElements.exportSvgButton) domElements.exportSvgButton.disabled = true;
     if (domElements.exportPdfButton) domElements.exportPdfButton.disabled = true;
}


// --- Core Application Logic ---

/**
 * Callback function triggered by Pickr when a color is saved.
 * @param {string} pickerId - The base ID of the picker trigger (e.g., 'color-left').
 * @param {string} newColor - The selected HEX color string.
 */
function handleColorChange(pickerId, newColor) {
    console.log(`Color changed via Pickr: ${pickerId} = ${newColor}`);
    // The color is already saved in the trigger's data-attribute by initializeColorPickers
    // We just need to regenerate the palette
    updateAndRenderPalette();
}

/**
 * Reads settings (using data-attributes for colors), generates, and renders the palette.
 */
function updateAndRenderPalette() {
    if (!modulesInitialized || !domReady) {
        console.warn("Skipping palette generation: Modules not initialized or DOM not ready.");
        return;
    }

    // Read colors from the data-color attributes of the trigger buttons
    const settings = {
        leftColor: domElements.colorLeftTrigger?.dataset.color,
        rightColor: domElements.colorRightTrigger?.dataset.color,
        topColor: domElements.colorTopTrigger?.dataset.color,
        bottomColor: domElements.colorBottomTrigger?.dataset.color,
        hLevels: parseInt(domElements.horizontalLevelsSlider.value, 10),
        vSteps: parseInt(domElements.verticalLevelsSlider.value, 10),
        method: domElements.interpolationMethodSelect.value,
        useVertical: domElements.verticalInterpolationToggle.checked
    };

    // Validate that colors were successfully read
    if (!settings.leftColor || !settings.rightColor || (settings.useVertical && (!settings.topColor || !settings.bottomColor))) {
        console.error("Invalid color data found in triggers before generation. DOM elements might be missing or data-attributes not set.", settings);
        displayPaletteMessage("Error: Invalid color selected or element missing.");
        // Optionally hide MainButton if in TMA
        if (WebApp?.MainButton.isVisible) WebApp.MainButton.hide();
        return;
    }

    // Generate and render
    currentPalette = generatePaletteData(settings);
    renderPalette(currentPalette, copyColorToClipboard); // Pass cell click handler

    // Update Telegram Main Button state
    setupMainButton();
}

// --- Telegram Main Button Logic ---
function setupMainButton() {
    if (!isTma || !WebApp) return;

    // Detach previous handler to prevent duplicates
    WebApp.MainButton.offClick(handleMainButtonClick);

    if (isValidPalette(currentPalette)) {
        WebApp.MainButton.setText("Export SVG"); // Default action
        WebApp.MainButton.onClick(handleMainButtonClick);
        WebApp.MainButton.show();
    } else {
        WebApp.MainButton.hide(); // Hide if palette is invalid
    }
}

function handleMainButtonClick() {
     if (!isValidPalette(currentPalette)) {
         if (WebApp) WebApp.showAlert("Generate a valid palette first.");
         else alert("Generate a valid palette first.");
         return;
     }
     // Perform the default action (SVG export)
     exportSVG(currentPalette);
     // You could add logic here to show a popup for format choice
     // WebApp.showPopup({ title: "Export Format", message: "Choose format:", buttons: [{id: 'svg', type: 'default', text: 'SVG'}, {id: 'pdf', type: 'default', text: 'PDF'}, {type: 'cancel'}] }, ...)
}

// --- Event Listeners Setup ---
function setupEventListeners() {
     if (!modulesInitialized || !domReady) {
          console.warn("Skipping event listener setup: Modules/DOM not ready.");
          return;
      }
    console.log("Setting up event listeners...");

    // Pickr instances handle their own color change events via the callback

    // Listeners for other controls that trigger palette regeneration
    const inputsToUpdatePalette = [
        domElements.interpolationMethodSelect,
        domElements.verticalInterpolationToggle // Add toggle here as well
    ];
    inputsToUpdatePalette.forEach(input => {
        if (input) {
            input.addEventListener('change', updateAndRenderPalette); // Use 'change' for select and checkbox
        }
    });

    // Sliders use 'input' for live updates
    if (domElements.horizontalLevelsSlider) {
        domElements.horizontalLevelsSlider.addEventListener('input', () => {
            updateSliderValueDisplay(domElements.horizontalLevelsSlider, domElements.horizontalLevelsValueSpan);
            updateAndRenderPalette();
        });
    }
    if (domElements.verticalLevelsSlider) {
        domElements.verticalLevelsSlider.addEventListener('input', () => {
            updateSliderValueDisplay(domElements.verticalLevelsSlider, domElements.verticalLevelsValueSpan);
            // Only update if vertical mode is active
            if (domElements.verticalInterpolationToggle.checked) {
                updateAndRenderPalette();
            }
        });
    }

     // Separate listener for toggle UI change (already updates palette via 'change' listener above)
     if (domElements.verticalInterpolationToggle) {
        domElements.verticalInterpolationToggle.addEventListener('change', () => {
             toggleVerticalControlsUI(domElements.verticalInterpolationToggle.checked);
         });
     }


    // Standard export buttons (fallback for non-TMA)
    if (domElements.exportSvgButton) {
        domElements.exportSvgButton.addEventListener('click', () => exportSVG(currentPalette));
    }
    if (domElements.exportPdfButton && !domElements.exportPdfButton.disabled) {
        domElements.exportPdfButton.addEventListener('click', () => exportPDF(currentPalette));
    }

    // Telegram specific events
    if (isTma && WebApp) {
        WebApp.onEvent('themeChanged', () => applyTelegramTheme(WebApp.themeParams));
        // If main button click needs re-attachment (though offClick/onClick in setupMainButton should handle it)
        // WebApp.onEvent('mainButtonClicked', handleMainButtonClick);
    }

    // Window resize listener
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
         console.error("Initialization failed: Essential DOM/libs/modules missing.");
         return;
    }

    try {
        // Set initial values from DEFAULTS into data-attributes and update trigger backgrounds
        if(domElements.colorLeftTrigger) {
            domElements.colorLeftTrigger.dataset.color = DEFAULTS.LEFT_COLOR;
            domElements.colorLeftTrigger.style.backgroundColor = DEFAULTS.LEFT_COLOR;
        }
        if(domElements.colorRightTrigger) {
            domElements.colorRightTrigger.dataset.color = DEFAULTS.RIGHT_COLOR;
            domElements.colorRightTrigger.style.backgroundColor = DEFAULTS.RIGHT_COLOR;
        }
         if(domElements.colorTopTrigger) {
            domElements.colorTopTrigger.dataset.color = DEFAULTS.TOP_COLOR;
            domElements.colorTopTrigger.style.backgroundColor = DEFAULTS.TOP_COLOR;
        }
         if(domElements.colorBottomTrigger) {
            domElements.colorBottomTrigger.dataset.color = DEFAULTS.BOTTOM_COLOR;
            domElements.colorBottomTrigger.style.backgroundColor = DEFAULTS.BOTTOM_COLOR;
        }


        // Set initial values for other controls
        domElements.horizontalLevelsSlider.value = DEFAULTS.H_LEVELS;
        domElements.verticalLevelsSlider.value = DEFAULTS.V_STEPS;
        domElements.interpolationMethodSelect.value = DEFAULTS.INTERPOLATION_METHOD;
        domElements.verticalInterpolationToggle.checked = DEFAULTS.VERTICAL_ENABLED;

        // Update UI elements based on initial values
        updateSliderValueDisplay(domElements.horizontalLevelsSlider, domElements.horizontalLevelsValueSpan);
        updateSliderValueDisplay(domElements.verticalLevelsSlider, domElements.verticalLevelsValueSpan);
        toggleVerticalControlsUI(domElements.verticalInterpolationToggle.checked);

        // Setup event listeners for sliders, select, toggle, etc.
        setupEventListeners();

        // Perform the initial palette generation and render
        updateAndRenderPalette();

        console.log("HueCraft Initialization Complete.");
    } catch (error) {
         console.error("Error during final initialization steps:", error);
         displayPaletteMessage(`Runtime Error: ${error.message}. Please reload.`);
    }
}

// --- Start Application ---
initializeApp();
