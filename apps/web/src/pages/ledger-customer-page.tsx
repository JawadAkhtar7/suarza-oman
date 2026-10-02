/**
 * One customer's account: where they stand, and every entry that got them there.
 *
 * The statement reads newest-first, the way somebody checking "did that payment
 * land" reads it, with a running balance beside each row so any line can be
 * pointed at in an argument about the total.
 */

import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Button,
  Card,
  Center,
  Group,
  Loader,
  Menu,
  Pagination,
  Paper,
  Stack,
  Table,
  Text,
  Textarea,
  ThemeIcon,
  Title,
  Tooltip,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useDisclosure, useMediaQuery } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import {
  IconArrowLeft,
  IconBan,
  IconDots,
  IconMinus,
  IconPencil,
  IconPlus,
  IconPrinter,
  IconReceipt2,
} from '@tabler/icons-react';
import {
  formatDate,
  formatDateTime,
  formatOMR,
  LEDGER_KIND_LABELS,
  standingOf,
  type LedgerEntry,
} from '@suarza-oman/shared';
import { EntryModal } from '../components/ledger/entry-modal.js';
import { AccountStatement } from '../components/ledger/account-statement.js';
import { STANDING_LABEL, standingColor } from '../components/ledger/balance.js';
import {
  useLedgerAccount,
  useLedgerEntries,
  useLedgerStatement,
  useUpdateLedgerEntry,
  useVoidLedgerEntry,
} from '../lib/ledger.js';

/**
 * A date the server can bracket on.
 *
 * Built in UTC from the calendar day that was picked, rather than from the
 * browser's own midnight: entries are stored at UTC midnight on their date, and
 * a Muscat-local end-of-day would fall four hours short and quietly drop
 * everything dated on the last day of the period.
 */
function dayBound(date: Date | null, edge: 'start' | 'end'): string {
  if (!date) return '';
  const ms = Date.UTC(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    ...(edge === 'start' ? ([0, 0, 0, 0] as const) : ([23, 59, 59, 999] as const)),
  );
  return new Date(ms).toISOString();
}

