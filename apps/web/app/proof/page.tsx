import { redirect } from 'next/navigation';

// Proof now lives in the Audit tab.
export default function Page() {
  redirect('/audit?view=proof');
}
