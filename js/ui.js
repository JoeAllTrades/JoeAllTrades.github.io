// js/ui.js
import { isValidPalette, hexToRgb, isColorDark } from './utils.js';

// --- Module Scope Variables ---
let domElements = {};
let WebApp = null;
let Pickr = null; // Reference to Pickr constructor
let notificationTimeout = null;

/**
 * Initializes the UI module with references to DOM elements, WebApp SDK, and Pickr constructor.
 * @param {object} elements - DOM element references.
 * @param {object | null} webAppInstance - window.Telegram.WebApp instance or null.
 * @param {object | null} pickrConstructor - window.Pickr constructor or null.
 */
export function initializeUI(elements, webAppInstance, pickrConstructor) {
    domElements = elements;
    WebApp = webAppInstance;
    Pickr = pickrConstructor; // Store Pickr constructor
    console.log("UI module initialized.");
    if (WebApp) { console.log("Telegram WebApp SDK available in UI module."); }
    if (Pickr) { console.log("Pickr library available in UI module."); }
    else { console.error("Pickr library NOT available in UI module!"); }
}

/**
 * Updates the text display for a slider value.
 * @param {HTMLInputElement} sliderElement - The slider input element.
 * @param {HTMLSpanElement} spanElement - The span element to display the value.
 */
export function updateSliderValueDisplay(sliderElement, spanElement) {
    if (sliderElement && spanElement) {
        spanElement.textContent = sliderElement.value;
    }
}

/**
 * Toggles the visibility of UI elements related to vertical (4-color) mode.
 * @param {boolean} showVertical - Whether to show the vertical controls.
 */
export function toggleVerticalControlsUI(showVertical) {
    if (domElements.verticalSliderGroup && domElements.verticalColorPickers && domElements.body) {
        domElements.body.classList.toggle('vertical-mode-enabled', showVertical);
        // Visibility of pickers is handled by CSS via body class
        domElements.verticalSliderGroup.style.display = showVertical ? 'block' : 'none';
    } else {
        console.error("Could not find elements needed to toggle vertical controls UI (slider group, body).");
    }
}

/**
 * Displays a message within the palette grid area (e.g., for errors or initial state).
 * @param {string} message - The message text to display.
 */
export function displayPaletteMessage(message) {
    const grid = domElements.paletteGrid;
    if (!grid) { console.warn("Cannot display message, palette grid not found."); return; }

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
    msgCell.style.color = 'var(--tg-theme-hint-color, #6c757d)';
    msgCell.style.fontSize = '1rem';
    msgCell.style.padding = '2rem';
    msgCell.style.minHeight = '100px';
    msgCell.style.textAlign = 'center';
    msgCell.style.gridColumn = '1 / -1';
    msgCell.style.gridRow = '1 / -1';
    grid.appendChild(msgCell);
}

/**
 * Renders the generated color palette into the DOM grid.
 * @param {Array<Array<string>>} paletteData - 2D array of HEX color strings.
 * @param {Function} onCellClick - Callback function for when a palette cell is clicked (receives hexColor).
 */
