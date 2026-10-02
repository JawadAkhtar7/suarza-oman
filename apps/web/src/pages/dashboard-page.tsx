/**
 * The landing screen: the business in one look.
 *
 * Built around a single question — "is anything wrong, and how are we doing?" —
 * so it is ordered the way somebody actually scans it: four headline figures,
 * then anything that needs a decision today, then the shape of trade, then who
 * and what is driving it. Nothing here is a number you have to work out; every
 * tile either states a fact or says it is zero.
 *
 * Every figure is aggregated live from the documents, the ledger and the stock
 * movements. Nothing is stored twice, so no tile here can disagree with the
 * screen it came from.
 *
 * One chart, not four. The dashboard's job is the headline; the shape of a
 * category split or a per-product bar is a Reports question, and putting it
 * here would cost the glance without answering anything.
 */

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Alert,
  Anchor,
  Badge,
  Button,
  Card,
  Center,
  Group,
  Progress,
  SegmentedControl,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  ThemeIcon,
  Title,
  Tooltip,
} from '@mantine/core';
import { AreaChart } from '@mantine/charts';
import { useMediaQuery } from '@mantine/hooks';
import {
  IconAlertTriangle,
  IconArrowDownRight,
  IconArrowRight,
  IconArrowUpRight,
  IconBox,
  IconBuildingWarehouse,
  IconCheck,
  IconCoins,
  IconPackages,
  IconPlus,
  IconReceipt2,
  IconShoppingCart,
  IconTrendingUp,
  IconUsers,
  type Icon,
} from '@tabler/icons-react';
import { formatOMR, formatQuantity } from '@suarza-oman/shared';
import { useReportsOverview } from '../lib/reports.js';
import { useLedgerCustomers } from '../lib/ledger.js';
import { useProductSummary } from '../lib/products.js';
import { useEmployeeSummary } from '../lib/employees.js';

type RangeKey = '7' | '30' | '90';

const RANGES: { value: RangeKey; label: string; short: string }[] = [
  { value: '7', label: '7 days', short: '7d' },
  { value: '30', label: '30 days', short: '30d' },
  { value: '90', label: '3 months', short: '3m' },
];

const DAY = 24 * 60 * 60 * 1000;

/** Rials, rounded — a chart axis reading "1,234.567" teaches nobody anything. */
const rials = (baisa: number) => Math.round(baisa / 1000);

/**
 * The change against the period immediately before this one.
 *
 * Null rather than "+100%" when there is nothing to compare against: a first
 * month of trading has not grown infinitely, it has simply started, and a
 * made-up percentage on a dashboard is the fastest way to lose one.
 */
function change(now: number, before: number): number | null {
  if (before <= 0) return null;
  return Math.round(((now - before) / before) * 100);
}

function Delta({ percent }: { percent: number | null }) {
  if (percent === null || percent === 0) return null;
  const up = percent > 0;
  return (
    <Group gap={2} wrap="nowrap">
      {up ? (
        <IconArrowUpRight size={14} stroke={2.2} color="var(--mantine-color-teal-6)" />
      ) : (
        <IconArrowDownRight size={14} stroke={2.2} color="var(--mantine-color-red-6)" />
      )}
      <Text fz="xs" fw={700} c={up ? 'teal.7' : 'red.7'}>
        {Math.abs(percent)}%
      </Text>
    </Group>
  );
}

