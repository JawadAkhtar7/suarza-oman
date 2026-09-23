import type { ReactElement, ReactNode } from 'react';
import { render } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { Customer } from '@suarza-oman/shared';
import { theme } from '../src/theme.js';

/** Everything a page needs to mount, in the same order as main.tsx. */
/* Returns only the query client: assertions go through `screen`, and typing
   the full render result drags in two copies of pretty-format's types. */
export function renderApp(ui: ReactElement, { route = '/' } = {}): { client: QueryClient } {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  const Wrapper = ({ children }: { children: ReactNode }) => (
    <MantineProvider theme={theme} defaultColorScheme="light">
      <QueryClientProvider client={client}>
        <ModalsProvider>
          <Notifications />
          <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
        </ModalsProvider>
      </QueryClientProvider>
    </MantineProvider>
  );

  render(ui, { wrapper: Wrapper });
  return { client };
}

export function customer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: '507f1f77bcf86cd799439011',
    name: 'Ahmed Al Balushi',
    company: 'Al Balushi Trading',
    email: 'ahmed@albalushi.om',
    phone: '+968 9123 4567',
    vat_number: 'OM1100123456',
    notes: '',
    status: 'ACTIVE',
    created_at: '2026-09-01T08:00:00.000Z',
    updated_at: '2026-09-01T08:00:00.000Z',
    ...overrides,
  };
}
