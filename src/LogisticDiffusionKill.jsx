import ResearchObservationKill from "./ResearchObservationKill";

const config = {
  endpoint: "/api/kill/logistic-diffusion",
  path: "/kill/logistic-diffusion",
  title: "逻辑扩散粒子滤波",
  shortTitle: "逻辑扩散",
  eyebrow: "SEQUENTIAL BAYESIAN FILTER · FROZEN V1",
  description:
    "让49个不可见概率状态在逻辑空间连续扩散，并在每期开奖后用贝叶斯规则更新粒子权重。",
  loadingText: "正在传播49×31个概率状态粒子…",
  variant: "diffusion",
  accent: "#62e6c5",
  accentRgb: "98, 230, 197",
  soft: "#0c554b",
  peerPath: "/kill/robust-block",
  peerLabel: "查看鲁棒块一致性",
};

export default function LogisticDiffusionKill() {
  return <ResearchObservationKill config={config} />;
}
