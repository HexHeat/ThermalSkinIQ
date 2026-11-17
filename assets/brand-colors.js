const thermalSkinIQPalette = {
    paper: { light: '#FFFFFF', DEFAULT: '#FFFFFF', dark: '#F3F6F8' },
    heatOrange: { light: '#FCA705', DEFAULT: '#FCA705', dark: '#FCA705' },
    hotHighlight: { light: '#FCA705', DEFAULT: '#FCA705', dark: '#FCA705' },
    deepHeatOrange: { light: '#FCA705', DEFAULT: '#FCA705', dark: '#FCA705' },
    coolingCyan: { light: '#CCF2FD', DEFAULT: '#03BAE9', dark: '#007392' },
    coolHighlight: { light: '#D7F7FF', DEFAULT: '#35D8FF', dark: '#1D778C' },
    deepCoolingBlue: { light: '#CCE4FA', DEFAULT: '#0451FB', dark: '#00478B' },
    metallicSilver: { light: '#F4F5F6', DEFAULT: '#B4B6BB', dark: '#6E7173' },
    graphite: { light: '#DEDFE0', DEFAULT: '#252A2E', dark: '#111315' },
};

tailwind.config = {
    theme: {
        extend: {
            colors: {
                ...thermalSkinIQPalette,
                hexBlue: thermalSkinIQPalette.deepCoolingBlue.dark,
                hexLightBlue: thermalSkinIQPalette.deepCoolingBlue.dark,
                hexOrange: thermalSkinIQPalette.heatOrange.DEFAULT,
                hexRed: thermalSkinIQPalette.deepHeatOrange.dark,
                heatDark: thermalSkinIQPalette.heatOrange.dark,
                heatHighlight: thermalSkinIQPalette.hotHighlight.DEFAULT,
                coolLight: thermalSkinIQPalette.deepCoolingBlue.light,
                gray: {
                    50: thermalSkinIQPalette.paper.dark,
                    100: thermalSkinIQPalette.metallicSilver.light,
                    200: thermalSkinIQPalette.graphite.light,
                    300: thermalSkinIQPalette.metallicSilver.DEFAULT,
                    400: thermalSkinIQPalette.metallicSilver.dark,
                    500: thermalSkinIQPalette.metallicSilver.dark,
                    600: thermalSkinIQPalette.graphite.DEFAULT,
                    700: thermalSkinIQPalette.graphite.DEFAULT,
                    800: thermalSkinIQPalette.graphite.DEFAULT,
                    900: thermalSkinIQPalette.graphite.dark,
                },
            },
        },
    },
};
