/**
 * Reports: the business at a glance.
 *
 * Built to be read in one look rather than studied — the four figures that
 * matter across the top, the shape of trade underneath, then what sold and who
 * bought it. Every number here is aggregated live from the documents, so
 * nothing on this page can disagree with the screen it came from.
 *
 * Money is shown in whole rials on the charts and to three decimals in the
 * figures: a chart axis reading "1,234.567" teaches nobody anything, while a
 * total that hides its baisa cannot be reconciled against an invoice.
 */

import { useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Card,
  Center,
  Group,
  Loader,
  Paper,
  Progress,
  SegmentedControl,
  SimpleGrid,
  Skeleton,
  Stack,
  Table,
  Text,
  ThemeIcon,
  Title,
  Tooltip,
} from '@mantine/core';
import { AreaChart, BarChart, DonutChart } from '@mantine/charts';
import { useMediaQuery } from '@mantine/hooks';
import {
  IconArrowDownRight,
  IconArrowUpRight,
  IconBuildingWarehouse,
  IconCoins,
  IconPackages,
  IconReceipt2,
  IconShoppingCart,
  IconTrendingUp,
  IconUsers,
} from '@tabler/icons-react';
import { formatOMR, formatQuantity } from '@suarza-oman/shared';
import { useReportsOverview } from '../lib/reports.js';

type RangeKey = '7' | '30' | '90' | '365';

/* Short labels on a phone: four full ones cannot fit across 390px however the
   control is stretched, and the last one slides off the screen. */
const RANGES: { value: RangeKey; label: string; short: string }[] = [
  { value: '7', label: '7 days', short: '7d' },
  { value: '30', label: '30 days', short: '30d' },
  { value: '90', label: '3 months', short: '3m' },
  { value: '365', label: '12 months', short: '12m' },
];

/** Rials, rounded — chart axes and tooltips are for shape, not for audit. */
const rials = (baisa: number) => Math.round(baisa / 1000);

