/**
 * The customer list.
 *
 * A table on a desktop and a stack of cards on a phone — not one table that
 * scrolls sideways. Horizontal scrolling hides the column that matters and is
 * the single most common way a "responsive" ERP stops being usable in a
 * warehouse.
 *
 * One layout is rendered at a time, chosen by a media query rather than by
 * CSS visibility. Shipping both and hiding one would put every customer in the
 * document twice — which doubles the DOM on a long page and, worse, reads the
 * whole list out twice to anyone using a screen reader.
 */

import {
  ActionIcon,
  Avatar,
  Badge,
  Card,
  Group,
  Menu,
  Skeleton,
  Stack,
  Table,
  Text,
  Tooltip,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import {
  IconDots,
  IconMail,
  IconPencil,
  IconPhone,
  IconReceipt2,
  IconTrash,
} from '@tabler/icons-react';
import { Link } from 'react-router-dom';
import { formatDate, initials, type Customer } from '@suarza-oman/shared';
import classes from './customers-table.module.css';

export interface CustomersTableProps {
  rows: Customer[];
  isLoading: boolean;
  onEdit: (customer: Customer) => void;
  onDelete: (customer: Customer) => void;
}

function StatusBadge({ status }: { status: Customer['status'] }) {
  return status === 'ACTIVE' ? (
    <Badge color="brand" variant="light" size="sm">
      Active
    </Badge>
  ) : (
    <Badge color="gray" variant="light" size="sm">
      Inactive
    </Badge>
  );
}

function Identity({ customer }: { customer: Customer }) {
  return (
    <Group gap="sm" wrap="nowrap">
      <Avatar size={34} radius="md" color="brand" variant="light">
        {initials(customer.name)}
      </Avatar>
      <div style={{ minWidth: 0 }}>
        <Text fz="sm" fw={600} truncate>
          {customer.name}
        </Text>
        <Text fz="xs" c="dimmed" truncate>
          {customer.company || '—'}
        </Text>
      </div>
    </Group>
  );
}

function RowMenu({ customer, onEdit, onDelete }: {
  customer: Customer;
  onEdit: (customer: Customer) => void;
  onDelete: (customer: Customer) => void;
}) {
  return (
    <Menu position="bottom-end" withArrow shadow="md">
      <Menu.Target>
        <ActionIcon variant="subtle" color="gray" aria-label={`Actions for ${customer.name}`}>
          <IconDots size={17} stroke={1.6} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item leftSection={<IconPencil size={15} />} onClick={() => onEdit(customer)}>
          Edit
        </Menu.Item>
        {/* Every customer has an account, so this is always somewhere to go. */}
        <Menu.Item
          component={Link}
          to={`/ledger/${customer.id}`}
          leftSection={<IconReceipt2 size={15} />}
        >
          Open ledger
        </Menu.Item>
        <Menu.Divider />
        <Menu.Item
          color="red"
          leftSection={<IconTrash size={15} />}
          onClick={() => onDelete(customer)}
        >
          Delete
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

export function CustomersTable({ rows, isLoading, onEdit, onDelete }: CustomersTableProps) {
  // `true` until the browser answers, so a desktop never flashes the phone
  // layout on first paint.
  const isWide = useMediaQuery('(min-width: 48em)', true);

  if (isLoading) {
    return (
      <Stack gap="xs" p="md">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} height={46} radius="sm" />
        ))}
      </Stack>
    );
  }

  if (!isWide) {
    return (
      <Stack gap="sm" p="md">
        {rows.map((customer) => (
          <Card key={customer.id} withBorder padding="md" radius="md">
            <Group justify="space-between" wrap="nowrap" align="flex-start">
              <Identity customer={customer} />
              <RowMenu customer={customer} onEdit={onEdit} onDelete={onDelete} />
            </Group>
            <Group gap="lg" mt="sm">
              <Group gap={6}>
                <IconPhone size={14} stroke={1.6} />
                <Text fz="xs" className={classes.numeric}>
                  {customer.phone}
                </Text>
              </Group>
              {customer.email && (
                <Group gap={6} style={{ minWidth: 0 }}>
                  <IconMail size={14} stroke={1.6} />
                  <Text fz="xs" truncate>
                    {customer.email}
                  </Text>
                </Group>
              )}
            </Group>
            <Group justify="space-between" mt="sm">
              <StatusBadge status={customer.status} />
              <Tooltip label="Date added">
                <Text fz="xs" c="dimmed">
                  {formatDate(customer.created_at)}
                </Text>
              </Tooltip>
            </Group>
          </Card>
        ))}
      </Stack>
    );
  }

  return (
    <Table.ScrollContainer minWidth={760}>
        <Table verticalSpacing="sm" horizontalSpacing="lg" highlightOnHover={false}>
          <Table.Thead className={classes.head}>
            <Table.Tr>
              <Table.Th className={classes.headCell}>Customer</Table.Th>
              <Table.Th className={classes.headCell}>Contact</Table.Th>
              <Table.Th className={classes.headCell}>VAT number</Table.Th>
              <Table.Th className={classes.headCell}>Status</Table.Th>
              <Table.Th className={classes.headCell}>Added</Table.Th>
              <Table.Th w={48} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((customer) => (
              <Table.Tr key={customer.id} className={classes.row}>
                <Table.Td>
                  <Identity customer={customer} />
                </Table.Td>
                <Table.Td>
                  <Text fz="sm" className={classes.numeric}>
                    {customer.phone}
                  </Text>
                  <Text fz="xs" c="dimmed" truncate maw={220}>
                    {customer.email || '—'}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text fz="sm" c={customer.vat_number ? undefined : 'dimmed'} className={classes.numeric}>
                    {customer.vat_number || '—'}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <StatusBadge status={customer.status} />
                </Table.Td>
                <Table.Td>
                  <Text fz="sm" c="dimmed">
                    {formatDate(customer.created_at)}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <RowMenu customer={customer} onEdit={onEdit} onDelete={onDelete} />
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
    </Table.ScrollContainer>
  );
}
