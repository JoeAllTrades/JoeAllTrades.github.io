// js/config.js

// Методы интерполяции, которые будут доступны в UI
export const INTERPOLATION_METHODS = {
    RGB: 'rgb',
    HSL: 'hsl',
    LAB: 'lab', // CIELAB
    HCT: 'hct'
};

// Настройки по умолчанию (если нужно централизовать)
export const DEFAULTS = {
    LEFT_COLOR: '#9C27B0',
    RIGHT_COLOR: '#2196F3',
    TOP_COLOR: '#ffffff',
    BOTTOM_COLOR: '#000000',
    H_LEVELS: 7,
    V_STEPS: 2, // Количество шагов вверх/вниз от центральной линии
    INTERPOLATION_METHOD: INTERPOLATION_METHODS.LAB,
    VERTICAL_ENABLED: false
};

// Настройки для экспорта (можно вынести)
export const EXPORT_DEFAULTS = {
    SVG_CELL_SIZE: 40,
    SVG_GAP: 3,
    PDF_MARGIN: 40,
    PDF_MIN_CELL_SIZE: 18,
    PDF_GAP: 2
};