function Kpi({
  label,
  value,
  hint,
  icon,
  color,
  loading,
  trend,
}: {
  label: string;
  value: string;
  hint: string;
  icon: React.ReactNode;
  color: string;
  loading: boolean;
  trend?: 'up' | 'down';
}) {
  return (
    <Card withBorder radius="lg" padding="lg" style={{ overflow: 'hidden', position: 'relative' }}>
      {/* A whisper of the colour, so the four tiles read as a set without
          shouting four different colours at the same volume. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `linear-gradient(135deg, var(--mantine-color-${color}-light) 0%, transparent 60%)`,
          opacity: 0.5,
          pointerEvents: 'none',
        }}
      />
      <Group justify="space-between" align="flex-start" wrap="nowrap" style={{ position: 'relative' }}>
        <div style={{ minWidth: 0 }}>
          <Text fz="xs" tt="uppercase" fw={700} c="dimmed" style={{ letterSpacing: '0.06em' }}>
            {label}
          </Text>
          {loading ? (
            <Skeleton height={32} width={140} mt={8} />
          ) : (
            <Group gap={6} align="baseline" mt={6} wrap="nowrap">
              <Text fz={28} fw={700} style={{ fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>
                {value}
              </Text>
              {trend && (
                <ThemeIcon size="sm" radius="xl" variant="light" color={trend === 'up' ? 'brand' : 'red'}>
                  {trend === 'up' ? <IconArrowUpRight size={13} /> : <IconArrowDownRight size={13} />}
                </ThemeIcon>
              )}
            </Group>
          )}
          <Text fz="xs" c="dimmed" mt={6}>
            {hint}
          </Text>
        </div>
        <ThemeIcon size={42} radius="md" variant="light" color={color}>
          {icon}
        </ThemeIcon>
      </Group>
    </Card>
  );
}

function PanelTitle({ title, hint, icon }: { title: string; hint?: string; icon: React.ReactNode }) {
  return (
    <Group gap="sm" mb="md" wrap="nowrap">
      <ThemeIcon size={32} radius="md" variant="light" color="gray">
        {icon}
      </ThemeIcon>
      <div>
        <Text fw={650}>{title}</Text>
        {hint && (
          <Text fz="xs" c="dimmed">
            {hint}
          </Text>
        )}
      </div>
    </Group>
  );
}

export function ReportsPage() {
  const [range, setRange] = useState<RangeKey>('30');
  const isWide = useMediaQuery('(min-width: 48em)', true);

  const { from, to } = useMemo(() => {
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - (Number(range) - 1));
    return { from: start, to: end };
  }, [range]);

  const query = useReportsOverview(from, to);
  const report = query.data;

  /* Points are per-day; over a long range that is more ink than information,
     so longer ranges are shown weekly. */
  const series = useMemo(() => {
    const points = (report?.series ?? []).map((point) => ({
      date: point.date,
      Sales: rials(point.sales),
      Purchases: rials(point.purchases),
    }));
    if (points.length <= 62) return points;

    const weeks: typeof points = [];
    for (let i = 0; i < points.length; i += 7) {
      const week = points.slice(i, i + 7);
      weeks.push({
        date: week[0]!.date,
        Sales: week.reduce((sum, p) => sum + p.Sales, 0),
        Purchases: week.reduce((sum, p) => sum + p.Purchases, 0),
      });
    }
    return weeks;
  }, [report?.series]);

  const topProducts = (report?.top_products ?? []).map((product) => ({
    name: product.name.length > 22 ? `${product.name.slice(0, 21)}…` : product.name,
    Revenue: rials(product.revenue_baisa),
  }));

  const stockSlices = (report?.stock_by_category ?? []).map((row, index) => ({
    name: row.category,
    value: rials(row.value_baisa),
    color: ['brand.6', 'blue.5', 'orange.5', 'grape.5', 'teal.5', 'yellow.6', 'pink.5', 'cyan.5'][index % 8]!,
  }));

  const biggestCustomer = report?.top_customers?.[0]?.revenue_baisa ?? 0;

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-start" wrap="wrap" gap="md">
        <div>
          <Title order={1} fz={26}>
            Reports
          </Title>
          <Text c="dimmed" fz="sm" mt={4}>
            Everything below is worked out live from your sales, purchases and stock.
          </Text>
        </div>
        <SegmentedControl
          value={range}
          onChange={(value) => setRange(value as RangeKey)}
          data={RANGES.map((option) => ({
            value: option.value,
            label: isWide ? option.label : option.short,
          }))}
          size="md"
          fullWidth={!isWide}
          style={isWide ? undefined : { width: '100%' }}
        />
      </Group>

      {query.isError && (
        <Alert color="red" variant="light" title="Could not load the report">
          {query.error instanceof Error ? query.error.message : 'Unknown error'}
        </Alert>
      )}

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
        <Kpi
          label="Sales"
          value={formatOMR(report?.sales.total_baisa ?? 0)}
          hint={`${report?.sales.count ?? 0} ${report?.sales.count === 1 ? 'document' : 'documents'} in this period`}
          icon={<IconShoppingCart size={22} stroke={1.7} />}
          color="brand"
          loading={query.isLoading}
          trend="up"
        />
        <Kpi
          label="Purchases"
          value={formatOMR(report?.purchases.total_baisa ?? 0)}
          hint={`${report?.purchases.count ?? 0} ${report?.purchases.count === 1 ? 'document' : 'documents'} in this period`}
          icon={<IconBuildingWarehouse size={22} stroke={1.7} />}
          color="blue"
          loading={query.isLoading}
        />
        <Kpi
          label="Estimated margin"
          value={formatOMR(report?.margin_baisa ?? 0)}
          hint="Sales less what those goods cost today"
          icon={<IconTrendingUp size={22} stroke={1.7} />}
          color={(report?.margin_baisa ?? 0) < 0 ? 'red' : 'teal'}
          loading={query.isLoading}
          trend={(report?.margin_baisa ?? 0) < 0 ? 'down' : 'up'}
        />
        <Kpi
          label="Stock on hand"
          value={formatOMR(report?.stock_value_baisa ?? 0)}
          hint="Valued at cost, right now"
          icon={<IconPackages size={22} stroke={1.7} />}
          color="orange"
          loading={query.isLoading}
        />
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, lg: 3 }} spacing="md">
        <Card withBorder radius="lg" padding="lg" style={{ gridColumn: isWide ? 'span 2' : undefined }}>
          <PanelTitle
            title="Trade over time"
            hint={series.length > 62 ? 'Weekly totals' : 'Daily totals, in rials'}
            icon={<IconTrendingUp size={18} stroke={1.7} />}
          />
          {query.isLoading ? (
            <Skeleton height={260} radius="md" />
          ) : series.length === 0 ? (
            <Center h={260}>
              <Text c="dimmed" fz="sm">
                Nothing in this period yet.
              </Text>
            </Center>
          ) : (
            <AreaChart
              h={260}
              data={series}
              dataKey="date"
              withGradient
              withDots={false}
              curveType="monotone"
              tickLine="x"
              series={[
                { name: 'Sales', color: 'brand.6' },
                { name: 'Purchases', color: 'blue.5' },
              ]}
              valueFormatter={(value) => `OMR ${value.toLocaleString('en-OM')}`}
              xAxisProps={{
                tickFormatter: (value: string) =>
                  new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
                minTickGap: 24,
              }}
            />
          )}
        </Card>

        <Card withBorder radius="lg" padding="lg">
          <PanelTitle title="Stock by category" hint="At cost" icon={<IconPackages size={18} stroke={1.7} />} />
          {query.isLoading ? (
            <Skeleton height={260} radius="md" />
          ) : stockSlices.length === 0 ? (
            <Center h={260}>
              <Text c="dimmed" fz="sm">
                No stock on hand.
              </Text>
            </Center>
          ) : (
            <Stack align="center" gap="md">
              <DonutChart
                data={stockSlices}
                size={180}
                thickness={26}
                withLabelsLine={false}
                chartLabel={`OMR ${rials(report?.stock_value_baisa ?? 0).toLocaleString('en-OM')}`}
                valueFormatter={(value) => `OMR ${value.toLocaleString('en-OM')}`}
              />
              <Stack gap={6} w="100%">
                {stockSlices.slice(0, 5).map((slice) => (
                  <Group key={slice.name} justify="space-between" wrap="nowrap">
                    <Group gap={8} wrap="nowrap" style={{ minWidth: 0 }}>
                      <div
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: 3,
                          background: `var(--mantine-color-${slice.color.replace('.', '-')})`,
                          flexShrink: 0,
                        }}
                      />
                      <Text fz="xs" truncate>
                        {slice.name}
                      </Text>
                    </Group>
                    <Text fz="xs" fw={600} style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {slice.value.toLocaleString('en-OM')}
                    </Text>
                  </Group>
                ))}
              </Stack>
            </Stack>
          )}
        </Card>
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="md">
        <Card withBorder radius="lg" padding="lg">
          <PanelTitle
            title="What sold most"
            hint="By value, before VAT"
            icon={<IconReceipt2 size={18} stroke={1.7} />}
          />
          {query.isLoading ? (
            <Skeleton height={240} radius="md" />
          ) : topProducts.length === 0 ? (
            <Center h={240}>
              <Text c="dimmed" fz="sm">
                Nothing sold in this period.
              </Text>
            </Center>
          ) : (
            <BarChart
              h={240}
              data={topProducts}
              dataKey="name"
              orientation="vertical"
              yAxisProps={{ width: 110 }}
              barProps={{ radius: [0, 6, 6, 0] }}
              series={[{ name: 'Revenue', color: 'brand.6' }]}
              valueFormatter={(value) => `OMR ${value.toLocaleString('en-OM')}`}
            />
          )}
        </Card>

        <Card withBorder radius="lg" padding="lg">
          <PanelTitle
            title="Who bought most"
            hint="By value, before VAT"
            icon={<IconUsers size={18} stroke={1.7} />}
          />
          {query.isLoading ? (
            <Skeleton height={240} radius="md" />
          ) : (report?.top_customers.length ?? 0) === 0 ? (
            <Center h={240}>
              <Text c="dimmed" fz="sm">
                No customers in this period.
              </Text>
            </Center>
          ) : (
            <Stack gap="md">
              {report?.top_customers.map((customer) => (
                <div key={customer.name}>
                  <Group justify="space-between" mb={4} wrap="nowrap">
                    <Text fz="sm" fw={550} truncate>
                      {customer.name}
                    </Text>
                    <Group gap={8} wrap="nowrap">
                      <Badge size="xs" variant="light" color="gray">
                        {customer.count}
                      </Badge>
                      <Text fz="sm" fw={650} style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {formatOMR(customer.revenue_baisa, { symbol: false })}
                      </Text>
                    </Group>
                  </Group>
                  {/* The bar is the comparison; the number is the fact. */}
                  <Progress
                    value={biggestCustomer > 0 ? (customer.revenue_baisa / biggestCustomer) * 100 : 0}
                    color="brand"
                    size="sm"
                    radius="xl"
                    transitionDuration={400}
                  />
                </div>
              ))}
            </Stack>
          )}
        </Card>
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="md">
        <Paper withBorder radius="lg" p="lg">
          <PanelTitle
            title="Money owed"
            hint="Across every account, right now"
            icon={<IconCoins size={18} stroke={1.7} />}
          />
          <SimpleGrid cols={2} spacing="lg">
            <div>
              <Text fz="xs" tt="uppercase" fw={700} c="dimmed" style={{ letterSpacing: '0.06em' }}>
                Owed to you
              </Text>
              <Text fz={24} fw={700} c="red" mt={4} style={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatOMR(report?.receivable_baisa ?? 0)}
              </Text>
            </div>
            <div>
              <Text fz="xs" tt="uppercase" fw={700} c="dimmed" style={{ letterSpacing: '0.06em' }}>
                You owe
              </Text>
              <Text fz={24} fw={700} c="orange" mt={4} style={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatOMR(report?.payable_baisa ?? 0)}
              </Text>
            </div>
          </SimpleGrid>
          <Text fz="xs" c="dimmed" mt="md">
            Never netted against each other — what is out there to collect and what has to be paid
            are two different problems.
          </Text>
        </Paper>

        <Paper withBorder radius="lg" p="lg">
          <PanelTitle title="VAT in this period" hint="Collected against paid" icon={<IconReceipt2 size={18} stroke={1.7} />} />
          <Table withRowBorders={false} verticalSpacing="xs">
            <Table.Tbody>
              <Table.Tr>
                <Table.Td>
                  <Text fz="sm" c="dimmed">
                    On sales
                  </Text>
                </Table.Td>
                <Table.Td ta="right">
                  <Text fz="sm" fw={600} style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {formatOMR(report?.sales.vat_baisa ?? 0)}
                  </Text>
                </Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Td>
                  <Text fz="sm" c="dimmed">
                    On purchases
                  </Text>
                </Table.Td>
                <Table.Td ta="right">
                  <Text fz="sm" fw={600} style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {formatOMR(report?.purchases.vat_baisa ?? 0)}
                  </Text>
                </Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Td>
                  <Text fz="sm" fw={650}>
                    Difference
                  </Text>
                </Table.Td>
                <Table.Td ta="right">
                  <Tooltip label="A rough figure, not a filing — it counts documents in this period only">
                    <Text fz="sm" fw={700} style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {formatOMR((report?.sales.vat_baisa ?? 0) - (report?.purchases.vat_baisa ?? 0))}
                    </Text>
                  </Tooltip>
                </Table.Td>
              </Table.Tr>
            </Table.Tbody>
          </Table>
        </Paper>
      </SimpleGrid>

      {query.isFetching && !query.isLoading && (
        <Center>
          <Loader size="xs" />
        </Center>
      )}

      {report?.top_products[0] && (
        <Text fz="xs" c="dimmed" ta="center">
          Best seller in this period: {report.top_products[0].name} —{' '}
          {formatQuantity(report.top_products[0].quantity_milli)} sold
        </Text>
      )}
    </Stack>
  );
}
