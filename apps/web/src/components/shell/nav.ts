/**
 * What is in the system, and how it is grouped.
 *
 * Grouping is the whole point. A flat list of links makes every destination
 * look equally likely and forces the eye to read all of them; four short,
 * labelled groups let someone find "Customers" by knowing it is master data,
 * which is how people who use an ERP all day actually think about it.
 *
 * Pages that do not exist yet are listed and marked, not hidden: the shape of
 * the product is information, and a menu that grows a new item every week is
 * harder to learn than one that was honest from the start.
 */

import {
  IconAddressBook,
  IconBox,
  IconBuildingWarehouse,
  IconCash,
  IconChartHistogram,
  IconFileInvoice,
  IconLayoutDashboard,
  IconReceipt2,
  IconSettings,
  IconShoppingCart,
  IconUsers,
  type Icon,
} from '@tabler/icons-react';

export interface NavItem {
  label: string;
  to: string;
  icon: Icon;
  /** Shown as a muted "Soon" chip; the link is inert until it is built. */
  planned?: boolean;
  /** Filled in by the shell for items that can show a live figure. */
  countKey?: 'customers';
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { label: 'Dashboard', to: '/', icon: IconLayoutDashboard },
      { label: 'Reports', to: '/reports', icon: IconChartHistogram, planned: true },
    ],
  },
  {
    label: 'Master data',
    items: [
      { label: 'Customers', to: '/customers', icon: IconAddressBook, countKey: 'customers' },
      { label: 'Products', to: '/products', icon: IconBox, planned: true },
      { label: 'Employees', to: '/employees', icon: IconUsers, planned: true },
      { label: 'Suppliers', to: '/suppliers', icon: IconBuildingWarehouse, planned: true },
    ],
  },
  {
    label: 'Operations',
    items: [
      { label: 'Sales', to: '/sales', icon: IconShoppingCart, planned: true },
      { label: 'Purchases', to: '/purchases', icon: IconFileInvoice, planned: true },
    ],
  },
  {
    label: 'Finance',
    items: [
      { label: 'Ledger', to: '/ledger', icon: IconReceipt2 },
      { label: 'Payments', to: '/payments', icon: IconCash, planned: true },
    ],
  },
];

export const SETTINGS_ITEM: NavItem = { label: 'Settings', to: '/settings', icon: IconSettings, planned: true };

/** Every real destination, flattened — the command palette walks this. */
export const ALL_ITEMS: NavItem[] = [...NAV.flatMap((group) => group.items), SETTINGS_ITEM];
