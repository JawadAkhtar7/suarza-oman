/**
 * Products, and the stock movements that decide how many of each there are.
 *
 * The fields below are a starting point for the catalogue — the client will
 * refine what a product is. They are defined once, here, so a change lands in
 * the API's validation and the web app's form together.
 *
 * Quantity on hand is NEVER stored on the product. It is the sum of that
 * product's stock movements, for the same reason a customer's balance is the
 * sum of their ledger entries: a stored total is a second answer to a question
 * that already has one, and the two eventually disagree. Purchases and sales
 * will post movements here without anything in this file changing.
 */

import { z } from 'zod';

/** How a product is counted. Labels are what the screens show. */
export const PRODUCT_UNITS = [
  'PIECE',
  'KG',
  'TONNE',
  'BAG',
  'BOX',
  'CARTON',
  'LITRE',
  'METRE',
  'DOZEN',
] as const;
export const productUnitSchema = z.enum(PRODUCT_UNITS);
export type ProductUnit = z.infer<typeof productUnitSchema>;

export const PRODUCT_UNIT_LABELS: Record<ProductUnit, string> = {
  PIECE: 'Piece',
  KG: 'Kilogram',
  TONNE: 'Tonne',
  BAG: 'Bag',
  BOX: 'Box',
  CARTON: 'Carton',
  LITRE: 'Litre',
  METRE: 'Metre',
  DOZEN: 'Dozen',
};

/** The short form that fits in a table cell. */
export const PRODUCT_UNIT_SHORT: Record<ProductUnit, string> = {
  PIECE: 'pcs',
  KG: 'kg',
  TONNE: 't',
  BAG: 'bag',
  BOX: 'box',
  CARTON: 'ctn',
  LITRE: 'L',
  METRE: 'm',
  DOZEN: 'dz',
};

export const PRODUCT_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export const productStatusSchema = z.enum(PRODUCT_STATUSES);
export type ProductStatus = z.infer<typeof productStatusSchema>;

const optionalText = (max: number) => z.string().trim().max(max).default('');

/** Whole baisa — 1 OMR = 1000 baisa. Zero means "not priced yet". */
const priceBaisa = z.number().int().min(0).max(9_000_000_000).default(0);

/** Whole thousandths of a unit, so 12.5 kg is 12500. */
const quantityMilli = z.number().int().min(0).max(1_000_000_000).default(0);

export const createProductSchema = z.object({
  name: z.string().trim().min(2, 'Enter the product name').max(140),
  /**
   * The code people say out loud and write on a delivery note. Optional —
   * plenty of small traders do without one — but unique when given, so two
   * products can never answer to the same code.
   */
  code: z.string().trim().max(40).default(''),
  category: optionalText(60),
  unit: productUnitSchema.default('PIECE'),

  /** What it costs you, and what you sell it for. */
  cost_price_baisa: priceBaisa,
  sale_price_baisa: priceBaisa,
  /** Oman VAT is 5%; kept per product because not everything is standard-rated. */
  vat_rate_percent: z.number().min(0).max(100).default(5),

  /**
   * Some things sold are not stocked — delivery, labour, a service. Those
   * still belong in the catalogue but have no quantity to run out of.
   */
  track_stock: z.boolean().default(true),
  /** Warn below this. Zero means "do not warn". */
  reorder_level_milli: quantityMilli,

  status: productStatusSchema.default('ACTIVE'),
  notes: optionalText(1000),
});
export type CreateProductInput = z.infer<typeof createProductSchema>;

/**
 * What the "new product" form sends. Opening stock is not a field on the
 * product: it becomes the first stock movement, so the quantity on hand is the
 * sum of the movements from the very first one.
 */
export const createProductWithStockSchema = createProductSchema.extend({
  opening_stock_milli: quantityMilli,
});
export type CreateProductWithStockInput = z.infer<typeof createProductWithStockSchema>;

export const updateProductSchema = createProductSchema.partial();
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

export interface Product {
  id: string;
  name: string;
  code: string;
  category: string;
  unit: ProductUnit;
  cost_price_baisa: number;
  sale_price_baisa: number;
  vat_rate_percent: number;
  track_stock: boolean;
  reorder_level_milli: number;
  status: ProductStatus;
  notes: string;
  /** Summed from the movements on every read — never stored. */
  stock_milli: number;
  created_at: string;
  updated_at: string;
}

/* --- Stock movements ------------------------------------------------------ */