/** A headline figure. The whole card is the link — a small arrow is a bad target. */
function Kpi({
  label,
  value,
  hint,
  icon: IconComponent,
  color,
  loading,
  delta,
  to,
}: {
  label: string;
  value: string;
  hint: string;
  icon: Icon;
  color: string;
  loading: boolean;
  delta?: number | null;
  to?: string;
}) {
  const body = (
    <Card withBorder radius="lg" padding="lg" h="100%" style={to ? { cursor: 'pointer' } : undefined}>
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <div style={{ minWidth: 0 }}>
          <Text fz="xs" tt="uppercase" fw={700} c="dimmed" style={{ letterSpacing: '0.06em' }}>
            {label}
          </Text>
          {loading ? (
            <Skeleton height={32} width={130} mt={8} />
          ) : (
            <Group gap="xs" align="baseline" wrap="nowrap" mt={6}>
              <Text fz={28} fw={700} style={{ fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>
                {value}
              </Text>
              <Delta percent={delta ?? null} />
            </Group>
          )}
          <Text fz="xs" c="dimmed" mt={6}>
            {hint}
          </Text>
        </div>
        <ThemeIcon size={42} radius="md" variant="light" color={color}>
          <IconComponent size={22} stroke={1.7} />
        </ThemeIcon>
      </Group>
    </Card>
  );

  return to ? (
    <Link to={to} style={{ textDecoration: 'none', color: 'inherit' }}>
      {body}
    </Link>
  ) : (
    body
  );
}

/** A smaller fact, for the second row. */
function Fact({
  label,
  value,
  hint,
  icon: IconComponent,
  color,
  loading,
}: {
  label: string;
  value: string;
  hint: string;
  icon: Icon;
  color: string;
  loading: boolean;
}) {
  return (
    <Card withBorder radius="lg" padding="md">
      <Group gap="sm" wrap="nowrap" align="flex-start">
        <ThemeIcon size={34} radius="md" variant="light" color={color}>
          <IconComponent size={18} stroke={1.7} />
        </ThemeIcon>
        <div style={{ minWidth: 0 }}>
          <Text fz="xs" c="dimmed" fw={600}>
            {label}
          </Text>
          {loading ? (
            <Skeleton height={20} width={90} mt={6} />
          ) : (
            <Text fz="lg" fw={700} style={{ fontVariantNumeric: 'tabular-nums' }}>
              {value}
            </Text>
          )}
          <Text fz="xs" c="dimmed">
            {hint}
          </Text>
        </div>
      </Group>
    </Card>
  );
}

function PanelTitle({ title, hint, to }: { title: string; hint: string; to?: string }) {
  return (
    <Group justify="space-between" align="flex-end" mb="sm" wrap="nowrap">
      <div>
        <Text fw={650}>{title}</Text>
        <Text fz="xs" c="dimmed">
          {hint}
        </Text>
      </div>
      {to && (
        <Anchor component={Link} to={to} fz="xs" fw={600}>
          <Group gap={3} wrap="nowrap">
            All <IconArrowRight size={13} />
          </Group>
        </Anchor>
      )}
    </Group>
  );
}

/**
 * A ranked list with a bar behind each row.
 *
 * The bar is the comparison and the figure is the fact; neither on its own
 * answers "is the top one twice the second, or barely ahead".
 */
function Ranked({
  rows,
  empty,
  loading,
}: {
  rows: { key: string; label: string; sub: string; value: number }[];
  empty: string;
  loading: boolean;
}) {
  if (loading) {
    return (
      <Stack gap="xs">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} height={34} radius="sm" />
        ))}
      </Stack>
    );
  }
  if (rows.length === 0) {
    return (
      <Center py="lg">
        <Text fz="sm" c="dimmed">
          {empty}
        </Text>
      </Center>
    );
  }

  const top = Math.max(...rows.map((row) => row.value), 1);

  return (
    <Stack gap="sm">
      {rows.map((row) => (
        <div key={row.key}>
          <Group justify="space-between" gap="sm" wrap="nowrap" mb={4}>
            <Text fz="sm" fw={500} truncate>
              {row.label}
            </Text>
            <Text fz="sm" fw={650} style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
              {formatOMR(row.value, { symbol: false })}
            </Text>
          </Group>
          <Progress value={(row.value / top) * 100} size="xs" radius="xl" color="brand" />
          <Text fz="xs" c="dimmed" mt={3}>
            {row.sub}
          </Text>
        </div>
      ))}
    </Stack>
  );
}

