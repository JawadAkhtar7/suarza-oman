/**
 * Create and edit, in one modal.
 *
 * The same form serves both because the fields are the same and a second
 * component would be a second place for them to drift apart. Validation comes
 * from the shared Zod schema, so the browser refuses exactly what the API would
 * have refused — the user finds out before the round trip, not after it.
 */

import { useEffect } from 'react';
import {
  Button,
  Group,
  Modal,
  Select,
  Stack,
  Textarea,
  TextInput,
  SimpleGrid,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { zodResolver } from 'mantine-form-zod-resolver';
import { notifications } from '@mantine/notifications';
import { createCustomerSchema, type Customer, type CreateCustomerInput } from '@suarza-oman/shared';
import { IconCheck } from '@tabler/icons-react';
import { ApiError } from '../../lib/api.js';
import { useCreateCustomer, useUpdateCustomer } from '../../lib/customers.js';

export interface CustomerModalProps {
  opened: boolean;
  onClose: () => void;
  /** Absent means "create"; present means "edit this one". */
  customer?: Customer | null;
}

/* Typed as the input the API takes, so the form and the request cannot
   disagree about what a customer is. */
const EMPTY: CreateCustomerInput = {
  name: '',
  company: '',
  email: '',
  phone: '',
  vat_number: '',
  notes: '',
  status: 'ACTIVE',
};

export function CustomerModal({ opened, onClose, customer }: CustomerModalProps) {
  const create = useCreateCustomer();
  const update = useUpdateCustomer();
  const editing = Boolean(customer);

  const form = useForm({
    mode: 'uncontrolled',
    initialValues: EMPTY,
    validate: zodResolver(createCustomerSchema),
  });

  /* Reopening on a different row must not show the previous row's values —
     the modal stays mounted, so the reset is explicit. */
  useEffect(() => {
    if (!opened) return;
    form.setValues(
      customer
        ? {
            name: customer.name,
            company: customer.company,
            email: customer.email,
            phone: customer.phone,
            vat_number: customer.vat_number,
            notes: customer.notes,
            status: customer.status,
          }
        : EMPTY,
    );
    form.resetDirty();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, customer?.id]);

  const submit = form.onSubmit(async (values) => {
    try {
      if (customer) {
        await update.mutateAsync({ id: customer.id, input: values });
      } else {
        await create.mutateAsync(values);
      }
      notifications.show({
        title: editing ? 'Customer updated' : 'Customer added',
        message: values.name,
        color: 'brand',
        icon: <IconCheck size={16} />,
      });
      onClose();
    } catch (error) {
      // A 422 names its fields: show them on the inputs, where the fix is.
      if (error instanceof ApiError && error.fields) {
        form.setErrors(error.fields);
        return;
      }
      notifications.show({
        title: 'Could not save',
        message: error instanceof Error ? error.message : 'Unknown error',
        color: 'red',
      });
    }
  });

  const busy = create.isPending || update.isPending;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={editing ? `Edit ${customer?.name}` : 'New customer'}
      size="lg"
    >
      <form onSubmit={submit} noValidate>
        <Stack gap="md">
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            <TextInput
              label="Name"
              placeholder="Ahmed Al Balushi"
              withAsterisk
              data-autofocus
              {...form.getInputProps('name')}
            />
            <TextInput
              label="Company"
              placeholder="Al Balushi Trading LLC"
              {...form.getInputProps('company')}
            />
            <TextInput
              label="Phone"
              placeholder="+968 9123 4567"
              withAsterisk
              {...form.getInputProps('phone')}
            />
            <TextInput
              label="Email"
              placeholder="ahmed@company.om"
              {...form.getInputProps('email')}
            />
            <TextInput
              label="VAT number"
              placeholder="OM1100123456"
              {...form.getInputProps('vat_number')}
            />
            <Select
              label="Status"
              data={[
                { value: 'ACTIVE', label: 'Active' },
                { value: 'INACTIVE', label: 'Inactive' },
              ]}
              allowDeselect={false}
              {...form.getInputProps('status')}
            />
          </SimpleGrid>

          <Textarea
            label="Notes"
            placeholder="Anything the team should know about this customer"
            autosize
            minRows={2}
            maxRows={6}
            {...form.getInputProps('notes')}
          />

          <Group justify="flex-end" mt="xs">
            <Button variant="default" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" loading={busy}>
              {editing ? 'Save changes' : 'Add customer'}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
