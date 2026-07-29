/**
 * 퀴즈 범위(scope) 정의.
 *
 * 범위 하나가 세션 페이지 하나이자 SEO list 페이지 하나가 된다.
 * `/quiz` 한 장에 전 문항을 담으면 통계만 풀 사람이 ML 문항까지 내려받게 되므로
 * 범위별로 페이지를 나누고 pageContext로 해당 범위만 주입한다.
 *
 * 매칭 규칙
 *   dir    : contents/<dir>/ 아래에서 quiz.json을 찾는다
 *   slugs  : 주면 그 폴더 중 지정한 글만 담는다. 생략하면 폴더 전체
 *
 * 새 시리즈를 추가하려면 여기에 한 줄 넣으면 된다. 문항이 하나도 없는 범위는
 * gatsby-node가 페이지를 만들지 않고 건너뛴다.
 *
 * gatsby-node.js가 require하므로 CommonJS로 유지한다.
 */

const quizScopes = [
  {
    id: 'postgres',
    title: 'PostgreSQL',
    description: '스토리지 구조, MVCC, VACUUM, 실행 계획',
    series: 'postgres',
    dir: 'postgres',
  },
  {
    id: 'llm-serving',
    title: 'LLM Serving',
    description: 'vLLM의 배칭, KV 캐시, 추론 최적화',
    series: 'llm-serving',
    dir: 'llm',
    slugs: [
      'llm-inference-process',
      'kv-cache',
      'paged-attention',
      'continuous-batching',
      'prefix-caching-radix-attention',
      'speculative-decoding',
      'llm-quantization-serving',
      'llm-serving-metrics-tuning',
      'vllm-serving-in-practice',
    ],
  },
  {
    id: 'stats',
    title: '확률과 통계',
    description: '확률론, 추정, 검정, 베이지안',
    series: 'stats',
    dir: 'stats',
  },
  {
    id: 'ml-foundations',
    title: 'ML 기초와 평가',
    description: '워크플로, 편향-분산, 교차검증, 평가 지표',
    series: 'ml',
    dir: 'ml',
    slugs: [
      'overview',
      'workflow',
      'ml-practical-advice',
      'bias-variance',
      'cross-validation',
      'hyperparameter-tuning',
      'regression-metrics',
      'classification-metrics',
    ],
  },
  {
    id: 'ml-regression',
    title: 'ML 회귀',
    description: '선형 회귀, 비용 함수, 경사 하강법, 규제',
    series: 'ml',
    dir: 'ml',
    slugs: [
      'linear-regression',
      'multiple-linear-regression',
      'cost-function',
      'gradient-descent',
      'regularization',
    ],
  },
  {
    id: 'ml-classification',
    title: 'ML 분류',
    description: '로지스틱 회귀, KNN, 나이브 베이즈, SVM, 결정 트리',
    series: 'ml',
    dir: 'ml',
    slugs: [
      'logistic-regression',
      'decision-boundary',
      'knn',
      'naive-bayes',
      'svm',
      'decision-tree',
    ],
  },
  {
    id: 'ml-ensemble',
    title: 'ML 앙상블',
    description: '배깅, 랜덤 포레스트, 부스팅, XGBoost와 LightGBM',
    series: 'ml',
    dir: 'ml',
    slugs: [
      'ensemble-and-bagging',
      'random-forest',
      'boosting',
      'xgboost-vs-lightgbm',
    ],
  },
  {
    id: 'ml-unsupervised',
    title: 'ML 비지도학습',
    description: '클러스터링, 차원 축소, 이상 탐지',
    series: 'ml',
    dir: 'ml',
    slugs: [
      'kmeans-clustering',
      'dbscan-and-gmm',
      'pca',
      'tsne-and-umap',
      'anomaly-detection',
    ],
  },
  {
    id: 'ml-features',
    title: 'ML 전처리와 피처',
    description: '스케일링, 피처 선택, 인코딩, 결측치 처리',
    series: 'ml',
    dir: 'ml',
    slugs: [
      'feature-scaling',
      'feature-selection',
      'categorical-encoding',
      'target-encoding',
      'missing-data-handling',
    ],
  },
  {
    id: 'ml-neuralnet',
    title: 'ML 신경망',
    description: '순전파, 역전파, 활성화 함수, 옵티마이저',
    series: 'ml',
    dir: 'ml',
    slugs: [
      'neural-network-basics',
      'forward-propagation',
      'backpropagation',
      'activation-functions',
      'optimizers',
      'neural-network-tips',
    ],
  },
]

module.exports = { quizScopes }
