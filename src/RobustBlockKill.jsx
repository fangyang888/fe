import ResearchObservationKill from "./ResearchObservationKill";

const config = {
  endpoint: "/api/kill/robust-block",
  path: "/kill/robust-block",
  title: "分布鲁棒块一致性",
  shortTitle: "鲁棒块一致性",
  eyebrow: "DISTRIBUTIONALLY ROBUST · FROZEN V1",
  description:
    "把最近192期固定切成8个时间块，控制最坏块风险，并惩罚跨块表现不一致的号码。",
  loadingText: "正在评估8×24期最坏块风险…",
  variant: "robust",
  accent: "#f3b95f",
  accentRgb: "243, 185, 95",
  soft: "#6b4118",
  peerPath: "/kill/logistic-diffusion",
  peerLabel: "查看逻辑扩散",
};

export default function RobustBlockKill() {
  return <ResearchObservationKill config={config} />;
}
