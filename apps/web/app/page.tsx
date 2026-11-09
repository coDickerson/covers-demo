import { IDS } from '@covers/contract/fixtures';
import { DinnerScreen } from '../components/dinner-screen';

export default function Home() {
  return <DinnerScreen planId={IDS.demoPlan} />;
}