export function LedgerCustomerPage() {
  const { customerId = '' } = useParams();
  const [page, setPage] = useState(1);
  const [intent, setIntent] = useState<'CHARGE' | 'PAYMENT' | 'ADJUSTMENT'>('CHARGE');
  const [modalOpen, { open: openModal, close: closeModal }] = useDisclosure(false);
  const isWide = useMediaQuery('(min-width: 48em)', true);

  /* The printed statement's period. Open at the start by default, so the first
     print of a new account says "Beginning" and opens at zero. */
  const [from, setFrom] = useState<Date | null>(null);
  const [to, setTo] = useState<Date | null>(new Date());

  const account = useLedgerAccount(customerId);
  const entries = useLedgerEntries(customerId, page);
  const statement = useLedgerStatement(customerId, dayBound(from, 'start'), dayBound(to, 'end'));
  const voidEntry = useVoidLedgerEntry();
  const updateEntry = useUpdateLedgerEntry();

  if (account.isLoading) {
    return (
      <Center py={80}>
        <Loader />
      </Center>
    );
  }

  if (account.isError || !account.data) {
    return (
      <Stack gap="md">
        <Anchor component={Link} to="/ledger" fz="sm">
          <Group gap={6}>
            <IconArrowLeft size={15} /> Ledger
          </Group>
        </Anchor>
        <Alert color="red" title="Could not open this account">
          {account.error instanceof Error ? account.error.message : 'Unknown error'}
        </Alert>
      </Stack>
    );
  }

  const { customer, account: totals } = account.data;
  const standing = standingOf(totals.balance_baisa);
  const rows = entries.data?.rows ?? [];
  const pages = Math.max(1, Math.ceil((entries.data?.total ?? 0) / 50));

  const start = (kind: 'CHARGE' | 'PAYMENT' | 'ADJUSTMENT') => {
    setIntent(kind);
    openModal();
  };

  /* Refetched before printing rather than trusting the cache: somebody prints a
     statement precisely because they just recorded a payment on it. */
  const printStatement = async () => {
    try {
      const fresh = await statement.refetch();
      if (!fresh.data) throw new Error('The statement could not be made');
      window.print();
    } catch (error) {
      notifications.show({
        title: 'Could not print the statement',
        message: error instanceof Error ? error.message : 'Unknown error',
        color: 'red',
      });
    }
  };

  const confirmVoid = (entry: LedgerEntry) => {
    let reason = '';
    modals.openConfirmModal({
      title: 'Cancel this entry?',
      centered: true,
      children: (
        <Stack gap="sm">
          <Text size="sm">
            {LEDGER_KIND_LABELS[entry.kind]} of <strong>{formatOMR(entry.amount_baisa)}</strong> —{' '}
            {entry.description}
          </Text>
          <Text size="sm" c="dimmed">
            It stops counting towards the balance, but it stays on the statement so you can
            still see what happened.
          </Text>
          <Textarea
            label="Why are you cancelling it?"
            placeholder="Entered twice, wrong customer, typo in the amount…"
            withAsterisk
            autosize
            minRows={2}
            onChange={(event) => {
              reason = event.currentTarget.value;
            }}
          />
        </Stack>
      ),
      labels: { confirm: 'Cancel it', cancel: 'Keep it' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        if (!reason.trim()) {
          notifications.show({
            title: 'Please give a reason',
            message: 'Write why, then try again.',
            color: 'red',
          });
          return;
        }
        try {
          await voidEntry.mutateAsync({ id: entry.id, void_reason: reason.trim() });
          notifications.show({ title: 'Entry cancelled', message: entry.description, color: 'gray' });
        } catch (error) {
          notifications.show({
            title: 'Could not cancel the entry',
            message: error instanceof Error ? error.message : 'Unknown error',
            color: 'red',
          });
        }
      },
    });
  };

  const editNote = (entry: LedgerEntry) => {
    let description = entry.description;
    modals.openConfirmModal({
      title: 'Edit the details',
      centered: true,
      children: (
        <Stack gap="sm">
          <Textarea
            label="Details"
            defaultValue={entry.description}
            autosize
            minRows={2}
            onChange={(event) => {
              description = event.currentTarget.value;
            }}
          />
          {/* Said plainly, because it is the rule the whole ledger rests on. */}
          <Text fz="xs" c="dimmed">
            The amount and the side cannot be changed. If one of those is wrong, cancel this
            entry and add a new one.
          </Text>
        </Stack>
      ),
      labels: { confirm: 'Save', cancel: 'Cancel' },
      onConfirm: async () => {
        if (!description.trim() || description === entry.description) return;
        try {
          await updateEntry.mutateAsync({ id: entry.id, input: { description: description.trim() } });
          notifications.show({ title: 'Entry updated', message: description, color: 'brand' });
        } catch (error) {
          notifications.show({
            title: 'Could not update the entry',
            message: error instanceof Error ? error.message : 'Unknown error',
            color: 'red',
          });
        }
      },
    });
  };

  return (
    <>
      {statement.data?.statement && (
        <AccountStatement customer={statement.data.customer} statement={statement.data.statement} />
      )}

      <Stack gap="lg" data-print="hide">
      <Anchor component={Link} to="/ledger" fz="sm" c="dimmed">
        <Group gap={6}>
          <IconArrowLeft size={15} /> Ledger
        </Group>
      </Anchor>

      <Card withBorder radius="lg" padding="lg">
        <Group justify="space-between" align="flex-start" wrap="wrap" gap="lg">
          <div>
            <Group gap="sm">
              <Title order={1} fz={24}>
                {customer.name}
              </Title>
              <Badge color={standingColor(totals.balance_baisa)} variant="light">
                {STANDING_LABEL[standing]}
              </Badge>
            </Group>
            <Text c="dimmed" fz="sm" mt={4}>
              {[customer.company, customer.phone].filter(Boolean).join(' · ')}
            </Text>
          </div>

          <div>
            <Text fz="xs" tt="uppercase" fw={700} c="dimmed" style={{ letterSpacing: '0.06em' }}>
              {/* The side is on the badge beside the name; this is the figure. */}
              Balance
            </Text>
            <Text
              fz={34}
              fw={700}
              c={standing === 'SETTLED' ? undefined : standingColor(totals.balance_baisa)}
              style={{ fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}
            >
              {formatOMR(Math.abs(totals.balance_baisa))}
            </Text>
            <Text fz="xs" c="dimmed">
              {formatOMR(totals.charged_baisa, { symbol: false })} debit ·{' '}
              {formatOMR(totals.paid_baisa, { symbol: false })} credit
            </Text>
          </div>

          <Group gap="sm">
            <Button leftSection={<IconPlus size={16} />} color="red" variant="light" onClick={() => start('CHARGE')}>
              Add debit
            </Button>
            <Button leftSection={<IconMinus size={16} />} onClick={() => start('PAYMENT')}>
              Add credit
            </Button>
            <Tooltip label="Adjustment or opening balance">
              <ActionIcon size={36} variant="default" onClick={() => start('ADJUSTMENT')} aria-label="Other entry">
                <IconDots size={18} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>
      </Card>

      <Paper withBorder radius="lg" p={0}>
        <Group p="md" justify="space-between" align="flex-end" wrap="wrap" gap="md">
          <div>
            <Text fw={650}>Statement</Text>
            <Text fz="sm" c="dimmed">
              {entries.data?.total ?? 0} {entries.data?.total === 1 ? 'entry' : 'entries'} on this
              account
            </Text>
          </div>

          {/* The printed Account General Ledger covers these dates, which is why
              they sit next to the button rather than filtering the list below. */}
          <Group gap="sm" align="flex-end" wrap="wrap">
            <DateInput
              label="Print from"
              placeholder="Beginning"
              value={from}
              onChange={(value) => setFrom(value as Date | null)}
              valueFormat="DD MMM YYYY"
              clearable
              size="sm"
              w={150}
            />
            <DateInput
              label="Print to"
              placeholder="Today"
              value={to}
              onChange={(value) => setTo(value as Date | null)}
              valueFormat="DD MMM YYYY"
              clearable
              size="sm"
              w={150}
            />
            <Button
              variant="default"
              leftSection={<IconPrinter size={16} />}
              onClick={() => void printStatement()}
              loading={statement.isFetching}
            >
              Print statement
            </Button>
          </Group>
        </Group>

        {entries.isLoading ? (
          <Center py="xl">
            <Loader size="sm" />
          </Center>
        ) : rows.length === 0 ? (
          <Center py={56} px="md">
            <Stack align="center" gap="xs" maw={360} ta="center">
              <ThemeIcon size={52} radius="lg" variant="light" color="brand">
                <IconReceipt2 size={24} stroke={1.5} />
              </ThemeIcon>
              <Text fw={650} fz="lg">
                Nothing on this account yet
              </Text>
              <Text c="dimmed" fz="sm">
                Add a debit for what they have to pay, or a credit for money received.
              </Text>
              <Button mt="xs" leftSection={<IconPlus size={16} />} onClick={() => start('CHARGE')}>
                Add the first entry
              </Button>
            </Stack>
          </Center>
        ) : isWide ? (
          <Table.ScrollContainer minWidth={820}>
            <Table verticalSpacing="sm" horizontalSpacing="lg">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Date</Table.Th>
                  <Table.Th>Details</Table.Th>
                  <Table.Th ta="right">Debit</Table.Th>
                  <Table.Th ta="right">Credit</Table.Th>
                  <Table.Th ta="right">Balance</Table.Th>
                  <Table.Th w={40} />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {rows.map((entry) => {
                  const voided = Boolean(entry.voided_at);
                  return (
                    <Table.Tr key={entry.id} opacity={voided ? 0.55 : 1}>
                      <Table.Td>
                        <Text fz="sm">{formatDate(entry.entry_date)}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Group gap={8} wrap="nowrap">
                          <Text
                            fz="sm"
                            fw={550}
                            td={voided ? 'line-through' : undefined}
                          >
                            {entry.description}
                          </Text>
                          <Badge size="xs" variant="outline" color="gray">
                            {LEDGER_KIND_LABELS[entry.kind]}
                          </Badge>
                          {voided && (
                            <Tooltip label={entry.void_reason ?? ''}>
                              <Badge size="xs" color="red" variant="light">
                                Cancelled
                              </Badge>
                            </Tooltip>
                          )}
                        </Group>
                        {entry.reference && (
                          <Text fz="xs" c="dimmed">
                            {entry.reference}
                          </Text>
                        )}
                      </Table.Td>
                      <Table.Td ta="right">
                        {entry.direction === 'DEBIT' && (
                          <Text fz="sm" c="red" style={{ fontVariantNumeric: 'tabular-nums' }}>
                            {formatOMR(entry.amount_baisa, { symbol: false })}
                          </Text>
                        )}
                      </Table.Td>
                      <Table.Td ta="right">
                        {entry.direction === 'CREDIT' && (
                          <Text fz="sm" c="brand" style={{ fontVariantNumeric: 'tabular-nums' }}>
                            {formatOMR(entry.amount_baisa, { symbol: false })}
                          </Text>
                        )}
                      </Table.Td>
                      <Table.Td ta="right">
                        <Text fz="sm" fw={600} style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {formatOMR(Math.abs(entry.balance_after_baisa), { symbol: false })}
                          {entry.balance_after_baisa < 0 ? ' Cr' : ''}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        {!voided && (
                          <Menu position="bottom-end" withArrow shadow="md">
                            <Menu.Target>
                              <ActionIcon
                                variant="subtle"
                                color="gray"
                                aria-label={`Actions for ${entry.description}`}
                              >
                                <IconDots size={16} />
                              </ActionIcon>
                            </Menu.Target>
                            <Menu.Dropdown>
                              <Menu.Item leftSection={<IconPencil size={15} />} onClick={() => editNote(entry)}>
                                Edit details
                              </Menu.Item>
                              <Menu.Divider />
                              <Menu.Item
                                color="red"
                                leftSection={<IconBan size={15} />}
                                onClick={() => confirmVoid(entry)}
                              >
                                Cancel entry
                              </Menu.Item>
                            </Menu.Dropdown>
                          </Menu>
                        )}
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        ) : (
          <Stack gap="sm" p="md">
            {rows.map((entry) => {
              const voided = Boolean(entry.voided_at);
              return (
                <Card key={entry.id} withBorder padding="md" radius="md" opacity={voided ? 0.6 : 1}>
                  <Group justify="space-between" wrap="nowrap" align="flex-start">
                    <div style={{ minWidth: 0 }}>
                      <Text fz="sm" fw={600} td={voided ? 'line-through' : undefined}>
                        {entry.description}
                      </Text>
                      <Text fz="xs" c="dimmed">
                        {formatDate(entry.entry_date)} · {LEDGER_KIND_LABELS[entry.kind]}
                        {entry.reference ? ` · ${entry.reference}` : ''}
                      </Text>
                    </div>
                    <Text
                      fz="sm"
                      fw={650}
                      c={entry.direction === 'DEBIT' ? 'red' : 'brand'}
                      style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}
                    >
                      {entry.direction === 'DEBIT' ? '+' : '−'}
                      {formatOMR(entry.amount_baisa, { symbol: false })}
                    </Text>
                  </Group>
                  <Group justify="space-between" mt="xs">
                    {voided ? (
                      <Badge size="xs" color="red" variant="light">
                        Cancelled
                      </Badge>
                    ) : (
                      <Button size="compact-xs" variant="subtle" color="red" onClick={() => confirmVoid(entry)}>
                        Cancel
                      </Button>
                    )}
                    <Text fz="xs" c="dimmed">
                      Balance {formatOMR(Math.abs(entry.balance_after_baisa), { symbol: false })}
                      {entry.balance_after_baisa < 0 ? ' Cr' : ''}
                    </Text>
                  </Group>
                </Card>
              );
            })}
          </Stack>
        )}

        {pages > 1 && (
          <Group justify="flex-end" p="md">
            <Pagination value={page} onChange={setPage} total={pages} size="sm" />
          </Group>
        )}
      </Paper>

      {totals.last_entry_at && (
        <Text fz="xs" c="dimmed" ta="right">
          Last entry {formatDateTime(totals.last_entry_at)}
        </Text>
      )}

      <EntryModal
        opened={modalOpen}
        onClose={closeModal}
        customerId={customerId}
        customerName={customer.name}
        balanceBaisa={totals.balance_baisa}
        intent={intent}
      />
      </Stack>
    </>
  );
}