export function renderPalette(paletteData, onCellClick) {
    const grid = domElements.paletteGrid;
    const gridContainer = domElements.paletteGridContainer;
    if (!grid || !gridContainer) {
        console.error("Palette grid or container element not found for rendering.");
        return;
    }
    grid.innerHTML = ''; // Clear previous grid

    if (!isValidPalette(paletteData)) {
        console.warn("Cannot render empty or invalid palette data.");
        displayPaletteMessage("Adjust settings to generate the palette.");
        return;
    }

    const numRows = paletteData.length;
    const numCols = paletteData[0].length;

    // --- Calculate Square Cell Size based on available space ---
    const containerStyle = getComputedStyle(gridContainer);
    const gridStyle = getComputedStyle(grid);
    const containerPaddingX = parseFloat(containerStyle.paddingLeft) + parseFloat(containerStyle.paddingRight);
    const containerPaddingY = parseFloat(containerStyle.paddingTop) + parseFloat(containerStyle.paddingBottom);
    // Use clientWidth/Height which includes padding but excludes border/scrollbar
    const availableWidth = gridContainer.clientWidth - containerPaddingX;
    const availableHeight = gridContainer.clientHeight - containerPaddingY;
    const gap = parseFloat(gridStyle.gap) || 0;
    const totalGapWidth = Math.max(0, numCols - 1) * gap;
    const totalGapHeight = Math.max(0, numRows - 1) * gap;
    const potentialCellWidth = numCols > 0 ? (availableWidth - totalGapWidth) / numCols : 0;
    const potentialCellHeight = numRows > 0 ? (availableHeight - totalGapHeight) / numRows : 0;
    let cellSize = Math.floor(Math.min(potentialCellWidth, potentialCellHeight));
    cellSize = Math.max(1, cellSize); // Ensure minimum size

    // --- Set Grid Styles ---
    grid.style.gridTemplateColumns = `repeat(${numCols}, ${cellSize}px)`;
    grid.style.gridTemplateRows = `repeat(${numRows}, ${cellSize}px)`;
    const totalGridWidthActual = numCols * cellSize + totalGapWidth;
    const totalGridHeightActual = numRows * cellSize + totalGapHeight;
    grid.style.width = `${totalGridWidthActual}px`;
    grid.style.height = `${totalGridHeightActual}px`;

    // --- Create and Append Cells ---
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
                        onCellClick(hexColor); // Invoke callback with color
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
 * Initializes Pickr instances for all color picker trigger buttons.
 * @param {Function} onColorSaveCallback - Callback function (pickerId, newColor) => {} called when color is saved.
 * @returns {object} An object mapping picker IDs (e.g., 'color-left') to their Pickr instances.
 */
export function initializeColorPickers(onColorSaveCallback) {
    if (!Pickr) {
        console.error("Pickr library is not available. Cannot initialize color pickers.");
        return {};
    }

    const pickrInstances = {};
    // Use the potentially updated domElements object
    const triggers = [
        domElements.colorLeftTrigger, domElements.colorRightTrigger,
        domElements.colorTopTrigger, domElements.colorBottomTrigger
    ];

    triggers.forEach(trigger => {
        if (!trigger) {
            // Attempt to find the element again, in case initialization order was tricky
            const potentialId = Object.keys(domElements).find(key => domElements[key] === trigger);
            console.warn(`Color picker trigger element${potentialId ? ` (${potentialId})` : ''} not found during Pickr initialization.`);
            return; // Skip if element doesn't exist
        }

        const pickerId = trigger.id.replace('-trigger', ''); // e.g., 'color-left'
        const initialColor = trigger.dataset.color || '#ffffff'; // Get initial color from data attribute
        trigger.style.backgroundColor = initialColor; // Ensure initial background is set

        try {
            const pickr = Pickr.create({
                el: trigger,
                theme: 'nano', // Or 'classic', 'monolith'
                default: initialColor,
                // position: 'bottom-middle', // Optional: Adjust popup position
                // appClass: 'custom-pickr-theme', // Optional: Class for custom CSS

                swatches: [
                    '#F44336', '#E91E63', '#9C27B0', '#673AB7',
                    '#3F51B5', '#2196F3', '#03A9F4', '#00BCD4',
                    '#009688', '#4CAF50', '#8BC34A', '#CDDC39',
                    '#FFEB3B', '#FFC107', '#FF9800', '#FF5722',
                    '#795548', '#9E9E9E', '#607D8B', '#000000', '#FFFFFF'
                ],

                components: {
                    preview: true,
                    // opacity: false, // Keep opacity disabled unless needed
                    hue: true,
                    interaction: {
                        hex: true, // Use HEX input
                        input: true,
                        save: true // Show Save button
                    }
                },

                // Optional: Customize button text
                 i18n: {
                    'ui:save': 'OK',
                    'btn:save': 'OK',
                 }
            });

            // --- Event Listeners for Pickr ---
            pickr.on('save', (color, instance) => {
                if (!color) {
                    // Handle case where user clears input and saves
                    console.warn("Pickr 'save' event with null color.");
                     // Revert to previous color or default
                     const triggerEl = instance.options.el;
                     const previousColor = triggerEl.dataset.color || instance.options.default;
                     instance.setColor(previousColor, true); // Silently set color back
                     instance.hide();
                    return;
                }
                const hexColor = color.toHEXA().toString(); // Get #RRGGBB format
                const triggerElement = instance.options.el;

                // Update the trigger button's state
                triggerElement.style.backgroundColor = hexColor;
                triggerElement.dataset.color = hexColor; // Store the canonical value

                // Notify the main application logic
                if (typeof onColorSaveCallback === 'function') {
                    onColorSaveCallback(pickerId, hexColor);
                }

                instance.hide(); // Close the picker
            });

             // Optional: Live background update on change (before saving)
             /*
             pickr.on('change', (color, source, instance) => {
                if(color) { // Ensure color is valid
                    const hexColor = color.toHEXA().toString();
                    instance.options.el.style.backgroundColor = hexColor;
                }
             });
             */

            // Store the instance
            pickrInstances[pickerId] = pickr;

        } catch (error) {
            console.error(`Failed to initialize Pickr for element #${trigger.id}:`, error);
        }
    });

    console.log(`Initialized ${Object.keys(pickrInstances).length} Pickr instances.`);
    return pickrInstances;
}


/**
 * Shows a notification message.
 * @param {string} message - The message text.
 * @param {boolean} [isError=false] - True if the message is an error.
 */
export function showCopyNotification(message, isError = false) {
    const notificationElement = domElements.copyNotificationElement;
    if (!notificationElement) return;
    if (notificationTimeout) { clearTimeout(notificationTimeout); notificationTimeout = null; }

    notificationElement.textContent = message;
    notificationElement.classList.toggle('error', isError); // Use CSS class for styling
    notificationElement.classList.add('show');

    notificationTimeout = setTimeout(() => {
        notificationElement.classList.remove('show');
        // Remove error class after fade out transition
        setTimeout(() => notificationElement.classList.remove('error'), 300);
    }, 2000);
}

/**
 * Copies the given HEX color to the clipboard, using HapticFeedback if available.
 * @param {string} colorHex - The HEX color string to copy.
 */
export async function copyColorToClipboard(colorHex) {
    if (!navigator.clipboard) {
        console.warn("Clipboard API not available.");
        showCopyNotification("Clipboard API not supported", true);
        WebApp?.HapticFeedback?.notificationOccurred('error');
        return;
    }
    try {
        await navigator.clipboard.writeText(colorHex);
        console.log(`Copied ${colorHex} to clipboard.`);
        showCopyNotification(`Copied ${colorHex}!`);
        WebApp?.HapticFeedback?.notificationOccurred('success'); // Use optional chaining
    } catch (err) {
        console.error('Failed to copy color: ', err);
        showCopyNotification("Failed to copy!", true);
        WebApp?.HapticFeedback?.notificationOccurred('error'); // Use optional chaining
    }
}

/**
 * Applies Telegram theme parameters to the application's UI via CSS variables.
 * @param {object} themeParams - The themeParams object from Telegram WebApp.
 */
export function applyTelegramTheme(themeParams) {
    if (!themeParams || !document.documentElement) return;
    console.log("Applying Telegram theme:", themeParams);

    const root = document.documentElement;
    const body = domElements.body;

    const hexToRgbString = (hex) => {
        const rgb = hexToRgb(hex); // Assuming hexToRgb returns {r,g,b} or null
        return rgb ? `${rgb.r}, ${rgb.g}, ${rgb.b}` : null;
    };

    // Set main colors
    root.style.setProperty('--tg-theme-bg-color', themeParams.bg_color || '#ffffff');
    root.style.setProperty('--tg-theme-text-color', themeParams.text_color || '#000000');
    root.style.setProperty('--tg-theme-hint-color', themeParams.hint_color || '#aaaaaa');
    root.style.setProperty('--tg-theme-link-color', themeParams.link_color || '#2481cc');
    root.style.setProperty('--tg-theme-button-color', themeParams.button_color || '#5288c1');
    root.style.setProperty('--tg-theme-button-text-color', themeParams.button_text_color || '#ffffff');
    root.style.setProperty('--tg-theme-secondary-bg-color', themeParams.secondary_bg_color || '#f1f1f1');

    // Set RGB versions
    const linkRgb = hexToRgbString(themeParams.link_color);
    const buttonRgb = hexToRgbString(themeParams.button_color);
    const textRgb = hexToRgbString(themeParams.text_color); // Added for select arrow

    root.style.setProperty('--tg-theme-link-rgb', linkRgb || '13, 110, 253');
    root.style.setProperty('--tg-theme-button-rgb', buttonRgb || '82, 136, 193');
    root.style.setProperty('--tg-theme-text-rgb', textRgb || '0, 0, 0');

    // Set body class for dark/light mode detection and TMA active state
    if (body && themeParams.bg_color) {
        const isDark = isColorDark(themeParams.bg_color); // Assumes isColorDark is imported/available
        body.classList.toggle('dark-theme', isDark);
        body.classList.toggle('light-theme', !isDark);
        body.classList.add('tma-active'); // Mark as running in TMA context
    }

    // Update Telegram native header/background colors
    WebApp?.setHeaderColor?.(themeParams.secondary_bg_color || themeParams.bg_color || '#ffffff');
    WebApp?.setBackgroundColor?.(themeParams.bg_color || '#ffffff');
}
