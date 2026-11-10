import { redirect } from 'next/navigation';

// Doctors now lives in the Audit tab.
export default function Page() {
  redirect('/audit?view=doctors');
}