export const STOCK_KINDS = ['OPENING', 'PURCHASE', 'SALE', 'ADJUSTMENT'] as const;
export const stockKindSchema = z.enum(STOCK_KINDS);
export type StockKind = z.infer<typeof stockKindSchema>;

export const STOCK_KIND_LABELS: Record<StockKind, string> = {
  OPENING: 'Opening stock',
  PURCHASE: 'Purchase',
  SALE: 'Sale',
  ADJUSTMENT: 'Adjustment',
};

export const STOCK_DIRECTIONS = ['IN', 'OUT'] as const;
export const stockDirectionSchema = z.enum(STOCK_DIRECTIONS);
export type StockDirection = z.infer<typeof stockDirectionSchema>;

/** Purchases come in, sales go out; the rest have to say which way. */
export const STOCK_KIND_DIRECTION: Record<StockKind, StockDirection | null> = {
  OPENING: 'IN',
  PURCHASE: 'IN',
  SALE: 'OUT',
  ADJUSTMENT: null,
};

export const createStockMovementSchema = z
  .object({
    kind: stockKindSchema.default('ADJUSTMENT'),
    direction: stockDirectionSchema.optional(),
    quantity_milli: z
      .number()
      .int('Quantities go to three decimal places')
      .positive('Enter a quantity greater than zero')
      .max(1_000_000_000),
    /** Why the count changed. A stock figure nobody can explain is a guess. */
    reason: z.string().trim().min(1, 'Say why the stock changed').max(300),
    reference: z.string().trim().max(60).default(''),
    movement_date: z.coerce.date(),
  })
  .transform((movement) => ({
    ...movement,
    direction: movement.direction ?? STOCK_KIND_DIRECTION[movement.kind] ?? 'IN',
  }))
  .refine(
    (movement) =>
      STOCK_KIND_DIRECTION[movement.kind] === null ||
      STOCK_KIND_DIRECTION[movement.kind] === movement.direction,
    { message: 'That kind of movement cannot go in that direction', path: ['direction'] },
  );
export type CreateStockMovementInput = z.infer<typeof createStockMovementSchema>;

export interface StockMovement {
  id: string;
  product_id: string;
  kind: StockKind;
  direction: StockDirection;
  quantity_milli: number;
  reason: string;
  reference: string;
  movement_date: string;
  /** Stock after this movement, oldest to newest. */
  stock_after_milli: number;
  created_at: string;
}

/* --- Queries -------------------------------------------------------------- */

export const PRODUCT_STOCK_FILTERS = ['ALL', 'IN_STOCK', 'LOW', 'OUT'] as const;
export const productStockFilterSchema = z.enum(PRODUCT_STOCK_FILTERS);
export type ProductStockFilter = z.infer<typeof productStockFilterSchema>;

export const productQuerySchema = z.object({
  q: z.string().trim().max(120).default(''),
  category: z.string().trim().max(60).default(''),
  status: z.union([productStatusSchema, z.literal('ALL')]).default('ALL'),
  stock: productStockFilterSchema.default('ALL'),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(25),
  sort: z.enum(['name', 'created_at', 'stock']).default('name'),
  dir: z.enum(['asc', 'desc']).default('asc'),
});
export type ProductQuery = z.infer<typeof productQuerySchema>;

export interface ProductPage {
  rows: Product[];
  total: number;
  page: number;
  page_size: number;
}

export interface StockMovementPage {
  rows: StockMovement[];
  total: number;
  page: number;
  page_size: number;
}

export interface ProductSummary {
  total_products: number;
  active_products: number;
  /** At or below the reorder level, and not yet at zero. */
  low_stock: number;
  out_of_stock: number;
  /** Everything on hand, valued at cost. */
  stock_value_baisa: number;
}

/** What a product's stock level means, in the one word a badge shows. */
export function stockStanding(product: {
  track_stock: boolean;
  stock_milli: number;
  reorder_level_milli: number;
}): 'UNTRACKED' | 'OUT' | 'LOW' | 'OK' {
  if (!product.track_stock) return 'UNTRACKED';
  if (product.stock_milli <= 0) return 'OUT';
  if (product.reorder_level_milli > 0 && product.stock_milli <= product.reorder_level_milli) {
    return 'LOW';
  }
  return 'OK';
}

/** Margin as a percentage of the sale price; null when it cannot be worked out. */
export function marginPercent(costBaisa: number, saleBaisa: number): number | null {
  if (saleBaisa <= 0 || costBaisa <= 0) return null;
  return ((saleBaisa - costBaisa) / saleBaisa) * 100;
}
