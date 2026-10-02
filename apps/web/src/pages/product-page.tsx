/**
 * One product: what it is, what it costs, and the stock card behind its count.
 *
 * The card reads newest first — the way somebody checks "did that delivery get
 * entered" — with the running quantity beside each row, so any line can be
 * pointed at when the shelf and the screen disagree.
 */

import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Alert,
  Anchor,
  Badge,
  Button,
  Card,
  Center,
  Group,
  Loader,
  Pagination,
  Paper,
  SimpleGrid,
  Stack,
  Table,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core';
import { useDisclosure, useMediaQuery } from '@mantine/hooks';
import {
  IconArrowLeft,
  IconArrowsExchange,
  IconPackages,
  IconPencil,
} from '@tabler/icons-react';
import {
  PRODUCT_UNIT_LABELS,
  PRODUCT_UNIT_SHORT,
  STOCK_KIND_LABELS,
  formatDate,
  formatOMR,
  formatQuantity,
  marginPercent,
  stockStanding,
} from '@suarza-oman/shared';
import { ProductModal } from '../components/products/product-modal.js';
import { StockModal } from '../components/products/stock-modal.js';
import { StockBadge } from '../components/products/stock-badge.js';
import { useProduct, useStockMovements } from '../lib/products.js';

function Fact({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <Text fz="xs" tt="uppercase" fw={700} c="dimmed" style={{ letterSpacing: '0.06em' }}>
        {label}
      </Text>
      <Text fz="lg" fw={650} mt={2} style={{ fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </Text>
      {hint && (
        <Text fz="xs" c="dimmed">
          {hint}
        </Text>
      )}
    </div>
  );
}

export function ProductPage() {
  const { productId = '' } = useParams();
  const [page, setPage] = useState(1);
  const [editOpen, { open: openEdit, close: closeEdit }] = useDisclosure(false);
  const [stockOpen, { open: openStock, close: closeStock }] = useDisclosure(false);
  const isWide = useMediaQuery('(min-width: 48em)', true);

  const product = useProduct(productId);
  const movements = useStockMovements(productId, page);

  if (product.isLoading) {
    return (
      <Center py={80}>
        <Loader />
      </Center>
    );
  }

  if (product.isError || !product.data) {
    return (
      <Stack gap="md">
        <Anchor component={Link} to="/products" fz="sm">
          <Group gap={6}>
            <IconArrowLeft size={15} /> Products
          </Group>
        </Anchor>
        <Alert color="red" title="Could not open this product">
          {product.error instanceof Error ? product.error.message : 'Unknown error'}
        </Alert>
      </Stack>
    );
  }

  const item = product.data;
  const unit = PRODUCT_UNIT_SHORT[item.unit];
  const margin = marginPercent(item.cost_price_baisa, item.sale_price_baisa);
  const standing = stockStanding(item);
  const rows = movements.data?.rows ?? [];
  const pages = Math.max(1, Math.ceil((movements.data?.total ?? 0) / 50));

  return (
    <Stack gap="lg">
      <Anchor component={Link} to="/products" fz="sm" c="dimmed">
        <Group gap={6}>
          <IconArrowLeft size={15} /> Products
        </Group>
      </Anchor>

      <Card withBorder radius="lg" padding="lg">
        <Group justify="space-between" align="flex-start" wrap="wrap" gap="lg">
          <div>
            <Group gap="sm">
              <Title order={1} fz={24}>
                {item.name}
              </Title>
              <StockBadge product={item} />
              {item.status === 'INACTIVE' && (
                <Badge color="gray" variant="outline">
                  Inactive
                </Badge>
              )}
            </Group>
            <Text c="dimmed" fz="sm" mt={4}>
              {[item.code, item.category, PRODUCT_UNIT_LABELS[item.unit]].filter(Boolean).join(' · ')}
            </Text>
          </div>

          <Group gap="sm">
            <Button variant="default" leftSection={<IconPencil size={16} />} onClick={openEdit}>
              Edit
            </Button>
            {item.track_stock && (
              <Button leftSection={<IconArrowsExchange size={16} />} onClick={openStock}>
                Stock movement
              </Button>
            )}
          </Group>
        </Group>

        <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="lg" mt="lg">
          <Fact
            label="In stock"
            value={item.track_stock ? `${formatQuantity(item.stock_milli)} ${unit}` : '—'}
            hint={
              item.track_stock
                ? item.reorder_level_milli > 0
                  ? `Warn below ${formatQuantity(item.reorder_level_milli)} ${unit}`
                  : 'No warning level set'
                : 'Stock is not counted'
            }
          />
          <Fact label="Cost" value={formatOMR(item.cost_price_baisa)} hint={`per ${unit}`} />
          <Fact
            label="Sale price"
            value={formatOMR(item.sale_price_baisa)}
            hint={margin === null ? `VAT ${item.vat_rate_percent}%` : `Margin ${margin.toFixed(1)}%`}
          />
          <Fact
            label="Stock value"
            value={formatOMR(Math.max(0, item.stock_milli) * item.cost_price_baisa / 1000)}
            hint="What you have, at cost price"
          />
        </SimpleGrid>

        {item.notes && (
          <Text fz="sm" c="dimmed" mt="lg">
            {item.notes}
          </Text>
        )}
      </Card>

      {standing === 'OUT' && item.track_stock && (
        <Alert color="red" variant="light" title="Nothing left">
          {item.stock_milli < 0
            ? `The count is ${formatQuantity(item.stock_milli)} ${unit} — more has gone out than was recorded coming in. Record what arrived, or adjust the count.`
            : 'Record a purchase when the next delivery arrives.'}
        </Alert>
      )}

      {item.track_stock && (
        <Paper withBorder radius="lg" p={0}>
          <Group p="md" justify="space-between">
            <Text fw={650}>Stock card</Text>
            <Text fz="sm" c="dimmed">
              {movements.data?.total ?? 0} {movements.data?.total === 1 ? 'movement' : 'movements'}
            </Text>
          </Group>

          {movements.isLoading ? (
            <Center py="xl">
              <Loader size="sm" />
            </Center>
          ) : rows.length === 0 ? (
            <Center py={48} px="md">
              <Stack align="center" gap="xs" maw={340} ta="center">
                <ThemeIcon size={48} radius="lg" variant="light" color="brand">
                  <IconPackages size={22} stroke={1.5} />
                </ThemeIcon>
                <Text fw={650}>Nothing recorded yet</Text>
                <Text c="dimmed" fz="sm">
                  Record what arrives and what goes out, and the count keeps itself.
                </Text>
                <Button mt="xs" leftSection={<IconArrowsExchange size={16} />} onClick={openStock}>
                  Record the first movement
                </Button>
              </Stack>
            </Center>
          ) : isWide ? (
            <Table.ScrollContainer minWidth={760}>
              <Table verticalSpacing="sm" horizontalSpacing="lg">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Date</Table.Th>
                    <Table.Th>Reason</Table.Th>
                    <Table.Th ta="right">In</Table.Th>
                    <Table.Th ta="right">Out</Table.Th>
                    <Table.Th ta="right">On hand</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {rows.map((movement) => (
                    <Table.Tr key={movement.id}>
                      <Table.Td>
                        <Text fz="sm">{formatDate(movement.movement_date)}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Group gap={8} wrap="nowrap">
                          <Text fz="sm" fw={550}>
                            {movement.reason}
                          </Text>
                          <Badge size="xs" variant="outline" color="gray">
                            {STOCK_KIND_LABELS[movement.kind]}
                          </Badge>
                        </Group>
                        {movement.reference && (
                          <Text fz="xs" c="dimmed">
                            {movement.reference}
                          </Text>
                        )}
                      </Table.Td>
                      <Table.Td ta="right">
                        {movement.direction === 'IN' && (
                          <Text fz="sm" c="brand" style={{ fontVariantNumeric: 'tabular-nums' }}>
                            {formatQuantity(movement.quantity_milli)}
                          </Text>
                        )}
                      </Table.Td>
                      <Table.Td ta="right">
                        {movement.direction === 'OUT' && (
                          <Text fz="sm" c="red" style={{ fontVariantNumeric: 'tabular-nums' }}>
                            {formatQuantity(movement.quantity_milli)}
                          </Text>
                        )}
                      </Table.Td>
                      <Table.Td ta="right">
                        <Text fz="sm" fw={600} style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {formatQuantity(movement.stock_after_milli)}
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          ) : (
            <Stack gap="sm" p="md">
              {rows.map((movement) => (
                <Card key={movement.id} withBorder padding="md" radius="md">
                  <Group justify="space-between" wrap="nowrap" align="flex-start">
                    <div style={{ minWidth: 0 }}>
                      <Text fz="sm" fw={600}>
                        {movement.reason}
                      </Text>
                      <Text fz="xs" c="dimmed">
                        {formatDate(movement.movement_date)} · {STOCK_KIND_LABELS[movement.kind]}
                      </Text>
                    </div>
                    <Text
                      fz="sm"
                      fw={650}
                      c={movement.direction === 'IN' ? 'brand' : 'red'}
                      style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}
                    >
                      {movement.direction === 'IN' ? '+' : '−'}
                      {formatQuantity(movement.quantity_milli)} {unit}
                    </Text>
                  </Group>
                  <Text fz="xs" c="dimmed" ta="right" mt="xs">
                    On hand {formatQuantity(movement.stock_after_milli)} {unit}
                  </Text>
                </Card>
              ))}
            </Stack>
          )}

          {pages > 1 && (
            <Group justify="flex-end" p="md">
              <Pagination value={page} onChange={setPage} total={pages} size="sm" />
            </Group>
          )}
        </Paper>
      )}

      <ProductModal opened={editOpen} onClose={closeEdit} product={item} />
      <StockModal opened={stockOpen} onClose={closeStock} product={item} />
    </Stack>
  );
}
