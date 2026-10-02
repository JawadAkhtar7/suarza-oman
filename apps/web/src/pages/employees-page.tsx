/**
 * The staff list: who works here, what they do, and what the payroll costs.
 */

import { useEffect, useState } from 'react';
import {
  ActionIcon,
  Avatar,
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
} from '@mantine/core';
import { useDebouncedValue, useDisclosure, useMediaQuery } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import {
  IconCalendarUser,
  IconDots,
  IconPencil,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconTrash,
  IconUserOff,
  IconUsers,
  IconWallet,
  IconX,
} from '@tabler/icons-react';
import {
  EMPLOYEE_STATUS_LABELS,
  PAY_FREQUENCY_LABELS,
  formatDate,
  formatOMR,
  initials,
  serviceLength,
  type Employee,
} from '@suarza-oman/shared';
import { EmployeeModal } from '../components/employees/employee-modal.js';
import {
  useDeleteEmployee,
  useEmployeeSummary,
  useEmployees,
  type EmployeeListParams,
} from '../lib/employees.js';

const PAGE_SIZE = 25;

const STATUS_COLOR: Record<Employee['status'], string> = {
  ACTIVE: 'brand',
  ON_LEAVE: 'orange',
  LEFT: 'gray',
};

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
            <Text fz={26} fw={700} mt={6} style={{ fontVariantNumeric: 'tabular-nums', lineHeight: 1.15 }}>
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

