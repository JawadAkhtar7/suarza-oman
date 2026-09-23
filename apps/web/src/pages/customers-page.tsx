/**
 * Customers: the list, the search, and the four things you can do to a record.
 *
 * The list is paged and searched on the SERVER. With a few dozen rows it would
 * not matter; the reason to build it this way now is that the day it matters —
 * ten thousand customers — is not the day to rewrite the screen.
 */

import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Center,
  Group,
  Pagination,
  Paper,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { useDebouncedValue, useDisclosure } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import {
  IconAddressBook,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconUserOff,
  IconUserPlus,
  IconX,
} from '@tabler/icons-react';
import type { Customer } from '@suarza-oman/shared';
import { CustomersTable } from '../components/customers/customers-table.js';
import { CustomerModal } from '../components/customers/customer-modal.js';
import { useCustomers, useDeleteCustomer, type CustomerListParams } from '../lib/customers.js';

const PAGE_SIZE = 25;

export function CustomersPage() {
  const [search, setSearch] = useState('');
  // 300ms: long enough that a fast typist sends one request instead of ten,
  // short enough that the list feels like it is keeping up.
  const [debounced] = useDebouncedValue(search, 300);
  const [status, setStatus] = useState<CustomerListParams['status']>('ALL');
  const [page, setPage] = useState(1);

  const [modalOpen, { open: openModal, close: closeModal }] = useDisclosure(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [params, setParams] = useSearchParams();

  const query = useCustomers({ q: debounced, status, page, page_size: PAGE_SIZE });
  const remove = useDeleteCustomer();

  /* The command palette opens this modal by navigating to ?new=1, so the
     palette never has to reach into this page's state. */
  useEffect(() => {
    if (params.get('new') === null) return;
    setEditing(null);
    openModal();
    setParams({}, { replace: true });
  }, [params, openModal, setParams]);

  // A filter change must not leave you on page 7 of a two-page result.
  useEffect(() => setPage(1), [debounced, status]);

  const rows = query.data?.rows ?? [];
  const total = query.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const firstOnPage = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastOnPage = Math.min(page * PAGE_SIZE, total);

  const isFiltered = debounced !== '' || status !== 'ALL';

  const startCreate = () => {
    setEditing(null);
    openModal();
  };

  const startEdit = (customer: Customer) => {
    setEditing(customer);
    openModal();
  };

  const confirmDelete = (customer: Customer) => {
    modals.openConfirmModal({
      title: 'Delete this customer?',
      centered: true,
      children: (
        <Text size="sm">
          <strong>{customer.name}</strong>
          {customer.company ? ` (${customer.company})` : ''} will be removed. This cannot be
          undone.
        </Text>
      ),
      labels: { confirm: 'Delete customer', cancel: 'Keep it' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        try {
          await remove.mutateAsync(customer.id);
          notifications.show({
            title: 'Customer deleted',
            message: customer.name,
            color: 'gray',
          });
        } catch (error) {
          notifications.show({
            title: 'Could not delete',
            message: error instanceof Error ? error.message : 'Unknown error',
            color: 'red',
          });
        }
      },
    });
  };

  const empty = !query.isLoading && rows.length === 0;

  const header = (
    <Group justify="space-between" align="flex-start" wrap="wrap" gap="md">
      <div>
        <Group gap="sm">
          <Title order={1} fz={26}>
            Customers
          </Title>
          {total > 0 && (
            <Badge variant="light" color="gray" size="lg">
              {total}
            </Badge>
          )}
        </Group>
        <Text c="dimmed" fz="sm" mt={4}>
          Everyone you sell to. Sales, invoices and ledgers all point back here.
        </Text>
      </div>
      <Button leftSection={<IconPlus size={17} />} onClick={startCreate} size="md">
        New customer
      </Button>
    </Group>
  );

  return (
    <Stack gap="lg">
      {header}

      <Paper withBorder radius="lg" p={0}>
        <Group p="md" gap="sm" wrap="wrap" justify="space-between">
          <TextInput
            placeholder="Search name, company, phone or email"
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
            style={{ flex: '1 1 320px' }}
            size="md"
          />
          <Group gap="sm">
            <SegmentedControl
              value={status}
              onChange={(value) => setStatus(value as CustomerListParams['status'])}
              data={[
                { label: 'All', value: 'ALL' },
                { label: 'Active', value: 'ACTIVE' },
                { label: 'Inactive', value: 'INACTIVE' },
              ]}
              size="md"
            />
            <Tooltip label="Refresh">
              <ActionIcon
                variant="default"
                size="lg"
                onClick={() => void query.refetch()}
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
              <Text fw={600}>Could not load customers</Text>
              <Text c="dimmed" fz="sm">
                {query.error instanceof Error ? query.error.message : 'Unknown error'}
              </Text>
              <Button variant="light" mt="sm" onClick={() => void query.refetch()}>
                Try again
              </Button>
            </Stack>
          </Center>
        ) : empty ? (
          <EmptyState filtered={isFiltered} onCreate={startCreate} onClear={() => { setSearch(''); setStatus('ALL'); }} />
        ) : (
          <CustomersTable
            rows={rows}
            isLoading={query.isLoading}
            onEdit={startEdit}
            onDelete={confirmDelete}
          />
        )}

        {!empty && !query.isError && (
          <Group justify="space-between" p="md" wrap="wrap" gap="sm">
            <Text fz="sm" c="dimmed">
              {firstOnPage}–{lastOnPage} of {total}
            </Text>
            {pages > 1 && <Pagination value={page} onChange={setPage} total={pages} size="sm" />}
          </Group>
        )}
      </Paper>

      <CustomerModal opened={modalOpen} onClose={closeModal} customer={editing} />
    </Stack>
  );
}

/**
 * Two different empty states, because they are two different situations: an
 * empty system needs a way in, an empty search needs a way back.
 */
function EmptyState({ filtered, onCreate, onClear }: {
  filtered: boolean;
  onCreate: () => void;
  onClear: () => void;
}) {
  return (
    <Center py={64} px="md">
      <Stack align="center" gap="sm" maw={380} ta="center">
        <Box
          style={{
            width: 56,
            height: 56,
            borderRadius: 16,
            display: 'grid',
            placeItems: 'center',
            background: 'var(--mantine-color-brand-light)',
            color: 'var(--mantine-color-brand-filled)',
          }}
        >
          {filtered ? <IconUserOff size={26} stroke={1.5} /> : <IconAddressBook size={26} stroke={1.5} />}
        </Box>
        <Text fw={650} fz="lg">
          {filtered ? 'No customer matches that' : 'No customers yet'}
        </Text>
        <Text c="dimmed" fz="sm">
          {filtered
            ? 'Try a shorter search, or clear the filters to see everyone.'
            : 'Add the first one and it will be available to every sale, invoice and ledger in the system.'}
        </Text>
        {filtered ? (
          <Button variant="light" onClick={onClear} mt="xs">
            Clear filters
          </Button>
        ) : (
          <Button leftSection={<IconUserPlus size={17} />} onClick={onCreate} mt="xs">
            Add the first customer
          </Button>
        )}
      </Stack>
    </Center>
  );
}
