/**
 * The frame every page sits in: navigation, a slim header, and the page body.
 *
 * Desktop keeps the sidebar; below the `md` breakpoint it becomes a drawer, so
 * the same screens work on a phone in a warehouse without a second layout.
 */

import { useState } from 'react';
import { AppShell, Burger, Group, Text, Tooltip, ActionIcon, Kbd, Box } from '@mantine/core';
import { useDisclosure, useHeadroom, useMediaQuery } from '@mantine/hooks';
import { spotlight } from '@mantine/spotlight';
import { IconBell, IconLayoutSidebarLeftCollapse, IconLayoutSidebarLeftExpand, IconSearch } from '@tabler/icons-react';
import { Outlet, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { CustomerPage } from '@suarza-oman/shared';
import { Sidebar } from './sidebar.js';
import { CommandPalette } from './command-palette.js';
import { ALL_ITEMS } from './nav.js';
import { api } from '../../lib/api.js';

const EXPANDED = 250;
const RAIL = 72;

export function AppLayout() {
  const [mobileOpen, { toggle: toggleMobile, close: closeMobile }] = useDisclosure(false);
  const [collapsed, setCollapsed] = useState(false);
  const isDesktop = useMediaQuery('(min-width: 62em)');
  const location = useLocation();

  /* The badge in the menu. Cheap — the list endpoint returns a total, so one
     row is enough to know how many there are. */
  const customerCount = useQuery({
    queryKey: ['customers', 'count'],
    queryFn: () => api.get<CustomerPage>('/api/customers?page_size=1'),
    select: (page) => page.total,
  });

  const current = ALL_ITEMS.find((item) =>
    item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to),
  );

  return (
    <AppShell
      layout="alt"
      header={{ height: 56 }}
      navbar={{
        width: collapsed && isDesktop ? RAIL : EXPANDED,
        breakpoint: 'md',
        collapsed: { mobile: !mobileOpen },
      }}
      padding={{ base: 'md', sm: 'lg' }}
    >
      <AppShell.Navbar withBorder={false} p={0}>
        <Sidebar
          collapsed={collapsed && !!isDesktop}
          counts={{ customers: customerCount.data }}
          onNavigate={closeMobile}
        />
      </AppShell.Navbar>

      <AppShell.Header withBorder>
        <Group h="100%" px="md" gap="sm" wrap="nowrap">
          <Burger opened={mobileOpen} onClick={toggleMobile} hiddenFrom="md" size="sm" />

          <Tooltip label={collapsed ? 'Expand menu' : 'Collapse menu'}>
            <ActionIcon
              variant="subtle"
              color="gray"
              visibleFrom="md"
              onClick={() => setCollapsed((value) => !value)}
              aria-label={collapsed ? 'Expand menu' : 'Collapse menu'}
            >
              {collapsed ? (
                <IconLayoutSidebarLeftExpand size={19} stroke={1.6} />
              ) : (
                <IconLayoutSidebarLeftCollapse size={19} stroke={1.6} />
              )}
            </ActionIcon>
          </Tooltip>

          {/* Where you are, in the header rather than repeated on every page. */}
          <Text fw={600} fz="sm" truncate>
            {current?.label ?? 'Suarza Oman'}
          </Text>

          <Box style={{ flex: 1 }} />

          <Tooltip label="Search">
            <ActionIcon
              variant="default"
              onClick={spotlight.open}
              aria-label="Search"
              hiddenFrom="sm"
            >
              <IconSearch size={17} stroke={1.7} />
            </ActionIcon>
          </Tooltip>

          <Group gap={6} visibleFrom="sm">
            <Text fz="xs" c="dimmed">
              Press
            </Text>
            <Kbd size="xs">Ctrl</Kbd>
            <Kbd size="xs">K</Kbd>
          </Group>

          <Tooltip label="Notifications — nothing yet">
            <ActionIcon variant="subtle" color="gray" aria-label="Notifications">
              <IconBell size={18} stroke={1.6} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </AppShell.Header>

      <AppShell.Main>
        <CommandPalette />
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}

/* Re-exported so the layout module is the only thing pages import from. */
export { useHeadroom };
