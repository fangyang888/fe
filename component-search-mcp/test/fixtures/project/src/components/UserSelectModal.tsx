import { useMemo } from "react";

/**
 * Select one or more users from a remote data source.
 * @use-case 远程搜索并选择项目成员
 * @use-case 选择审批人员
 */
export interface UserSelectModalProps {
  multiple?: boolean;
  request: (keyword: string) => Promise<unknown[]>;
}

export function UserSelectModal(_props: UserSelectModalProps) {
  const label = useMemo(() => "User selector", []);
  return <div><input /><button>{label}</button></div>;
}
