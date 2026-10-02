/**
 * The catalogue: what you sell, what it costs, and how much is left.
 *
 * Alphabetical by default — this is the list somebody opens to find a product,
 * not to rank them. The summary tiles answer the one question worth asking
 * before that: is anything about to run out.
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Center,
  Group,
  Menu,
  Pagination,
  Paper,
  SegmentedControl,
  SimpleGrid,
  Skeleton,
  Stack,
  Table,
  Text,
  TextInput,
  ThemeIcon,
  Title,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import { useDebouncedValue, useDisclosure, useMediaQuery } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import {
  IconAlertTriangle,
  IconBox,
  IconBoxOff,
  IconCoins,
  IconDots,
  IconPackages,
  IconPencil,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconTrash,
  IconX,
} from '@tabler/icons-react';
import {
  PRODUCT_UNIT_SHORT,
  formatOMR,
  type Product,
  type ProductStockFilter,
} from '@suarza-oman/shared';
import { StockAmount, StockBadge } from '../components/products/stock-badge.js';
import { ProductModal } from '../components/products/product-modal.js';
import { useDeleteProduct, useProductSummary, useProducts } from '../lib/products.js';

const PAGE_SIZE = 25;

function Tile({
  label,
  value,
  hint,
  icon,
  color,
  loading,
}: {
  label: string;
  value: string;
  hint: string;
  icon: React.ReactNode;
  color: string;
  loading: boolean;
}) {
  return (
    <Card withBorder radius="lg" padding="lg">
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <div style={{ minWidth: 0 }}>
          <Text fz="xs" tt="uppercase" fw={700} c="dimmed" style={{ letterSpacing: '0.06em' }}>
            {label}
          </Text>
          {loading ? (
            <Skeleton height={30} width={110} mt={8} />
          ) : (
            <Text
              fz={26}
              fw={700}
              mt={6}
              c={color === 'gray' ? undefined : color}
              style={{ fontVariantNumeric: 'tabular-nums', lineHeight: 1.15 }}
            >
              {value}
            </Text>
          )}
          <Text fz="xs" c="dimmed" mt={6}>
            {hint}
          </Text>
        </div>
        <ThemeIcon size={40} radius="md" variant="light" color={color}>
          {icon}
        </ThemeIcon>
      </Group>
    </Card>
  );
}

export function ProductsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [debounced] = useDebouncedValue(search, 300);
  const [stock, setStock] = useState<ProductStockFilter>('ALL');
  const [page, setPage] = useState(1);
  const isWide = useMediaQuery('(min-width: 48em)', true);

  const [modalOpen, { open: openModal, close: closeModal }] = useDisclosure(false);
  const [editing, setEditing] = useState<Product | null>(null);

  const summary = useProductSummary();
  const query = useProducts({
    q: debounced,
    category: '',
    status: 'ALL',
    stock,
    page,
    page_size: PAGE_SIZE,
  });
  const remove = useDeleteProduct();

  useEffect(() => setPage(1), [debounced, stock]);

  const rows = query.data?.rows ?? [];
  const total = query.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const startCreate = () => {
    setEditing(null);
    openModal();
  };

  const startEdit = (product: Product) => {
    setEditing(product);
    openModal();
  };

  const confirmDelete = (product: Product) => {
    modals.openConfirmModal({
      title: 'Delete this product?',
      centered: true,
      children: (
        <Text size="sm">
          <strong>{product.name}</strong> will be removed from the catalogue. This cannot be undone.
        </Text>
      ),
      labels: { confirm: 'Delete product', cancel: 'Keep it' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        try {
          await remove.mutateAsync(product.id);
          notifications.show({ title: 'Product deleted', message: product.name, color: 'gray' });
        } catch (error) {
          /* A product with stock history cannot be deleted; the API says so in
             a sentence worth showing as-is. */
          notifications.show({
            title: 'Could not delete',
            message: error instanceof Error ? error.message : 'Unknown error',
            color: 'red',
            autoClose: 8000,
          });
        }
      },
    });
  };

  const empty = !query.isLoading && rows.length === 0;
  const isFiltered = debounced !== '' || stock !== 'ALL';

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-start" wrap="wrap" gap="md">
        <div>
          <Group gap="sm">
            <Title order={1} fz={26}>
              Products
            </Title>
            {total > 0 && (
              <Badge variant="light" color="gray" size="lg">
                {total}
              </Badge>
            )}
          </Group>
          <Text c="dimmed" fz="sm" mt={4}>
            What you sell, what it costs, and how much is left.
          </Text>
        </div>
        <Button leftSection={<IconPlus size={17} />} onClick={startCreate} size="md">
          New product
        </Button>
      </Group>

      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
        <Tile
          label="Stock value"
          value={formatOMR(summary.data?.stock_value_baisa ?? 0)}
          hint="Everything you have, at cost price"
          icon={<IconCoins size={21} stroke={1.7} />}
          color="gray"
          loading={summary.isLoading}
        />
        <Tile
          label="Running low"
          value={String(summary.data?.low_stock ?? 0)}
          hint="At or below the warning level"
          icon={<IconAlertTriangle size={21} stroke={1.7} />}
          color="orange"
          loading={summary.isLoading}
        />
        <Tile
          label="Out of stock"
          value={String(summary.data?.out_of_stock ?? 0)}
          hint="Nothing left to sell"
          icon={<IconBoxOff size={21} stroke={1.7} />}
          color="red"
          loading={summary.isLoading}
        />
      </SimpleGrid>

      <Paper withBorder radius="lg" p={0}>
        <Group p="md" gap="sm" wrap="wrap" justify="space-between">
          <TextInput
            placeholder="Search name, code or category"
            leftSection={<IconSearch size={16} stroke={1.7} />}
            rightSection={
              search ? (
                <ActionIcon variant="subtle" color="gray" onClick={() => setSearch('')} aria-label="Clear search">
                  <IconX size={14} />
                </ActionIcon>
              ) : null
            }
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
            style={{ flex: '1 1 300px' }}
            size="md"
          />
          <Group gap="sm">
            <SegmentedControl
              value={stock}
              onChange={(value) => setStock(value as ProductStockFilter)}
              data={[
                { label: 'All', value: 'ALL' },
                { label: 'In stock', value: 'IN_STOCK' },
                { label: 'Low', value: 'LOW' },
                { label: 'Out', value: 'OUT' },
              ]}
              size="md"
            />
            <Tooltip label="Refresh">
              <ActionIcon
                variant="default"
                size="lg"
                onClick={() => {
                  void query.refetch();
                  void summary.refetch();
                }}
                loading={query.isFetching}
                aria-label="Refresh"
              >
                <IconRefresh size={17} stroke={1.7} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>

        {query.isError ? (
          <Center p="xl">
            <Stack align="center" gap="xs">
              <Text fw={600}>Could not load products</Text>
              <Text c="dimmed" fz="sm">
                {query.error instanceof Error ? query.error.message : 'Unknown error'}
              </Text>
            </Stack>
          </Center>
        ) : query.isLoading ? (
          <Stack gap="xs" p="md">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} height={46} radius="sm" />
            ))}
          </Stack>
        ) : empty ? (
          <Center py={56} px="md">
            <Stack align="center" gap="xs" maw={380} ta="center">
              <ThemeIcon size={52} radius="lg" variant="light" color="brand">
                <IconPackages size={24} stroke={1.5} />
              </ThemeIcon>
              <Text fw={650} fz="lg">
                {isFiltered ? 'No product matches that' : 'No products yet'}
              </Text>
              <Text c="dimmed" fz="sm">
                {isFiltered
                  ? 'Try a shorter search, or clear the filters.'
                  : 'Add the first one, and you can use it on every sale and purchase.'}
              </Text>
              {!isFiltered && (
                <Button mt="xs" leftSection={<IconBox size={17} />} onClick={startCreate}>
                  Define the first product
                </Button>
              )}
            </Stack>
          </Center>
        ) : isWide ? (
          <Table.ScrollContainer minWidth={820}>
            <Table verticalSpacing="sm" horizontalSpacing="lg">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Product</Table.Th>
                  <Table.Th>Category</Table.Th>
                  <Table.Th ta="right">Cost</Table.Th>
                  <Table.Th ta="right">Sale</Table.Th>
                  <Table.Th ta="right">In stock</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th w={40} />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {rows.map((product) => (
                  <Table.Tr
                    key={product.id}
                    style={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/products/${product.id}`)}
                  >
                    <Table.Td>
                      <Text fz="sm" fw={600}>
                        {product.name}
                      </Text>
                      <Group gap={6}>
                        <Text fz="xs" c="dimmed">
                          {product.code || '—'}
                        </Text>
                        <Text fz="xs" c="dimmed">
                          · per {PRODUCT_UNIT_SHORT[product.unit]}
                        </Text>
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Text fz="sm" c={product.category ? undefined : 'dimmed'}>
                        {product.category || '—'}
                      </Text>
                    </Table.Td>
                    <Table.Td ta="right">
                      <Text fz="sm" c="dimmed" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {formatOMR(product.cost_price_baisa, { symbol: false })}
                      </Text>
                    </Table.Td>
                    <Table.Td ta="right">
                      <Text fz="sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {formatOMR(product.sale_price_baisa, { symbol: false })}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <StockAmount product={product} />
                    </Table.Td>
                    <Table.Td>
                      <StockBadge product={product} />
                    </Table.Td>
                    <Table.Td onClick={(event) => event.stopPropagation()}>
                      <Menu position="bottom-end" withArrow shadow="md">
                        <Menu.Target>
                          <ActionIcon variant="subtle" color="gray" aria-label={`Actions for ${product.name}`}>
                            <IconDots size={16} />
                          </ActionIcon>
                        </Menu.Target>
                        <Menu.Dropdown>
                          <Menu.Item leftSection={<IconPencil size={15} />} onClick={() => startEdit(product)}>
                            Edit
                          </Menu.Item>
                          <Menu.Divider />
                          <Menu.Item
                            color="red"
                            leftSection={<IconTrash size={15} />}
                            onClick={() => confirmDelete(product)}
                          >
                            Delete
                          </Menu.Item>
                        </Menu.Dropdown>
                      </Menu>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        ) : (
          <Stack gap="sm" p="md">
            {rows.map((product) => (
              <UnstyledButton key={product.id} onClick={() => navigate(`/products/${product.id}`)}>
                <Card withBorder padding="md" radius="md">
                  <Group justify="space-between" wrap="nowrap" align="flex-start">
                    <div style={{ minWidth: 0 }}>
                      <Text fz="sm" fw={600} truncate>
                        {product.name}
                      </Text>
                      <Text fz="xs" c="dimmed" truncate>
                        {product.code || '—'} · {formatOMR(product.sale_price_baisa)}
                      </Text>
                    </div>
                    <StockAmount product={product} />
                  </Group>
                  <Group justify="space-between" mt="sm">
                    <StockBadge product={product} />
                    <Text fz="xs" c="dimmed">
                      {product.category || 'Uncategorised'}
                    </Text>
                  </Group>
                </Card>
              </UnstyledButton>
            ))}
          </Stack>
        )}

        {rows.length > 0 && (
          <Group justify="space-between" p="md" wrap="wrap" gap="sm">
            <Text fz="sm" c="dimmed">
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
            </Text>
            {pages > 1 && <Pagination value={page} onChange={setPage} total={pages} size="sm" />}
          </Group>
        )}
      </Paper>

      <ProductModal opened={modalOpen} onClose={closeModal} product={editing} />
    </Stack>
  );
}
