/**
 * The landing screen.
 *
 * Honest about being early: it shows the one figure the system really has, and
 * says plainly what is coming rather than filling the space with charts of
 * invented data. A dashboard that lies while a product is being built teaches
 * people not to trust it once it stops lying.
 */

import { Badge, Card, Group, SimpleGrid, Stack, Text, ThemeIcon, Title, Progress } from '@mantine/core';
import {
  IconAddressBook,
  IconArrowRight,
  IconBox,
  IconReceipt2,
  IconShoppingCart,
  IconUsers,
} from '@tabler/icons-react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { CustomerPage } from '@suarza-oman/shared';
import { api } from '../lib/api.js';

function StatCard({ label, value, hint, icon, to }: {
  label: string;
  value: string;
  hint: string;
  icon: React.ReactNode;
  to?: string;
}) {
  const card = (
    <Card
      withBorder
      radius="lg"
      padding="lg"
      style={to ? { cursor: 'pointer', height: '100%' } : { height: '100%' }}
    >
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <div>
          <Text fz="xs" tt="uppercase" fw={700} c="dimmed" style={{ letterSpacing: '0.06em' }}>
            {label}
          </Text>
          <Text fz={30} fw={700} mt={6} style={{ fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>
            {value}
          </Text>
          <Text fz="xs" c="dimmed" mt={6}>
            {hint}
          </Text>
        </div>
        <ThemeIcon size={42} radius="md" variant="light" color="brand">
          {icon}
        </ThemeIcon>
      </Group>
    </Card>
  );

  return to ? (
    <Link to={to} style={{ textDecoration: 'none', color: 'inherit' }}>
      {card}
    </Link>
  ) : (
    card
  );
}

const ROADMAP = [
  { label: 'Products & stock', icon: IconBox, done: false },
  { label: 'Employees', icon: IconUsers, done: false },
  { label: 'Sales & invoices', icon: IconShoppingCart, done: false },
  { label: 'Customer ledgers', icon: IconReceipt2, done: false },
];

export function DashboardPage() {
  const customers = useQuery({
    queryKey: ['customers', 'count'],
    queryFn: () => api.get<CustomerPage>('/api/customers?page_size=1'),
    select: (page) => page.total,
  });

  const built = 1;
  const planned = ROADMAP.length + 1;

  return (
    <Stack gap="lg">
      <div>
        <Title order={1} fz={26}>
          Good to see you
        </Title>
        <Text c="dimmed" fz="sm" mt={4}>
          Suarza Oman — everything the business runs on, in one place.
        </Text>
      </div>

      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
        <StatCard
          label="Customers"
          value={customers.isLoading ? '—' : String(customers.data ?? 0)}
          hint="On file and ready to sell to"
          icon={<IconAddressBook size={22} stroke={1.6} />}
          to="/customers"
        />
        <StatCard
          label="Products"
          value="—"
          hint="Not built yet"
          icon={<IconBox size={22} stroke={1.6} />}
        />
        <StatCard
          label="Sales this month"
          value="—"
          hint="Not built yet"
          icon={<IconShoppingCart size={22} stroke={1.6} />}
        />
        <StatCard
          label="Outstanding"
          value="—"
          hint="Not built yet"
          icon={<IconReceipt2 size={22} stroke={1.6} />}
        />
      </SimpleGrid>

      <Card withBorder radius="lg" padding="lg">
        <Group justify="space-between" mb="xs">
          <Text fw={650}>Build progress</Text>
          <Badge variant="light" color="gray">
            {built} of {planned} modules
          </Badge>
        </Group>
        <Progress value={(built / planned) * 100} color="brand" radius="xl" size="sm" mb="lg" />

        <Stack gap="xs">
          <Group gap="sm">
            <ThemeIcon size={28} radius="md" variant="light" color="brand">
              <IconAddressBook size={16} stroke={1.7} />
            </ThemeIcon>
            <Text fz="sm" fw={550} style={{ flex: 1 }}>
              Customers
            </Text>
            <Badge size="sm" color="brand" variant="light">
              Ready
            </Badge>
            <Link to="/customers" style={{ display: 'flex' }} aria-label="Open customers">
              <IconArrowRight size={16} />
            </Link>
          </Group>

          {ROADMAP.map(({ label, icon: Icon }) => (
            <Group gap="sm" key={label}>
              <ThemeIcon size={28} radius="md" variant="light" color="gray">
                <Icon size={16} stroke={1.7} />
              </ThemeIcon>
              <Text fz="sm" c="dimmed" style={{ flex: 1 }}>
                {label}
              </Text>
              <Badge size="sm" color="gray" variant="outline">
                Planned
              </Badge>
            </Group>
          ))}
        </Stack>
      </Card>
    </Stack>
  );
}
