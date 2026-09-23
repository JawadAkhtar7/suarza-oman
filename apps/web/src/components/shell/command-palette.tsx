/**
 * Ctrl/⌘ K.
 *
 * The one feature that most changes how an ERP feels to someone who uses it
 * every day: the menu is for learning where things are, the palette is for
 * getting there once you know. It also gives actions — "New customer" — a home
 * that does not depend on being on the right page first.
 */

import { Spotlight, type SpotlightActionData } from '@mantine/spotlight';
import { IconPlus, IconSearch } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import { ALL_ITEMS } from './nav.js';

export function CommandPalette() {
  const navigate = useNavigate();

  const actions: SpotlightActionData[] = [
    {
      id: 'new-customer',
      label: 'New customer',
      description: 'Add a customer record',
      leftSection: <IconPlus size={18} stroke={1.6} />,
      group: 'Actions',
      // The page owns the modal, so the palette asks for it through the URL
      // rather than reaching into another component's state.
      onClick: () => navigate('/customers?new=1'),
    },
    ...ALL_ITEMS.filter((item) => !item.planned).map((item) => ({
      id: item.to,
      label: item.label,
      description: `Go to ${item.label.toLowerCase()}`,
      leftSection: <item.icon size={18} stroke={1.6} />,
      group: 'Go to',
      onClick: () => navigate(item.to),
    })),
  ];

  return (
    <Spotlight
      actions={actions}
      shortcut={['mod + K', '/']}
      nothingFound="Nothing matches that"
      highlightQuery
      searchProps={{
        leftSection: <IconSearch size={18} stroke={1.6} />,
        placeholder: 'Search pages and actions…',
      }}
    />
  );
}
