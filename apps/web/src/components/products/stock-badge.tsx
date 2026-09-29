/**
 * How much is left, said in a way that survives a glance.
 *
 * The number never appears without its unit — "40" is meaningless when the
 * catalogue holds bags, tonnes and metres — and the colour repeats what the
 * word already says rather than carrying the meaning alone.
 */

import { Badge, Group, Text } from '@mantine/core';
import {
  PRODUCT_UNIT_SHORT,
  formatQuantity,
  stockStanding,
  type Product,
} from '@suarza-oman/shared';

const STANDING = {
  OK: { label: 'In stock', color: 'brand' },
  LOW: { label: 'Low', color: 'orange' },
  OUT: { label: 'Out of stock', color: 'red' },
  UNTRACKED: { label: 'Not stocked', color: 'gray' },
} as const;

export function StockBadge({ product }: { product: Product }) {
  const standing = stockStanding(product);
  return (
    <Badge color={STANDING[standing].color} variant="light" size="sm">
      {STANDING[standing].label}
    </Badge>
  );
}

export function StockAmount({ product, size = 'sm' }: { product: Product; size?: string }) {
  const standing = stockStanding(product);

  if (standing === 'UNTRACKED') {
    return (
      <Text fz={size} c="dimmed">
        —
      </Text>
    );
  }

  return (
    <Group gap={5} justify="flex-end" wrap="nowrap">
      <Text
        fz={size}
        fw={650}
        c={standing === 'OUT' ? 'red' : standing === 'LOW' ? 'orange' : undefined}
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {/* Negative stock is real — it means more was sold than was recorded —
            and hiding the sign would turn a problem into a plausible figure. */}
        {formatQuantity(product.stock_milli)}
      </Text>
      <Text fz="xs" c="dimmed">
        {PRODUCT_UNIT_SHORT[product.unit]}
      </Text>
    </Group>
  );
}
