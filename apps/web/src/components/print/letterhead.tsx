/**
 * The letterhead: the Suarza mark, the client's name, and the document's own
 * corner. Shared by every printed document so an invoice and a statement that
 * land on the same desk look like they came from the same office.
 */

import type { ReactNode } from 'react';
import { COMPANY, COMPANY_NAME_COLORS } from '../../lib/company.js';
import classes from './letterhead.module.css';

export interface LetterheadProps {
  /** The top-right corner: a document title and number, or a timestamp. */
  aside?: ReactNode;
}

export function Letterhead({ aside }: LetterheadProps) {
  return (
    <div className={classes.head}>
      <div className={classes.mark}>
        {COMPANY.brand_logo && (
          /* Empty alt: the mark says nothing a reader of the statement needs,
             and the company name is right beside it in text. */
          <img src={COMPANY.brand_logo} alt="" className={classes.markImage} />
        )}
      </div>

      <div className={classes.identity}>
        {COMPANY.name_ar && (
          <div className={classes.nameAr} style={{ color: COMPANY_NAME_COLORS.arabic }} lang="ar">
            {COMPANY.name_ar}
          </div>
        )}
        <div className={classes.nameEn} style={{ color: COMPANY_NAME_COLORS.english }}>
          {COMPANY.name}
        </div>
        {COMPANY.tagline && <div className={classes.tagline}>{COMPANY.tagline}</div>}
        {COMPANY.cr_number && <div className={classes.cr}>C.R: {COMPANY.cr_number}</div>}
      </div>

      <div className={classes.aside}>{aside}</div>
    </div>
  );
}