export function EmployeesPage() {
  const [search, setSearch] = useState('');
  const [debounced] = useDebouncedValue(search, 300);
  const [status, setStatus] = useState<EmployeeListParams['status']>('ALL');
  const [page, setPage] = useState(1);
  const isWide = useMediaQuery('(min-width: 48em)', true);

  const [modalOpen, { open: openModal, close: closeModal }] = useDisclosure(false);
  const [editing, setEditing] = useState<Employee | null>(null);

  const summary = useEmployeeSummary();
  const query = useEmployees({ q: debounced, status, page, page_size: PAGE_SIZE });
  const remove = useDeleteEmployee();

  useEffect(() => setPage(1), [debounced, status]);

  const rows = query.data?.rows ?? [];
  const total = query.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const startCreate = () => {
    setEditing(null);
    openModal();
  };
  const startEdit = (employee: Employee) => {
    setEditing(employee);
    openModal();
  };

  const confirmDelete = (employee: Employee) => {
    modals.openConfirmModal({
      title: 'Remove this employee?',
      centered: true,
      children: (
        <Stack gap="xs">
          <Text size="sm">
            <strong>{employee.name}</strong> will be removed from the staff list. This cannot be
            undone.
          </Text>
          <Text size="sm" c="dimmed">
            If they have simply left, set their status to “Left” instead — that keeps the record.
          </Text>
        </Stack>
      ),
      labels: { confirm: 'Remove', cancel: 'Keep it' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        try {
          await remove.mutateAsync(employee.id);
          notifications.show({ title: 'Employee removed', message: employee.name, color: 'gray' });
        } catch (error) {
          notifications.show({
            title: 'Could not remove',
            message: error instanceof Error ? error.message : 'Unknown error',
            color: 'red',
          });
        }
      },
    });
  };

  const empty = !query.isLoading && rows.length === 0;
  const isFiltered = debounced !== '' || status !== 'ALL';

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-start" wrap="wrap" gap="md">
        <div>
          <Group gap="sm">
            <Title order={1} fz={26}>
              Employees
            </Title>
            {total > 0 && (
              <Badge variant="light" color="gray" size="lg">
                {total}
              </Badge>
            )}
          </Group>
          <Text c="dimmed" fz="sm" mt={4}>
            Who works here, what they do, and what they are paid.
          </Text>
        </div>
        <Button leftSection={<IconPlus size={17} />} onClick={startCreate} size="md">
          New employee
        </Button>
      </Group>

      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
        <Tile
          label="On the payroll"
          value={String(summary.data?.active ?? 0)}
          hint="Active staff"
          icon={<IconUsers size={21} stroke={1.7} />}
          color="brand"
          loading={summary.isLoading}
        />
        <Tile
          label="Monthly cost"
          value={formatOMR(summary.data?.monthly_payroll_baisa ?? 0)}
          hint="Daily and hourly pay counted as 26 days a month"
          icon={<IconWallet size={21} stroke={1.7} />}
          color="gray"
          loading={summary.isLoading}
        />
        <Tile
          label="On leave"
          value={String(summary.data?.on_leave ?? 0)}
          hint="Away but still working here"
          icon={<IconCalendarUser size={21} stroke={1.7} />}
          color="orange"
          loading={summary.isLoading}
        />
      </SimpleGrid>

      <Paper withBorder radius="lg" p={0}>
        <Group p="md" gap="sm" wrap="wrap" justify="space-between">
          <TextInput
            placeholder="Search name, staff number, role or phone"
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
              value={status}
              onChange={(value) => setStatus(value as EmployeeListParams['status'])}
              data={[
                { label: 'All', value: 'ALL' },
                { label: 'Active', value: 'ACTIVE' },
                { label: 'On leave', value: 'ON_LEAVE' },
                { label: 'Left', value: 'LEFT' },
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
              <Text fw={600}>Could not load employees</Text>
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
            <Stack align="center" gap="xs" maw={360} ta="center">
              <ThemeIcon size={52} radius="lg" variant="light" color="brand">
                {isFiltered ? <IconUserOff size={24} stroke={1.5} /> : <IconUsers size={24} stroke={1.5} />}
              </ThemeIcon>
              <Text fw={650} fz="lg">
                {isFiltered ? 'No employee matches that' : 'No employees yet'}
              </Text>
              <Text c="dimmed" fz="sm">
                {isFiltered
                  ? 'Try a shorter search, or clear the filters.'
                  : 'Add the first one. Pay, deliveries and sales all link back here.'}
              </Text>
              {!isFiltered && (
                <Button mt="xs" leftSection={<IconPlus size={17} />} onClick={startCreate}>
                  Add the first employee
                </Button>
              )}
            </Stack>
          </Center>
        ) : isWide ? (
          <Table.ScrollContainer minWidth={820}>
            <Table verticalSpacing="sm" horizontalSpacing="lg">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Employee</Table.Th>
                  <Table.Th>Department</Table.Th>
                  <Table.Th>Contact</Table.Th>
                  <Table.Th ta="right">Salary</Table.Th>
                  <Table.Th>Service</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th w={40} />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {rows.map((employee) => (
                  <Table.Tr key={employee.id}>
                    <Table.Td>
                      <Group gap="sm" wrap="nowrap">
                        <Avatar size={34} radius="md" color="brand" variant="light">
                          {initials(employee.name)}
                        </Avatar>
                        <div style={{ minWidth: 0 }}>
                          <Text fz="sm" fw={600} truncate>
                            {employee.name}
                          </Text>
                          <Text fz="xs" c="dimmed" truncate>
                            {[employee.code, employee.designation].filter(Boolean).join(' · ') || '—'}
                          </Text>
                        </div>
                      </Group>
                    </Table.Td>
                    <Table.Td>
                      <Text fz="sm" c={employee.department ? undefined : 'dimmed'}>
                        {employee.department || '—'}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text fz="sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {employee.phone}
                      </Text>
                      <Text fz="xs" c="dimmed" truncate maw={200}>
                        {employee.email || '—'}
                      </Text>
                    </Table.Td>
                    <Table.Td ta="right">
                      <Text fz="sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {employee.salary_baisa > 0 ? formatOMR(employee.salary_baisa, { symbol: false }) : '—'}
                      </Text>
                      {employee.salary_baisa > 0 && (
                        <Text fz="xs" c="dimmed">
                          {PAY_FREQUENCY_LABELS[employee.pay_frequency].toLowerCase()}
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Text fz="sm">{serviceLength(employee.joined_on) ?? '—'}</Text>
                      {employee.joined_on && (
                        <Text fz="xs" c="dimmed">
                          since {formatDate(employee.joined_on)}
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Badge color={STATUS_COLOR[employee.status]} variant="light" size="sm">
                        {EMPLOYEE_STATUS_LABELS[employee.status]}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Menu position="bottom-end" withArrow shadow="md">
                        <Menu.Target>
                          <ActionIcon variant="subtle" color="gray" aria-label={`Actions for ${employee.name}`}>
                            <IconDots size={16} />
                          </ActionIcon>
                        </Menu.Target>
                        <Menu.Dropdown>
                          <Menu.Item leftSection={<IconPencil size={15} />} onClick={() => startEdit(employee)}>
                            Edit
                          </Menu.Item>
                          <Menu.Divider />
                          <Menu.Item
                            color="red"
                            leftSection={<IconTrash size={15} />}
                            onClick={() => confirmDelete(employee)}
                          >
                            Remove
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
            {rows.map((employee) => (
              <Card key={employee.id} withBorder padding="md" radius="md">
                <Group justify="space-between" wrap="nowrap" align="flex-start">
                  <Group gap="sm" wrap="nowrap">
                    <Avatar size={34} radius="md" color="brand" variant="light">
                      {initials(employee.name)}
                    </Avatar>
                    <div style={{ minWidth: 0 }}>
                      <Text fz="sm" fw={600} truncate>
                        {employee.name}
                      </Text>
                      <Text fz="xs" c="dimmed" truncate>
                        {employee.designation || '—'}
                      </Text>
                    </div>
                  </Group>
                  <Menu position="bottom-end" withArrow shadow="md">
                    <Menu.Target>
                      <ActionIcon variant="subtle" color="gray" aria-label={`Actions for ${employee.name}`}>
                        <IconDots size={16} />
                      </ActionIcon>
                    </Menu.Target>
                    <Menu.Dropdown>
                      <Menu.Item leftSection={<IconPencil size={15} />} onClick={() => startEdit(employee)}>
                        Edit
                      </Menu.Item>
                      <Menu.Item color="red" leftSection={<IconTrash size={15} />} onClick={() => confirmDelete(employee)}>
                        Remove
                      </Menu.Item>
                    </Menu.Dropdown>
                  </Menu>
                </Group>
                <Group justify="space-between" mt="sm">
                  <Badge color={STATUS_COLOR[employee.status]} variant="light" size="sm">
                    {EMPLOYEE_STATUS_LABELS[employee.status]}
                  </Badge>
                  <Text fz="xs" c="dimmed">
                    {employee.phone}
                  </Text>
                </Group>
              </Card>
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

      <EmployeeModal opened={modalOpen} onClose={closeModal} employee={editing} />
    </Stack>
  );
}
