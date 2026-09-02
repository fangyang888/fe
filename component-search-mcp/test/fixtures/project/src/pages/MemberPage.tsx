import { UserSelectModal } from "../components/UserSelectModal";

export default function MemberPage() {
  return <UserSelectModal request={async () => []} />;
}
