import { definePreset } from '@primeuix/themes';
import Aura from '@primeuix/themes/aura';

/** Soho surface palette from the PrimeNG website configurator. */
const sohoSurface = {
  0: '#ffffff',
  50: '#ececec',
  100: '#dedfdf',
  200: '#c4c4c6',
  300: '#adaeb0',
  400: '#97979b',
  500: '#7f8084',
  600: '#6a6b70',
  700: '#55565b',
  800: '#3f4046',
  900: '#2c2c34',
  950: '#16161d',
} as const;

export const ParcelScrubberPreset = definePreset(Aura, {
  semantic: {
    primary: {
      50: '{blue.50}',
      100: '{blue.100}',
      200: '{blue.200}',
      300: '{blue.300}',
      400: '{blue.400}',
      500: '{blue.500}',
      600: '{blue.600}',
      700: '{blue.700}',
      800: '{blue.800}',
      900: '{blue.900}',
      950: '{blue.950}',
    },
    colorScheme: {
      light: {
        surface: sohoSurface,
      },
      dark: {
        surface: sohoSurface,
      },
    },
  },
});
