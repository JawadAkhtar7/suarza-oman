/**
 * How a balance is shown, everywhere it is shown.
 *
 * A number on its own is ambiguous in a ledger — 4.500 could be theirs or ours.
 * So the amount never appears without the word that says which: "owes you", or
 * "in credit". Colour carries the same meaning a second time, for the glance
 * rather than the read, and never carries it alone.
 */

import { Badge, Group, Text } from '@mantine/core';
import { formatOMR, standingOf } from '@suarza-oman/shared';

export const STANDING_LABEL = {
  OWING: 'Owes you',
  ADVANCE: 'In credit',
  SETTLED: 'Settled',
} as const;

/** Red for money out there, green for money held, grey for nothing owed. */
export function standingColor(balanceBaisa: number): string {
  const standing = standingOf(balanceBaisa);
  if (standing === 'OWING') return 'red';
  if (standing === 'ADVANCE') return 'brand';
  return 'gray';
}

export function StandingBadge({ balanceBaisa }: { balanceBaisa: number }) {
  const standing = standingOf(balanceBaisa);
  return (
    <Badge color={standingColor(balanceBaisa)} variant="light" size="sm">
      {STANDING_LABEL[standing]}
    </Badge>
  );
}

/**
 * The figure in a table cell. Always the absolute amount: a minus sign meaning
 * "in credit" is the easiest thing to misread in a column of numbers, so the
 * words do that job instead.
 */
export function BalanceAmount({
  balanceBaisa,
  size = 'sm',
  withWord = false,
}: {
  balanceBaisa: number;
  size?: string;
  withWord?: boolean;
}) {
  const standing = standingOf(balanceBaisa);
  const color = standing === 'SETTLED' ? 'dimmed' : standingColor(balanceBaisa);

  return (
    <Group gap={6} wrap="nowrap" justify="flex-end">
      <Text fz={size} fw={650} c={color} style={{ fontVariantNumeric: 'tabular-nums' }}>
        {formatOMR(Math.abs(balanceBaisa), { symbol: false })}
      </Text>
      {withWord && standing !== 'SETTLED' && (
        <Text fz="xs" c="dimmed">
          {standing === 'OWING' ? 'owed' : 'in credit'}
        </Text>
      )}
    </Group>
  );
}
