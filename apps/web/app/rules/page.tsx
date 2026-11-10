import { redirect } from 'next/navigation';

// Rules now lives in the Audit tab.
export default function Page() {
  redirect('/audit?view=rules');
}
