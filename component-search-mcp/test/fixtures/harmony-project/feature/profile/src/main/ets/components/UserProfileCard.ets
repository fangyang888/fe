import { Avatar } from "uikit"

/**
 * 用户资料卡片，展示用户头像和昵称。
 * @use-case 个人主页和成员列表中的用户信息展示
 */
@Component
export struct UserProfileCard {
  @Require @Prop userId: string
  @Prop avatar?: ResourceStr
  @State expanded: boolean = false

  build() {
    Column() {
      Avatar({ source: this.avatar })
      Image(this.avatar)
      Text(this.userId)
    }
  }
}
