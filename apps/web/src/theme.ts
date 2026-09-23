/**
 * The look of the product.
 *
 * Deliberately not the weighbridge's palette-and-borders: that app is a single
 * machine screen read from two metres away, this one is a system somebody sits
 * inside all day. The differences that matter here are softer surfaces, a
 * tighter type scale, and one confident accent instead of two competing ones.
 *
 * Suarza's green survives as the primary, stepped up in lightness and chroma so
 * it works as an interface colour rather than a logo colour — the logo green
 * (#155932) is near-black at button size and fails contrast as a text colour.
 */

import { createTheme, rem, type MantineColorsTuple } from '@mantine/core';

/** Emerald, from a tint that works as a hover background to a readable dark. */
const brand: MantineColorsTuple = [
  '#e7fbf2',
  '#d0f3e4',
  '#a1e6c8',
  '#6fd8aa',
  '#48cc91',
  '#31c481',
  '#22c07a',
  '#12a968',
  '#00965b',
  '#00814c',
];

/** The logo's orange, kept for the few places that mean "needs you". */
const accent: MantineColorsTuple = [
  '#fff4e6',
  '#ffe8cc',
  '#fdd0a2',
  '#fbb675',
  '#f9a04f',
  '#f89237',
  '#f68523',
  '#dc7318',
  '#c46512',
  '#aa550a',
];

export const theme = createTheme({
  colors: { brand, accent },
  primaryColor: 'brand',
  /* 6 rather than the default 9: the darker step reads as a solid button
     colour, the lighter one washes out against white. */
  primaryShade: { light: 7, dark: 5 },

  fontFamily: 'Inter Variable, Inter, system-ui, -apple-system, Segoe UI, sans-serif',
  headings: {
    fontFamily: 'Inter Variable, Inter, system-ui, sans-serif',
    fontWeight: '650',
    sizes: {
      h1: { fontSize: rem(28), lineHeight: '1.25' },
      h2: { fontSize: rem(22), lineHeight: '1.3' },
      h3: { fontSize: rem(18), lineHeight: '1.35' },
    },
  },

  defaultRadius: 'md',
  radius: { md: rem(10), lg: rem(14) },

  /* Figures in an ERP are read in columns and compared down the column, so
     every numeral is the same width wherever one appears. */
  other: { tabular: "font-variant-numeric: tabular-nums" },

  components: {
    Card: { defaultProps: { radius: 'lg', withBorder: true, padding: 'lg' } },
    Paper: { defaultProps: { radius: 'lg' } },
    Modal: {
      defaultProps: {
        radius: 'lg',
        centered: true,
        overlayProps: { blur: 3, backgroundOpacity: 0.45 },
      },
    },
    Button: { defaultProps: { radius: 'md' } },
    TextInput: { defaultProps: { radius: 'md' } },
    Textarea: { defaultProps: { radius: 'md' } },
    Select: { defaultProps: { radius: 'md' } },
    Badge: { defaultProps: { radius: 'sm', fw: 600 } },
    Tooltip: { defaultProps: { radius: 'sm', withArrow: true, openDelay: 300 } },
  },
});
