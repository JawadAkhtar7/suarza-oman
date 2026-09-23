/**
 * The ledger: every customer account on one screen.
 *
 * Sorted by what is owed, largest first, because the question this page exists
 * to answer is "who owes us money" — not "what is everyone called".
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ActionIcon,
  Card,
  Center,
  Group,
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
import { useDebouncedValue, useMediaQuery } from '@mantine/hooks';
import {
  IconArrowDownLeft,
  IconArrowUpRight,
  IconChevronRight,
  IconReceipt2,
  IconRefresh,
  IconSearch,
  IconWallet,
  IconX,
} from '@tabler/icons-react';
import { formatDate, formatOMR, type LedgerCustomerRow, type LedgerStanding } from '@suarza-oman/shared';
import { BalanceAmount, StandingBadge } from '../components/ledger/balance.js';
import { useLedgerCustomers, useLedgerSummary, type LedgerListParams } from '../lib/ledger.js';

const PAGE_SIZE = 25;

function SummaryTile({
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
            <Skeleton height={30} width={130} mt={8} />
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

export function LedgerPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [debounced] = useDebouncedValue(search, 300);
  const [standing, setStanding] = useState<LedgerStanding>('ALL');
  const [page, setPage] = useState(1);
  const isWide = useMediaQuery('(min-width: 48em)', true);

  const params: LedgerListParams = {
    q: debounced,
    standing,
    page,
    page_size: PAGE_SIZE,
    sort: 'balance',
    dir: 'desc',
  };

  const summary = useLedgerSummary();
  const list = useLedgerCustomers(params);

  useEffect(() => setPage(1), [debounced, standing]);

  const rows = list.data?.rows ?? [];
  const total = list.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const openAccount = (row: LedgerCustomerRow) => navigate(`/ledger/${row.customer_id}`);

  return (
    <Stack gap="lg">
      <div>
        <Title order={1} fz={26}>
          Ledger
        </Title>
        <Text c="dimmed" fz="sm" mt={4}>
          What every customer owes, and what they have paid. Open an account to add an entry.
        </Text>
      </div>

      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
        <SummaryTile
          label="Owed to you"
          value={formatOMR(summary.data?.receivable_baisa ?? 0)}
          hint={`Across ${summary.data?.owing_count ?? 0} ${
            summary.data?.owing_count === 1 ? 'account' : 'accounts'
          }`}
          icon={<IconArrowUpRight size={21} stroke={1.7} />}
          color="red"
          loading={summary.isLoading}
        />
        <SummaryTile
          label="Held in credit"
          value={formatOMR(summary.data?.advance_baisa ?? 0)}
          hint={`Paid ahead by ${summary.data?.advance_count ?? 0} ${
            summary.data?.advance_count === 1 ? 'customer' : 'customers'
          }`}
          icon={<IconArrowDownLeft size={21} stroke={1.7} />}
          color="brand"
          loading={summary.isLoading}
        />
        <SummaryTile
          label="Settled"
          value={String(summary.data?.settled_count ?? 0)}
          hint="Accounts with nothing outstanding"
          icon={<IconWallet size={21} stroke={1.7} />}
          color="gray"
          loading={summary.isLoading}
        />
      </SimpleGrid>

      <Paper withBorder radius="lg" p={0}>
        <Group p="md" gap="sm" wrap="wrap" justify="space-between">
          <TextInput
            placeholder="Search customer, company or phone"
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
              value={standing}
              onChange={(value) => setStanding(value as LedgerStanding)}
              data={[
                { label: 'All', value: 'ALL' },
                { label: 'Owing', value: 'OWING' },
                { label: 'Settled', value: 'SETTLED' },
                { label: 'In credit', value: 'ADVANCE' },
              ]}
              size="md"
            />
            <Tooltip label="Refresh">
              <ActionIcon
                variant="default"
                size="lg"
                onClick={() => {
                  void list.refetch();
                  void summary.refetch();
                }}
                loading={list.isFetching}
                aria-label="Refresh"
              >
                <IconRefresh size={17} stroke={1.7} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>

        {list.isError ? (
          <Center p="xl">
            <Stack align="center" gap="xs">
              <Text fw={600}>Could not load the ledger</Text>
              <Text c="dimmed" fz="sm">
                {list.error instanceof Error ? list.error.message : 'Unknown error'}
              </Text>
            </Stack>
          </Center>
        ) : list.isLoading ? (
          <Stack gap="xs" p="md">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} height={46} radius="sm" />
            ))}
          </Stack>
        ) : rows.length === 0 ? (
          <Center py={56} px="md">
            <Stack align="center" gap="xs" maw={360} ta="center">
              <ThemeIcon size={52} radius="lg" variant="light" color="brand">
                <IconReceipt2 size={24} stroke={1.5} />
              </ThemeIcon>
              <Text fw={650} fz="lg">
                Nothing to show
              </Text>
              <Text c="dimmed" fz="sm">
                {debounced || standing !== 'ALL'
                  ? 'No account matches that. Try clearing the filters.'
                  : 'Add a customer first — every customer gets a ledger account automatically.'}
              </Text>
            </Stack>
          </Center>
        ) : isWide ? (
          <Table.ScrollContainer minWidth={720}>
            <Table verticalSpacing="sm" horizontalSpacing="lg">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Customer</Table.Th>
                  <Table.Th ta="right">Charged</Table.Th>
                  <Table.Th ta="right">Paid</Table.Th>
                  <Table.Th ta="right">Balance</Table.Th>
                  <Table.Th>Standing</Table.Th>
                  <Table.Th>Last entry</Table.Th>
                  <Table.Th w={40} />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {rows.map((row) => (
                  <Table.Tr
                    key={row.customer_id}
                    onClick={() => openAccount(row)}
                    style={{ cursor: 'pointer' }}
                  >
                    <Table.Td>
                      <Text fz="sm" fw={600}>
                        {row.name}
                      </Text>
                      <Text fz="xs" c="dimmed">
                        {row.company || row.phone}
                      </Text>
                    </Table.Td>
                    <Table.Td ta="right">
                      <Text fz="sm" c="dimmed" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {formatOMR(row.charged_baisa, { symbol: false })}
                      </Text>
                    </Table.Td>
                    <Table.Td ta="right">
                      <Text fz="sm" c="dimmed" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {formatOMR(row.paid_baisa, { symbol: false })}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <BalanceAmount balanceBaisa={row.balance_baisa} />
                    </Table.Td>
                    <Table.Td>
                      <StandingBadge balanceBaisa={row.balance_baisa} />
                    </Table.Td>
                    <Table.Td>
                      <Text fz="xs" c="dimmed">
                        {row.last_entry_at ? formatDate(row.last_entry_at) : 'No entries'}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <IconChevronRight size={15} color="var(--mantine-color-dimmed)" />
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        ) : (
          <Stack gap="sm" p="md">
            {rows.map((row) => (
              <UnstyledButton key={row.customer_id} onClick={() => openAccount(row)}>
                <Card withBorder padding="md" radius="md">
                  <Group justify="space-between" wrap="nowrap">
                    <div style={{ minWidth: 0 }}>
                      <Text fz="sm" fw={600} truncate>
                        {row.name}
                      </Text>
                      <Text fz="xs" c="dimmed" truncate>
                        {row.company || row.phone}
                      </Text>
                    </div>
                    <BalanceAmount balanceBaisa={row.balance_baisa} withWord />
                  </Group>
                  <Group justify="space-between" mt="sm">
                    <StandingBadge balanceBaisa={row.balance_baisa} />
                    <Text fz="xs" c="dimmed">
                      {row.last_entry_at ? formatDate(row.last_entry_at) : 'No entries'}
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
    </Stack>
  );
}
