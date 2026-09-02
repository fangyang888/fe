export type EvaluationCategory = "semantic" | "exact" | "hard";

export interface RetrievalEvaluationCase {
  id: string;
  category: EvaluationCategory;
  query: string;
  expected: "DataTable" | "PhoneInput" | "UserSelectModal";
}

export const RETRIEVAL_EVALUATION_CASES: readonly RetrievalEvaluationCase[] = [
  {
    id: "S01",
    category: "semantic",
    query: "后台订单很多，希望按页浏览，每一行显示一条记录",
    expected: "DataTable",
  },
  {
    id: "S02",
    category: "semantic",
    query: "商品清单太长，需要分批展示并切换下一批",
    expected: "DataTable",
  },
  {
    id: "S03",
    category: "semantic",
    query: "把业务数据整理成行和列，同时显示加载状态",
    expected: "DataTable",
  },
  {
    id: "S04",
    category: "semantic",
    query: "运营查看客户列表时需要翻到下一页",
    expected: "DataTable",
  },
  {
    id: "S05",
    category: "semantic",
    query: "让客户填写可以联系到他的号码",
    expected: "PhoneInput",
  },
  {
    id: "S06",
    category: "semantic",
    query: "收集收件人的移动联系方式",
    expected: "PhoneInput",
  },
  {
    id: "S07",
    category: "semantic",
    query: "用户资料中需要填写移动通信号码",
    expected: "PhoneInput",
  },
  {
    id: "S08",
    category: "semantic",
    query: "输入一串用于联系对方的数字",
    expected: "PhoneInput",
  },
  {
    id: "S09",
    category: "semantic",
    query: "审批流程里挑选一个负责人",
    expected: "UserSelectModal",
  },
  {
    id: "S10",
    category: "semantic",
    query: "从服务器加载同事名单，并允许选好几个人",
    expected: "UserSelectModal",
  },
  {
    id: "S11",
    category: "semantic",
    query: "给项目添加若干参与者",
    expected: "UserSelectModal",
  },
  {
    id: "S12",
    category: "semantic",
    query: "指定一位或多位流程处理人",
    expected: "UserSelectModal",
  },
  {
    id: "E01",
    category: "exact",
    query: "DataTable",
    expected: "DataTable",
  },
  {
    id: "E02",
    category: "exact",
    query: "PhoneInput",
    expected: "PhoneInput",
  },
  {
    id: "E03",
    category: "exact",
    query: "UserSelectModal",
    expected: "UserSelectModal",
  },
  {
    id: "E04",
    category: "exact",
    query: "pagination loading",
    expected: "DataTable",
  },
  {
    id: "E05",
    category: "exact",
    query: "telephone field",
    expected: "PhoneInput",
  },
  {
    id: "E06",
    category: "exact",
    query: "multiple request selector",
    expected: "UserSelectModal",
  },
  {
    id: "H01",
    category: "hard",
    query: "展示员工列表，不需要选择人员",
    expected: "DataTable",
  },
  {
    id: "H02",
    category: "hard",
    query: "录入联系方式，不需要选择联系人",
    expected: "PhoneInput",
  },
  {
    id: "H03",
    category: "hard",
    query: "选择审批人，不是填写电话号码",
    expected: "UserSelectModal",
  },
  {
    id: "H04",
    category: "hard",
    query: "数据加载过程中展示业务清单",
    expected: "DataTable",
  },
  {
    id: "H05",
    category: "hard",
    query: "可以选多个成员，但不能手动填写名字",
    expected: "UserSelectModal",
  },
  {
    id: "H06",
    category: "hard",
    query: "保存客户的电话号码，不是选择客户",
    expected: "PhoneInput",
  },
];
