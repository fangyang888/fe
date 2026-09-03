import { UserProfileCard } from "../../../../../../../feature/profile/src/main/ets/components/UserProfileCard"

@Entry
@Component
struct HomePage {
  build() {
    UserProfileCard({ userId: "10001" })
  }
}