export function DashboardPage() {
  const [range, setRange] = useState<RangeKey>('30');
  const isWide = useMediaQuery('(min-width: 48em)', true);

  /* Both periods are pinned to one render so the comparison cannot drift over
     midnight, and so the two queries share a cache key between re-renders. */
  const { from, to, previousFrom, previousTo } = useMemo(() => {
    const days = Number(range);
    const end = new Date();
    const start = new Date(end.getTime() - (days - 1) * DAY);
    return {
      from: start,
      to: end,
      previousFrom: new Date(start.getTime() - days * DAY),
      previousTo: new Date(start.getTime() - DAY),
    };
  }, [range]);

  const current = useReportsOverview(from, to);
  const previous = useReportsOverview(previousFrom, previousTo);
  const products = useProductSummary();
  const staff = useEmployeeSummary();
  const inDebit = useLedgerCustomers({
    q: '',
    standing: 'OWING',
    page: 1,
    page_size: 5,
    sort: 'balance',
    dir: 'desc',
  });

  const report = current.data;
  const loading = current.isLoading;

  const series = useMemo(
    () =>
      (report?.series ?? []).map((point) => ({
        date: point.date,
        Sales: rials(point.sales),
        Purchases: rials(point.purchases),
      })),
    [report],
  );

  const traded = (report?.sales.count ?? 0) + (report?.purchases.count ?? 0) > 0;
  const vatNet = (report?.sales.vat_baisa ?? 0) - (report?.purchases.vat_baisa ?? 0);

  /* Anything that wants a decision today. Empty is the good case, and it says
     so rather than leaving a blank panel that looks broken. */
  const attention = [
    {
      key: 'out',
      show: (products.data?.out_of_stock ?? 0) > 0,
      color: 'red',
      icon: IconPackages,
      text: `${products.data?.out_of_stock} ${products.data?.out_of_stock === 1 ? 'product is' : 'products are'} out of stock`,
      to: '/products',
    },
    {
      key: 'low',
      show: (products.data?.low_stock ?? 0) > 0,
      color: 'accent',
      icon: IconBox,
      text: `${products.data?.low_stock} ${products.data?.low_stock === 1 ? 'product is' : 'products are'} running low`,
      to: '/products',
    },
    {
      key: 'debit',
      show: (report?.receivable_baisa ?? 0) > 0,
      color: 'red',
      icon: IconReceipt2,
      text: `${formatOMR(report?.receivable_baisa ?? 0)} still to collect, from ${inDebit.data?.total ?? 0} ${inDebit.data?.total === 1 ? 'customer' : 'customers'}`,
      to: '/ledger',
    },
    {
      key: 'credit',
      show: (report?.payable_baisa ?? 0) > 0,
      color: 'accent',
      icon: IconBuildingWarehouse,
      text: `${formatOMR(report?.payable_baisa ?? 0)} still to pay your vendors`,
      to: '/vendors',
    },
  ].filter((row) => row.show);

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-end" wrap="wrap" gap="md">
        <div>
          <Title order={1} fz={26}>
            Dashboard
          </Title>
          <Text c="dimmed" fz="sm" mt={4}>
            Everything the business did in the last {RANGES.find((r) => r.value === range)?.label}.
          </Text>
        </div>
        <SegmentedControl
          value={range}
          onChange={(value) => setRange(value as RangeKey)}
          data={RANGES.map((option) => ({
            value: option.value,
            label: isWide ? option.label : option.short,
          }))}
        />
      </Group>

      {/* --- The four headline figures ---------------------------------- */}
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
        <Kpi
          label="Sales"
          value={formatOMR(report?.net_sales_baisa ?? 0)}
          hint={
            report?.sale_returns.count
              ? `${report.sales.count} invoices, less ${formatOMR(report.sale_returns.total_baisa)} returned`
              : `${report?.sales.count ?? 0} ${report?.sales.count === 1 ? 'invoice' : 'invoices'}`
          }
          icon={IconShoppingCart}
          color="brand"
          loading={loading}
          delta={change(report?.net_sales_baisa ?? 0, previous.data?.net_sales_baisa ?? 0)}
          to="/sales"
        />
        <Kpi
          label="Purchases"
          value={formatOMR(report?.net_purchases_baisa ?? 0)}
          hint={
            report?.purchase_returns.count
              ? `${report.purchases.count} purchases, less ${formatOMR(report.purchase_returns.total_baisa)} returned`
              : `${report?.purchases.count ?? 0} ${report?.purchases.count === 1 ? 'purchase' : 'purchases'}`
          }
          icon={IconBuildingWarehouse}
          color="blue"
          loading={loading}
          delta={change(report?.net_purchases_baisa ?? 0, previous.data?.net_purchases_baisa ?? 0)}
          to="/purchases"
        />
        <Kpi
          label="Total debit"
          value={formatOMR(report?.receivable_baisa ?? 0)}
          hint="What customers still have to pay you"
          icon={IconReceipt2}
          color="red"
          loading={loading}
          to="/ledger"
        />
        <Kpi
          label="Total credit"
          value={formatOMR(report?.payable_baisa ?? 0)}
          hint="What you still have to pay vendors"
          icon={IconCoins}
          color="accent"
          loading={loading}
          to="/vendors"
        />
      </SimpleGrid>

      {/* --- Anything that wants a decision ------------------------------ */}
      <Card withBorder radius="lg" padding="lg">
        <PanelTitle title="Needs attention" hint="Checked just now" />
        {products.isLoading || loading ? (
          <Skeleton height={60} radius="md" />
        ) : attention.length === 0 ? (
          <Group gap="sm">
            <ThemeIcon size={32} radius="md" variant="light" color="teal">
              <IconCheck size={17} stroke={2} />
            </ThemeIcon>
            <Text fz="sm">Nothing is out of stock, and nobody owes you money. All clear.</Text>
          </Group>
        ) : (
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="sm">
            {attention.map((row) => {
              const RowIcon = row.icon;
              return (
                <Alert
                  key={row.key}
                  color={row.color}
                  variant="light"
                  p="sm"
                  icon={<RowIcon size={18} stroke={1.8} />}
                >
                  <Group justify="space-between" gap="xs" wrap="nowrap">
                    <Text fz="sm">{row.text}</Text>
                    <Anchor component={Link} to={row.to} fz="xs" fw={600} style={{ whiteSpace: 'nowrap' }}>
                      Open
                    </Anchor>
                  </Group>
                </Alert>
              );
            })}
          </SimpleGrid>
        )}
      </Card>

      {/* --- The shape of trade ------------------------------------------ */}
      <Card withBorder radius="lg" padding="lg">
        <PanelTitle
          title="Sales and purchases"
          hint="Rials each day, with returns taken off"
          to="/reports"
        />
        {loading ? (
          <Skeleton height={240} radius="md" />
        ) : !traded ? (
          <Center h={240}>
            <Stack align="center" gap="xs" ta="center" maw={320}>
              <ThemeIcon size={46} radius="lg" variant="light" color="brand">
                <IconShoppingCart size={22} stroke={1.5} />
              </ThemeIcon>
              <Text fw={600}>Nothing traded in this period</Text>
              <Text fz="sm" c="dimmed">
                Save an invoice or a purchase, and the line starts here.
              </Text>
            </Stack>
          </Center>
        ) : (
          <AreaChart
            h={240}
            data={series}
            dataKey="date"
            withGradient
            withDots={false}
            withLegend
            curveType="monotone"
            tickLine="x"
            /* The same two colours these series wear on the reports page: the
               colour follows the entity across the product, never the chart. */
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

      {/* --- The rest of the picture -------------------------------------- */}
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
        <Fact
          label="Rough profit"
          value={formatOMR(report?.margin_baisa ?? 0)}
          hint="Sales, less what the goods cost you"
          icon={IconTrendingUp}
          color={(report?.margin_baisa ?? 0) < 0 ? 'red' : 'teal'}
          loading={loading}
        />
        <Fact
          label="Stock you have"
          value={formatOMR(report?.stock_value_baisa ?? 0)}
          hint={`${products.data?.active_products ?? 0} products, at cost price`}
          icon={IconPackages}
          color="blue"
          loading={loading || products.isLoading}
        />
        <Fact
          label="VAT"
          value={formatOMR(Math.abs(vatNet))}
          hint={vatNet >= 0 ? 'You took in, less what you paid' : 'You paid more VAT than you took in'}
          icon={IconReceipt2}
          color="grape"
          loading={loading}
        />
        <Fact
          label="Payroll"
          value={formatOMR(staff.data?.monthly_payroll_baisa ?? 0)}
          hint={`${staff.data?.active ?? 0} staff, every month`}
          icon={IconUsers}
          color="indigo"
          loading={staff.isLoading}
        />
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, lg: 3 }} spacing="md">
        <Card withBorder radius="lg" padding="lg">
          <PanelTitle title="Top customers" hint="Who bought the most" to="/customers" />
          <Ranked
            loading={loading}
            empty="Nobody has bought anything yet."
            rows={(report?.top_customers ?? []).slice(0, 5).map((row) => ({
              key: row.name,
              label: row.name,
              sub: `${row.count} ${row.count === 1 ? 'invoice' : 'invoices'}`,
              value: row.revenue_baisa,
            }))}
          />
        </Card>

        <Card withBorder radius="lg" padding="lg">
          <PanelTitle title="Top products" hint="What sold the most" to="/products" />
          <Ranked
            loading={loading}
            empty="Nothing has sold yet."
            rows={(report?.top_products ?? []).slice(0, 5).map((row) => ({
              key: row.name,
              label: row.name,
              sub: `${formatQuantity(row.quantity_milli)} sold`,
              value: row.revenue_baisa,
            }))}
          />
        </Card>

        <Card withBorder radius="lg" padding="lg">
          <PanelTitle title="Who has the most to pay" hint="Open an account to see it" to="/ledger" />
          <Ranked
            loading={inDebit.isLoading}
            empty="Everyone has paid."
            rows={(inDebit.data?.rows ?? []).map((row) => ({
              key: row.customer_id,
              label: row.name,
              sub: row.company || `${row.entry_count} entries`,
              value: row.balance_baisa,
            }))}
          />
        </Card>
      </SimpleGrid>

      {/* --- The four things people come here to start -------------------- */}
      <Card withBorder radius="lg" padding="lg">
        <PanelTitle title="Quick start" hint="The jobs you do most" />
        <Group gap="sm" wrap="wrap">
          <Button component={Link} to="/sales/new" leftSection={<IconPlus size={16} />}>
            New sales invoice
          </Button>
          <Button component={Link} to="/purchases/new" variant="light" leftSection={<IconPlus size={16} />}>
            New purchase
          </Button>
          <Button component={Link} to="/customers" variant="default" leftSection={<IconPlus size={16} />}>
            New customer
          </Button>
          <Button component={Link} to="/products" variant="default" leftSection={<IconPlus size={16} />}>
            New product
          </Button>
          <Tooltip label="All of these numbers, for any dates you pick">
            <Button component={Link} to="/reports" variant="subtle" rightSection={<IconArrowRight size={16} />}>
              Full reports
            </Button>
          </Tooltip>
        </Group>
      </Card>

      {current.isError && (
        <Alert color="red" variant="light" icon={<IconAlertTriangle size={18} />}>
          The numbers could not be loaded.{' '}
          {current.error instanceof Error ? current.error.message : 'Unknown error'}
        </Alert>
      )}

      {report && (
        <Badge variant="light" color="gray" size="sm" style={{ alignSelf: 'flex-start' }}>
          Taken from {(report.sales.count + report.purchases.count).toLocaleString('en-OM')} saved documents
        </Badge>
      )}
    </Stack>
  );
}
