/**
 * The frame every page sits in: navigation, a slim header, and the page body.
 *
 * Desktop keeps the sidebar; below the `md` breakpoint it becomes a drawer, so
 * the same screens work on a phone in a warehouse without a second layout.
 */

import { useState } from 'react';
import { AppShell, Burger, Group, Overlay, Text, Tooltip, ActionIcon, Kbd, Box } from '@mantine/core';
import { useDisclosure, useHeadroom, useMediaQuery } from '@mantine/hooks';
import { spotlight } from '@mantine/spotlight';
import { IconBell, IconLayoutSidebarLeftCollapse, IconLayoutSidebarLeftExpand, IconSearch } from '@tabler/icons-react';
import { Outlet, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { CustomerPage } from '@suarza-oman/shared';
import { Sidebar } from './sidebar.js';
import { CommandPalette } from './command-palette.js';
import { ALL_ITEMS } from './nav.js';
import { useSwipeToClose } from './use-swipe-to-close.js';
import { api } from '../../lib/api.js';

const EXPANDED = 250;
const RAIL = 72;

export function AppLayout() {
  const [mobileOpen, { toggle: toggleMobile, close: closeMobile }] = useDisclosure(false);
  const [collapsed, setCollapsed] = useState(false);
  const isDesktop = useMediaQuery('(min-width: 62em)');
  const location = useLocation();

  /* The drawer is only a drawer below `md`; above it the sidebar is furniture
     and there is nothing to dismiss. */
  const isDrawer = useMediaQuery('(max-width: 62em)') ?? false;
  const swipe = useSwipeToClose(closeMobile, isDrawer && mobileOpen);

  /* The badge in the menu. Cheap — the list endpoint returns a total, so one
     row is enough to know how many there are. */
  const customerCount = useQuery({
    queryKey: ['customers', 'count'],
    queryFn: () => api.get<CustomerPage>('/api/customers?page_size=1'),
    select: (page) => page.total,
  });

  const productCount = useQuery({
    queryKey: ['products', 'count'],
    queryFn: () => api.get<{ total: number }>('/api/products?page_size=1'),
    select: (page) => page.total,
  });

  const employeeCount = useQuery({
    queryKey: ['employees', 'count'],
    queryFn: () => api.get<{ total: number }>('/api/employees?page_size=1'),
    select: (page) => page.total,
  });

  const vendorCount = useQuery({
    queryKey: ['customers', 'count', 'vendors'],
    queryFn: () => api.get<CustomerPage>('/api/customers?page_size=1&vendor=true'),
    select: (page) => page.total,
  });

  /* Matched on whole path segments, not as a string prefix: "/sales-returns"
     begins with "/sales" and would otherwise be labelled "Sales". */
  const current = ALL_ITEMS.find((item) => {
    if (item.to === '/') return location.pathname === '/';
    return location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);
  });

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
      {/*
        Three ways out of the open drawer, because one was not enough: the cross
        in its corner, a tap on the page behind it, and a right-to-left swipe.
        Until now it closed only when a menu item was picked, which left anyone
        who opened it by mistake with nowhere to go.
      */}
      <AppShell.Navbar withBorder={false} p={0} {...swipe}>
        <Sidebar
          collapsed={collapsed && !!isDesktop}
          counts={{
            customers: customerCount.data,
            vendors: vendorCount.data,
            products: productCount.data,
            employees: employeeCount.data,
          }}
          onNavigate={closeMobile}
          onClose={closeMobile}
        />
      </AppShell.Navbar>

      {mobileOpen && isDrawer && (
        <Overlay
          /*
           * 99, because AppShell sits at Mantine's `app` elevation of 100.
           * Anything higher covers the drawer itself: taps on a menu item land
           * on the overlay, the drawer closes, and the link is never followed —
           * which looks exactly like the menu being broken.
           *
           * Fixed rather than absolute: AppShell's root is not a positioned
           * ancestor, so an absolute overlay would scroll away with the page.
           */
          fixed
          color="#000"
          backgroundOpacity={0.45}
          zIndex={99}
          onClick={closeMobile}
          {...swipe}
        />
      )}

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
