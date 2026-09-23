/**
 * The navigation.
 *
 * Six things separate this from a list of links, and each one is a complaint
 * someone has had about a sidebar:
 *
 *  1. Groups with labels, so the eye skips to a region instead of reading ten
 *     items.
 *  2. A search entry that opens the command palette — the fastest path for
 *     anyone who already knows where they are going.
 *  3. Live counts, so the menu carries information rather than only addresses.
 *  4. An honest "Soon" on what is not built, instead of links that 404.
 *  5. An account block pinned to the bottom, where every application has
 *     trained people to look for it.
 *  6. A collapsed rail that keeps the icons in the same vertical positions, so
 *     muscle memory survives the collapse.
 */

import { NavLink, useMatch } from 'react-router-dom';
import { Avatar, Menu, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { spotlight } from '@mantine/spotlight';
import {
  IconChevronRight,
  IconLogout,
  IconMoon,
  IconSearch,
  IconSun,
  IconUserCog,
} from '@tabler/icons-react';
import { useMantineColorScheme } from '@mantine/core';
import { initials } from '@suarza-oman/shared';
import { NAV, SETTINGS_ITEM, type NavItem } from './nav.js';
import classes from './sidebar.module.css';

export interface SidebarProps {
  collapsed: boolean;
  /** Live figures for the badges; absent while they load. */
  counts: Partial<Record<'customers', number>>;
  /** Closes the mobile drawer after a jump; absent on desktop. */
  onNavigate?: () => void;
}

function NavRow({ item, collapsed, count, onNavigate }: {
  item: NavItem;
  collapsed: boolean;
  count?: number;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  // `end` only for the dashboard: /customers should stay lit on /customers/:id.
  const isActive = Boolean(useMatch({ path: item.to, end: item.to === '/' }));

  const body = (
    <>
      <Icon className={classes.linkIcon} stroke={1.7} />
      {!collapsed && (
        <>
          <span className={classes.linkLabel}>{item.label}</span>
          {item.planned ? (
            <span className={classes.soon}>Soon</span>
          ) : (
            count !== undefined && <span className={classes.count}>{count}</span>
          )}
        </>
      )}
    </>
  );

  if (item.planned) {
    return (
      <Tooltip label={`${item.label} — not built yet`} position="right" disabled={!collapsed}>
        <div className={`${classes.link} ${classes.linkPlanned}`} aria-disabled>
          {body}
        </div>
      </Tooltip>
    );
  }

  /*
   * The active class is worked out here rather than through NavLink's
   * function-form `className`. Tooltip clones its child and rewrites
   * className, which turns a function into nothing at all — the links then
   * render as bare blue anchors. Passing a plain string is immune to that.
   */
  const link = (
    <NavLink
      to={item.to}
      onClick={onNavigate}
      className={isActive ? `${classes.link} ${classes.linkActive}` : classes.link}
    >
      {body}
    </NavLink>
  );

  // Tooltips only exist to replace the labels the rail hides.
  return collapsed ? (
    <Tooltip label={item.label} position="right">
      {link}
    </Tooltip>
  ) : (
    link
  );
}

export function Sidebar({ collapsed, counts, onNavigate }: SidebarProps) {
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const dark = colorScheme === 'dark';

  return (
    <div className={`${classes.navbar} ${collapsed ? classes.collapsed : ''}`}>
      <div className={classes.brand}>
        {collapsed ? (
          <div className={classes.mark}>S</div>
        ) : (
          <div className={classes.logoPlate}>
            <img
              src="/logo.png"
              srcSet="/logo.png 1x, /logo@3x.png 3x"
              alt="Suarza International"
              className={classes.logo}
            />
          </div>
        )}
      </div>

      <UnstyledButton
        className={classes.search}
        onClick={spotlight.open}
        style={collapsed ? { justifyContent: 'center' } : undefined}
        aria-label="Search the system"
      >
        <IconSearch size={15} stroke={1.8} />
        {!collapsed && (
          <>
            <span>Search…</span>
            <span className={classes.kbd}>Ctrl K</span>
          </>
        )}
      </UnstyledButton>

      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 8 }}>
        {NAV.map((group) => (
          <div key={group.label}>
            {/* The label is the navigation aid; in the rail the gap does that
                job, and a truncated caption would only be noise. */}
            {!collapsed && <div className={classes.groupLabel}>{group.label}</div>}
            {collapsed && <div style={{ height: 14 }} />}
            {group.items.map((item) => (
              <NavRow
                key={item.to}
                item={item}
                collapsed={collapsed}
                count={item.countKey ? counts[item.countKey] : undefined}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        ))}
      </div>

      <div className={classes.footer}>
        <NavRow item={SETTINGS_ITEM} collapsed={collapsed} onNavigate={onNavigate} />

        <Menu position="right-end" withArrow shadow="md" width={200}>
          <Menu.Target>
            <UnstyledButton className={classes.user}>
              <Avatar
                size={32}
                radius="md"
                variant="gradient"
                gradient={{ from: 'brand.5', to: 'brand.8', deg: 135 }}
              >
                {initials('Suarza Admin')}
              </Avatar>
              {!collapsed && (
                <>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className={classes.userName}>Suarza Admin</div>
                    <div className={classes.userRole}>Administrator</div>
                  </div>
                  <IconChevronRight size={14} color="rgba(255,255,255,0.4)" />
                </>
              )}
            </UnstyledButton>
          </Menu.Target>

          <Menu.Dropdown>
            <Menu.Label>Signed in as admin</Menu.Label>
            <Menu.Item leftSection={<IconUserCog size={15} />} disabled>
              Profile
            </Menu.Item>
            <Menu.Item
              leftSection={dark ? <IconSun size={15} /> : <IconMoon size={15} />}
              onClick={() => setColorScheme(dark ? 'light' : 'dark')}
            >
              {dark ? 'Light mode' : 'Dark mode'}
            </Menu.Item>
            <Menu.Divider />
            {/* No auth in the system yet; the item is here so the shape of the
                menu does not change when it arrives. */}
            <Menu.Item leftSection={<IconLogout size={15} />} disabled>
              Sign out
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>

        {!collapsed && (
          <Text size="10px" c="rgba(255,255,255,0.25)" ta="center" mt={6}>
            v0.1.0
          </Text>
        )}
      </div>
    </div>
  );
}
