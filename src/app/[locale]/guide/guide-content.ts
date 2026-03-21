export const guideHero = {
  title: 'waoowaoo 使用攻略',
  summary: '从文本到分镜、配音和视频，先看清整条创作链路再开始使用。',
  badge: 'Public Quick Tour',
} as const

export const guidePrerequisite = {
  title: '开始前',
  description: '开始前先完成 API 配置，并确认不同阶段需要的模型与服务已经可用。',
} as const

export const guideSteps = [
  {
    id: 'import',
    title: '导入文本',
    description: '把小说正文、剧情梗概或片段素材导入工作区。',
    output: '得到可继续拆解的创作输入。',
  },
  {
    id: 'analysis',
    title: '剧情拆解',
    description: '分析故事节奏、角色关系和段落结构，整理成可执行的创作素材。',
    output: '得到结构化剧情与任务切分基础。',
  },
  {
    id: 'assets',
    title: '角色与场景',
    description: '生成或细化角色设定、场景氛围和世界观资产。',
    output: '得到后续分镜和出图需要的核心视觉资产。',
  },
  {
    id: 'storyboard',
    title: '分镜与出图',
    description: '把剧情转换成镜头面板，并生成每个面板对应的视觉结果。',
    output: '得到可用于视频拼装的分镜和图片产物。',
  },
  {
    id: 'voice',
    title: '配音',
    description: '为角色或旁白生成配音内容，统一语气、情绪和段落节奏。',
    output: '得到可直接进入视频合成的音频素材。',
  },
  {
    id: 'video',
    title: '视频生成',
    description: '组合图像、镜头顺序、字幕与配音，生成可预览和迭代的视频结果。',
    output: '得到接近成片的短视频内容。',
  },
] as const

export const guideOutcomes = [
  '结构化剧情素材',
  '角色和场景资产',
  '分镜与图片结果',
  '配音与视频产物',
] as const

export const guideCta = {
  title: '准备好开始了吗？',
  description: '如果你已经理解了整条链路，现在就可以进入注册或先回到首页继续浏览。',
  primaryLabel: '开始使用',
  secondaryLabel: '返回首页',
} as const
