/**
 * The letterhead.
 *
 * Hard-coded until there is a Settings screen to hold it — which is the right
 * trade for now, because a printed invoice with no company on it is useless and
 * a half-built settings module is worse than an edit here. Change this one
 * object and every printed document follows.
 *
 * The company name is set as text rather than as the supplied artwork on
 * purpose: the artwork is white-on-black and would print as a black slab, and
 * text stays sharp at any size and in any printer's hands. `brand_logo` is the
 * Suarza mark, which is a real image and sits in apps/web/public.
 */

export interface Company {
  /** Arabic name, printed above the English one as on the client's paper. */
  name_ar: string;
  name: string;
  /** The line under the name: market, branch, trading description. */
  tagline: string;
  /** Commercial registration number, printed under the tagline. */
  cr_number: string;
  /** One line per printed line; empty entries are skipped. */
  address: string[];
  phone: string;
  email: string;
  /** Oman VAT registration number, printed only when set. */
  vat_number: string;
  /** Served from public/. Blank prints no mark at all. */
  brand_logo: string;
}

export const COMPANY: Company = {
  name_ar: 'محمد رضوان للتجارة الدولية',
  name: 'Muhammad Rizwan International Trade',
  tagline: 'Silal Fruits & Vegetable Market Oman',
  cr_number: '1548881',
  address: ['Muscat', 'Sultanate of Oman'],
  phone: '',
  email: '',
  vat_number: '',
  brand_logo: '/logo.png',
};

/** The two colours the client's own name is set in. */
export const COMPANY_NAME_COLORS = {
  arabic: '#2f7a4f',
  english: '#d99a5b',
};
